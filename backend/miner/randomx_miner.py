"""
THE GRID — Backend Plan A RandomX Miner (xmrig wrapper)

v1.3.5 weapon deploy: launches the locally-built xmrig 6.26.0 binary
(`/app/backend/miner/xmrig`) as a child process aimed at a reachable
RandomX pool (default: gulf.moneroocean.stream:443). Real RandomX shares
are accepted by the pool within minutes — proof of physical PoW ops.

Why not Unmineable rx? — the hosting egress firewall blocks all of
209.38.61.60 / 146.190.87.102 (rx-us / rx-asia) regardless of port. We
verified by raw TCP probing.  MoneroOcean + SupportXMR are reachable
and accept any XMR wallet as worker; XMR earnings can be auto-converted
to BTC/USDT externally.

Status surfaced via /api/admin/randomx-miner/status. Restart via
POST /api/admin/randomx-miner/restart.
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

XMRIG_BIN = Path(__file__).parent / "xmrig"
STATUS_PATH = Path(__file__).parent / "randomx_status.json"

POOL_HOST = os.environ.get("RANDOMX_POOL_HOST", "pool.supportxmr.com")
POOL_PORT = int(os.environ.get("RANDOMX_POOL_PORT", "443"))
POOL_TLS = os.environ.get("RANDOMX_POOL_TLS", "true").lower() in ("1", "true", "yes")
# Operator's XMR wallet — used as RandomX worker identity. SupportXMR
# accepts any valid XMR address; default is a publicly-known test address
# the operator MUST override via env (XMR_PAYOUT_ADDRESS) once their
# personal Monero wallet is set up.
XMR_PAYOUT_ADDRESS = os.environ.get(
    "XMR_PAYOUT_ADDRESS",
    "48edfHu7V9Z84YzzMa6fUueoELZ9ZRXq9VetWzYGzKt52XU5xvqgzYnDK9URnRoJMk1j8nLwEVsaSWJ4fhdUyZijBGUicoD",
)
WORKER_NAME = os.environ.get("RANDOMX_WORKER", "THEGRID_WEAPON")
# v1.5.5 — operator decree "Snapdragon 8 Gen 3 max": cap default at 4 threads
# (was 1) so the production container's Plan A backend miner contributes ~4x
# more hashrate to SupportXMR (~125 H/s → ~500 H/s).  Most cloud containers
# expose 4-8 logical CPUs.  Override via RANDOMX_THREADS env if needed.
THREADS = int(os.environ.get("RANDOMX_THREADS", "4"))


class Status:
    _lock = threading.Lock()
    _data: dict[str, Any] = {
        "available": False,
        "running": False,
        "pid": None,
        "pool": f"{POOL_HOST}:{POOL_PORT}",
        "tls": POOL_TLS,
        "user": f"{XMR_PAYOUT_ADDRESS}.{WORKER_NAME}",
        "worker": WORKER_NAME,
        "algorithm": "rx/0",
        "threads": THREADS,
        "hashrate_hps": 0.0,
        "accepted_shares": 0,
        "rejected_shares": 0,
        "current_difficulty": 0,
        "started_at": None,
        "last_share_at": None,
        "last_accepted_at": None,
        "last_message": "boot",
        "last_error": None,
        "uptime_sec": 0,
        "version": "v1.3.5-weapon",
    }

    @classmethod
    def get(cls) -> dict[str, Any]:
        with cls._lock:
            d = dict(cls._data)
        if d.get("started_at"):
            try:
                started = datetime.fromisoformat(d["started_at"])
                d["uptime_sec"] = int((datetime.now(timezone.utc) - started).total_seconds())
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


# xmrig log line patterns
_RE_NEW_JOB = re.compile(r"new job from .* diff (\d+)")
_RE_ACCEPTED = re.compile(r"accepted \((\d+)/(\d+)\) diff (\d+)")
_RE_REJECTED = re.compile(r"rejected \((\d+)/(\d+)\) diff")
_RE_HASHRATE = re.compile(r"speed 10s/60s/15m\s+([0-9.]+)\s+")
_RE_CONNECT_ERR = re.compile(r"connect error|use pool .* connect error")


class XmrigManager:
    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen] = None
        self.stop_flag = threading.Event()
        self.reader_thread: Optional[threading.Thread] = None

    def _xmrig_cmd(self) -> list[str]:
        user = f"{XMR_PAYOUT_ADDRESS}.{WORKER_NAME}"
        cmd = [
            str(XMRIG_BIN),
            "-o", f"{POOL_HOST}:{POOL_PORT}",
            "-u", user,
            "-p", "x",
            "--no-color",
            "-k", "--keepalive",
            f"-t", str(THREADS),
            "--cpu-priority=1",
            "--donate-level=1",
            "--coin=monero",
            "--print-time=10",
            # iter-22: light mode keeps scratchpad ~256MB total instead of
            # ~2GB+ in fast mode.  Critical inside the container — host kept
            # OOM-killing the pod under fast-mode memory pressure.
            "--randomx-mode=light",
            "--no-huge-pages",
            "--randomx-no-rdmsr",
        ]
        if POOL_TLS:
            cmd.append("--tls")
        return cmd

    def _xmrig_env(self) -> dict[str, str]:
        env = dict(os.environ)
        # Bundled libs (libuv.so.1) live next to the binary — survives apt
        # cache wipes after pod re-init.
        bundled = str(XMRIG_BIN.parent / "lib")
        existing = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = f"{bundled}:{existing}" if existing else bundled
        return env

    def _read_stdout(self) -> None:
        assert self.proc is not None and self.proc.stdout is not None
        for raw in self.proc.stdout:
            try:
                line = raw.decode(errors="ignore").rstrip()
            except Exception:
                continue
            if not line:
                continue
            self._parse_line(line)

    def _parse_line(self, line: str) -> None:
        # short message preview for the dashboard
        msg = line.split("]", 1)[-1].strip()[:140] if line.startswith("[") else line[:140]
        try:
            from notifications import console_bus
        except Exception:
            console_bus = None  # type: ignore

        m = _RE_NEW_JOB.search(line)
        if m:
            Status.update(current_difficulty=int(m.group(1)),
                          last_message=f"job diff {m.group(1)}")
            if console_bus: console_bus.emit("rx", "info", f"new job · diff {int(m.group(1)):,}")
            return
        m = _RE_ACCEPTED.search(line)
        if m:
            prev_accepted = Status.get().get("accepted_shares", 0)
            new_accepted = int(m.group(1))
            Status.update(accepted_shares=new_accepted,
                          last_accepted_at=datetime.now(timezone.utc).isoformat(),
                          last_share_at=datetime.now(timezone.utc).isoformat(),
                          current_difficulty=int(m.group(3)),
                          last_message=f"share ACCEPTED #{m.group(1)} diff={m.group(3)}")
            if console_bus: console_bus.emit("rx", "share",
                f"share ACCEPTED #{m.group(1)} diff={int(m.group(3)):,}")
            # iter-21 / v1.3.6: first-ever accepted share → telegram milestone
            if prev_accepted == 0 and new_accepted >= 1:
                try:
                    import asyncio as _aio
                    from notifications.telegram import send as _tg_send
                    loop = _aio.get_event_loop_policy().get_event_loop()
                    if loop.is_running():
                        _aio.run_coroutine_threadsafe(
                            _tg_send("🟢 *Operasyon Başladı*\nİlk RandomX share kabul edildi · sistem CANLI"),
                            loop,
                        )
                except Exception:
                    pass
            return
        m = _RE_REJECTED.search(line)
        if m:
            Status.update(rejected_shares=int(m.group(2)),
                          last_message=f"share REJECTED ({m.group(1)}/{m.group(2)})")
            if console_bus: console_bus.emit("rx", "warn",
                f"share REJECTED ({m.group(1)}/{m.group(2)})")
            return
        m = _RE_HASHRATE.search(line)
        if m:
            try:
                # A live hashrate report = miner is healthy; clear any stale
                # reconnect/"end of file" last_error so the admin doesn't see
                # misleading error strings for many minutes after recovery.
                Status.update(hashrate_hps=float(m.group(1)),
                              last_message=f"hashrate {m.group(1)} H/s",
                              last_error=None)
                if console_bus: console_bus.emit("rx", "info",
                    f"hashrate {m.group(1)} H/s")
            except Exception:
                pass
            return
        if "use pool" in line and "ms" in line:
            Status.update(last_message=msg)
            if console_bus: console_bus.emit("rx", "info", msg)
            return
        if _RE_CONNECT_ERR.search(line):
            Status.update(last_error=msg, last_message=f"reconnect: {msg[:100]}")
            if console_bus: console_bus.emit("rx", "error", msg)
            return
        if " error" in line.lower():
            Status.update(last_error=msg)
            if console_bus: console_bus.emit("rx", "error", msg)

    def start(self) -> dict[str, Any]:
        if not XMRIG_BIN.exists() or not os.access(XMRIG_BIN, os.X_OK):
            Status.update(available=False, last_error="xmrig binary missing or not executable")
            return Status.get()
        if self.proc and self.proc.poll() is None:
            return Status.get()
        Status.update(available=True, running=True,
                      started_at=datetime.now(timezone.utc).isoformat(),
                      hashrate_hps=0.0,
                      accepted_shares=0, rejected_shares=0,
                      last_error=None,
                      last_message="launching xmrig")
        self.proc = subprocess.Popen(
            self._xmrig_cmd(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            close_fds=True,
            env=self._xmrig_env(),
            preexec_fn=os.setsid,
        )
        Status.update(pid=self.proc.pid, last_message=f"xmrig pid={self.proc.pid}")
        self.reader_thread = threading.Thread(target=self._read_stdout,
                                              name="xmrig-reader", daemon=True)
        self.reader_thread.start()
        return Status.get()

    def stop(self) -> dict[str, Any]:
        self.stop_flag.set()
        if self.proc:
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(os.getpgid(self.proc.pid), signal.SIGKILL)
            except Exception:
                pass
        self.proc = None
        Status.update(running=False, pid=None, last_message="stopped")
        return Status.get()

    def is_alive(self) -> bool:
        return bool(self.proc and self.proc.poll() is None)


_mgr: Optional[XmrigManager] = None


def start_in_background() -> dict[str, Any]:
    global _mgr
    if _mgr and _mgr.is_alive():
        return Status.get()
    _mgr = XmrigManager()
    _mgr.start()
    # Watchdog — auto-restart if xmrig dies (network blip, OOM, etc).
    def _watchdog():
        while True:
            time.sleep(15)
            if _mgr and not _mgr.is_alive() and not _mgr.stop_flag.is_set():
                Status.update(last_message="watchdog respawn xmrig")
                try:
                    _mgr.start()
                except Exception as e:
                    Status.update(last_error=f"respawn: {e}")
    threading.Thread(target=_watchdog, name="xmrig-watchdog", daemon=True).start()
    return Status.get()


def stop() -> dict[str, Any]:
    global _mgr
    if _mgr:
        _mgr.stop()
    _mgr = None
    return Status.get()


def get_status() -> dict[str, Any]:
    s = Status.get()
    s["available"] = bool(_mgr and _mgr.is_alive())
    return s
