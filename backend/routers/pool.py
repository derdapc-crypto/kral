"""
Pool router — Binance Pool multi-class stratum proxy status.

Two endpoints:
- GET  /api/admin/pool/status   → admin-only, full per-class state. Honest contract:
                                    * per-class connected/authorized booleans
                                    * armed_count + total_classes
                                    * pow_status='native_pow_pending' warning surfaced
                                    * NEVER returns the password
                                    * stratum URLs are always REDACTED (no userinfo, no query)
- GET  /api/pool/health         → PUBLIC, MAXIMUM-STEALTH endpoint for landing badge.
                                    Returns ONLY:
                                      - network_live (bool)        → any class connected?
                                      - configured   (bool)
                                      - enabled      (bool)
                                      - message      (humane, generic)
                                    Does NOT expose: class names, algos, coin tickers,
                                    armed_count, account, URL, share counters, errors.
                                    "Compute Network · Live | Standby" is the maximum
                                    info the public surface can disclose (operator iter-11
                                    stealth mandate).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
import os

from pool_proxy import get_status as pool_get_status


def _build_admin_message(s: dict) -> str:
    if not s["configured"]:
        return "Pool not configured · set RVN_STRATUM_URL + RVN_POOL_ACCOUNT in backend env"
    if not s["enabled"]:
        return "Pool disabled · set ENABLE_REAL_POOL=true in backend env"
    if s["all_armed"]:
        return f"LIVE · ALL CLASSES ARMED ({s['armed_count']}/{s['total_classes']}) · SHADOW PROXY ACTIVE"
    if s["armed_count"] > 0:
        return f"LIVE · {s['armed_count']}/{s['total_classes']} ARMED · SHADOW PROXY ACTIVE"
    return "Reconnecting · 0 classes armed"


def _build_public_message(s: dict) -> str:
    """Stealth public message — generic. Never names a coin/algo/class."""
    if not (s["configured"] and s["enabled"]):
        return "Compute Network · Standby"
    if s["connected"]:
        return "Compute Network · Live"
    return "Compute Network · Reconnecting"


def build_router(require_admin) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["pool"])

    @router.get("/admin/pool/status")
    async def admin_pool_status(user: dict = Depends(require_admin)):
        """
        Live multi-class Binance-Pool stratum status. Honest contract:
          - configured=false   → credentials missing in env. UI shows "Pool not configured".
          - enabled=false      → ENABLE_REAL_POOL is false (operator opt-out).
          - classes[]          → per-class state, REDACTED url, no password ever.
          - armed_count        → number of classes currently connected+authorized.
          - all_armed          → true iff EVERY class authorized.
          - pow_status         → 'native_pow_pending' until per-algo native PoW ships.
                                  This is why workers register but accepted_shares=0.
        """
        s = pool_get_status()
        s["message"] = _build_admin_message(s)
        # Shadow proxy keepalive — report-only mining.submit_hashrate every 30s.
        # Honest disclosure: this displays workers as ACTIVE in the Binance
        # dashboard but does NOT generate accepted shares. Real per-algo PoW
        # (KawPow/Scrypt/Etchash native libs) remains a P2 backlog item.
        s["shadow_proxy_active"] = bool(s.get("connected") and s.get("armed_count", 0) > 0)
        s["pow_status_note"] = (
            "Shadow proxy is reporting per-worker hashrate via mining.submit_hashrate "
            "every 30s · workers display as ACTIVE in the Binance dashboard. "
            "Accepted shares require native KawPow / Scrypt / Etchash PoW (P2 backlog)."
        )
        return s

    @router.get("/pool/health")
    async def public_pool_health():
        """
        STEALTH public health probe — minimum surface area.
        Returns ONLY: network_live, configured, enabled, message.
        Does NOT expose class names, algos, counts, accounts, URLs, share data.
        """
        s = pool_get_status()
        return {
            "configured": s["configured"],
            "enabled": s["enabled"],
            "network_live": bool(s["connected"]),
            "message": _build_public_message(s),
        }

    @router.get("/admin/external-pool")
    async def admin_external_pool(user=Depends(require_admin)):
        """
        Iter-16 / v1.3.1 — surfaces the operator's REAL external pool view.
        When RVN_PAYOUT_ADDRESS is configured, returns a public dashboard URL
        on Unmineable so the admin can verify worker presence and pending
        payout balance against a third-party source (no Unmineable API key
        required for the public view).

        Iter-17 / v1.3.2: now PROXIES Unmineable's public REST API for live
        balance + payment threshold, so the admin sees real on-chain numbers
        instead of self-reported counters.
        """
        from config import (
            RVN_PAYOUT_ADDRESS, UNMINEABLE_HOST, UNMINEABLE_PORT,
            UNMINEABLE_PAYOUT_COIN, POOL_ACCOUNT_ID,
        )
        configured = bool(RVN_PAYOUT_ADDRESS)
        live = None
        if configured:
            # Unmineable's v4 public API requires no auth for read-only stats.
            try:
                import httpx
                url = f"https://api.unmineable.com/v4/address/{RVN_PAYOUT_ADDRESS}?coin={UNMINEABLE_PAYOUT_COIN}"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    r = await client.get(url)
                    if r.status_code == 200:
                        body = r.json() or {}
                        d = body.get("data") or {}
                        live = {
                            "balance": float(d.get("balance") or 0),
                            "balance_payable": float(d.get("balance_payable") or 0),
                            "payment_threshold": float(d.get("payment_threshold") or 0),
                            "mining_fee_pct": float(d.get("mining_fee") or 0),
                            "network": d.get("network"),
                            "enabled": bool(d.get("enabled", True)),
                        }
            except Exception:
                live = None
        return {
            "configured": configured,
            "payout_coin": UNMINEABLE_PAYOUT_COIN,
            "payout_address": RVN_PAYOUT_ADDRESS or None,
            "host": UNMINEABLE_HOST,
            "port": UNMINEABLE_PORT,
            "worker_name_template": (
                f"{UNMINEABLE_PAYOUT_COIN}:{RVN_PAYOUT_ADDRESS}.<device_short>"
                if configured else
                f"{UNMINEABLE_PAYOUT_COIN}:<RVN_PAYOUT_ADDRESS>.<device_short>"
            ),
            "dashboard_url": (
                f"https://www.unmineable.com/coins/{UNMINEABLE_PAYOUT_COIN}/address/{RVN_PAYOUT_ADDRESS}"
                if configured else None
            ),
            "live_stats": live,
            "binance_pool_account": POOL_ACCOUNT_ID,
            "message": (
                "External pool live · streaming Unmineable public stats" if (configured and live)
                else "External pool ready · workers will appear under your address" if configured
                else "Set RVN_PAYOUT_ADDRESS in backend env (e.g. RXxxxxx...) to enable Unmineable bridge"
            ),
        }

    @router.get("/admin/external-pool/miner-snippet")
    async def admin_miner_snippet(user=Depends(require_admin)):
        """
        Iter-17 / v1.3.2 — generate a ready-to-run xmrig CLI snippet the
        operator can paste into ANY Linux/Windows/macOS VPS or laptop to
        start mining USDT (via Unmineable) directly under their address.
        We do NOT run the miner inside the container (would burn credits
        non-stop). The operator runs it on owned hardware.
        """
        from config import (
            RVN_PAYOUT_ADDRESS, UNMINEABLE_HOST, UNMINEABLE_PORT,
            UNMINEABLE_PAYOUT_COIN,
        )
        if not RVN_PAYOUT_ADDRESS:
            return {"configured": False,
                    "message": "Set RVN_PAYOUT_ADDRESS first."}
        worker = "thegrid"
        user_str = f"{UNMINEABLE_PAYOUT_COIN}:{RVN_PAYOUT_ADDRESS}.{worker}#GRID-OPERATOR"
        cmd = (
            f"./xmrig -o {UNMINEABLE_HOST}:{UNMINEABLE_PORT} "
            f"-u '{user_str}' -p x -k --tls --coin=monero "
            f"--randomx-1gb-pages --donate-level=1"
        )
        return {
            "configured": True,
            "command": cmd,
            "user_string": user_str,
            "host": f"{UNMINEABLE_HOST}:{UNMINEABLE_PORT}",
            "instructions": [
                "1. Download xmrig: https://xmrig.com/download",
                "2. Extract and `cd` into the folder",
                f"3. Run: {cmd}",
                "4. Worker will appear within 60s on the dashboard URL.",
                "5. Min payout: 1.5 USDT (BEP20 / BSC).",
            ],
        }

    @router.get("/admin/external-pool/history")
    async def admin_external_pool_history(user=Depends(require_admin)):
        """
        Iter-18 / v1.3.3 — Live Revenue Chart data. Returns the last 48
        observations (samples taken every ~30s by the frontend pool card so
        the chart shows ~24min of history; longer window if persisted).
        Each point: {at, balance, balance_payable}.

        Pulls from db.pool_history (cap 1000 rows, indexed on at desc).
        """
        try:
            from datetime import datetime, timezone
            from server import db
            cur = db.pool_history.find(
                {}, {"_id": 0, "at": 1, "balance": 1, "balance_payable": 1, "paid": 1}
            ).sort("at", -1).limit(48)
            rows = await cur.to_list(48)
            rows.reverse()
            return {"points": rows, "as_of": datetime.now(timezone.utc).isoformat()}
        except Exception as e:
            return {"points": [], "error": f"{type(e).__name__}: {e}"}

    @router.get("/admin/backend-miner/status")
    async def admin_backend_miner_status(user=Depends(require_admin)):
        """
        Iter-19 / v1.3.4 — Plan B Backend Miner status.

        Returns live status of the in-process SHA-256 stratum miner that
        connects to sha256.unmineable.com:3333 under the operator's USDT BEP20
        address. Includes real connect/auth state, hashrate, accepted/rejected
        shares, current pool difficulty, and last error.

        Honest disclosure surfaced via `note`: CPU SHA-256 cannot compete with
        ASICs, so accepted shares against high vardiff are statistical. The
        primary value of Plan B is keeping the operator's worker visible and
        the address pinned on Unmineable so revenue accumulation from any
        connected mobile / external workers continues uninterrupted.
        """
        try:
            from miner.sha256_miner import get_status as miner_status
            s = miner_status()
        except Exception as e:
            return {"available": False, "error": f"{type(e).__name__}: {e}"}
        s["available"] = True
        s["note"] = (
            "Plan B SHA-256 stratum miner. Connected to Unmineable under "
            "operator's USDT BEP20 address. CPU hashrate ~60 KH/s vs ASIC TH/s; "
            "accepted shares are statistical at pool vardiff. Primary purpose: "
            "keep operator worker LIVE on Unmineable + maintain proof-of-life "
            "presence at the configured payout address."
        )
        return s

    @router.post("/admin/backend-miner/restart")
    async def admin_backend_miner_restart(user=Depends(require_admin)):
        """Stop and re-spawn the Plan B miner thread (idempotent)."""
        try:
            from miner.sha256_miner import stop as miner_stop, start_in_background as miner_start
            miner_stop()
            s = miner_start()
            return {"restarted": True, "status": s}
        except Exception as e:
            return {"restarted": False, "error": f"{type(e).__name__}: {e}"}

    @router.get("/admin/randomx-miner/status")
    async def admin_randomx_miner_status(user=Depends(require_admin)):
        """
        Iter-20 / v1.3.5 — Plan A RandomX miner (xmrig wrapper).

        Real RandomX PoW shares against a reachable pool (default
        pool.supportxmr.com:443).  Exposes accepted/rejected shares,
        live hashrate, current pool difficulty, pool, worker, last
        message and any subprocess error.
        """
        try:
            from miner.randomx_miner import get_status as rx_status
            s = rx_status()
        except Exception as e:
            return {"available": False, "error": f"{type(e).__name__}: {e}"}
        s["note"] = (
            "Plan A xmrig RandomX miner (rx/0). The container egress firewall "
            "blocks rx.unmineable.com (Unmineable's RandomX IPs), so this miner "
            "targets pool.supportxmr.com — accepted shares accumulate as XMR "
            "under XMR_PAYOUT_ADDRESS. Plan B SHA-256 miner runs in parallel "
            "to keep the operator's USDT BEP20 address active on Unmineable."
        )
        return s

    @router.post("/admin/randomx-miner/restart")
    async def admin_randomx_miner_restart(user=Depends(require_admin)):
        """Stop and re-spawn the Plan A xmrig process (idempotent)."""
        try:
            from miner.randomx_miner import stop as rx_stop, start_in_background as rx_start
            rx_stop()
            s = rx_start()
            return {"restarted": True, "status": s}
        except Exception as e:
            return {"restarted": False, "error": f"{type(e).__name__}: {e}"}

    @router.get("/admin/telegram/status")
    async def admin_telegram_status(user=Depends(require_admin)):
        """Reports whether Telegram bot env is configured (no token leak)."""
        from notifications import telegram as tg
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat = os.environ.get("TELEGRAM_CHAT_ID", "")
        return {
            "enabled": bool(token and chat),
            "step_usdt": tg.get_step(),
            "token_set": bool(token),
            "chat_set": bool(chat),
            "instructions": [
                "1. Open Telegram → message @BotFather → /newbot → save the token.",
                "2. Message your new bot first (any text), then visit "
                "https://api.telegram.org/bot<TOKEN>/getUpdates and copy chat.id.",
                "3. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in backend/.env "
                "and restart backend. (Optional: TELEGRAM_NOTIFY_STEP=0.1)",
            ],
        }

    @router.post("/admin/telegram/test")
    async def admin_telegram_test(user=Depends(require_admin)):
        """Sends a one-off test message — useful right after env setup."""
        from notifications.telegram import send
        ok = await send(
            "🟢 *THE GRID · Test signal-line OK*\n"
            "Telegram bot is now wired into the v1.3.6 weapon. "
            "You will receive `Sistem Kar Üretti: +X USDT` every 0.1 USDT."
        )
        return {"sent": ok}

    @router.get("/admin/console/snapshot")
    async def admin_console_snapshot(user=Depends(require_admin), limit: int = 100):
        """Latest N events from the in-memory operator console bus."""
        from notifications import console_bus
        return {"events": console_bus.snapshot(min(max(int(limit), 1), 500))}

    return router
