"""
Pure-Python in-memory EVM simulation.

Replaces web3 + eth_tester so the server starts without C++ Build Tools.
The API surface is identical to the original blockchain.py — all dashboard
UI (wallets, transactions, rewards, slashes) works exactly the same.
"""

import hashlib
import logging
import os
import time

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tiny deterministic wallet generator (sha256 based — no pysha3/keccak needed)
# ---------------------------------------------------------------------------

def _make_address(seed: str) -> str:
    """Generate a deterministic mock Ethereum-style address from a seed string."""
    h = hashlib.sha256(seed.encode()).hexdigest()
    return "0x" + h[:40].upper()


def _make_tx_hash(data: str) -> str:
    """Generate a unique-ish transaction hash."""
    raw = f"{data}-{time.time_ns()}"
    return "0x" + hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

INITIAL_BALANCE   = 1_000    # starting ETH-equivalent per wallet
STAKE_AMOUNT      = 100      # FLT staked on registration
REWARD_AMOUNT     = 10       # FLT per accepted update
SLASH_AMOUNT      = 15       # FLT deducted per rejected update

client_wallets:   dict[str, str]   = {}   # client_id → address
wallet_balances:  dict[str, float] = {}   # address   → balance (FLT)
staked_balances:  dict[str, float] = {}   # address   → staked  (FLT)
transaction_log:  list[dict]       = []

# Pool address (index 0 equivalent)
STAKING_POOL_ADDRESS = _make_address("__pool__")
wallet_balances[STAKING_POOL_ADDRESS] = 1_000_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _log_tx(tx_hash: str, action: str, client_id: str, amount: float):
    transaction_log.append({
        "tx_hash":      tx_hash,
        "action":       action,
        "client_id":    client_id,
        "amount":       amount,
        "block_number": len(transaction_log) + 1,   # simulated block
        "gas_used":     21_000,
    })
    if len(transaction_log) > 50:
        transaction_log.pop(0)


def _transfer(from_addr: str, to_addr: str, amount: float) -> bool:
    """Move FLT between two wallet addresses. Returns False if insufficient funds."""
    if wallet_balances.get(from_addr, 0) < amount:
        logger.warning(f"[Blockchain] Insufficient balance in {from_addr[:10]}…")
        return False
    wallet_balances[from_addr]  = wallet_balances.get(from_addr, 0)  - amount
    wallet_balances[to_addr]    = wallet_balances.get(to_addr,   0)  + amount
    return True


# ---------------------------------------------------------------------------
# Public API (matches original blockchain.py exactly)
# ---------------------------------------------------------------------------

def get_or_create_wallet(client_id: str) -> str:
    """Return existing wallet address or create + auto-stake one."""
    if client_id in client_wallets:
        return client_wallets[client_id]

    addr = _make_address(client_id)
    client_wallets[client_id]   = addr
    wallet_balances[addr]       = float(INITIAL_BALANCE)
    staked_balances[addr]       = 0.0

    # Auto-stake on join
    stake_tokens(client_id, STAKE_AMOUNT)
    logger.info(f"[Blockchain] Wallet created for {client_id}: {addr[:12]}…")
    return addr


def stake_tokens(client_id: str, amount: int = STAKE_AMOUNT):
    wallet = client_wallets.get(client_id)
    if not wallet:
        return None

    if _transfer(wallet, STAKING_POOL_ADDRESS, amount):
        staked_balances[wallet] = staked_balances.get(wallet, 0) + amount
        tx = _make_tx_hash(f"STAKE-{client_id}-{amount}")
        _log_tx(tx, "STAKE", client_id, amount)
        return tx
    return None


def reward_client(client_id: str, amount: int = REWARD_AMOUNT):
    wallet = client_wallets.get(client_id)
    if not wallet:
        return None

    if _transfer(STAKING_POOL_ADDRESS, wallet, amount):
        tx = _make_tx_hash(f"REWARD-{client_id}-{amount}")
        _log_tx(tx, "REWARD", client_id, amount)
        return tx
    return None


def slash_client(client_id: str, amount: int = SLASH_AMOUNT):
    wallet = client_wallets.get(client_id)
    if not wallet:
        return None

    slash_amt = min(amount, staked_balances.get(wallet, 0))
    if slash_amt <= 0:
        return None

    staked_balances[wallet] = staked_balances.get(wallet, 0) - slash_amt
    # Move slashed funds back to pool
    _transfer(wallet, STAKING_POOL_ADDRESS, slash_amt)
    tx = _make_tx_hash(f"SLASH-{client_id}-{slash_amt}")
    _log_tx(tx, "SLASH", client_id, slash_amt)
    return tx


def get_client_status(client_id: str):
    wallet = client_wallets.get(client_id)
    if not wallet:
        return None
    return {
        "wallet":  wallet,
        "balance": round(wallet_balances.get(wallet, 0), 2),
        "staked":  round(staked_balances.get(wallet, 0), 2),
    }


def get_all_status() -> list[dict]:
    return [
        {
            "client_id": cid,
            "wallet":    w,
            "balance":   round(wallet_balances.get(w, 0), 2),
            "staked":    round(staked_balances.get(w, 0), 2),
        }
        for cid, w in client_wallets.items()
    ]


def get_recent_transactions() -> list[dict]:
    return list(reversed(transaction_log))
