"""
clients/local_training.py

Client-side local training pipeline for the Federated Learning system.

All hyperparameters (epochs, LR, batch size, optimizer) are read from
config.settings — no magic numbers in this file.
No dataset-specific logic. No architecture assumptions.
Works with any FLModel (CNN or MLP).

Real PyTorch training only — no mocking, no fake gradients.
"""

import logging
from typing import Dict, Optional

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

from config.settings import FLSettings, settings as _default_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Weight Loading
# ---------------------------------------------------------------------------

def load_global_weights(
    model: nn.Module,
    weights_dict: Dict[str, torch.Tensor],
) -> None:
    """
    Safely loads server global weights into the local model.

    Validates that layer names and shapes match exactly.
    Raises KeyError if keys diverge (architecture drift detection).
    Raises RuntimeError if tensor shapes are incompatible.

    Args:
        model:        Local PyTorch model instance.
        weights_dict: State dict from the server (CPU tensors).
    """
    local_keys  = set(model.state_dict().keys())
    server_keys = set(weights_dict.keys())

    missing = server_keys - local_keys
    extra   = local_keys  - server_keys

    if missing:
        raise KeyError(
            f"Server weights contain layers absent from local model: {missing}"
        )
    if extra:
        raise KeyError(
            f"Local model has layers absent from server weights: {extra}"
        )

    model.load_state_dict(weights_dict, strict=True)
    logger.debug("Global weights loaded into local model.")


# ---------------------------------------------------------------------------
# 2. Local Training Loop
# ---------------------------------------------------------------------------

def train_local_model(
    model:      nn.Module,
    dataloader: DataLoader,
    cfg:        Optional[FLSettings] = None,
    epochs:     Optional[int]        = None,
    lr:         Optional[float]      = None,
    device:     Optional[str]        = None,
) -> Dict[str, torch.Tensor]:
    """
    Runs a genuine local training loop on the client's private data.

    All hyperparameters default to values from FLSettings unless
    explicitly overridden (useful for testing).

    Pipeline per batch:
        1. Forward pass through model
        2. CrossEntropyLoss computation
        3. Backward pass (real gradients)
        4. Optimizer step (SGD or Adam per settings.OPTIMIZER)

    Args:
        model:      Local model (pre-loaded with global weights).
        dataloader: DataLoader over client's local partition.
        cfg:        FLSettings instance (defaults to module-level singleton).
        epochs:     Override for LOCAL_EPOCHS.
        lr:         Override for LEARNING_RATE.
        device:     Override for DEVICE.

    Returns:
        Updated state dict (CPU tensors, detached from computation graph).

    Raises:
        ValueError: If dataloader dataset is empty.
    """
    cfg = cfg or _default_settings

    _epochs = epochs if epochs is not None else cfg.LOCAL_EPOCHS
    _lr     = lr     if lr     is not None else cfg.LEARNING_RATE
    _device = device if device is not None else cfg.DEVICE

    if len(dataloader.dataset) == 0:
        raise ValueError("Dataloader is empty — cannot train.")

    model = model.to(_device)
    model.train()

    criterion = nn.CrossEntropyLoss()

    if cfg.OPTIMIZER == "adam":
        optimizer = optim.Adam(model.parameters(), lr=_lr)
    else:
        optimizer = optim.SGD(model.parameters(), lr=_lr, momentum=0.9)

    total_batches = 0

    for epoch in range(1, _epochs + 1):
        epoch_loss = 0.0
        correct    = 0
        total      = 0

        for data, targets in dataloader:
            data    = data.to(_device)
            targets = targets.to(_device)

            optimizer.zero_grad()

            outputs = model(data)        # real forward pass
            loss    = criterion(outputs, targets)  # real loss
            loss.backward()              # real gradients
            optimizer.step()             # real update

            epoch_loss += loss.item()
            _, predicted = torch.max(outputs, dim=1)
            correct      += (predicted == targets).sum().item()
            total        += targets.size(0)
            total_batches += 1

        avg_loss = epoch_loss / max(len(dataloader), 1)
        accuracy = correct   / max(total, 1)

        logger.info(
            f"[Local] Epoch {epoch}/{_epochs} | "
            f"Loss: {avg_loss:.4f} | Acc: {accuracy*100:.2f}%"
        )

    logger.info(
        f"[Local] Training complete — {_epochs} epoch(s), "
        f"{total_batches} batches."
    )

    return get_updated_weights(model)


# ---------------------------------------------------------------------------
# 3. Weight Extraction
# ---------------------------------------------------------------------------

def get_updated_weights(model: nn.Module) -> Dict[str, torch.Tensor]:
    """
    Returns a detached CPU copy of the model's current state dict.

    Safe for serialisation and transmission — no computation graph references.
    """
    return {
        k: v.cpu().detach().clone()
        for k, v in model.state_dict().items()
    }
