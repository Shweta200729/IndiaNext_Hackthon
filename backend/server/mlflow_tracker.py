"""
server/mlflow_tracker.py

MLflow experiment tracking integration for the IndiaNext FL Platform.

Tracks per-round metrics:
  - training_round
  - contributor (client_id)
  - dataset
  - train_accuracy
  - val_accuracy
  - loss
  - aggregation_method

Usage:
  from server.mlflow_tracker import log_fl_round, get_recent_experiments

  run_id = log_fl_round(
      round_num=3,
      contributor="Alice",
      dataset="iris_csv",
      accuracy=0.92,
      loss=0.18,
      params={"lr": 0.01, "epochs": 5},
      method="FedAvg",
  )
"""

import logging
import os
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# MLflow is optional — if not installed, tracking silently no-ops
_MLFLOW_AVAILABLE = False
try:
    import mlflow
    _MLFLOW_AVAILABLE = True
except ImportError:
    logger.warning("[MLflow] mlflow not installed — experiment tracking disabled.")


# ---------------------------------------------------------------------------
# In-memory fallback log (when MLflow is unavailable or for quick preview)
# ---------------------------------------------------------------------------

_mem_experiment_log: List[Dict] = []
_EXPERIMENT_NAME = "IndiaNext-FederatedLearning"


def _ensure_experiment():
    """Create or fetch the MLflow experiment."""
    if not _MLFLOW_AVAILABLE:
        return

    tracking_uri = os.environ.get("MLFLOW_TRACKING_URI", "")
    if tracking_uri:
        mlflow.set_tracking_uri(tracking_uri)

    try:
        exp = mlflow.get_experiment_by_name(_EXPERIMENT_NAME)
        if exp is None:
            mlflow.create_experiment(_EXPERIMENT_NAME)
        mlflow.set_experiment(_EXPERIMENT_NAME)
    except Exception as e:
        logger.warning(f"[MLflow] Could not initialize experiment: {e}")


def log_fl_round(
    round_num: int,
    contributor: str,
    dataset: str,
    accuracy: float,
    loss: float,
    params: Optional[Dict[str, Any]] = None,
    method: str = "FedAvg",
    val_accuracy: Optional[float] = None,
) -> Optional[str]:
    """
    Log one FL aggregation round to MLflow.

    Args:
        round_num: The global model version / round number.
        contributor: Client name / contributor ID.
        dataset: Dataset name used for training.
        accuracy: Training accuracy (0.0–1.0).
        loss: Training loss value.
        params: Optional dict of hyperparameters.
        method: Aggregation method name.
        val_accuracy: Optional validation accuracy.

    Returns:
        MLflow run_id if successful, else None.
    """
    import datetime as dt

    entry = {
        "run_id": None,
        "round": round_num,
        "contributor": contributor,
        "dataset": dataset,
        "accuracy": round(accuracy, 4),
        "loss": round(loss, 4),
        "val_accuracy": round(val_accuracy, 4) if val_accuracy is not None else None,
        "method": method,
        "params": params or {},
        "timestamp": dt.datetime.utcnow().isoformat() + "Z",
    }

    if _MLFLOW_AVAILABLE:
        try:
            _ensure_experiment()
            with mlflow.start_run(run_name=f"Round-{round_num}-{contributor}") as run:
                mlflow.log_param("round", round_num)
                mlflow.log_param("contributor", contributor)
                mlflow.log_param("dataset", dataset)
                mlflow.log_param("method", method)
                if params:
                    for k, v in params.items():
                        mlflow.log_param(k, v)

                mlflow.log_metric("accuracy", accuracy, step=round_num)
                mlflow.log_metric("loss", loss, step=round_num)
                if val_accuracy is not None:
                    mlflow.log_metric("val_accuracy", val_accuracy, step=round_num)

                run_id = run.info.run_id
                entry["run_id"] = run_id
                logger.info(
                    f"[MLflow] Logged round {round_num} | contributor={contributor} "
                    f"| acc={accuracy:.4f} | loss={loss:.4f} | run_id={run_id}"
                )
        except Exception as e:
            logger.error(f"[MLflow] Logging failed: {e}")

    # Always persist in-memory (survives restarts in the current session)
    _mem_experiment_log.append(entry)
    if len(_mem_experiment_log) > 100:
        _mem_experiment_log.pop(0)

    return entry.get("run_id")


def get_recent_experiments(limit: int = 20) -> List[Dict]:
    """
    Return recent experiment runs.

    Tries MLflow server first, falls back to in-memory log.
    """
    if _MLFLOW_AVAILABLE:
        try:
            _ensure_experiment()
            exp = mlflow.get_experiment_by_name(_EXPERIMENT_NAME)
            if exp:
                runs = mlflow.search_runs(
                    experiment_ids=[exp.experiment_id],
                    order_by=["start_time DESC"],
                    max_results=limit,
                )
                if not runs.empty:
                    results = []
                    for _, row in runs.iterrows():
                        results.append(
                            {
                                "run_id": row.get("run_id", ""),
                                "contributor": row.get("params.contributor", ""),
                                "dataset": row.get("params.dataset", ""),
                                "round": row.get("params.round", ""),
                                "method": row.get("params.method", ""),
                                "accuracy": row.get("metrics.accuracy"),
                                "loss": row.get("metrics.loss"),
                                "val_accuracy": row.get("metrics.val_accuracy"),
                                "timestamp": str(
                                    row.get("start_time", "")
                                ),
                            }
                        )
                    return results
        except Exception as e:
            logger.warning(f"[MLflow] get_recent_experiments failed: {e}")

    # Fallback to in-memory log
    return list(reversed(_mem_experiment_log[-limit:]))
