"""
clients/csv_trainer.py

Universal CSV dataset training for the FL pipeline.

Handles ANY CSV file:
  - Auto-detects whether a header row is present.
  - Assumes last column is the label, all others are features.
  - Automatically encodes string labels to integers.
  - Normalises features to zero mean / unit variance.
  - Builds the correct FLModel (CNN or MLP) based on feature count.

No hardcoded column counts, no hardcoded class counts, no MNIST assumptions.

Called by server/_train_client_background after a user uploads a CSV.
"""

import csv
import math
import os
import sys
import logging
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

logger = logging.getLogger(__name__)

# Ensure the backend root is importable
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)


# ---------------------------------------------------------------------------
# CSV introspection helpers  (exported for use by server/main.py)
# ---------------------------------------------------------------------------


def _sniff_csv(csv_path: str) -> Tuple[bool, int]:
    """
    Detects whether a CSV has a header and counts the number of feature columns.

    Heuristic: if every value in the first row can be parsed as a float,
    there is NO header. Otherwise, the first row is a header.

    Returns:
        (has_header, num_features)
        num_features = total columns − 1 (last col is the label).
    """
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        first_row = next(reader, None)
        if first_row is None:
            raise ValueError(f"CSV file is empty: {csv_path}")

        # Try to parse every cell as float
        try:
            [float(v) for v in first_row]
            has_header = False
        except ValueError:
            has_header = True

        # Count columns from first data row
        if has_header:
            data_row = next(reader, None)
            if data_row is None:
                raise ValueError("CSV has a header but no data rows.")
            num_cols = len(data_row)
        else:
            num_cols = len(first_row)

    num_features = num_cols - 1  # last column = label
    if num_features < 1:
        raise ValueError(
            f"CSV has only {num_cols} column(s). Need at least 2 (features + label)."
        )

    return has_header, num_features


def _build_label_map(csv_path: str, has_header: bool) -> Dict[str, int]:
    """
    Scans the label column (last column) and builds a string→int map.

    Works for integer labels ("0", "1", ...) and string labels ("cat", "dog", ...).

    Returns:
        Ordered dict mapping unique label strings to contiguous integer indices.
    """
    labels = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        if has_header:
            next(reader)  # skip header
        for row in reader:
            if row:
                labels.add(row[-1].strip())

    sorted_labels = sorted(labels)
    return {label: idx for idx, label in enumerate(sorted_labels)}


# ---------------------------------------------------------------------------
# Universal CSV Dataset
# ---------------------------------------------------------------------------


class UniversalCSVDataset(Dataset):
    """
    Parses ANY CSV file into (feature_tensor, label_int) pairs.

    - Last column = label (encoded via label_map).
    - All other columns = float features, normalised per-column.
    - For image-like data (feature count is a perfect square ≥ 64),
      reshapes features to (1, side, side) for CNN input.
    - Otherwise keeps features flat as (num_features,) for MLP.

    No hardcoded column counts or class assumptions.
    """

    def __init__(
        self,
        csv_path: str,
        label_map: Dict[str, int],
        has_header: bool,
        max_rows: int = 100_000,
    ):
        super().__init__()
        self.label_map = label_map
        self.features: List[torch.Tensor] = []
        self.labels: List[int] = []
        self._parse(csv_path, has_header, max_rows)

    def _parse(self, path: str, has_header: bool, max_rows: int):
        raw_rows: List[List[str]] = []
        skipped = 0

        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            if has_header:
                next(reader, None)

            for i, row in enumerate(reader):
                if i >= max_rows:
                    break
                if not row or len(row) < 2:
                    skipped += 1
                    continue
                try:
                    label_str = row[-1].strip()
                    if label_str not in self.label_map:
                        skipped += 1
                        continue

                    self.labels.append(self.label_map[label_str])
                    raw_rows.append([v.strip() for v in row[:-1]])
                except IndexError:
                    skipped += 1
                    continue

        if not raw_rows:
            logger.warning(f"No valid rows parsed from {os.path.basename(path)}.")
            return

        # Infer types column by column and convert
        num_features = len(raw_rows[0])
        parsed_cols = [[] for _ in range(num_features)]

        for col_idx in range(num_features):
            is_numeric = True
            for r in raw_rows:
                try:
                    float(r[col_idx])
                except ValueError:
                    is_numeric = False
                    break

            if is_numeric:
                for r in raw_rows:
                    parsed_cols[col_idx].append(float(r[col_idx]))
            else:
                # String column -> categorical (label encode)
                unique_vals = sorted(list(set(r[col_idx] for r in raw_rows)))
                val_to_idx = {v: float(idx) for idx, v in enumerate(unique_vals)}
                for r in raw_rows:
                    parsed_cols[col_idx].append(val_to_idx[r[col_idx]])

        # Transpose columns back to rows
        raw_features = list(zip(*parsed_cols))

        # Convert to tensor and normalise per-column
        feat_tensor = torch.tensor(raw_features, dtype=torch.float32)
        mean = feat_tensor.mean(dim=0)
        std = feat_tensor.std(dim=0).clamp(min=1e-7)
        feat_tensor = (feat_tensor - mean) / std

        # Decide shape: image (1,H,W) or flat (D,)
        num_feat = feat_tensor.size(1)
        side = int(math.isqrt(num_feat))
        is_image = side * side == num_feat and side >= 8

        for idx in range(feat_tensor.size(0)):
            row_t = feat_tensor[idx]
            if is_image:
                row_t = row_t.view(1, side, side)
            self.features.append(row_t)

        logger.info(
            f"UniversalCSVDataset: {len(self.features)} samples, "
            f"{num_feat} features ({'image ' + str(side) + 'x' + str(side) if is_image else 'flat'}), "
            f"{len(self.label_map)} classes, skipped {skipped} rows."
        )

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        return self.features[idx], self.labels[idx]


# ---------------------------------------------------------------------------
# Training entry-point
# ---------------------------------------------------------------------------


def train_on_csv(
    client_id: str,
    csv_path: str,
    global_weights: dict,
    epochs: int = 3,
    batch_size: int = 64,
    lr: float = 0.01,
    device: str = "cpu",
) -> Optional[str]:
    """
    Universal CSV training pipeline.

    1. Sniffs the CSV to detect header / feature count.
    2. Builds a label map from the label column.
    3. Creates a UniversalCSVDataset.
    4. Builds the correct FLModel from the data shape.
    5. Loads global weights (if compatible).
    6. Runs a real local training loop.
    7. Saves updated weights to disk.

    Args:
        client_id:      Client identifier string.
        csv_path:       Path to the uploaded CSV.
        global_weights: Current global model state_dict.
        epochs:         Local training epochs.
        batch_size:     Mini-batch size.
        lr:             Learning rate.
        device:         "cpu" or "cuda".

    Returns:
        Tuple of (weights_path_or_None, epoch_metrics_list).
        epoch_metrics_list: [{epoch, loss, accuracy}, ...] one entry per epoch.
    """
    from models.model_factory import build_model
    from config.settings import settings as cfg

    logger.info(f"[CSV Train] Starting for {client_id}, file: {csv_path}")

    if not os.path.isfile(csv_path):
        logger.error(f"[CSV Train] ❌ File not found: {csv_path}")
        return None

    try:
        # ── Step 1: Detect CSV shape ─────────────────────────────────────
        has_header, num_features = _sniff_csv(csv_path)
        label_map = _build_label_map(csv_path, has_header)
        num_classes = len(label_map)

        if num_classes < 2:
            logger.warning(f"[CSV Train] Only {num_classes} class(es) found. Need ≥ 2.")
            return None

        # ── Step 2: Load dataset ─────────────────────────────────────────
        dataset = UniversalCSVDataset(csv_path, label_map, has_header)
        if len(dataset) == 0:
            logger.warning(f"[CSV Train] No valid rows for {client_id}.")
            return None

        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        # ── Step 3: Build model matching the data shape ──────────────────
        sample_x, _ = dataset[0]
        input_shape = tuple(sample_x.shape)

        local_model = build_model(
            input_shape=input_shape,
            num_classes=num_classes,
            hidden_dims=cfg.hidden_dims(),
        )

        # ── Step 4: Load global weights if they fit ──────────────────────
        try:
            local_model.load_state_dict(global_weights, strict=True)
            logger.info("[CSV Train] Loaded global weights into local model.")
        except Exception as e:
            logger.warning(
                f"[CSV Train] Global weights incompatible ({e}). "
                "Training from scratch."
            )

        # ── Step 5: Train ────────────────────────────────────────────────
        local_model = local_model.to(device)
        local_model.train()

        criterion = nn.CrossEntropyLoss()
        optimizer = optim.SGD(local_model.parameters(), lr=lr, momentum=0.9)

        epoch_metrics: List[Dict] = []

        for epoch in range(1, epochs + 1):
            epoch_loss = 0.0
            correct = 0
            total = 0

            for data, targets in loader:
                data = data.to(device)
                targets = (
                    torch.tensor(targets, dtype=torch.long).to(device)
                    if not isinstance(targets, torch.Tensor)
                    else targets.to(device)
                )

                optimizer.zero_grad()
                outputs = local_model(data)
                loss = criterion(outputs, targets)
                loss.backward()
                optimizer.step()

                epoch_loss += loss.item()
                _, pred = torch.max(outputs, 1)
                correct += (pred == targets).sum().item()
                total += targets.size(0)

            acc = correct / max(total, 1)
            epoch_loss_avg = epoch_loss / max(len(loader), 1)
            logger.info(
                f"[CSV Train] {client_id} epoch {epoch}/{epochs} | "
                f"loss={epoch_loss_avg:.4f} | acc={acc*100:.1f}%"
            )
            epoch_metrics.append({
                "epoch": epoch,
                "loss": round(float(epoch_loss_avg), 6),
                "accuracy": round(float(acc), 6),
            })

        # ── Step 6: Save weights ─────────────────────────────────────────
        client_dir = os.path.dirname(csv_path)
        weights_path = os.path.join(client_dir, f"weights_{client_id}.pt")

        updated = {
            k: v.cpu().detach().clone() for k, v in local_model.state_dict().items()
        }
        torch.save(updated, weights_path)

        logger.info(f"[CSV Train] ✅ Saved weights → {weights_path}")
        return weights_path, epoch_metrics

    except Exception as exc:
        logger.error(f"[CSV Train] ❌ {client_id}: {exc}", exc_info=True)
        return None, []
