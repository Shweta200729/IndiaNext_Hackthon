import os
import asyncio
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
import bcrypt

load_dotenv(override=True)

url: str = os.environ.get("SUPABASE")
key: str = os.environ.get("SUPABASE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    raise ValueError("Supabase credentials not found in .env file")

supabase: Client = create_client(url, key)

from pydantic import BaseModel, EmailStr

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    confirm_password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChatRequest(BaseModel):
    message: str


@app.post("/agent/chat")
async def agent_chat(request: ChatRequest):
    msg = request.message.lower()
    if "train" in msg:
        reply = "To train a model, go to the 'Playground' tab, configure your parameters, and start a simulation. You can also upload your own .pt weights in the 'Upload' tab."
    elif "federated" in msg:
        reply = "Federated Learning is a decentralized ML approach where models are trained on local devices and only weights are shared with the global server."
    elif "upload" in msg:
        reply = "You can upload PyTorch (.pt) files in the 'Contribute' tab. Make sure your model architecture matches the global MNIST shape (1, 28, 28)."
    else:
        reply = "I am the AsyncFL AI Assistant. I can help you with questions about federated learning, model training, and weight uploads."
    
    return {"reply": reply}


@app.post("/upload_weights")
async def upload_weights(
    file: UploadFile = File(...),
    client_id: str = Form("mobile_user"),
):
    # This acts as a simplified wrapper for the mobile app
    # In a real scenario, we'd call the /fl/update logic or similar
    # For now, we'll just save it and return success
    
    # Save to a temporary or data directory
    upload_dir = os.path.join(os.path.dirname(__file__), "data", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    return {
        "status": "ACCEPTED",
        "message": f"Weights from {client_id} uploaded successfully.",
        "file": file.filename
    }


@app.post("/api/auth/signup")
async def signup(request: SignupRequest):
    if request.password != request.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    try:
        # Hash the password using bcrypt
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(request.password.encode("utf-8"), salt).decode(
            "utf-8"
        )

        # Insert into the Custom SQL 'users' table
        user_data = {
            "name": request.name,
            "email": request.email,
            "phone": request.phone,
            "password_hash": hashed_password,
        }
        response = await asyncio.to_thread(
            lambda: supabase.table("users").insert(user_data).execute()
        )

        # Auto-create blockchain wallet + stake for the new user
        # This populates the Web3 Token Economy table on the dashboard
        try:
            from server.blockchain import get_or_create_wallet

            wallet_addr = get_or_create_wallet(request.name)
        except Exception as wallet_err:
            print(f"Wallet creation skipped: {wallet_err}")
            wallet_addr = None

        return {
            "message": "User created successfully",
            "user": response.data,
            "wallet": wallet_addr,
        }
    except Exception as e:
        print(f"Signup error: {e}")
        raise HTTPException(
            status_code=500, detail=f"Database error saving new user: {str(e)}"
        )


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    try:
        # Fetch user by email
        response = await asyncio.to_thread(
            lambda: supabase.table("users").select("*").eq("email", request.email).execute()
        )
        users = response.data

        if not users:
            raise HTTPException(status_code=400, detail="Invalid email or password")

        user = users[0]

        # Verify password using bcrypt
        if not bcrypt.checkpw(
            request.password.encode("utf-8"), user["password_hash"].encode("utf-8")
        ):
            raise HTTPException(status_code=400, detail="Invalid email or password")

        # Ensure blockchain wallet exists for this user (idempotent)
        wallet_addr = None
        try:
            from server.blockchain import get_or_create_wallet

            wallet_addr = get_or_create_wallet(user["name"])
        except Exception:
            pass

        # Return user details securely (without password_hash)
        return {
            "message": "Login successful",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "phone": user["phone"],
                "wallet": wallet_addr,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {"message": "Hello World"}


# ── Mount the Federated Learning sub-app under /fl ──────────────────────────
# All dashboard API calls use the /fl/* prefix. Without this mount,
# every /fl/* request returns 404 from the root auth-only app.
import sys as _sys, os as _os

_sys.path.insert(0, _os.path.abspath(_os.path.dirname(__file__)))

from server.main import app as fl_app, init_fl_state  # noqa: E402

app.mount("/fl", fl_app)


@app.on_event("startup")
async def _root_startup():
    """Root app startup: initialises the FL sub-app state.
    Necessary because mounted sub-apps do NOT fire their own on_startup events.
    """
    await init_fl_state()
