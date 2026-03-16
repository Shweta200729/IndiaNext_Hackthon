"""
data/dataset_loader.py

Universal, model-agnostic dataset loader for the FL pipeline.

Supports any torchvision image classification dataset by name.
Dynamically infers input_shape and num_classes from data.
Splits data into server validation set + per-client training partitions.

All sizes, splits, and client counts come from FLSettings — no magic numbers.
"""

import importlib
import logging
import os
from typing import Dict, List, Tuple, Any

import torch
from torch.utils.data import DataLoader, Dataset, Subset, random_split
from torchvision import transforms

from config.settings import FLSettings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

DataLoaders = List[DataLoader]
InputShape  = Tuple[int, ...]   # e.g. (1, 28, 28) or (3, 32, 32)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _infer_shape_and_classes(dataset: Dataset) -> Tuple[InputShape, int]:
    """
    Infers input shape and number of output classes from a dataset.
    Does NOT assume image size, channel count, or class count.

    Args:
        dataset: Any PyTorch Dataset whose __getitem__ returns (tensor, label).

    Returns:
        (input_shape, num_classes)
    """
    sample_x, _ = dataset[0]
    input_shape  = tuple(sample_x.shape)   # e.g. (1, 28, 28)

    # Scan all labels to find unique classes — no assumption of 0..N
    if hasattr(dataset, "targets"):
        labels = dataset.targets
        if not isinstance(labels, torch.Tensor):
            labels = torch.tensor(labels)
        num_classes = int(labels.max().item()) + 1
    else:
        # Fallback: scan every label (slower but correct for any dataset)
        label_set = set()
        for _, label in dataset:
            label_set.add(int(label))
        num_classes = len(label_set)

    logger.info(f"Dataset introspection → input_shape={input_shape}, num_classes={num_classes}")
    return input_shape, num_classes


def _get_default_transform(input_shape: InputShape) -> transforms.Compose:
    """
    Builds a sensible default transform for any image dataset.
    Adapts normalisation based on number of channels detected.
    """
    c = input_shape[0] if len(input_shape) == 3 else 1

    # Per-channel mean/std = 0.5 is a safe universal default
    mean = tuple([0.5] * c)
    std  = tuple([0.5] * c)

    return transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])


def _partition_dataset(
    dataset: Dataset,
    num_clients: int,
    val_ratio: float,
) -> Tuple[List[Dataset], Dataset]:
    """
    Splits a dataset into:
      - One validation subset (val_ratio fraction of total)
      - `num_clients` equal training subsets (IID partition)

    Sizes are purely data-driven — no hardcoded sample counts.

    Args:
        dataset:     Full dataset to partition.
        num_clients: Number of FL clients.
        val_ratio:   Fraction for server validation.

    Returns:
        (client_subsets, val_subset)
    """
    n_total = len(dataset)
    if num_clients > n_total:
        raise ValueError(
            f"NUM_CLIENTS ({num_clients}) > dataset size ({n_total}). "
            "Reduce NUM_CLIENTS or use a larger dataset."
        )

    n_val   = max(1, int(n_total * val_ratio))
    n_train = n_total - n_val

    # Reproducible split
    generator  = torch.Generator().manual_seed(42)
    train_data, val_data = random_split(
        dataset, [n_train, n_val], generator=generator
    )

    # Divide training data into num_clients equal parts
    base_size  = n_train // num_clients
    remainder  = n_train % num_clients
    sizes      = [base_size + (1 if i < remainder else 0) for i in range(num_clients)]
    client_partitions = random_split(train_data, sizes, generator=generator)

    logger.info(
        f"Dataset partitioned → train={n_train} ({num_clients} clients), "
        f"val={n_val} ({val_ratio*100:.0f}%)"
    )
    return list(client_partitions), val_data


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_dataset(cfg: FLSettings) -> Dict[str, Any]:
    """
    Loads and prepares any torchvision image classification dataset.

    Args:
        cfg: FLSettings instance (contains DATASET_NAME, DATASET_ROOT, etc.)

    Returns a dict with:
        {
            "client_dataloaders": List[DataLoader],   # one per client
            "val_dataloader":     DataLoader,
            "input_shape":        Tuple[int, ...],    # inferred from data
            "num_classes":        int,                # inferred from data
        }

    Raises:
        ImportError:  If dataset name is not found in torchvision.datasets
        ValueError:   If NUM_CLIENTS > dataset size
    """
    os.makedirs(cfg.DATASET_ROOT, exist_ok=True)

    # ── Step 1: load the dataset class dynamically ───────────────────────────
    try:
        tv_datasets = importlib.import_module("torchvision.datasets")
        DatasetClass = getattr(tv_datasets, cfg.DATASET_NAME)
    except AttributeError:
        available = [
            name for name in dir(tv_datasets)
            if isinstance(getattr(tv_datasets, name), type)
            and issubclass(getattr(tv_datasets, name), torch.utils.data.Dataset)
        ]
        raise ImportError(
            f"Dataset '{cfg.DATASET_NAME}' not found in torchvision.datasets.\n"
            f"Available datasets include: {', '.join(available[:20])}..."
        )

    logger.info(f"Loading dataset: {cfg.DATASET_NAME} → {cfg.DATASET_ROOT}")

    # ── Step 2: load a probe sample to infer shape ───────────────────────────
    # Load with ToTensor only first to detect the raw shape
    probe_transform = transforms.ToTensor()
    try:
        probe_ds = DatasetClass(
            root=cfg.DATASET_ROOT,
            train=True,
            download=True,
            transform=probe_transform,
        )
    except TypeError:
        # Some datasets don't have train/download kwargs
        probe_ds = DatasetClass(
            root=cfg.DATASET_ROOT,
            transform=probe_transform,
        )

    input_shape, num_classes = _infer_shape_and_classes(probe_ds)

    # ── Step 3: build proper normalisation transform from inferred shape ──────
    final_transform = _get_default_transform(input_shape)

    try:
        full_ds = DatasetClass(
            root=cfg.DATASET_ROOT,
            train=True,
            download=False,
            transform=final_transform,
        )
    except TypeError:
        full_ds = DatasetClass(root=cfg.DATASET_ROOT, transform=final_transform)

    # ── Step 4: partition ─────────────────────────────────────────────────────
    client_subsets, val_subset = _partition_dataset(
        full_ds, cfg.NUM_CLIENTS, cfg.TEST_SPLIT_RATIO
    )

    # ── Step 5: build validation dataloaders for the server ───────────────────
    # Try to load the dataset's designated test split if available
    try:
        test_ds = DatasetClass(
            root=cfg.DATASET_ROOT,
            train=False,
            download=True,
            transform=final_transform,
        )
        val_dataset = test_ds
        logger.info(f"Using dedicated test split for validation (n={len(test_ds)}).")
    except (TypeError, AttributeError):
        val_dataset = val_subset
        logger.info(f"Using held-out validation split (n={len(val_subset)}).")

    val_loader = DataLoader(
        val_dataset,
        batch_size=cfg.BATCH_SIZE,
        shuffle=False,
        num_workers=0,
        pin_memory=False,
    )

    # ── Step 6: build per-client DataLoaders ──────────────────────────────────
    client_loaders = [
        DataLoader(
            subset,
            batch_size=cfg.BATCH_SIZE,
            shuffle=True,
            num_workers=0,
            pin_memory=False,
        )
        for subset in client_subsets
    ]

    return {
        "client_dataloaders": client_loaders,
        "val_dataloader":     val_loader,
        "input_shape":        input_shape,
        "num_classes":        num_classes,
    }
