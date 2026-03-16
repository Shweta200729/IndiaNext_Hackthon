"""
server/collab.py

Collaboration API for Federated Learning.

Allows registered users to:
  - Discover other users
  - Send/respond to collaboration requests
  - Train together in isolated, gated FL sessions

Mount on the fl_app router in server/main.py:
    from server.collab import collab_router
    app.include_router(collab_router, prefix="/collab", tags=["collaboration"])
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Lazy imports to avoid circular deps — resolved at request time
def _get_supabase():
    """Returns the Supabase client from main storage."""
    # Import here to get the live `storage` object
    try:
        from server.main import storage as _storage
        if _storage and hasattr(_storage, "supabase"):
            return _storage.supabase
    except ImportError:
        pass
    # Fallback: build our own client from env
    import os
    from supabase import create_client
    url = os.environ.get("SUPABASE", "")
    key = os.environ.get("SUPABASE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")
    if url and key:
        return create_client(url, key)
    return None


collab_router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CollabRequestBody(BaseModel):
    to_user_id: int
    message: Optional[str] = None


class CollabRespondBody(BaseModel):
    session_id: str
    action: str          # "accept" | "reject" | "cancel"


class CollabSubmitBody(BaseModel):
    """Used internally — front-end sends this via POST /collab/session/{id}/submit"""
    user_id: int
    client_id: str       # FL client_name (e.g. "EdgeNode-001")


class CollabMessageBody(BaseModel):
    sender_id: int
    content: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _require_sb():
    sb = _get_supabase()
    if not sb:
        raise HTTPException(503, "Database unavailable. Check Supabase credentials.")
    return sb


def _get_user(sb, user_id: int) -> Dict:
    try:
        r = sb.table("users").select("id,name,email,created_at").eq("id", user_id).single().execute()
        if not r.data:
            raise HTTPException(404, f"User {user_id} not found.")
        return r.data
    except HTTPException:
        raise
    except Exception as e:
        if "0 rows" in str(e):
            raise HTTPException(404, f"User {user_id} not found.")
        raise HTTPException(500, f"User lookup failed: {e}")


# ---------------------------------------------------------------------------
# GET /collab/users — discover other registered users
# ---------------------------------------------------------------------------

@collab_router.get("/users")
async def list_users():
    """
    Returns all registered users for discovery / invite UI.
    Excludes password hashes.
    """
    sb = _require_sb()
    try:
        r = sb.table("users").select("id,name,email,created_at").order("name").execute()
        return {"data": r.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch users: {e}")


@collab_router.get("/debug")
async def debug_env():
    import os
    return {
        "role_key_exists": bool(os.environ.get("SUPABASE_ROLE_KEY")),
        "anon_key_exists": bool(os.environ.get("SUPABASE_ANON_KEY")),
        "supabase_url": os.environ.get("SUPABASE")
    }

@collab_router.get("/test_insert")
async def test_insert():
    sb = _require_sb()
    try:
        r = sb.table("collab_sessions").insert({
            "requester_id": 1,
            "recipient_id": 3,
            "status": "pending",
            "message": "test"
        }).execute()
        return {"success": True, "data": r.data}
    except Exception as e:
        return {"success": False, "error": str(e), "repr": repr(e)}

# ---------------------------------------------------------------------------
# POST /collab/request — send a collaboration invite
# ---------------------------------------------------------------------------

@collab_router.post("/request")
async def send_collab_request(body: CollabRequestBody, requester_id: int):
    """
    Send a collaboration request to another user.
    requester_id comes from ?requester_id= query param (simplified auth —
    replace with JWT middleware in production).
    """
    sb = _require_sb()

    if requester_id == body.to_user_id:
        raise HTTPException(400, "Cannot send a collaboration request to yourself.")

    # Verify both users exist
    _get_user(sb, requester_id)
    _get_user(sb, body.to_user_id)

    # Check if a session already exists between this pair (either direction)
    try:
        existing = (
            sb.table("collab_sessions")
            .select("id,status")
            .or_(
                f"and(requester_id.eq.{requester_id},recipient_id.eq.{body.to_user_id}),"
                f"and(requester_id.eq.{body.to_user_id},recipient_id.eq.{requester_id})"
            )
            .in_("status", ["pending", "active"])
            .execute()
        )
        if existing.data:
            sess = existing.data[0]
            raise HTTPException(
                409,
                f"A session already exists (id={sess['id']}, status={sess['status']})."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Conflict check failed: {e}")

    # Insert new pending session
    try:
        insert_data = {
            "requester_id": requester_id,
            "recipient_id": body.to_user_id,
            "status":       "pending",
            "updated_at":   _now_iso(),
        }
        r = sb.table("collab_sessions").insert(insert_data).execute()
        session = r.data[0]
        logger.info(
            f"[Collab] User {requester_id} invited User {body.to_user_id} "
            f"— session {session['id']}"
        )
        return {"session_id": session["id"], "status": "pending"}
    except Exception as e:
        raise HTTPException(500, f"Could not create session: {e} | Insert Data: {insert_data}")


# ---------------------------------------------------------------------------
# POST /collab/respond — accept or reject a request
# ---------------------------------------------------------------------------

@collab_router.post("/respond")
async def respond_to_request(body: CollabRespondBody, user_id: int):
    """
    Accept or reject a pending collaboration request.
    Only the recipient (or requester for cancel) may call this.
    """
    sb = _require_sb()

    if body.action not in ("accept", "reject", "cancel"):
        raise HTTPException(400, "action must be 'accept', 'reject', or 'cancel'.")

    # Fetch the session
    try:
        r = sb.table("collab_sessions").select("*").eq("id", body.session_id).single().execute()
        if not r.data:
            raise HTTPException(404, f"Session {body.session_id} not found.")
        session = r.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Session lookup failed: {e}")

    # Permission check
    if body.action in ("accept", "reject"):
        if session["recipient_id"] != user_id:
            raise HTTPException(403, "Only the recipient can accept or reject a request.")
    elif body.action == "cancel":
        if session["requester_id"] != user_id:
            raise HTTPException(403, "Only the requester can cancel a request.")

    if session["status"] != "pending":
        raise HTTPException(409, f"Session is already '{session['status']}' — cannot respond.")

    new_status = {"accept": "active", "reject": "rejected", "cancel": "cancelled"}[body.action]

    try:
        sb.table("collab_sessions").update({
            "status":     new_status,
            "updated_at": _now_iso(),
        }).eq("id", body.session_id).execute()
    except Exception as e:
        raise HTTPException(500, f"Could not update session: {e}")

    logger.info(
        f"[Collab] User {user_id} {body.action}ed session {body.session_id} "
        f"→ {new_status}"
    )
    return {"session_id": body.session_id, "status": new_status}


# ---------------------------------------------------------------------------
# GET /collab/sessions — list my sessions
# ---------------------------------------------------------------------------

@collab_router.get("/sessions")
async def list_my_sessions(user_id: int):
    """Returns all sessions (any status) where user_id is requester or recipient."""
    sb = _require_sb()
    try:
        r = (
            sb.table("collab_sessions")
            .select("*")
            .or_(
                f"requester_id.eq.{user_id},recipient_id.eq.{user_id}"
            )
            .order("updated_at", desc=True)
            .execute()
        )
        sessions = r.data or []

        # Enrich with partner user names
        user_ids = set()
        for s in sessions:
            user_ids.add(s["requester_id"])
            user_ids.add(s["recipient_id"])

        names: Dict[int, str] = {}
        if user_ids:
            users_r = (
                sb.table("users")
                .select("id,name,email")
                .in_("id", list(user_ids))
                .execute()
            )
            for u in (users_r.data or []):
                names[u["id"]] = u["name"]

        for s in sessions:
            partner_id = (
                s["recipient_id"] if s["requester_id"] == user_id
                else s["requester_id"]
            )
            s["partner_name"] = names.get(partner_id, f"User {partner_id}")
            s["partner_id"]   = partner_id
            s["is_requester"] = s["requester_id"] == user_id

        return {"data": sessions}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch sessions: {e}")


# ---------------------------------------------------------------------------
# GET /collab/session/{id} — session detail
# ---------------------------------------------------------------------------

@collab_router.get("/session/{session_id}")
async def get_session_detail(session_id: str, user_id: int):
    """Returns full detail for one session, including round progress."""
    sb = _require_sb()
    try:
        r = sb.table("collab_sessions").select("*").eq("id", session_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Session not found.")
        session = r.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Session lookup failed: {e}")

    # Access check
    if user_id not in (session["requester_id"], session["recipient_id"]):
        raise HTTPException(403, "Access denied.")

    # Enrich with partner info
    partner_id = (
        session["recipient_id"] if session["requester_id"] == user_id
        else session["requester_id"]
    )
    try:
        pu = sb.table("users").select("id,name,email").eq("id", partner_id).single().execute()
        session["partner"] = pu.data
    except Exception:
        session["partner"] = {"id": partner_id, "name": f"User {partner_id}"}

    # Add round status
    submitted = session.get("round_submitted") or []
    all_members = [str(session["requester_id"]), str(session["recipient_id"])]
    session["round_progress"] = {
        "submitted":    submitted,
        "waiting_for":  [m for m in all_members if str(m) not in [str(s) for s in submitted]],
        "ready_to_aggregate": len(submitted) >= 2,
    }

    return session


# ---------------------------------------------------------------------------
# POST /collab/session/{id}/submit — mark that user has submitted their update
# ---------------------------------------------------------------------------

@collab_router.post("/session/{session_id}/submit")
async def mark_submitted(session_id: str, body: CollabSubmitBody):
    """
    Called after a client posts their weights via POST /update with collab_session_id.
    Marks the user as 'submitted' in round_submitted[].
    When both members have submitted, returns ready_to_aggregate=True.
    The actual aggregation is triggered by the /update endpoint in main.py.
    """
    sb = _require_sb()
    try:
        r = sb.table("collab_sessions").select("*").eq("id", session_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Session not found.")
        session = r.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Session lookup failed: {e}")

    if session["status"] != "active":
        raise HTTPException(409, f"Session is '{session['status']}', not active.")

    submitted = list(session.get("round_submitted") or [])
    uid_str   = str(body.user_id)
    if uid_str not in submitted:
        submitted.append(uid_str)

    all_members = {str(session["requester_id"]), str(session["recipient_id"])}
    ready = set(submitted) >= all_members

    # Update DB
    update_payload = {
        "updated_at": _now_iso(),
    }
    if ready:
        update_payload["status"] = "completed"

    try:
        sb.table("collab_sessions").update(update_payload).eq("id", session_id).execute()
    except Exception as e:
        raise HTTPException(500, f"Could not update session: {e}")

    logger.info(
        f"[Collab] Session {session_id}: user {body.user_id} submitted "
        f"({len(submitted)}/2). Ready={ready}"
    )
    return {
        "session_id":          session_id,
        "submitted":           submitted,
        "ready_to_aggregate":  ready,
    }


# ---------------------------------------------------------------------------
# DELETE /collab/session/{id} — cancel / leave
# ---------------------------------------------------------------------------

@collab_router.delete("/session/{session_id}")
async def cancel_session(session_id: str, user_id: int):
    """Cancel an active or pending session."""
    sb = _require_sb()
    try:
        r = sb.table("collab_sessions").select("*").eq("id", session_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Session not found.")
        session = r.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Session lookup: {e}")

    if user_id not in (session["requester_id"], session["recipient_id"]):
        raise HTTPException(403, "Access denied.")
    if session["status"] in ("rejected", "cancelled", "completed"):
        raise HTTPException(409, f"Session already '{session['status']}'.")

    try:
        sb.table("collab_sessions").update({
            "status":     "cancelled",
            "updated_at": _now_iso(),
        }).eq("id", session_id).execute()
    except Exception as e:
        raise HTTPException(500, f"Cancel failed: {e}")

    return {"session_id": session_id, "status": "cancelled"}


# ---------------------------------------------------------------------------
# GET /collab/session/{id}/messages — get chat messages
# ---------------------------------------------------------------------------

@collab_router.get("/session/{session_id}/messages")
async def get_session_messages(session_id: str, user_id: int):
    """Fetch chat messages for a collaboration session."""
    sb = _require_sb()
    try:
        r = sb.table("collab_sessions").select("*").eq("id", session_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Session not found.")
        session = r.data
    except Exception as e:
        raise HTTPException(500, f"Session lookup failed: {e}")

    if user_id not in (session["requester_id"], session["recipient_id"]):
        raise HTTPException(403, "Access denied.")

    try:
        msgs = (
            sb.table("collab_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
        return {"data": msgs.data or []}
    except Exception as e:
        raise HTTPException(500, f"Could not fetch messages: {e}")


# ---------------------------------------------------------------------------
# POST /collab/session/{id}/messages — send a chat message
# ---------------------------------------------------------------------------

@collab_router.post("/session/{session_id}/messages")
async def send_session_message(session_id: str, body: CollabMessageBody):
    """Send a chat message within an active collaboration session."""
    sb = _require_sb()
    
    # Check session exists and is active
    try:
        r = sb.table("collab_sessions").select("status,requester_id,recipient_id").eq("id", session_id).single().execute()
        if not r.data:
            raise HTTPException(404, "Session not found.")
        session = r.data
    except Exception as e:
        raise HTTPException(500, f"Session lookup failed: {e}")

    if session["status"] != "active":
        raise HTTPException(403, "Messages can only be sent in active sessions.")

    if body.sender_id not in (session["requester_id"], session["recipient_id"]):
        raise HTTPException(403, "Only participants can send messages.")

    try:
        insert_data = {
            "session_id": session_id,
            "sender_id":  body.sender_id,
            "content":    body.content,
            "updated_at": _now_iso(),
        }
        r = sb.table("collab_messages").insert(insert_data).execute()
        return {"data": r.data[0]}
    except Exception as e:
        raise HTTPException(500, f"Could not send message: {e}")
