"""
THE GRID — Live Operator Console event bus (v1.3.6).

Captures real-time events from the Plan A xmrig miner + Plan B SHA-256 miner +
device heartbeats and broadcasts them to a small in-memory ring buffer that
admin WebSocket clients can subscribe to. Each event is shaped:

    {
      "ts": iso_utc,
      "src": "rx" | "sha256" | "device" | "system",
      "level": "info" | "share" | "warn" | "error",
      "msg": str,
    }

The xmrig stdout is parsed by miner/randomx_miner.py — instead of dropping
log lines we mirror them into this bus.
"""
from __future__ import annotations

import asyncio
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any

_LOCK = threading.Lock()
_BUFFER: deque[dict[str, Any]] = deque(maxlen=500)
_SUBSCRIBERS: list[asyncio.Queue] = []
_LOOP: asyncio.AbstractEventLoop | None = None


def attach_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Called once on FastAPI startup so `emit()` can dispatch from threads."""
    global _LOOP
    _LOOP = loop


def emit(src: str, level: str, msg: str) -> None:
    """Thread-safe event push. Called from xmrig stdout reader (worker thread)."""
    ev = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "src": src,
        "level": level,
        "msg": msg[:300],
    }
    with _LOCK:
        _BUFFER.append(ev)
        targets = list(_SUBSCRIBERS)
    if _LOOP and not _LOOP.is_closed():
        for q in targets:
            try:
                _LOOP.call_soon_threadsafe(q.put_nowait, ev)
            except Exception:
                pass


def snapshot(limit: int = 100) -> list[dict[str, Any]]:
    """Latest `limit` events for a freshly-opened WS or HTTP poll."""
    with _LOCK:
        items = list(_BUFFER)
    return items[-limit:]


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    with _LOCK:
        _SUBSCRIBERS.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    with _LOCK:
        try:
            _SUBSCRIBERS.remove(q)
        except ValueError:
            pass
