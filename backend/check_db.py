"""
check_db.py — run from backend/ directory to diagnose Supabase state.
Usage:  python check_db.py
"""
import os
import sys

# Load .env manually (same logic as main.py)
_env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_file):
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file)
        print(f"[.env] Loaded from {_env_file}")
    except ImportError:
        with open(_env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())
        print(f"[.env] Loaded manually from {_env_file}")
else:
    print(f"[.env] NOT FOUND at {_env_file}")

url = os.environ.get("SUPABASE", "")
key = os.environ.get("SUPABASE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

print(f"\n[Credentials]")
print(f"  SUPABASE URL : {url or 'MISSING'}")
print(f"  KEY          : {'SET (' + key[:20] + '...)' if key else 'MISSING'}")

if not url or not key:
    print("\n❌ Missing credentials — fix .env and retry.")
    sys.exit(1)

try:
    from supabase import create_client
    sb = create_client(url, key)
    print("\n[Connection] ✓ Supabase client created")
except Exception as e:
    print(f"\n❌ Could not create Supabase client: {e}")
    sys.exit(1)

TABLES = [
    "model_versions",
    "evaluation_metrics",
    "aggregation_logs",
    "client_updates",
    "clients",
]

print("\n[Table row counts]")
for table in TABLES:
    try:
        res = sb.table(table).select("id", count="exact").execute()
        count = res.count if hasattr(res, "count") else len(res.data or [])
        print(f"  {table:<25} → {count} rows")
    except Exception as e:
        print(f"  {table:<25} → ERROR: {e}")

# Also check train_history (optional table)
try:
    res = sb.table("train_history").select("id", count="exact").execute()
    count = res.count if hasattr(res, "count") else len(res.data or [])
    print(f"  {'train_history':<25} → {count} rows")
except Exception as e:
    print(f"  {'train_history':<25} → MISSING or error: {e}")

print("\n[Latest evaluation_metrics rows]")
try:
    rows = sb.table("evaluation_metrics").select("*").order("id", desc=True).limit(5).execute()
    if rows.data:
        for r in rows.data:
            print(f"  version={r.get('version_id')} acc={r.get('accuracy')} loss={r.get('loss')}")
    else:
        print("  (empty)")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n[Latest aggregation_logs rows]")
try:
    rows = sb.table("aggregation_logs").select("*").order("id", desc=True).limit(5).execute()
    if rows.data:
        for r in rows.data:
            print(f"  version={r.get('version_id')} accepted={r.get('total_accepted')} method={r.get('method')}")
    else:
        print("  (empty)")
except Exception as e:
    print(f"  ERROR: {e}")

print("\nDone. If tables are empty, Supabase writes are silently failing during training.")
print("Check the 'Aggregation Supabase persist failed' log in uvicorn output for the real error.")
