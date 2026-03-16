"""
clients/client_node.py

Production Federated Learning client node.

Full lifecycle:
  1. GET /fl/round-status  — check if server is ready for updates.
  2. GET /fl/model         — download current global_model.pt.
  3. Local PyTorch training on client's private data.
  4. Save update.pt to disk.
  5. POST /fl/update (multipart) — submit update with client_id,
     wallet_address, model_version.
  6. Handle ACCEPTED / REJECTED / stale-version responses gracefully.

Usage:
    python clients/client_node.py \\
        --client-id EdgeNode-001 \\
        --server-url http://localhost:8000/fl \\
        --data-path ./data/my_dataset.csv \\
        --epochs 3

Environment variables (override CLI args):
    FL_SERVER_URL, FL_CLIENT_ID, FL_WALLET_ADDRESS
"""

import argparse
import io
import logging
import os
import sys
import time
from pathlib import Path
from typing import Dict, Optional

import requests
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

# Allow running from backend/ root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("client_node")

# ---------------------------------------------------------------------------
# Defaults / constants
# ---------------------------------------------------------------------------

DEFAULT_SERVER_URL   = os.getenv("FL_SERVER_URL", "http://localhost:8000/fl")
DEFAULT_CLIENT_ID    = os.getenv("FL_CLIENT_ID", f"EdgeNode-{os.getpid()}")
DEFAULT_WALLET       = os.getenv("FL_WALLET_ADDRESS", "")
MAX_RETRIES          = 5
RETRY_BACKOFF_BASE   = 2.0   # seconds; doubles each retry
MAX_FILE_BYTES       = 200 * 1024 * 1024  # 200 MB safety cap on downloaded model


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------

def _get(url: str, timeout: int = 30, **kwargs) -> requests.Response:
    """GET with logging."""
    logger.debug(f"GET {url}")
    r = requests.get(url, timeout=timeout, **kwargs)
    r.raise_for_status()
    return r


def _post(url: str, timeout: int = 60, **kwargs) -> requests.Response:
    """POST with logging."""
    logger.debug(f"POST {url}")
    r = requests.post(url, timeout=timeout, **kwargs)
    r.raise_for_status()
    return r


# ---------------------------------------------------------------------------
# Step 1 — Check round-status
# ---------------------------------------------------------------------------

def check_round_status(server_url: str) -> Dict:
    """
    Fetches GET /round-status.

    Returns the JSON payload, e.g.:
      {
        "current_version": 3,
        "required_updates": 1,
        "received_updates": 0,
        "active_clients": [],
        "round_active": true,
      }

    Raises requests.HTTPError on non-2xx.
    """
    url = f"{server_url}/round-status"
    resp = _get(url)
    data = resp.json()
    logger.info(
        f"[Round Status] v{data['current_version']} | "
        f"received={data['received_updates']}/{data['required_updates']} | "
        f"active={data['round_active']}"
    )
    return data


# ---------------------------------------------------------------------------
# Step 2 — Download global model
# ---------------------------------------------------------------------------

def download_global_model(server_url: str, save_path: str = "global_model.pt") -> str:
    """
    Downloads the current global model weights from GET /model.

    Saves to ``save_path`` and returns the path.
    Validates the downloaded content is a valid torch state_dict.
    """
    url = f"{server_url}/model"
    logger.info(f"Downloading global model from {url} …")
    resp = _get(url, stream=True, timeout=120)

    raw = b""
    for chunk in resp.iter_content(chunk_size=65536):
        raw += chunk
        if len(raw) > MAX_FILE_BYTES:
            raise RuntimeError(
                f"Global model exceeds {MAX_FILE_BYTES // (1024**2)} MB — aborting."
            )

    # Validate it loads as a state_dict
    try:
        state = torch.load(io.BytesIO(raw), weights_only=True, map_location="cpu")
    except Exception as exc:
        raise RuntimeError(f"Downloaded file is not a valid .pt state_dict: {exc}")

    if not isinstance(state, dict):
        raise RuntimeError(
            f"Expected dict from server model, got {type(state).__name__}"
        )

    with open(save_path, "wb") as f:
        f.write(raw)

    logger.info(f"Global model saved to '{save_path}' ({len(raw):,} bytes).")
    return save_path


# ---------------------------------------------------------------------------
# Step 3 — Local training
# ---------------------------------------------------------------------------

def build_local_model_from_weights(
    weights: Dict[str, torch.Tensor],
) -> nn.Module:
    """
    Reconstructs a generic linear model that matches the shape of the server
    weights. Uses the first layer's in_features and the last layer's out_features
    to infer architecture.

    For production: replace this with your real model class import.
    """
    # Infer input/output dims from weight keys
    keys = list(weights.keys())
    first_w = weights[keys[0]]
    last_w  = weights[keys[-2]] if len(keys) >= 2 else weights[keys[0]]  # bias last

    # Simple heuristic: look for weight matrices (2-D tensors)
    weight_tensors = [v for v in weights.values() if v.dim() == 2]
    if not weight_tensors:
        raise RuntimeError("Cannot infer model architecture from state_dict.")

    in_features  = weight_tensors[0].shape[1]
    out_features = weight_tensors[-1].shape[0]

    # Build layers matching the checkpoint
    layers = []
    prev = in_features
    for wt in weight_tensors:
        out = wt.shape[0]
        layers.extend([nn.Linear(prev, out), nn.ReLU()])
        prev = out
    layers.pop()  # remove last ReLU

    model = nn.Sequential(*layers)
    model.load_state_dict(weights, strict=True)
    return model


def train_locally(
    model: nn.Module,
    data_path: Optional[str],
    epochs: int = 3,
    lr: float = 0.01,
    batch_size: int = 32,
    device: str = "cpu",
) -> Dict[str, torch.Tensor]:
    """
    Runs a genuine local training loop on the client's private data.

    If data_path is None or the CSV is missing, falls back to synthetic data
    so the demo pipeline stays runnable end-to-end.

    Returns an updated CPU-side state_dict.
    """
    model = model.to(device)
    model.train()

    # --- load data ---
    dataloader: Optional[DataLoader] = None
    if data_path and os.path.exists(data_path):
        try:
            import pandas as pd
            df = pd.read_csv(data_path)
            if df.shape[1] < 2:
                raise ValueError("CSV must have at least 2 columns (features + label).")
            X = torch.tensor(df.iloc[:, :-1].values, dtype=torch.float32)
            y = torch.tensor(df.iloc[:, -1].values, dtype=torch.long)
            # Normalise labels to 0-based
            y = y - y.min()
            ds = TensorDataset(X, y)
            dataloader = DataLoader(ds, batch_size=batch_size, shuffle=True)
            logger.info(f"Loaded {len(ds)} samples from '{data_path}'.")
        except Exception as exc:
            logger.warning(f"Could not load CSV ({exc}) — using synthetic data.")

    if dataloader is None:
        # Synthetic fallback: random data matching model input shape
        weight_tensors = [p for p in model.parameters() if p.dim() == 2]
        in_f = weight_tensors[0].shape[1] if weight_tensors else 16
        out_f = weight_tensors[-1].shape[0] if weight_tensors else 3
        X_syn = torch.randn(128, in_f)
        y_syn = torch.randint(0, out_f, (128,))
        dataloader = DataLoader(TensorDataset(X_syn, y_syn), batch_size=batch_size)
        logger.info("Using synthetic training data (no CSV provided).")

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.SGD(model.parameters(), lr=lr, momentum=0.9)

    for epoch in range(1, epochs + 1):
        total_loss, correct, total = 0.0, 0, 0
        for X_batch, y_batch in dataloader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            out  = model(X_batch)
            loss = criterion(out, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            preds  = out.argmax(dim=1)
            correct += (preds == y_batch).sum().item()
            total  += y_batch.size(0)
        avg_loss = total_loss / len(dataloader)
        acc      = correct / max(total, 1)
        logger.info(
            f"  Epoch {epoch}/{epochs} | loss={avg_loss:.4f} | acc={acc*100:.1f}%"
        )

    # Return detached CPU copy — safe to serialise
    return {k: v.cpu().detach().clone() for k, v in model.state_dict().items()}


# ---------------------------------------------------------------------------
# Step 4 — Save update.pt
# ---------------------------------------------------------------------------

def save_update(weights: Dict[str, torch.Tensor], path: str = "update.pt") -> str:
    """Saves the updated state_dict to disk as a .pt file."""
    torch.save(weights, path)
    size_mb = os.path.getsize(path) / (1024 ** 2)
    logger.info(f"Update saved to '{path}' ({size_mb:.2f} MB).")
    return path


# ---------------------------------------------------------------------------
# Step 5 — Send update to server
# ---------------------------------------------------------------------------

def send_update(
    server_url: str,
    client_id: str,
    wallet_address: str,
    model_version: int,
    update_path: str,
) -> Dict:
    """
    POSTs update.pt to POST /update with:
      - client_id        (form field)
      - wallet_address   (form field)
      - model_version    (form field, int)
      - file             (multipart .pt file)

    Returns the parsed JSON response:
      {"status": "ACCEPTED"|"REJECTED", "reason": "...", "new_model_version": int}
    """
    url = f"{server_url}/update"
    with open(update_path, "rb") as f:
        file_bytes = f.read()

    logger.info(
        f"Submitting update to {url} "
        f"(client={client_id}, version={model_version}, "
        f"{len(file_bytes):,} bytes) …"
    )

    resp = _post(
        url,
        data={
            "client_id":      client_id,
            "wallet_address": wallet_address,
            "model_version":  str(model_version),
        },
        files={
            "file": ("update.pt", file_bytes, "application/octet-stream"),
        },
    )
    result = resp.json()
    status = result.get("status", "UNKNOWN")
    reason = result.get("reason", result.get("message", ""))
    new_v  = result.get("new_model_version", model_version)

    if status in ("ACCEPT", "ACCEPTED"):
        logger.info(f"Update ACCEPTED — new server version: {new_v}")
    elif status in ("REJECT", "REJECTED"):
        logger.warning(f"Update REJECTED — {reason}")
    else:
        logger.warning(f"Unknown server response: {result}")

    return result


# ---------------------------------------------------------------------------
# Main FL loop
# ---------------------------------------------------------------------------

def run_fl_round(
    server_url: str,
    client_id: str,
    wallet_address: str,
    data_path: Optional[str],
    epochs: int,
    work_dir: str = ".",
    device: str = "cpu",
) -> Dict:
    """
    Runs one complete FL round:
      check_round_status → download → train → save → send

    Returns the server response dict.
    Retries on transient network errors with exponential back-off.
    """
    os.makedirs(work_dir, exist_ok=True)
    global_pt_path = os.path.join(work_dir, "global_model.pt")
    update_pt_path = os.path.join(work_dir, "update.pt")

    # --- 1. Check round status ---
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            status = check_round_status(server_url)
            break
        except Exception as exc:
            wait = RETRY_BACKOFF_BASE ** attempt
            logger.warning(
                f"round-status failed (attempt {attempt}/{MAX_RETRIES}): {exc}. "
                f"Retrying in {wait:.0f}s …"
            )
            time.sleep(wait)
    else:
        raise RuntimeError("Server unreachable after all retries.")

    if not status.get("round_active", False):
        logger.info("Server round not active yet — waiting 10s and retrying …")
        time.sleep(10)
        status = check_round_status(server_url)

    model_version = status["current_version"]

    # --- 2. Download global model ---
    download_global_model(server_url, save_path=global_pt_path)
    global_weights = torch.load(
        global_pt_path, weights_only=True, map_location=device
    )

    # --- 3. Reconstruct model + train ---
    try:
        model = build_local_model_from_weights(global_weights)
    except Exception as exc:
        raise RuntimeError(f"Could not reconstruct model from server weights: {exc}")

    logger.info(f"Starting local training ({epochs} epoch(s)) …")
    updated_weights = train_locally(
        model, data_path=data_path, epochs=epochs, device=device
    )

    # --- 4. Save update.pt ---
    save_update(updated_weights, path=update_pt_path)

    # --- 5. Send to server ---
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = send_update(
                server_url=server_url,
                client_id=client_id,
                wallet_address=wallet_address,
                model_version=model_version,
                update_path=update_pt_path,
            )

            # Stale version — re-download and retry
            if result.get("status") in ("REJECT", "REJECTED") and "Stale" in result.get("reason", ""):
                new_v = result.get("new_model_version", model_version + 1)
                logger.info(f"Stale version detected. Server is at v{new_v}. Re-running round.")
                return run_fl_round(
                    server_url, client_id, wallet_address, data_path,
                    epochs, work_dir, device
                )

            return result

        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code < 500:
                # 4xx — not retryable (bad request, auth, etc.)
                logger.error(f"Non-retryable error {exc.response.status_code}: {exc}")
                raise
            wait = RETRY_BACKOFF_BASE ** attempt
            logger.warning(
                f"Server error (attempt {attempt}/{MAX_RETRIES}): {exc}. "
                f"Retrying in {wait:.0f}s …"
            )
            time.sleep(wait)
        except requests.ConnectionError as exc:
            wait = RETRY_BACKOFF_BASE ** attempt
            logger.warning(f"Connection error: {exc}. Retry in {wait:.0f}s …")
            time.sleep(wait)

    raise RuntimeError("Failed to submit update after all retries.")


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Federated Learning client node — .pt based"
    )
    p.add_argument("--client-id",      default=DEFAULT_CLIENT_ID,  help="Unique client identifier")
    p.add_argument("--server-url",     default=DEFAULT_SERVER_URL,  help="FL server base URL")
    p.add_argument("--wallet-address", default=DEFAULT_WALLET,      help="Blockchain wallet address")
    p.add_argument("--data-path",      default=None,                help="Path to local CSV dataset")
    p.add_argument("--epochs",         type=int, default=3,         help="Local training epochs")
    p.add_argument("--work-dir",       default="./client_workdir",  help="Temp dir for .pt files")
    p.add_argument("--device",         default="cpu",               help="Torch device (cpu/cuda)")
    p.add_argument("--rounds",         type=int, default=1,         help="Number of FL rounds to run")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    logger.info(
        f"FL Client Node starting | id={args.client_id} | "
        f"server={args.server_url} | rounds={args.rounds}"
    )

    for rnd in range(1, args.rounds + 1):
        logger.info(f"=== Round {rnd}/{args.rounds} ===")
        try:
            result = run_fl_round(
                server_url     = args.server_url,
                client_id      = args.client_id,
                wallet_address = args.wallet_address,
                data_path      = args.data_path,
                epochs         = args.epochs,
                work_dir       = args.work_dir,
                device         = args.device,
            )
            logger.info(f"Round {rnd} result: {result}")
        except Exception as exc:
            logger.error(f"Round {rnd} failed: {exc}", exc_info=True)
            break

    logger.info("Client node finished.")
