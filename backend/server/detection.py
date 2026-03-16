"""
server/detection.py

Byzantine update detection for the FL aggregation server.

Decision thresholds (NORM_THRESHOLD, DISTANCE_THRESHOLD) come exclusively
from config.settings — no magic numbers in this file.

Pure ML logic: no database calls, no HTTP logic, no dataset specifics.
Works on any model's state_dict — no architecture assumptions.
"""

import logging
from typing import Dict, Tuple

import torch

from config.settings import FLSettings, settings as _default_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def flattened_l2_norm(weights_dict: Dict[str, torch.Tensor]) -> float:
    """
    Computes the total L2 norm of a weight dictionary.
    All tensors are flattened and combined before taking the square root.

    Args:
        weights_dict: Model state dict (any architecture).

    Returns:
        Scalar L2 norm (float).
    """
    sq_sum = 0.0
    with torch.no_grad():
        for tensor in weights_dict.values():
            sq_sum += torch.sum(tensor.cpu().float() ** 2).item()
    return sq_sum ** 0.5


def l2_distance(
    weights_a: Dict[str, torch.Tensor],
    weights_b: Dict[str, torch.Tensor],
) -> float:
    """
    Computes the L2 distance between two weight dictionaries.

    Keys present only in one dict contribute the full norm of that tensor
    (graceful handling of partial key overlap).

    Args:
        weights_a: First state dict.
        weights_b: Second state dict.

    Returns:
        Scalar L2 distance (float).
    """
    sq_sum = 0.0
    all_keys = set(weights_a.keys()) | set(weights_b.keys())
    with torch.no_grad():
        for key in all_keys:
            if key in weights_a and key in weights_b:
                diff    = weights_a[key].cpu().float() - weights_b[key].cpu().float()
                sq_sum += torch.sum(diff ** 2).item()
            elif key in weights_a:
                sq_sum += torch.sum(weights_a[key].cpu().float() ** 2).item()
            else:
                sq_sum += torch.sum(weights_b[key].cpu().float() ** 2).item()
    return sq_sum ** 0.5


# ---------------------------------------------------------------------------
# Public detection function
# ---------------------------------------------------------------------------

def detect_update(
    update_weights: Dict[str, torch.Tensor],
    global_weights: Dict[str, torch.Tensor],
    cfg: FLSettings = None,
) -> Tuple[str, str, float, float]:
    """
    Decides whether a client update is safe to aggregate.

    Checks:
        1. L2 norm of the update → must be <= cfg.NORM_THRESHOLD
        2. L2 distance from global model → must be <= cfg.DISTANCE_THRESHOLD

    All thresholds come from FLSettings — no hardcoded numbers.

    Args:
        update_weights: Client's submitted state dict.
        global_weights: Current server global state dict.
        cfg:            FLSettings instance (defaults to singleton).

    Returns:
        (status, reason, norm, distance)
        where status ∈ {"ACCEPT", "REJECT"}.
    """
    cfg = cfg or _default_settings

    norm     = flattened_l2_norm(update_weights)
    distance = l2_distance(update_weights, global_weights)

    logger.debug(
        f"[Detection] norm={norm:.4f} (thresh={cfg.NORM_THRESHOLD}), "
        f"distance={distance:.4f} (thresh={cfg.DISTANCE_THRESHOLD})"
    )

    if norm > cfg.NORM_THRESHOLD:
        reason = (
            f"Update norm {norm:.4f} exceeds threshold {cfg.NORM_THRESHOLD}"
        )
        logger.info(f"[Detection] REJECT — {reason}")
        return "REJECT", reason, norm, distance

    if distance > cfg.DISTANCE_THRESHOLD:
        reason = (
            f"Update distance {distance:.4f} exceeds threshold "
            f"{cfg.DISTANCE_THRESHOLD}"
        )
        logger.info(f"[Detection] REJECT — {reason}")
        return "REJECT", reason, norm, distance

    logger.info(f"[Detection] ACCEPT — norm={norm:.4f}, distance={distance:.4f}")
    return "ACCEPT", "Update within acceptable bounds.", norm, distance
