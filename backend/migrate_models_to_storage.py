"""
migrate_models_to_storage.py
============================
One-shot migration script.

What it does
------------
1. Creates the 'fl-models' Supabase Storage bucket (if it doesn't exist).
2. Scans the 'model_versions' table for rows whose file_path is a local
   disk path (contains path separators), finds the matching .pt file on disk,
   uploads it under a canonical bucket key, and updates the DB row.
3. Prints a plain summary at the end so you can see what was done.

Run once:
    cd /Users/macbook/Desktop/DevHacks/backend
    source venv/bin/activate
    python migrate_models_to_storage.py
"""

import io
import os
import sys

# ── Env vars ──────────────────────────────────────────────────────────────────
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("SUPABASE", "")
SUPABASE_KEY = os.getenv("SUPABASE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("❌  SUPABASE / SUPABASE_ROLE_KEY env vars are missing. Check your .env file.")

from supabase import create_client, Client  # noqa: E402

client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BUCKET = "fl-models"
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


# ── 1. Ensure bucket exists ───────────────────────────────────────────────────

def ensure_bucket() -> None:
    try:
        buckets = client.storage.list_buckets()
        existing = [b.name for b in buckets]
        if BUCKET in existing:
            print(f"✅  Bucket '{BUCKET}' already exists.")
        else:
            client.storage.create_bucket(BUCKET, options={"public": False})
            print(f"✅  Bucket '{BUCKET}' created.")
    except Exception as e:
        print(f"⚠️   Could not list/create bucket: {e}")
        print("     This may be normal if bucket already exists — continuing…")


# ── 2. Migrate legacy rows ────────────────────────────────────────────────────

def is_legacy_path(fp: str) -> bool:
    """Return True if file_path is a local disk path (not a bucket key)."""
    if not fp:
        return False
    return "\\" in fp or "/" in fp


def find_local_pt(file_path: str) -> str | None:
    """Try to locate the actual .pt file relative to BACKEND_DIR."""
    # Normalise to forward slashes, strip leading backslashes
    relative = file_path.replace("\\", "/").lstrip("/")
    # Try as-is relative to backend dir
    candidate = os.path.join(BACKEND_DIR, relative)
    if os.path.isfile(candidate):
        return candidate
    # Walk fl_simulation_data/models as fallback
    basename = os.path.basename(relative)
    fallback = os.path.join(BACKEND_DIR, "fl_simulation_data", "models", basename)
    if os.path.isfile(fallback):
        return fallback
    return None


def upload_pt(local_path: str, bucket_key: str) -> None:
    with open(local_path, "rb") as fh:
        raw = fh.read()
    client.storage.from_(BUCKET).upload(
        path=bucket_key,
        file=raw,
        file_options={"content-type": "application/octet-stream", "upsert": "true"},
    )


def migrate_rows() -> None:
    print("\n── Scanning model_versions table…")
    res = (
        client.table("model_versions")
        .select("*")
        .order("version_num", desc=False)
        .execute()
    )
    rows = res.data or []

    if not rows:
        print("   No rows in model_versions — nothing to migrate.")
        return

    migrated = 0
    skipped = 0
    missing = 0

    for row in rows:
        row_id = row["id"]
        version_num = row["version_num"]
        file_path = row.get("file_path") or ""

        if not is_legacy_path(file_path):
            print(f"   v{version_num}: '{file_path}' looks like a valid bucket key — skipping.")
            skipped += 1
            continue

        local_pt = find_local_pt(file_path)
        if not local_pt:
            print(f"   v{version_num}: ⚠️  Cannot find '{file_path}' on disk — skipping.")
            missing += 1
            continue

        bucket_key = f"global_model_v{version_num}.pt"
        print(f"   v{version_num}: Uploading '{local_pt}' → '{bucket_key}'…", end=" ", flush=True)
        try:
            upload_pt(local_pt, bucket_key)
            # Update DB row with the new bucket key
            client.table("model_versions").update({"file_path": bucket_key}).eq("id", row_id).execute()
            print("✅")
            migrated += 1
        except Exception as e:
            print(f"❌  {e}")

    print(f"\n── Migration complete: {migrated} migrated, {skipped} already valid, {missing} missing on disk.")


# ── 3. Main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ensure_bucket()
    migrate_rows()
    print("\nDone. Restart the backend server and refresh the Models page.")
