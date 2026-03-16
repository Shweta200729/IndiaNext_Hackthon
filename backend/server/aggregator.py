"""
server/aggregator.py

Aggregation strategies for the Federated Learning server.

All tunable values (trim_ratio, clip_norm, noise_mult, dp_enabled)
come exclusively from FLSettings — no magic numbers in this file.

Pure ML logic: no database calls, no HTTP logic, no dataset specifics.
"""

import logging
import math
from typing import Dict, List, Optional

import torch

from config.settings import FLSettings, settings as _default_settings

logger = logging.getLogger(__name__)

WeightsDict = Dict[str, torch.Tensor]


# ---------------------------------------------------------------------------
# FedAvg
# ---------------------------------------------------------------------------

def fedavg(updates: List[WeightsDict]) -> WeightsDict:
    """
    Federated Averaging (McMahan et al., 2017).

    Stacks client updates layer-wise and computes the element-wise mean.
    No trimming; treats all contributions equally.

    Args:
        updates: Non-empty list of client state dicts (CPU tensors).

    Returns:
        Averaged state dict.

    Raises:
        ValueError: If updates list is empty.
    """
    if not updates:
        raise ValueError("fedavg: cannot aggregate an empty list.")

    aggregated: WeightsDict = {}
    for key in updates[0].keys():
        tensors = [u[key].cpu() for u in updates if key in u]
        if tensors:
            orig_dtype = tensors[0].dtype
            stacked = torch.stack([t.float() for t in tensors])
            aggregated[key] = stacked.mean(dim=0).to(orig_dtype)

    logger.debug(f"[FedAvg] Aggregated {len(updates)} updates.")
    return aggregated


# ---------------------------------------------------------------------------
# Trimmed Mean
# ---------------------------------------------------------------------------

def trimmed_mean(
    updates:    List[WeightsDict],
    cfg:        Optional[FLSettings] = None,
) -> WeightsDict:
    """
    Trimmed Mean aggregation (robust to Byzantine clients).

    For each parameter position, sorts values from all clients,
    removes the top and bottom `trim_ratio` fraction, and averages
    the remaining values.

    trim_ratio comes from cfg.TRIM_RATIO (no magic default here).

    Args:
        updates: Non-empty list of client state dicts.
        cfg:     FLSettings instance (defaults to singleton).

    Returns:
        Trimmed-mean state dict.

    Raises:
        ValueError: If updates is empty.
        ValueError: If trim_ratio is not in [0, 0.5).
    """
    cfg = cfg or _default_settings
    trim_ratio = cfg.TRIM_RATIO

    if not updates:
        raise ValueError("trimmed_mean: cannot aggregate an empty list.")
    if not 0.0 <= trim_ratio < 0.5:
        raise ValueError("TRIM_RATIO must be in [0, 0.5).")

    n          = len(updates)
    trim_count = int(n * trim_ratio)

    # If trimming would remove all clients, fall back to fedavg
    if 2 * trim_count >= n:
        logger.warning(
            f"[TrimmedMean] trim_count={trim_count} would trim all {n} updates. "
            "Falling back to FedAvg."
        )
        return fedavg(updates)

    aggregated: WeightsDict = {}
    for key in updates[0].keys():
        tensors = [u[key].cpu() for u in updates if key in u]
        if not tensors:
            continue
        orig_dtype = tensors[0].dtype
        stacked = torch.stack([t.float() for t in tensors])   # (n, *shape)
        sorted_, _ = torch.sort(stacked, dim=0)
        sliced = sorted_[trim_count: n - trim_count]
        aggregated[key] = sliced.mean(dim=0).to(orig_dtype)

    logger.debug(
        f"[TrimmedMean] Aggregated {n} updates, "
        f"trim_count={trim_count} (ratio={trim_ratio})."
    )
    return aggregated


# ---------------------------------------------------------------------------
# Differential Privacy utilities
# ---------------------------------------------------------------------------

def clip_weights(weights: WeightsDict, clip_norm: float) -> WeightsDict:
    """
    Per-update L2 norm clipping.

    Scales the entire weight dict so its total L2 norm ≤ clip_norm.
    No-op when the norm is already within bounds.

    Args:
        weights:   Client state dict.
        clip_norm: Maximum allowed L2 norm (from cfg.DP_CLIP_NORM).

    Returns:
        Clipped state dict (new tensors, originals unchanged).
    """
    sq_sum = 0.0
    with torch.no_grad():
        for v in weights.values():
            sq_sum += torch.sum(v.cpu().float() ** 2).item()
    total_norm = math.sqrt(sq_sum)
    scale = min(1.0, clip_norm / (total_norm + 1e-9))
    return {k: v.cpu() * scale for k, v in weights.items()}


def add_gaussian_noise(
    aggregated:        WeightsDict,
    clip_norm:         float,
    noise_multiplier:  float,
    num_clients:       int,
) -> WeightsDict:
    """
    Adds calibrated Gaussian noise for (ε, δ)-DP.

    σ = noise_multiplier × clip_norm / num_clients

    Args:
        aggregated:       Aggregated weight dict.
        clip_norm:        Clipping norm used on individual updates.
        noise_multiplier: σ scale relative to clip_norm.
        num_clients:      Number of contributing clients.

    Returns:
        Noisy weight dict.
    """
    sigma = noise_multiplier * clip_norm / max(num_clients, 1)
    noisy: WeightsDict = {}
    with torch.no_grad():
        for key, tensor in aggregated.items():
            # Noise is always added in float space; cast back to original dtype
            orig_dtype = tensor.dtype
            noisy[key] = (tensor.float() + torch.randn_like(tensor.float()) * sigma).to(orig_dtype)
    logger.debug(f"[DP] Gaussian noise added with σ={sigma:.6f}.")
    return noisy


def dp_trimmed_mean(
    updates: List[WeightsDict],
    cfg:     Optional[FLSettings] = None,
) -> WeightsDict:
    """
    Full DP-FL aggregation pipeline:
        1. Clip each update to cfg.DP_CLIP_NORM.
        2. Trimmed Mean aggregation using cfg.TRIM_RATIO.
        3. Add Gaussian noise with cfg.DP_NOISE_MULT.

    If cfg.DP_ENABLED is False, falls back to plain trimmed_mean.

    Args:
        updates: Non-empty list of client state dicts.
        cfg:     FLSettings instance (defaults to singleton).

    Returns:
        Aggregated (and optionally noisy) state dict.
    """
    cfg = cfg or _default_settings

    if not cfg.DP_ENABLED:
        logger.debug("[Aggregation] DP disabled — using plain Trimmed Mean.")
        return trimmed_mean(updates, cfg=cfg)

    clipped   = [clip_weights(u, cfg.DP_CLIP_NORM) for u in updates]
    agg       = trimmed_mean(clipped, cfg=cfg)
    noisy     = add_gaussian_noise(
        agg,
        clip_norm        = cfg.DP_CLIP_NORM,
        noise_multiplier = cfg.DP_NOISE_MULT,
        num_clients      = len(updates),
    )
    logger.info(
        f"[Aggregation] DP-Trimmed-Mean complete | "
        f"n={len(updates)}, clip={cfg.DP_CLIP_NORM}, σ_mult={cfg.DP_NOISE_MULT}"
    )
    return noisy


# ---------------------------------------------------------------------------
# Unified entry-point used by server/main.py
# ---------------------------------------------------------------------------

def aggregate(
    updates: List[WeightsDict],
    cfg:     Optional[FLSettings] = None,
) -> tuple[WeightsDict, str]:
    """
    Selects and runs the appropriate aggregation strategy from settings.

    Strategy selection:
        DP_ENABLED=True  → DP-Trimmed Mean
        DP_ENABLED=False, TRIM_RATIO > 0 → Trimmed Mean
        DP_ENABLED=False, TRIM_RATIO == 0 → FedAvg

    Args:
        updates: Non-empty list of accepted client state dicts.
        cfg:     FLSettings instance.

    Returns:
        (aggregated_weights, method_name_string)
    """
    cfg = cfg or _default_settings

    if cfg.DP_ENABLED:
        return dp_trimmed_mean(updates, cfg=cfg), "DP-Trimmed Mean"
    elif cfg.TRIM_RATIO > 0:
        return trimmed_mean(updates, cfg=cfg), "Trimmed Mean"
    else:
        return fedavg(updates), "FedAvg"
