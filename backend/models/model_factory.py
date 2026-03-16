"""
models/model_factory.py

Dynamic model factory for the FL pipeline.

Builds an appropriate PyTorch model given:
  - input_shape  : tuple inferred from the dataset (e.g. (1,28,28) or (512,))
  - num_classes  : int inferred from the dataset labels

Architecture decision:
  - 3-D input (C, H, W)  → Configurable CNN
  - 1-D input (D,)       → Multi-layer MLP

All layer sizes are derived from input_shape and num_classes.
No hardcoded channel counts, no hardcoded hidden dims (from settings).
"""

import math
import logging
from typing import List, Tuple, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)

InputShape = Tuple[int, ...]


# ---------------------------------------------------------------------------
# CNN builder  (for 3-D image inputs)
# ---------------------------------------------------------------------------

class _DynamicCNN(nn.Module):
    """
    Convolutional network that adapts to any (C, H, W) input shape.

    Two conv blocks with MaxPool, then a fully-connected head.
    Channel progression is proportional to the input channels (not hardcoded).
    Final linear layer size is computed from actual spatial dimensions after pooling.
    """

    def __init__(self, input_shape: Tuple[int, int, int], num_classes: int):
        super().__init__()
        C, H, W = input_shape

        # Scale feature maps proportionally to input channels (min 8, max 128)
        feat1 = max(8 ,  C * 8)
        feat2 = max(16, C * 16)

        self.conv1 = nn.Conv2d(C,     feat1, kernel_size=3, padding=1)
        self.bn1   = nn.BatchNorm2d(feat1)
        self.conv2 = nn.Conv2d(feat1, feat2, kernel_size=3, padding=1)
        self.bn2   = nn.BatchNorm2d(feat2)
        self.pool  = nn.MaxPool2d(2, 2)
        self.drop  = nn.Dropout(0.25)

        # Compute exact flattened size after two MaxPool operations
        h_out = H // 4
        w_out = W // 4
        flat  = feat2 * h_out * w_out

        # Guard: if image is too small for two pooling stages
        if h_out < 1 or w_out < 1:
            raise ValueError(
                f"Input spatial size ({H}×{W}) is too small for two MaxPool(2,2) layers. "
                f"Minimum requirement: 4×4."
            )

        self.fc1 = nn.Linear(flat, 128)
        self.fc2 = nn.Linear(128,  num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pool(F.relu(self.bn1(self.conv1(x))))
        x = self.pool(F.relu(self.bn2(self.conv2(x))))
        x = self.drop(x)
        x = x.view(x.size(0), -1)
        x = F.relu(self.fc1(x))
        return self.fc2(x)


# ---------------------------------------------------------------------------
# MLP builder  (for 1-D / flat feature inputs)
# ---------------------------------------------------------------------------

class _DynamicMLP(nn.Module):
    """
    Fully-connected MLP for 1-D feature inputs (tabular data, flat vectors).

    Hidden layer sizes come from settings.MODEL_HIDDEN_DIMS.
    BN + Dropout applied after each hidden layer for regularisation.
    """

    def __init__(self, input_dim: int, hidden_dims: List[int], num_classes: int):
        super().__init__()
        layers: List[nn.Module] = []
        prev = input_dim
        for h in hidden_dims:
            layers += [
                nn.Linear(prev, h),
                nn.BatchNorm1d(h),
                nn.ReLU(inplace=True),
                nn.Dropout(0.2),
            ]
            prev = h
        layers.append(nn.Linear(prev, num_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.float())


# ---------------------------------------------------------------------------
# Public model wrapper
# ---------------------------------------------------------------------------

class FLModel(nn.Module):
    """
    Universal FL model. Wraps either _DynamicCNN or _DynamicMLP depending
    on the input_shape detected from the dataset.

    Exposes:
        get_weights() → Dict[str, Tensor]  (CPU copies)
        set_weights(dict)                  (strict load)
        arch  → str  ("CNN" | "MLP")
    """

    def __init__(
        self,
        input_shape:  InputShape,
        num_classes:  int,
        hidden_dims:  Optional[List[int]] = None,
    ):
        super().__init__()
        self.input_shape  = input_shape
        self.num_classes  = num_classes
        self._hidden_dims = hidden_dims or [256, 128]

        if len(input_shape) == 3:
            # Image-like input: (C, H, W)
            self.backbone = _DynamicCNN(input_shape, num_classes)
            self._arch    = "CNN"
        elif len(input_shape) == 1:
            # Tabular / flat input: (D,)
            self.backbone = _DynamicMLP(input_shape[0], self._hidden_dims, num_classes)
            self._arch    = "MLP"
        else:
            raise ValueError(
                f"Unsupported input_shape {input_shape}. "
                "Expected 1-D (tabular) or 3-D (C, H, W) tensors."
            )

        logger.info(
            f"FLModel built → arch={self._arch}, "
            f"input={input_shape}, classes={num_classes}"
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)

    def get_weights(self):
        """CPU-isolated copy of current state dict."""
        return {k: v.cpu().clone() for k, v in self.state_dict().items()}

    def set_weights(self, weights):
        """Strict state dict load — raises RuntimeError on shape mismatch."""
        self.load_state_dict(weights, strict=True)

    @property
    def arch(self) -> str:
        return self._arch

    def __repr__(self) -> str:
        return (
            f"FLModel(arch={self._arch}, input={self.input_shape}, "
            f"classes={self.num_classes})"
        )


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def build_model(
    input_shape:  InputShape,
    num_classes:  int,
    hidden_dims:  Optional[List[int]] = None,
) -> FLModel:
    """
    Instantiates and returns the correct FLModel for the given data shape.

    Args:
        input_shape:  Tuple inferred from dataset (e.g. (1,28,28), (3,32,32), (30,))
        num_classes:  Number of output classes inferred from dataset labels.
        hidden_dims:  Hidden layer sizes for MLP path (from settings.hidden_dims()).
                      Ignored for CNN path.

    Returns:
        Configured FLModel instance (untrained).

    Raises:
        ValueError: If input_shape is neither 1-D nor 3-D.
        ValueError: If num_classes < 2.
    """
    if num_classes < 2:
        raise ValueError(f"num_classes must be >= 2, got {num_classes}.")

    return FLModel(input_shape=input_shape, num_classes=num_classes, hidden_dims=hidden_dims)
