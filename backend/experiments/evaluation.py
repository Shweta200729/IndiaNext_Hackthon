"""
experiments/evaluation.py

Model evaluation logic for the FL pipeline.

Pure ML: accepts any nn.Module and any DataLoader.
No dataset names, no architecture assumptions, no hardcoded class counts.
"""

import logging
from typing import Dict

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

logger = logging.getLogger(__name__)


def evaluate_model(
    model:      nn.Module,
    dataloader: DataLoader,
    device:     str = "cpu",
) -> Dict[str, float]:
    """
    Evaluates a PyTorch model on a DataLoader.

    Computes:
        - Cross-entropy loss (averaged over all samples)
        - Top-1 accuracy

    Works with any model architecture (CNN, MLP, etc.) and any number of classes.
    Infers nothing from the dataset name or model type.

    Args:
        model:      Any nn.Module that outputs logits of shape (N, num_classes).
        dataloader: DataLoader yielding (inputs, integer_labels) batches.
        device:     Torch device string ('cpu' or 'cuda').

    Returns:
        {'loss': float, 'accuracy': float}  (accuracy in [0, 1])

    Raises:
        ValueError: If the dataloader is empty.
    """
    model.eval()
    model = model.to(device)

    criterion    = nn.CrossEntropyLoss()
    total_loss   = 0.0
    correct      = 0
    total        = 0

    with torch.no_grad():
        for inputs, targets in dataloader:
            inputs  = inputs.to(device)
            targets = targets.to(device)

            outputs = model(inputs)           # (N, num_classes)
            loss    = criterion(outputs, targets)

            total_loss += loss.item() * inputs.size(0)

            _, predicted = torch.max(outputs, dim=1)
            correct      += (predicted == targets).sum().item()
            total        += targets.size(0)

    if total == 0:
        raise ValueError("Evaluation dataloader is empty — cannot compute metrics.")

    avg_loss = total_loss / total
    accuracy = correct   / total

    logger.info(
        f"[Evaluation] loss={avg_loss:.4f} | "
        f"accuracy={accuracy*100:.2f}% ({correct}/{total})"
    )
    return {"loss": avg_loss, "accuracy": accuracy}
