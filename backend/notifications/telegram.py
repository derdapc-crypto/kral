"""
THE GRID — Telegram signal-line notifier.

v1.3.5: when the Unmineable USDT BEP20 balance crosses an integer-multiple
of 0.1 USDT, fire a Telegram message to the operator. Configured via:
  TELEGRAM_BOT_TOKEN  — bot token from @BotFather
  TELEGRAM_CHAT_ID    — operator's chat id (numeric)
  TELEGRAM_NOTIFY_STEP — delta threshold in USDT (default 0.1)

If either env is empty, the notifier is a no-op (returns False) — no
exceptions, no log spam. So shipping with placeholder env is safe.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import httpx


def _enabled() -> bool:
    return bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"))


def get_step() -> float:
    try:
        return max(0.001, float(os.environ.get("TELEGRAM_NOTIFY_STEP", "0.1")))
    except Exception:
        return 0.1


async def send(text: str) -> bool:
    """Best-effort fire-and-forget Telegram message. Returns True on 200."""
    if not _enabled():
        return False
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat = os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.post(url, json={
                "chat_id": chat,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            })
            return r.status_code == 200
    except Exception:
        return False


async def notify_balance_step(prev: float, curr: float, coin: str = "USDT") -> Optional[float]:
    """
    Fires a "Sistem Kar Üretti: +X USDT" message every time the balance
    crosses a multiple of `step`.  Returns the new "last reported" floor
    (curr // step * step) so callers can persist it. Returns None when no
    threshold was crossed or notifier is disabled.
    """
    step = get_step()
    if curr is None or prev is None:
        return None
    prev_floor = (int(prev / step)) * step
    curr_floor = (int(curr / step)) * step
    if curr_floor <= prev_floor:
        return None
    delta = round(curr - prev, 6)
    when = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    msg = (
        f"🟢 *Sistem Kar Üretti: +{delta:.4f} {coin}*\n"
        f"Yeni bakiye: `{curr:.6f} {coin}`\n"
        f"Eşik aşıldı: `{curr_floor:.4f} {coin}` (step={step})\n"
        f"⏱ {when}"
    )
    await send(msg)
    return curr_floor
