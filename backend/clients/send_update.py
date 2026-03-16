"""
client/send_update.py

Handles serialization and network transmission of trained client weights
to the FastAPI FL server's POST /update endpoint.

No mocking. Real torch.save serialization, real HTTP multipart upload.
"""

import io
import os
import sys
import logging
from typing import Dict, Optional

import torch
import requests

logger = logging.getLogger(__name__)

# Server base URL — read from env or default to localhost
FL_SERVER_URL = os.getenv("FL_SERVER_URL", "http://localhost:8000/fl")


def serialize_weights(weights: Dict[str, torch.Tensor]) -> bytes:
    """
    Serializes a PyTorch state dict to a bytes buffer using torch.save.

    Uses an in-memory BytesIO buffer to avoid writing temp files to disk.

    Args:
        weights: CPU-side state dict from the local model.

    Returns:
        Raw bytes ready to be sent as a multipart file upload.
    """
    buffer = io.BytesIO()
    torch.save(weights, buffer)
    buffer.seek(0)
    return buffer.read()


def send_update_to_server(
    client_id: str,
    weights: Dict[str, torch.Tensor],
    server_url: Optional[str] = None,
) -> Dict:
    """
    Serializes the client's trained weights and sends them to the FL server
    via a multipart POST /update request.

    The server will:
      1. Deserialize the weight file.
      2. Run malicious detection.
      3. Either queue the update for aggregation or reject it.

    Args:
        client_id:  Unique string identifying this client node.
        weights:    State dict produced by get_updated_weights().
        server_url: Override the target URL (defaults to FL_SERVER_URL env var).

    Returns:
        The parsed JSON response dict from the server, e.g.:
          {"status": "ACCEPT", "message": "Update queued."}
          {"status": "REJECT", "reason": "..."}

    Raises:
        requests.exceptions.ConnectionError: If the server is unreachable.
        RuntimeError: If the server returns a non-2xx HTTP response.
    """
    url = f"{server_url or FL_SERVER_URL}/update"

    # Serialize weights to bytes in-memory
    weight_bytes = serialize_weights(weights)

    logger.info(f"[Client {client_id}] Sending weight update to {url} ...")

    try:
        response = requests.post(
            url,
            data={"client_id": client_id},
            files={"file": ("weights.pt", weight_bytes, "application/octet-stream")},
            timeout=30,
        )
    except requests.exceptions.ConnectionError as e:
        logger.error(f"[Client {client_id}] Could not reach FL server at {url}: {e}")
        raise

    if not response.ok:
        raise RuntimeError(
            f"[Client {client_id}] Server returned HTTP {response.status_code}: "
            f"{response.text}"
        )

    result = response.json()
    status  = result.get("status", "UNKNOWN")
    reason  = result.get("reason", result.get("message", ""))

    if status == "ACCEPT":
        logger.info(f"[Client {client_id}] ✅ Update ACCEPTED by server. {reason}")
    elif status == "REJECT":
        logger.warning(f"[Client {client_id}] ❌ Update REJECTED by server. Reason: {reason}")
    else:
        logger.warning(f"[Client {client_id}] ⚠️  Unknown server response: {result}")

    print(f"[{client_id}] {status}: {reason}")
    return result
