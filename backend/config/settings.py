"""
config/settings.py

Single source of truth for all configurable parameters in the FL system.
All values load from environment variables / .env file.
No hardcoded magic numbers anywhere else in the codebase.

Usage:
    from config.settings import settings   # singleton
    print(settings.LEARNING_RATE)
"""

import os
from typing import List, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FLSettings(BaseSettings):
    """
    Federated Learning system configuration.
    All fields load from environment variables or a .env file.
    """

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Dataset ──────────────────────────────────────────────────────────────
    DATASET_NAME: str = "MNIST"
    """
    torchvision dataset name (e.g. MNIST, FashionMNIST, CIFAR10) OR
    the string "CSV" for custom CSV uploads.
    """

    DATASET_ROOT: str = "./data"
    """Local directory where datasets are downloaded / stored."""

    TEST_SPLIT_RATIO: float = 0.2
    """Fraction of training data reserved for server-side validation (0 < ratio < 1)."""

    # ── Federation ───────────────────────────────────────────────────────────
    NUM_CLIENTS: int = 5
    """Number of simulated or real FL clients."""

    LOCAL_EPOCHS: int = 1
    """Number of local training epochs per round."""

    BATCH_SIZE: int = 32
    """Mini-batch size for both local training and validation."""

    LEARNING_RATE: float = 0.01
    """Client-side learning rate."""

    OPTIMIZER: str = "sgd"
    """Optimizer type: 'sgd' or 'adam'."""

    MIN_AGGREGATE_SIZE: int = 1
    """Minimum number of accepted updates before aggregation fires."""

    # ── Model ────────────────────────────────────────────────────────────────
    MODEL_HIDDEN_DIMS: str = "256,128"
    """
    Comma-separated hidden layer sizes for MLP path.
    E.g. '512,256,128'
    """

    DEVICE: str = "cpu"
    """Torch device: 'cpu' or 'cuda'."""

    # ── Byzantine Detection ──────────────────────────────────────────────────
    NORM_THRESHOLD: float = 1000.0
    """Maximum L2 norm allowed for an update. Updates above this are rejected."""

    DISTANCE_THRESHOLD: float = 500.0
    """Maximum L2 distance from global model allowed for an update."""

    # ── Aggregation ──────────────────────────────────────────────────────────
    TRIM_RATIO: float = 0.1
    """
    Fraction of extreme updates to trim in Trimmed Mean aggregation.
    Must be in [0, 0.5).
    """

    DP_ENABLED: bool = False
    """Enable Differential Privacy noise injection after aggregation."""

    DP_CLIP_NORM: float = 10.0
    """Gradient clipping norm for DP-SGD."""

    DP_NOISE_MULT: float = 1.0
    """Gaussian noise multiplier for DP."""

    # ── Background Training ──────────────────────────────────────────────────
    BG_TRAIN_EPOCHS: int = 3
    """Epochs used when training on user-uploaded CSV datasets."""

    # ── Validators ───────────────────────────────────────────────────────────

    @field_validator("TEST_SPLIT_RATIO")
    @classmethod
    def _val_split(cls, v: float) -> float:
        if not 0.0 < v < 1.0:
            raise ValueError("TEST_SPLIT_RATIO must be strictly between 0 and 1.")
        return v

    @field_validator("TRIM_RATIO")
    @classmethod
    def _val_trim(cls, v: float) -> float:
        if not 0.0 <= v < 0.5:
            raise ValueError("TRIM_RATIO must be in [0, 0.5).")
        return v

    @field_validator("NORM_THRESHOLD", "DISTANCE_THRESHOLD", "DP_CLIP_NORM")
    @classmethod
    def _val_positive(cls, v: float, info) -> float:
        if v <= 0:
            raise ValueError(f"{info.field_name} must be > 0.")
        return v

    @field_validator("OPTIMIZER")
    @classmethod
    def _val_optimizer(cls, v: str) -> str:
        if v.lower() not in ("sgd", "adam"):
            raise ValueError("OPTIMIZER must be 'sgd' or 'adam'.")
        return v.lower()

    @field_validator("NUM_CLIENTS")
    @classmethod
    def _val_clients(cls, v: int) -> int:
        if v < 1:
            raise ValueError("NUM_CLIENTS must be >= 1.")
        return v

    # ── Derived helpers ───────────────────────────────────────────────────────

    def hidden_dims(self) -> List[int]:
        """Parse MODEL_HIDDEN_DIMS string into a list of ints."""
        try:
            return [int(x.strip()) for x in self.MODEL_HIDDEN_DIMS.split(",") if x.strip()]
        except ValueError:
            raise ValueError(
                f"MODEL_HIDDEN_DIMS must be comma-separated integers, got: '{self.MODEL_HIDDEN_DIMS}'"
            )


# Module-level singleton — import this everywhere
settings = FLSettings()
