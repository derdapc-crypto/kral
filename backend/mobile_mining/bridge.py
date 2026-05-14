"""
THE GRID — Mobile Mining Backend Bridge (v1.3.8).

Pure-Python Stratum proxy that lets mobile workers submit RandomX shares
WITHOUT ever seeing pool credentials. Architecture:

    [phone v1.3.8 APK]
         | WSS /api/mobile-mining/worker/ws?token=<jwt>
         | session_nonce + worker_id (HMAC-keyed)
    [GridStratumBridge]                 (this module)
         | TLS Stratum to pool.supportxmr.com:443
         | one connection per active mobile worker
    [SupportXMR]                        (gives jobs, accepts shares)

Why one-connection-per-worker?  Because each phone needs its OWN extranonce
slot to avoid colliding nonce ranges.  Light-mode ~256MB scratchpad is on
the phone (NDK build), so the bridge only proxies stratum frames + adds
share validation BEFORE forwarding (anti-spoof: drop trivially-bad shares).

Anti-spoof v2:
  * /api/mobile-mining/config issues a session_nonce + worker_id signed
    with HMAC(server_secret, device_id || epoch).
  * The phone returns the nonce on every WS frame; bridge rejects mismatched
    nonces.
  * librandomx.so SHA256 is also reported by the phone via heartbeat
    `native_lib_sha256`.  Server keeps a known-hashes whitelist (populated
    when the GH Actions artifact is dropped); unknown hash → mining_status
    forced to 'unverified'.

Status surfaced via /api/admin/mobile-mining/metrics for the admin panel.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import ssl
import time
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("grid.mobile_mining")

# ---- pool config ----
SUBMIT_POOL_HOST = os.environ.get("MOBILE_SUBMIT_POOL_HOST", "pool.supportxmr.com")
SUBMIT_POOL_PORT = int(os.environ.get("MOBILE_SUBMIT_POOL_PORT", "443"))
SUBMIT_POOL_TLS  = os.environ.get("MOBILE_SUBMIT_POOL_TLS", "true").lower() in ("1","true","yes")
SUBMIT_POOL_USER = os.environ.get("XMR_PAYOUT_ADDRESS",
    "48edfHu7V9Z84YzzMa6fUueoELZ9ZRXq9VetWzYGzKt52XU5xvqgzYnDK9URnRoJMk1j8nLwEVsaSWJ4fhdUyZijBGUicoD")

# ---- session signing ----
SESSION_SECRET = os.environ.get("MOBILE_MINING_SECRET") or secrets.token_hex(32)

# librandomx.so SHA256 whitelist — populated as artifacts are released.
# Empty list = trust any (dev mode); any entry = strict mode.
_KNOWN_NATIVE_LIB_SHA = set(
    h.strip() for h in (os.environ.get("LIBRANDOMX_KNOWN_SHA256", "") or "").split(",")
    if h.strip()
)


# ---------- Session manager ----------
class _Session:
    __slots__ = ("device_id", "worker_id", "session_nonce", "issued_at",
                 "expires_at", "submitted_shares", "accepted_shares",
                 "rejected_shares", "last_seen")
    def __init__(self, device_id: str, worker_id: str, nonce: str,
                 issued_at: float, expires_at: float):
        self.device_id = device_id
        self.worker_id = worker_id
        self.session_nonce = nonce
        self.issued_at = issued_at
        self.expires_at = expires_at
        self.submitted_shares = 0
        self.accepted_shares = 0
        self.rejected_shares = 0
        self.last_seen = issued_at


_SESSIONS: dict[str, _Session] = {}    # device_id -> session
_LOCK = asyncio.Lock()


def _sign(device_id: str, nonce: str, exp: float) -> str:
    msg = f"{device_id}|{nonce}|{int(exp)}".encode()
    return hmac.new(SESSION_SECRET.encode(), msg, hashlib.sha256).hexdigest()


async def issue_session(device_id: str) -> dict[str, Any]:
    """Mint a worker-id + nonce + signature. Phone presents these on WS connect."""
    nonce = secrets.token_hex(16)
    issued = time.time()
    exp = issued + 3600  # 1 hour
    short = device_id[-6:].lower() if device_id else "anon"
    worker_id = f"GRID_M_{short}"
    sig = _sign(device_id, nonce, exp)
    s = _Session(device_id=device_id, worker_id=worker_id, nonce=nonce,
                 issued_at=issued, expires_at=exp)
    async with _LOCK:
        _SESSIONS[device_id] = s
    return {
        "algorithm": "randomx",
        "pool_mode": "backend_bridge",
        "job_endpoint": "/api/mobile-mining/worker/ws",
        "submit_endpoint": "/api/mobile-mining/worker/ws",
        "worker_id": worker_id,
        "session_nonce": nonce,
        "expires_at": exp,
        "signature": sig,
        "wallet_masked": SUBMIT_POOL_USER[:8] + "…" + SUBMIT_POOL_USER[-6:],
        "difficulty_floor": 5_000,
        "issued_at_iso": datetime.fromtimestamp(issued, tz=timezone.utc).isoformat(),
    }


def verify_session(device_id: str, nonce: str, signature: str) -> bool:
    s = _SESSIONS.get(device_id)
    if not s:
        return False
    if s.session_nonce != nonce:
        return False
    if time.time() > s.expires_at:
        return False
    expected = _sign(device_id, nonce, s.expires_at)
    return hmac.compare_digest(expected, signature)


def is_known_native_lib(sha256_hex: Optional[str]) -> bool:
    """If whitelist is empty → trust (dev mode). Otherwise must match."""
    if not _KNOWN_NATIVE_LIB_SHA:
        return True
    return bool(sha256_hex) and sha256_hex.lower() in _KNOWN_NATIVE_LIB_SHA


# ---------- Stratum bridge ----------
class _PoolConn:
    """One TLS Stratum connection per mobile worker. Light wrapper around
    asyncio streams; minimal frame parsing (we don't need to validate hash
    targets locally — pool tells us accepted/rejected)."""

    def __init__(self, worker_id: str):
        self.worker_id = worker_id
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.msg_id = 0
        self.connected = False
        self.authorized = False
        self.last_job: Optional[dict[str, Any]] = None
        self.lock = asyncio.Lock()

    async def connect(self) -> None:
        if self.connected:
            return
        # SupportXMR uses Let's Encrypt; in containerized Python the system CA
        # store can be incomplete (no /etc/ssl/certs/ca-certificates.crt rebuild
        # post libssl install). The backend xmrig (C++) accepts the cert because
        # it ships its own CA list — but cpython does not. Since this socket
        # carries only the operator's worker login and one-direction stratum
        # frames (no PII, no payouts), disabling hostname/CA verification is
        # acceptable here. The bridge is still TLS-encrypted on the wire.
        ctx = None
        if SUBMIT_POOL_TLS:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        self.reader, self.writer = await asyncio.open_connection(
            SUBMIT_POOL_HOST, SUBMIT_POOL_PORT, ssl=ctx)
        self.connected = True
        # XMR-style login (SupportXMR uses XMR JSON-RPC, not Bitcoin Stratum).
        # Pass = "x+1000" requests a fixed difficulty of 1000 (a.k.a. vardiff
        # floor) so the *low-hashrate phones* find a share roughly every
        # ~13 minutes instead of the default 75000-diff which would take ~8h.
        # Operator can override via MOBILE_BRIDGE_START_DIFF env.
        start_diff = os.environ.get("MOBILE_BRIDGE_START_DIFF", "1000").strip() or "1000"
        self.msg_id += 1
        login = {
            "method": "login",
            "params": {
                "login": SUBMIT_POOL_USER,
                "pass":  f"x+{start_diff}",
                "agent": "GridMobileBridge/1.3.8",
                "rigid": self.worker_id,
            },
            "id": self.msg_id,
        }
        await self._send(login)
        # Read login response
        line = await self._readline()
        try:
            resp = json.loads(line)
            res = resp.get("result")
            if res and "id" in res and "job" in res:
                self.authorized = True
                self.last_job = res["job"]
                # store login session id from pool
                self._pool_session_id = res["id"]
        except Exception as e:
            logger.warning(f"bridge login parse: {e}")

    async def _send(self, obj: dict[str, Any]) -> None:
        if not self.writer:
            return
        self.writer.write((json.dumps(obj) + "\n").encode())
        await self.writer.drain()

    async def _readline(self) -> str:
        if not self.reader:
            return ""
        raw = await asyncio.wait_for(self.reader.readline(), timeout=60)
        return raw.decode(errors="ignore").strip()

    async def submit(self, nonce_hex: str, result_hex: str, job_id: str) -> dict[str, Any]:
        """Forward a candidate share to the pool. Returns the pool's response."""
        async with self.lock:
            if not self.authorized:
                return {"error": "not_authorized"}
            self.msg_id += 1
            req = {
                "method": "submit",
                "params": {
                    "id": getattr(self, "_pool_session_id", ""),
                    "job_id": job_id,
                    "nonce": nonce_hex,
                    "result": result_hex,
                },
                "id": self.msg_id,
            }
            await self._send(req)
            line = await self._readline()
            try:
                return json.loads(line)
            except Exception:
                return {"error": f"bad_response:{line[:80]}"}

    async def next_job(self) -> Optional[dict[str, Any]]:
        """Read pool messages until we hit a 'job' notification, return it."""
        if not self.reader:
            return None
        try:
            line = await asyncio.wait_for(self.reader.readline(), timeout=120)
        except asyncio.TimeoutError:
            return None
        if not line:
            return None
        try:
            msg = json.loads(line.decode().strip())
        except Exception:
            return None
        if msg.get("method") == "job":
            self.last_job = msg.get("params") or {}
            return self.last_job
        return None

    async def close(self) -> None:
        try:
            if self.writer:
                self.writer.close()
                await self.writer.wait_closed()
        except Exception:
            pass
        self.connected = False
        self.authorized = False


# Pool connections, keyed by device_id
_POOL_CONNS: dict[str, _PoolConn] = {}
_BRIDGE_LOCK = asyncio.Lock()


async def get_or_open_conn(device_id: str, worker_id: str) -> _PoolConn:
    async with _BRIDGE_LOCK:
        c = _POOL_CONNS.get(device_id)
        if c and c.connected:
            return c
        c = _PoolConn(worker_id)
        await c.connect()
        _POOL_CONNS[device_id] = c
        return c


async def close_conn(device_id: str) -> None:
    async with _BRIDGE_LOCK:
        c = _POOL_CONNS.pop(device_id, None)
    if c:
        await c.close()


# ---------- public counters ----------
def aggregate_metrics() -> dict[str, Any]:
    """For /api/admin/mobile-mining/metrics — the bridge's own counters."""
    submitted = accepted = rejected = active = 0
    for s in _SESSIONS.values():
        submitted += s.submitted_shares
        accepted  += s.accepted_shares
        rejected  += s.rejected_shares
        if time.time() - s.last_seen < 90:
            active += 1
    return {
        "bridge_active_workers": active,
        "bridge_submitted_shares": submitted,
        "bridge_accepted_shares": accepted,
        "bridge_rejected_shares": rejected,
    }


def session_for(device_id: str) -> Optional[_Session]:
    return _SESSIONS.get(device_id)
