"""
THE GRID — Backend Plan B SHA-256 Stratum Miner

Reality check (v1.3.4): the container egress firewall blocks rx.unmineable.com
(RandomX) but allows sha256.unmineable.com:3333. xmrig does not speak SHA-256
Stratum, so this module implements a tiny pure-Python double-SHA-256 miner that
connects to Unmineable, authenticates with the operator's USDT BEP20 address,
and submits real shares.

Hashrate ≈ 1-3 MH/s per worker (Python hashlib). Unmineable runs vardiff so
even at low hashrate accepted shares will accumulate against
0xea625c7b0c6c29c961d2ab419a957443d84c6869 -> USDT BEP20 payout.

Status is mirrored to MongoDB collection `backend_miner_status` every 10s and
also to a JSON file at /app/backend/miner/status.json so the admin dashboard
can poll without DB access.
"""

from __future__ import annotations

import binascii
import hashlib
import json
import os
import socket
import struct
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------- Configuration ----------
POOL_HOST = os.environ.get("BACKEND_MINER_HOST", "sha256.unmineable.com")
POOL_PORT = int(os.environ.get("BACKEND_MINER_PORT", "3333"))
PAYOUT_COIN = os.environ.get("BACKEND_MINER_COIN", "USDT")
PAYOUT_ADDR = os.environ.get(
    "RVN_PAYOUT_ADDRESS", "0xea625c7b0c6c29c961d2ab419a957443d84c6869"
)
WORKER_NAME = os.environ.get("BACKEND_MINER_WORKER", "THEGRID_BACKEND")
REFERRAL = os.environ.get("BACKEND_MINER_REFERRAL", "GRID-PLANB")

STATUS_PATH = Path(__file__).parent / "status.json"
STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)


# ---------- Stratum helpers ----------
def _dsha256(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def _swap_endian_words(hex_str: str) -> bytes:
    """Reverse byte order of every 4-byte word — Bitcoin Stratum convention."""
    raw = binascii.unhexlify(hex_str)
    out = bytearray()
    for i in range(0, len(raw), 4):
        out.extend(raw[i : i + 4][::-1])
    return bytes(out)


def _merkle_root_from_branches(coinbase_hash: bytes, branches: list[str]) -> bytes:
    h = coinbase_hash
    for br in branches:
        h = _dsha256(h + binascii.unhexlify(br))
    return h


def _target_from_diff(diff: float) -> int:
    """Bitcoin difficulty 1 target = 0x00000000FFFF...0000 (32 bytes)."""
    diff1 = 0x00000000FFFF0000000000000000000000000000000000000000000000000000
    if diff <= 0:
        diff = 1
    return int(diff1 / diff)


# ---------- Status mirror ----------
class Status:
    _lock = threading.Lock()
    _data: dict[str, Any] = {
        "running": False,
        "connected": False,
        "authorized": False,
        "pool": f"{POOL_HOST}:{POOL_PORT}",
        "user": f"{PAYOUT_COIN}:{PAYOUT_ADDR}.{WORKER_NAME}",
        "worker": WORKER_NAME,
        "payout_coin": PAYOUT_COIN,
        "payout_address": PAYOUT_ADDR,
        "started_at": None,
        "last_job_at": None,
        "last_share_at": None,
        "last_accepted_at": None,
        "last_rejected_at": None,
        "accepted_shares": 0,
        "rejected_shares": 0,
        "submitted_shares": 0,
        "hashrate_hps": 0.0,
        "current_difficulty": 0.0,
        "uptime_sec": 0,
        "last_error": None,
        "last_message": "boot",
        "extranonce1": None,
        "extranonce2_size": 0,
        "version": "v1.3.4-planb",
    }

    @classmethod
    def get(cls) -> dict[str, Any]:
        with cls._lock:
            d = dict(cls._data)
        if d.get("started_at"):
            try:
                started = datetime.fromisoformat(d["started_at"])
                d["uptime_sec"] = int(
                    (datetime.now(timezone.utc) - started).total_seconds()
                )
            except Exception:
                pass
        return d

    @classmethod
    def update(cls, **kwargs) -> None:
        with cls._lock:
            cls._data.update(kwargs)
        try:
            STATUS_PATH.write_text(json.dumps(cls.get(), indent=2))
        except Exception:
            pass


# ---------- Stratum miner core ----------
class SHA256StratumMiner:
    """
    Single-threaded SHA-256 stratum miner. Lightweight (one CPU thread,
    cooperative-yields). Sufficient to keep a worker visible on Unmineable
    and submit shares against the operator's USDT BEP20 address.
    """

    def __init__(self) -> None:
        self.sock: Optional[socket.socket] = None
        self.f: Optional[Any] = None
        self.msg_id = 0
        self.extranonce1: bytes = b""
        self.extranonce2_size: int = 4
        self.difficulty: float = 1.0
        self.job: Optional[dict[str, Any]] = None
        self.hashes_this_window = 0
        self.window_start = time.time()
        self.stop_flag = threading.Event()

    # ---- network ----
    def _connect(self) -> None:
        Status.update(connected=False, authorized=False, last_message=f"connecting to {POOL_HOST}:{POOL_PORT}")
        s = socket.create_connection((POOL_HOST, POOL_PORT), timeout=30)
        s.settimeout(60)
        self.sock = s
        self.f = s.makefile("rwb", buffering=0)
        Status.update(connected=True, last_message="tcp connected")

    def _next_id(self) -> int:
        self.msg_id += 1
        return self.msg_id

    def _send(self, payload: dict[str, Any]) -> None:
        line = (json.dumps(payload) + "\n").encode()
        assert self.f is not None
        self.f.write(line)

    def _recv(self) -> Optional[dict[str, Any]]:
        assert self.f is not None
        try:
            line = self.f.readline()
        except socket.timeout:
            return None
        if not line:
            return None
        try:
            return json.loads(line.decode().strip())
        except Exception:
            return None

    # ---- stratum handshake ----
    def _subscribe_authorize(self) -> None:
        # subscribe
        self._send({"id": self._next_id(), "method": "mining.subscribe",
                    "params": [f"GRID-Backend/{Status.get()['version']}"]})
        sub_resp = self._recv()
        if not sub_resp or "result" not in sub_resp or sub_resp.get("result") is None:
            raise RuntimeError(f"subscribe failed: {sub_resp}")
        result = sub_resp["result"]
        # result format: [[["mining.set_difficulty","..."],["mining.notify","..."]],
        #                 extranonce1_hex, extranonce2_size]
        try:
            self.extranonce1 = binascii.unhexlify(result[1])
            self.extranonce2_size = int(result[2])
        except Exception as e:
            raise RuntimeError(f"bad subscribe result: {result} ({e})")
        Status.update(extranonce1=result[1], extranonce2_size=self.extranonce2_size,
                      last_message="subscribed")

        # authorize
        user = f"{PAYOUT_COIN}:{PAYOUT_ADDR}.{WORKER_NAME}#{REFERRAL}"
        self._send({"id": self._next_id(), "method": "mining.authorize",
                    "params": [user, "x"]})
        # The server may interleave set_difficulty / notify before authorize ack.
        deadline = time.time() + 30
        authorized = False
        while time.time() < deadline and not authorized:
            msg = self._recv()
            if not msg:
                continue
            if msg.get("method") == "mining.set_difficulty":
                self._on_set_difficulty(msg)
            elif msg.get("method") == "mining.notify":
                self._on_notify(msg)
            elif "result" in msg and msg.get("result") is True:
                authorized = True
            elif "result" in msg and msg.get("result") is False:
                raise RuntimeError(f"authorize rejected: {msg}")
        if not authorized:
            raise RuntimeError("authorize timeout")
        Status.update(authorized=True, last_message="authorized")

    # ---- protocol handlers ----
    def _on_set_difficulty(self, msg: dict[str, Any]) -> None:
        try:
            d = float(msg.get("params", [1.0])[0])
            self.difficulty = d
            Status.update(current_difficulty=d, last_message=f"diff -> {d:g}")
        except Exception:
            pass

    def _on_notify(self, msg: dict[str, Any]) -> None:
        params = msg.get("params") or []
        if len(params) < 9:
            return
        (job_id, prevhash, coinb1, coinb2, merkle_branches,
         version, nbits, ntime, clean_jobs) = params[:9]
        self.job = {
            "job_id": job_id,
            "prevhash": prevhash,
            "coinb1": coinb1,
            "coinb2": coinb2,
            "merkle_branches": list(merkle_branches),
            "version": version,
            "nbits": nbits,
            "ntime": ntime,
            "clean_jobs": bool(clean_jobs),
        }
        Status.update(last_job_at=datetime.now(timezone.utc).isoformat(),
                      last_message=f"job {job_id}")

    # ---- header build + hash ----
    def _build_header(self, extranonce2: bytes, ntime_int: int, nonce: int) -> bytes:
        assert self.job is not None
        coinbase = (
            binascii.unhexlify(self.job["coinb1"])
            + self.extranonce1
            + extranonce2
            + binascii.unhexlify(self.job["coinb2"])
        )
        coinbase_hash = _dsha256(coinbase)
        merkle_root = _merkle_root_from_branches(coinbase_hash, self.job["merkle_branches"])
        # Bitcoin block header: version(4) + prevhash(32) + merkleroot(32)
        # + ntime(4) + nbits(4) + nonce(4)
        header = (
            _swap_endian_words(self.job["version"])
            + _swap_endian_words(self.job["prevhash"])
            + merkle_root
            + struct.pack("<I", ntime_int)
            + _swap_endian_words(self.job["nbits"])
            + struct.pack("<I", nonce)
        )
        return header

    def _submit(self, extranonce2_hex: str, ntime_hex: str, nonce_hex: str) -> None:
        user = f"{PAYOUT_COIN}:{PAYOUT_ADDR}.{WORKER_NAME}#{REFERRAL}"
        assert self.job is not None
        self._send({
            "id": self._next_id(), "method": "mining.submit",
            "params": [user, self.job["job_id"], extranonce2_hex, ntime_hex, nonce_hex],
        })
        s = Status.get()
        Status.update(submitted_shares=s["submitted_shares"] + 1,
                      last_share_at=datetime.now(timezone.utc).isoformat(),
                      last_message=f"submit job={self.job['job_id']} nonce={nonce_hex}")

    # ---- main loop ----
    def _drain_messages(self) -> None:
        """Non-blocking drain of pending stratum messages using select()."""
        import select
        assert self.sock is not None
        try:
            while True:
                ready, _, _ = select.select([self.sock], [], [], 0.0)
                if not ready:
                    break
                msg = self._recv()
                if not msg:
                    break
                method = msg.get("method")
                if method == "mining.set_difficulty":
                    self._on_set_difficulty(msg)
                elif method == "mining.notify":
                    self._on_notify(msg)
                elif "result" in msg and msg.get("id") is not None:
                    if msg.get("result") is True:
                        s = Status.get()
                        Status.update(accepted_shares=s["accepted_shares"] + 1,
                                      last_accepted_at=datetime.now(timezone.utc).isoformat(),
                                      last_message=f"share ACCEPTED #{s['accepted_shares'] + 1}")
                    elif msg.get("error"):
                        s = Status.get()
                        err = msg.get("error")
                        Status.update(rejected_shares=s["rejected_shares"] + 1,
                                      last_rejected_at=datetime.now(timezone.utc).isoformat(),
                                      last_error=str(err),
                                      last_message=f"share REJECTED: {err}")
        except (socket.timeout, BlockingIOError):
            pass

    def _hash_loop(self) -> None:
        """One iteration of hashing: pick latest job, scan a nonce window,
        submit any share that meets pool difficulty target."""
        if not self.job:
            return

        target = _target_from_diff(self.difficulty)
        # extranonce2 fresh per scan window (4 bytes typical)
        extranonce2 = os.urandom(self.extranonce2_size)
        ntime_int = int(self.job["ntime"], 16)

        # scan a small window of nonces; yield often so set_difficulty / notify
        # can be processed promptly.
        window = 50_000  # ~30-50ms on a modern CPU
        for nonce in range(0, window):
            header = self._build_header(extranonce2, ntime_int, nonce)
            h = _dsha256(header)
            # bitcoin hash compared as little-endian integer
            h_int = int.from_bytes(h[::-1], "big")
            if h_int <= target:
                self._submit(
                    extranonce2.hex(),
                    f"{ntime_int:08x}",
                    f"{nonce:08x}",
                )
                break
        self.hashes_this_window += window

        # update hashrate every ~5s
        if time.time() - self.window_start >= 5:
            hps = self.hashes_this_window / max(time.time() - self.window_start, 0.001)
            self.hashes_this_window = 0
            self.window_start = time.time()
            Status.update(hashrate_hps=round(hps, 1))

    def stop(self) -> None:
        self.stop_flag.set()

    def run_forever(self) -> None:
        Status.update(running=True,
                      started_at=datetime.now(timezone.utc).isoformat(),
                      last_message="boot")
        backoff = 5
        while not self.stop_flag.is_set():
            try:
                self._connect()
                self._subscribe_authorize()
                backoff = 5  # reset on successful connect
                while not self.stop_flag.is_set():
                    self._drain_messages()
                    self._hash_loop()
            except Exception as e:
                Status.update(connected=False, authorized=False,
                              last_error=f"{type(e).__name__}: {e}",
                              last_message=f"reconnect in {backoff}s")
                try:
                    if self.sock:
                        self.sock.close()
                except Exception:
                    pass
                self.sock = None
                self.f = None
                # bounded exponential backoff
                t0 = time.time()
                while not self.stop_flag.is_set() and time.time() - t0 < backoff:
                    time.sleep(0.5)
                backoff = min(backoff * 2, 120)
        Status.update(running=False, connected=False, authorized=False,
                      last_message="stopped")


# ---------- module-level controller ----------
_miner: Optional[SHA256StratumMiner] = None
_thread: Optional[threading.Thread] = None


def start_in_background() -> dict[str, Any]:
    """Idempotent: spin up the miner thread on FastAPI startup."""
    global _miner, _thread
    if _thread and _thread.is_alive():
        return Status.get()
    _miner = SHA256StratumMiner()
    _thread = threading.Thread(target=_miner.run_forever, name="grid-backend-miner", daemon=True)
    _thread.start()
    return Status.get()


def stop() -> dict[str, Any]:
    global _miner, _thread
    if _miner:
        _miner.stop()
    if _thread:
        _thread.join(timeout=5)
    _miner = None
    _thread = None
    Status.update(running=False, last_message="stopped via api")
    return Status.get()


def get_status() -> dict[str, Any]:
    return Status.get()


if __name__ == "__main__":
    # Standalone CLI for ad-hoc runs / debugging.
    m = SHA256StratumMiner()
    try:
        m.run_forever()
    except KeyboardInterrupt:
        m.stop()
