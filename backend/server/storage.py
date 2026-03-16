import io
import hashlib
import os
import torch
import logging
from supabase import create_client, Client
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# ── Module-level supabase client (used by blockchain endpoint in server/main.py) ──
_url: str = os.getenv("SUPABASE", "")
_key: str = os.getenv("SUPABASE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
supabase: Optional[Client] = None
if _url and _key:
    try:
        supabase = create_client(_url, _key)
    except Exception as _e:
        logger.warning(f"[Storage] Module-level supabase init failed: {_e}")

_BUCKET = "fl-models"


def _is_bucket_key(file_path: str) -> bool:
    """Return True only if file_path is a plain bucket object key (no directory separators).

    Old DB rows store local disk paths like 'fl_simulation_data\\models\\global_model_round_12.pt'.
    New rows store bucket keys like 'global_model_v3.pt'.
    We distinguish them by the presence of path separators.
    """
    if not file_path:
        return False
    return "\\" not in file_path and "/" not in file_path



class SupabaseManager:
    """Handles persistence to Supabase and tracks models.

    All write methods are best-effort: they log errors but never raise,
    so the FL pipeline works even when Supabase is temporarily unreachable.

    All read methods return empty lists on failure so callers can fall
    back to in-memory accumulators transparently.

    Model checkpoints are stored in the Supabase Storage bucket 'fl-models'.
    No local disk writes are performed for model files.
    """

    def __init__(self):
        url: str = os.getenv("SUPABASE", "")
        key: str = os.getenv("SUPABASE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
        if not url or not key:
            raise ValueError("Supabase credentials not found for SupabaseManager initialization.")
        self.supabase: Client = create_client(url, key)

        # Cache: client_name → DB UUID  (avoids repeated upserts)
        self._client_id_cache: Dict[str, str] = {}

    # ── Supabase Storage — model upload / download ────────────────────────────

    def upload_model(
        self, model_state_dict: Dict[str, torch.Tensor], version_num: int
    ) -> str:
        """Serialize and upload a model checkpoint to the fl-models Storage bucket.

        Args:
            model_state_dict: PyTorch state dict to upload.
            version_num:      Version number used to build the file name.

        Returns:
            file_name (str) — the object key in the bucket.

        Raises:
            RuntimeError: if the upload fails.
        """
        file_name = f"global_model_v{version_num}.pt"

        # Serialize into memory — no disk touch
        buf = io.BytesIO()
        torch.save(model_state_dict, buf)
        buf.seek(0)
        raw_bytes = buf.read()

        # Phase 7: SHA-256 for integrity tracking
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        logger.info(
            f"[Storage] Uploading model v{version_num} "
            f"({len(raw_bytes):,} bytes, sha256={sha256[:12]}…)"
        )

        try:
            self.supabase.storage.from_(_BUCKET).upload(
                path=file_name,
                file=raw_bytes,
                file_options={"content-type": "application/octet-stream", "upsert": "true"},
            )
            logger.info(f"[Storage] ✅ Uploaded {file_name} to bucket '{_BUCKET}'")
            return file_name
        except Exception as e:
            raise RuntimeError(f"[Storage] Upload failed for {file_name}: {e}") from e

    def download_model(self, file_name: str) -> Dict[str, torch.Tensor]:
        """Download and deserialize a model checkpoint from the fl-models bucket.

        Args:
            file_name: Object key in the bucket (e.g. 'global_model_v3.pt').
                       Old local disk paths (containing path separators) are
                       rejected immediately with a clear RuntimeError.

        Returns:
            state_dict (dict of str → Tensor).

        Raises:
            RuntimeError: if the path is a legacy local path, download fails,
                          or deserialization fails.
        """
        # Guard: old DB rows store local disk paths, not bucket keys
        if not _is_bucket_key(file_name):
            raise RuntimeError(
                f"[Storage] '{file_name}' looks like a local disk path, not a "
                f"bucket key. Create the 'fl-models' Supabase Storage bucket and "
                f"trigger a new aggregation round to generate a cloud checkpoint."
            )

        logger.info(f"[Storage] Downloading {file_name} from bucket '{_BUCKET}'")
        try:
            raw_bytes: bytes = (
                self.supabase.storage.from_(_BUCKET).download(file_name)
            )
        except Exception as e:
            raise RuntimeError(
                f"[Storage] Download failed for '{file_name}': {e}"
            ) from e

        try:
            buf = io.BytesIO(raw_bytes)
            state_dict = torch.load(buf, weights_only=True, map_location="cpu")
            logger.info(
                f"[Storage] ✅ Loaded {file_name} ({len(raw_bytes):,} bytes, "
                f"{len(state_dict)} layers)"
            )
            return state_dict
        except Exception as e:
            raise RuntimeError(
                f"[Storage] Deserialization failed for '{file_name}': {e}"
            ) from e

    # ── Client registry ───────────────────────────────────────────────────────

    def get_or_create_client_db_id(self, client_name: str) -> Optional[str]:
        """Upsert a client row and return its UUID.

        Used so client_updates FK inserts succeed.  Result is cached in-process.
        Returns None on failure (caller should skip DB write, use in-memory path).
        """
        if client_name in self._client_id_cache:
            return self._client_id_cache[client_name]
        try:
            # Try to find existing row first
            res = (
                self.supabase.table("clients")
                .select("id")
                .eq("client_name", client_name)
                .limit(1)
                .execute()
            )
            if res.data:
                uid = res.data[0]["id"]
            else:
                ins = self.supabase.table("clients").insert({"client_name": client_name}).execute()
                uid = ins.data[0]["id"]
            self._client_id_cache[client_name] = uid
            return uid
        except Exception as e:
            logger.warning(f"[Storage] get_or_create_client_db_id({client_name}): {e}")
            return None

    def register_client(self, name: str) -> str:
        """Registers a mock edge client in DB and returns UUID."""
        return self.get_or_create_client_db_id(name) or ""

    # ── Model versions ────────────────────────────────────────────────────────

    def save_model_version(
        self, model_state_dict: Dict[str, torch.Tensor], version_num: int
    ) -> int:
        """Upload checkpoint to Supabase Storage and upsert a DB log row.

        The 'file_path' column now stores the Storage bucket object key
        (e.g. 'global_model_v3.pt') instead of a local disk path.

        Uses UPSERT so re-running with the same version_num (e.g. after a restart)
        updates the file_path instead of crashing with a unique-constraint error.

        Returns the internal DB row id.
        """
        # Upload to bucket — raises on failure (caller gets the error)
        file_name = self.upload_model(model_state_dict, version_num)

        try:
            res = (
                self.supabase.table("model_versions")
                .upsert(
                    {"version_num": version_num, "file_path": file_name},
                    on_conflict="version_num",
                )
                .execute()
            )
            row_id = res.data[0]["id"]
            logger.info(
                f"[Storage] model_versions upserted: version={version_num} "
                f"file={file_name} id={row_id}"
            )
            return row_id
        except Exception as e:
            logger.error(f"[Storage] save_model_version DB upsert failed: {e}")
            raise  # re-raise so caller knows — DO NOT swallow this

    def get_latest_version(self) -> Dict[str, Any]:
        """Gets metadata for the latest version that has a valid bucket key.

        Skips over legacy rows whose file_path is a local disk path
        (contains path separators) rather than a Supabase Storage bucket key.
        """
        res = (
            self.supabase.table("model_versions")
            .select("*")
            .order("version_num", desc=True)
            .limit(50)
            .execute()
        )
        for row in (res.data or []):
            fp = row.get("file_path") or ""
            if _is_bucket_key(fp):
                return row
        # No valid bucket-key row found — return sentinel
        return {"version_num": 0, "file_path": None, "id": None}

    # ── Write helpers ─────────────────────────────────────────────────────────

    def log_client_update(
        self,
        version_id: int,
        client_name: str,
        status: str,
        norm: float,
        dist: float,
        reason: str,
    ):
        """Write a client update row.  Upserts client first to satisfy FK."""
        client_db_id = self.get_or_create_client_db_id(client_name)
        if not client_db_id:
            logger.warning(f"[Storage] Skipping client_updates DB write — no UUID for {client_name}")
            return
        try:
            self.supabase.table("client_updates").insert({
                "version_id":     version_id,
                "client_id":      client_db_id,
                "status":         status,
                "norm_value":     round(norm, 4) if norm is not None else None,
                "distance_value": round(dist, 4) if dist is not None else None,
                "reason":         reason,
            }).execute()
        except Exception as e:
            logger.warning(f"[Storage] log_client_update failed: {e}")

    def log_aggregation(self, version_id: int, accepted: int, rejected: int, method: str):
        try:
            self.supabase.table("aggregation_logs").insert({
                "version_id":     version_id,
                "total_accepted": accepted,
                "total_rejected": rejected,
                "method":         method,
            }).execute()
        except Exception as e:
            logger.warning(f"[Storage] log_aggregation failed: {e}")

    def log_evaluation(self, version_id: int, loss: float, accuracy: float):
        try:
            self.supabase.table("evaluation_metrics").insert({
                "version_id": version_id,
                "loss":       round(loss, 6) if loss is not None else None,
                "accuracy":   round(accuracy, 6) if accuracy is not None else None,
            }).execute()
        except Exception as e:
            logger.warning(f"[Storage] log_evaluation failed: {e}")

    def log_train_epoch(
        self,
        client_id: str,
        round_num: int,
        epoch: int,
        loss: float,
        accuracy: float,
    ):
        """Persist a single per-epoch training metric row to train_history."""
        try:
            self.supabase.table("train_history").insert({
                "client_id": client_id,
                "round":     round_num,
                "epoch":     epoch,
                "loss":      round(loss, 6) if loss is not None else None,
                "accuracy":  round(accuracy, 6) if accuracy is not None else None,
            }).execute()
        except Exception as e:
            logger.warning(f"[Storage] log_train_epoch failed: {e}")

    # ── Bulk-read helpers (called during startup warm-up) ─────────────────────

    def read_recent_evaluations(self, limit: int = 50) -> List[Dict]:
        try:
            rows = (
                self.supabase.table("evaluation_metrics")
                .select("id, version_id, loss, accuracy, created_at")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(rows.data or []))
        except Exception as e:
            logger.warning(f"[Storage] read_recent_evaluations: {e}")
            return []

    def read_recent_aggregations(self, limit: int = 50) -> List[Dict]:
        try:
            rows = (
                self.supabase.table("aggregation_logs")
                .select("id, version_id, total_accepted, total_rejected, method, created_at")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(rows.data or []))
        except Exception as e:
            logger.warning(f"[Storage] read_recent_aggregations: {e}")
            return []

    def read_recent_client_updates(self, limit: int = 100) -> List[Dict]:
        try:
            rows = (
                self.supabase.table("client_updates")
                .select("id, version_id, client_id, status, norm_value, distance_value, reason, created_at")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            # Resolve client UUID → name using cached map (reverse lookup)
            uid_to_name = {v: k for k, v in self._client_id_cache.items()}
            result = []
            for row in reversed(rows.data or []):
                row = dict(row)
                uid = row.get("client_id", "")
                row["client_id"] = uid_to_name.get(uid, uid)  # prefer name, fall back to UUID
                result.append(row)
            return result
        except Exception as e:
            logger.warning(f"[Storage] read_recent_client_updates: {e}")
            return []

    def read_recent_versions(self, limit: int = 50) -> List[Dict]:
        try:
            rows = (
                self.supabase.table("model_versions")
                .select("id, version_num, file_path, created_at")
                .order("version_num", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(rows.data or []))
        except Exception as e:
            logger.warning(f"[Storage] read_recent_versions: {e}")
            return []

    def read_recent_train_history(self, limit: int = 300) -> List[Dict]:
        try:
            rows = (
                self.supabase.table("train_history")
                .select("id, client_id, round, epoch, loss, accuracy, created_at")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(rows.data or []))
        except Exception as e:
            logger.warning(f"[Storage] read_recent_train_history: {e}")
            return []
