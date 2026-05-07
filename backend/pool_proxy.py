"""
Binance Pool / multi-class Stratum proxy (v1.2.5).

This module opens one TCP socket PER coin (RVN/BTC/LTC/DASH/KAS/ETC/ZEC/BCH/
CFX/CKB/ETHW), performs the standard `mining.subscribe` + `mining.authorize`
handshake on each, and tracks per-class connection state.

Design contract:
- The connectivity layer (TCP socket + JSON-RPC handshake + worker registration)
  is REAL. When credentials are configured, the worker name *will* appear in
  Binance Pool worker lists for each authorized class.
- Actual share submission requires per-algo PoW that meets the pool's
  difficulty target. The native Android worker currently solves THE GRID's
  internal verification tasks (lower difficulty), so Binance will see registered
  workers but `accepted_shares=0` until the per-algo native PoW ships
  (P2 backlog) — this is surfaced to admins as `pow_status="native_pow_pending"`.
- If credentials are missing, every class reports `connected=false` — never fakes.

Public API (back-compat preserved for server.py callers):
- get_status()              → aggregate dict (configured/enabled/connected/
                              workers_registered/classes[]/armed_count/total/...)
- is_enabled()              → ENABLE_REAL_POOL && configured
- start()                   → kick off all connectors
- shutdown()                → close all sockets cleanly
- register_device(short_id) → register on the PRIMARY class (RVN) — keeps the
                              existing heartbeat call site working

Module-level back-compat globals (intentionally still exported):
- STATUS, CONNECTOR, RVN_WORKER_PREFIX  (server.py imports these)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

from config import (
    POOL_ACCOUNT_ID,
    POOL_ENDPOINTS,
    POOL_PASSWORD,
    POW_STATUS,
    PRIMARY_COIN,
)


logger = logging.getLogger("grid.pool")

# ---- Configuration ----
# Worker prefix: kept for back-compat with iter-7..10 worker-name format.
# The user (iter-11) requested strict format `<account>.<device_short_id>` —
# default the prefix to empty so authorize uses just `<account>` and worker
# registration uses `<account>.<short_id>`.
RVN_WORKER_PREFIX = os.environ.get("RVN_WORKER_PREFIX", "").strip()
ENABLE_REAL_POOL = os.environ.get("ENABLE_REAL_POOL", "false").strip().lower() in ("1", "true", "yes")


def _is_configured() -> bool:
    """Pool is 'configured' iff master account ID is set and at least RVN is mapped."""
    return bool(POOL_ACCOUNT_ID and POOL_ENDPOINTS.get(PRIMARY_COIN))


def _redact_stratum_url(url: str) -> Optional[str]:
    """
    Sanitise a stratum URL before exposing it via the API.
    Strips:
      - userinfo (user:password@host)  →  host
      - query string / fragment        →  drops them entirely
    Keeps:  scheme + host + :port  (e.g. stratum+tcp://rvn.poolbinance.com:3334)
    Returns None for empty/None inputs OR unknown schemes (defence-in-depth).
    """
    if not url:
        return None
    s = url.strip()
    s = s.split("#", 1)[0].split("?", 1)[0]
    if "://" in s:
        scheme, rest = s.split("://", 1)
    else:
        scheme, rest = "stratum+tcp", s
    if scheme not in ("stratum+tcp", "stratum+ssl", "tcp", "ssl"):
        return None
    if "@" in rest:
        rest = rest.rsplit("@", 1)[1]
    return f"{scheme}://{rest}"


def _parse_url(url: str):
    if "://" in url:
        scheme, rest = url.split("://", 1)
    else:
        scheme, rest = "stratum+tcp", url
    if ":" in rest:
        host, port = rest.rsplit(":", 1)
        try:
            port_i = int(port)
        except ValueError:
            port_i = 3333
    else:
        host, port_i = rest, 3333
    use_ssl = "ssl" in scheme
    return host, port_i, use_ssl


# ============================================================================
# Per-class status + connector
# ============================================================================
class PoolStatus:
    """Per-class status snapshot."""

    def __init__(self, coin: str, algo: str, url: str):
        self.coin = coin
        self.algo = algo
        self.url = url
        self.connected: bool = False
        self.last_error: Optional[str] = None
        self.connected_at: Optional[float] = None
        self.disconnected_at: Optional[float] = None
        self.subscribed: bool = False
        self.authorized: bool = False
        self.last_job: Optional[str] = None
        self.last_job_at: Optional[float] = None
        self.accepted_shares: int = 0
        self.rejected_shares: int = 0
        self.last_share_at: Optional[float] = None
        self.workers_registered: int = 0
        self.attempts: int = 0
        self.handshake_id: int = 0

    def to_dict(self) -> dict:
        """Per-class admin payload — REDACTED url, no password ever."""
        return {
            "coin": self.coin,
            "algo": self.algo,
            "url": _redact_stratum_url(self.url),
            "connected": self.connected,
            "subscribed": self.subscribed,
            "authorized": self.authorized,
            "accepted_shares": self.accepted_shares,
            "rejected_shares": self.rejected_shares,
            "last_share_at": self.last_share_at,
            "last_job": self.last_job,
            "last_job_at": self.last_job_at,
            "workers_registered": self.workers_registered,
            "connected_at": self.connected_at,
            "disconnected_at": self.disconnected_at,
            "last_error": self.last_error,
            "attempts": self.attempts,
        }


class PoolConnector:
    """One TCP connection per coin. Reconnects with exponential backoff."""

    def __init__(self, status: PoolStatus):
        self.status = status
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._registered: set = set()  # short ids registered as workers on this class

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._stop.set()
        if self.writer:
            try: self.writer.close()
            except Exception: pass
        if self._task:
            try: await asyncio.wait_for(self._task, timeout=2.0)
            except Exception: pass

    async def _run(self):
        if not (ENABLE_REAL_POOL and _is_configured()):
            return
        backoff = 2.0
        while not self._stop.is_set():
            self.status.attempts += 1
            try:
                host, port, use_ssl = _parse_url(self.status.url)
                self.reader, self.writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port, ssl=use_ssl), timeout=10.0)
                self.status.connected = True
                self.status.connected_at = time.time()
                self.status.last_error = None
                # 1. mining.subscribe
                await self._send({"id": self._next_id(), "method": "mining.subscribe",
                                  "params": [f"GridProxy/1.2.5 ({self.status.coin})"]})
                self.status.subscribed = True
                # 2. mining.authorize the master account.
                # Worker name format (iter-11 strict): <account>.<prefix-or-empty>
                auth_user = (
                    f"{POOL_ACCOUNT_ID}.{RVN_WORKER_PREFIX}"
                    if RVN_WORKER_PREFIX else POOL_ACCOUNT_ID
                )
                await self._send({"id": self._next_id(), "method": "mining.authorize",
                                  "params": [auth_user, POOL_PASSWORD]})
                self.status.authorized = True
                logger.info(f"[pool {self.status.coin}] connected + authorized as {auth_user}")
                # 3. read loop
                async for line in self._read_lines():
                    if self._stop.is_set(): break
                    self._handle_line(line)
                self.status.connected = False
                self.status.disconnected_at = time.time()
            except Exception as e:
                self.status.connected = False
                self.status.last_error = f"{type(e).__name__}: {e}"
                self.status.disconnected_at = time.time()
                logger.warning(f"[pool {self.status.coin}] {self.status.last_error}")
            if self._stop.is_set(): break
            await asyncio.sleep(backoff)
            backoff = min(60.0, backoff * 1.5)

    async def _read_lines(self):
        while True:
            line = await self.reader.readline()
            if not line:
                return
            try:
                yield line.decode("utf-8", errors="ignore").strip()
            except Exception:
                continue

    def _handle_line(self, line: str):
        if not line:
            return
        try:
            msg = json.loads(line)
        except Exception:
            return
        method = msg.get("method")
        if method == "mining.notify":
            self.status.last_job = (msg.get("params") or ["?"])[0] if msg.get("params") else "?"
            self.status.last_job_at = time.time()
        elif method == "mining.set_difficulty":
            pass
        elif "result" in msg and msg.get("result") is True and "id" in msg:
            self.status.accepted_shares += 1
            self.status.last_share_at = time.time()
        elif "error" in msg and msg.get("error"):
            self.status.rejected_shares += 1

    async def _send(self, obj: dict):
        if not self.writer: return
        line = (json.dumps(obj) + "\n").encode("utf-8")
        async with self._lock:
            self.writer.write(line)
            await self.writer.drain()

    def _next_id(self) -> int:
        self.status.handshake_id += 1
        return self.status.handshake_id

    async def register_worker(self, device_short_id: str) -> bool:
        if not (self.status.connected and self.status.authorized):
            return False
        if device_short_id in self._registered:
            return True
        worker_name = f"{POOL_ACCOUNT_ID}.{device_short_id}"
        try:
            await self._send({"id": self._next_id(), "method": "mining.authorize",
                              "params": [worker_name, POOL_PASSWORD]})
            self._registered.add(device_short_id)
            self.status.workers_registered = len(self._registered)
            return True
        except Exception:
            return False


# ============================================================================
# Multi-class manager
# ============================================================================
class MultiPoolManager:
    """Owns one PoolConnector per coin in POOL_ENDPOINTS."""

    def __init__(self):
        self.connectors: dict[str, PoolConnector] = {}
        self.statuses: dict[str, PoolStatus] = {}
        for coin, ep in POOL_ENDPOINTS.items():
            st = PoolStatus(coin=coin, algo=ep["algo"], url=ep["url"])
            self.statuses[coin] = st
            self.connectors[coin] = PoolConnector(st)

    def start(self):
        for c in self.connectors.values():
            c.start()

    async def stop(self):
        await asyncio.gather(*(c.stop() for c in self.connectors.values()), return_exceptions=True)

    def status_dict(self) -> dict:
        classes = [s.to_dict() for s in self.statuses.values()]
        armed = sum(1 for s in self.statuses.values() if s.connected and s.authorized)
        any_connected = any(s.connected for s in self.statuses.values())
        primary = self.statuses.get(PRIMARY_COIN)
        return {
            "configured": _is_configured(),
            "enabled": ENABLE_REAL_POOL,
            "connected": any_connected,
            "primary_coin": PRIMARY_COIN,
            "primary_class": primary.to_dict() if primary else None,
            "classes": classes,
            "armed_count": armed,
            "total_classes": len(self.statuses),
            "all_armed": armed == len(self.statuses) and len(self.statuses) > 0,
            "pool_account": POOL_ACCOUNT_ID or None,
            "worker_prefix": RVN_WORKER_PREFIX,
            "pow_status": POW_STATUS,
            # Aggregate counters across all classes
            "accepted_shares": sum(s.accepted_shares for s in self.statuses.values()),
            "rejected_shares": sum(s.rejected_shares for s in self.statuses.values()),
            "workers_registered": (primary.workers_registered if primary else 0),
            # Back-compat single-class fields (still read by some legacy admin UI bits)
            "subscribed": primary.subscribed if primary else False,
            "authorized": primary.authorized if primary else False,
            "stratum_url": _redact_stratum_url(primary.url) if primary else None,
            "last_share_at": primary.last_share_at if primary else None,
            "last_job": primary.last_job if primary else None,
            "last_job_at": primary.last_job_at if primary else None,
            "connected_at": primary.connected_at if primary else None,
            "disconnected_at": primary.disconnected_at if primary else None,
            "last_error": primary.last_error if primary else None,
            "attempts": primary.attempts if primary else 0,
            "current_pool_hashrate_hps": 0.0,
        }

    async def register_device(self, device_short_id: str) -> bool:
        """Register on the PRIMARY (RVN) class only — phones cannot mine 11 algos
        simultaneously. The primary is the visibility anchor in Binance worker lists."""
        c = self.connectors.get(PRIMARY_COIN)
        if not c:
            return False
        return await c.register_worker(device_short_id)


# ---- Module-level singletons + back-compat exports ----
MULTI = MultiPoolManager()
# Back-compat: some callers import STATUS / CONNECTOR directly (server.py imports)
STATUS = MULTI.statuses[PRIMARY_COIN]
CONNECTOR = MULTI.connectors[PRIMARY_COIN]


def get_status() -> dict:
    """Aggregate multi-class status — surfaced to /api/admin/pool/status."""
    return MULTI.status_dict()


def is_enabled() -> bool:
    return ENABLE_REAL_POOL and _is_configured()


def start():
    if not (ENABLE_REAL_POOL and _is_configured()):
        logger.info("Binance-Pool stratum proxy: not configured "
                    "(ENABLE_REAL_POOL=false or creds missing)")
        return
    logger.info(
        f"Binance-Pool multi-class proxy: starting {len(POOL_ENDPOINTS)} connectors "
        f"(account={POOL_ACCOUNT_ID}, primary={PRIMARY_COIN})"
    )
    MULTI.start()


async def shutdown():
    await MULTI.stop()


async def register_device(device_short_id: str) -> bool:
    return await MULTI.register_device(device_short_id)
