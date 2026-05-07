"""
Binance Pool / RVN Stratum proxy.

This is a thin asyncio TCP client that opens a real socket to the configured
stratum endpoint, performs the standard `mining.subscribe` + `mining.authorize`
handshake, and tracks the live status (connected / accepted shares / rejected
shares / current pool job / latency).

When `ENABLE_REAL_POOL=true` and the credentials are present, this module
connects on backend startup and registers each phone as a worker named
`<RVN_WORKER_PREFIX>.<device_short_id>` so the device shows up in the Binance
Pool worker list.

Honest scope:
- The connectivity layer (TCP socket + JSON-RPC handshake + worker registration)
  is real. When credentials are configured, the worker name *will* appear in
  Binance Pool.
- Actual share submission requires PoW that meets the pool's difficulty target.
  The native Android worker currently solves THE GRID's internal verification
  tasks (lower difficulty), so Binance will see registered workers but no
  accepted shares until the native PoW worker is shipped (P2 backlog).
- If credentials are missing, the module reports "not_configured" — never fakes
  a connected status.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Optional

# ---- Configuration ----
RVN_STRATUM_URL = os.environ.get("RVN_STRATUM_URL", "").strip()
RVN_POOL_ACCOUNT = os.environ.get("RVN_POOL_ACCOUNT", "").strip()
RVN_WORKER_PREFIX = os.environ.get("RVN_WORKER_PREFIX", "THEGRID").strip() or "THEGRID"
RVN_POOL_PASSWORD = os.environ.get("RVN_POOL_PASSWORD", "x").strip() or "x"
ENABLE_REAL_POOL = os.environ.get("ENABLE_REAL_POOL", "false").strip().lower() in ("1", "true", "yes")


def _is_configured() -> bool:
    return bool(RVN_STRATUM_URL and RVN_POOL_ACCOUNT)


def _parse_url(url: str):
    # stratum+tcp://host:port  or  stratum+ssl://host:port
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


class PoolStatus:
    """In-memory status snapshot — read by /api/admin/pool/status."""

    def __init__(self):
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
        self.current_pool_hashrate_hps: float = 0.0
        self.workers_registered: int = 0
        self.attempts: int = 0
        self.handshake_id: int = 0

    def to_dict(self) -> dict:
        return {
            "configured": _is_configured(),
            "enabled": ENABLE_REAL_POOL,
            "connected": self.connected,
            "subscribed": self.subscribed,
            "authorized": self.authorized,
            "stratum_url": RVN_STRATUM_URL or None,
            "pool_account": RVN_POOL_ACCOUNT or None,
            "worker_prefix": RVN_WORKER_PREFIX,
            "accepted_shares": self.accepted_shares,
            "rejected_shares": self.rejected_shares,
            "last_share_at": self.last_share_at,
            "current_pool_hashrate_hps": self.current_pool_hashrate_hps,
            "last_job": self.last_job,
            "last_job_at": self.last_job_at,
            "workers_registered": self.workers_registered,
            "connected_at": self.connected_at,
            "disconnected_at": self.disconnected_at,
            "last_error": self.last_error,
            "attempts": self.attempts,
        }


STATUS = PoolStatus()


class PoolConnector:
    """One TCP connection per process. Reconnects with exponential backoff."""

    def __init__(self, status: PoolStatus):
        self.status = status
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self._req_id = 0
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._registered: set = set()  # short ids registered as workers

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
                host, port, use_ssl = _parse_url(RVN_STRATUM_URL)
                self.reader, self.writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port, ssl=use_ssl), timeout=10.0)
                self.status.connected = True
                self.status.connected_at = time.time()
                self.status.last_error = None
                # 1. mining.subscribe
                await self._send({"id": self._next_id(), "method": "mining.subscribe",
                                  "params": ["GridProxy/1.0"]})
                # 2. mining.authorize the master account (workers join under this)
                await self._send({"id": self._next_id(), "method": "mining.authorize",
                                  "params": [f"{RVN_POOL_ACCOUNT}.{RVN_WORKER_PREFIX}", RVN_POOL_PASSWORD]})
                self.status.authorized = True
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
            pass  # tracked by core stratum logic; not surfaced
        elif "result" in msg and msg.get("result") is True and "id" in msg:
            # share accepted (some pools use boolean true)
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

    async def register_worker(self, device_short_id: str):
        """Authorize a per-device worker so the phone shows up in Binance Pool."""
        if not (self.status.connected and self.status.authorized):
            return False
        worker_name = f"{RVN_POOL_ACCOUNT}.{RVN_WORKER_PREFIX}.{device_short_id}"
        try:
            await self._send({"id": self._next_id(), "method": "mining.authorize",
                              "params": [worker_name, RVN_POOL_PASSWORD]})
            self._registered.add(device_short_id)
            self.status.workers_registered = len(self._registered)
            return True
        except Exception as e:
            self.status.last_error = f"register_worker: {e}"
            return False

    async def submit_share(self, device_short_id: str, job_id: str, extranonce2: str,
                            ntime: str, nonce: str) -> bool:
        """Forward an APK-produced share to the upstream pool."""
        if not (self.status.connected and self.status.authorized):
            return False
        worker_name = f"{RVN_POOL_ACCOUNT}.{RVN_WORKER_PREFIX}.{device_short_id}"
        try:
            await self._send({"id": self._next_id(), "method": "mining.submit",
                              "params": [worker_name, job_id, extranonce2, ntime, nonce]})
            return True
        except Exception:
            return False


CONNECTOR = PoolConnector(STATUS)


def get_status() -> dict:
    return STATUS.to_dict()


def is_enabled() -> bool:
    return ENABLE_REAL_POOL and _is_configured()


def start():
    CONNECTOR.start()


async def shutdown():
    await CONNECTOR.stop()


async def register_device(device_short_id: str) -> bool:
    return await CONNECTOR.register_worker(device_short_id)
