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

from pool_proxy import get_status as pool_get_status


def _build_admin_message(s: dict) -> str:
    if not s["configured"]:
        return "Pool not configured · set RVN_STRATUM_URL + RVN_POOL_ACCOUNT in backend env"
    if not s["enabled"]:
        return "Pool disabled · set ENABLE_REAL_POOL=true in backend env"
    if s["all_armed"]:
        return f"LIVE · ALL CLASSES ARMED ({s['armed_count']}/{s['total_classes']}) · NATIVE PoW PENDING"
    if s["armed_count"] > 0:
        return f"LIVE · {s['armed_count']}/{s['total_classes']} ARMED · NATIVE PoW PENDING"
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
        # Surface PoW pending banner data prominently for the admin UI:
        s["pow_status_note"] = (
            "Workers registered ✓ · Accepted shares = 0 until native KawPow / Scrypt / "
            "Etchash / Ethash / X11 / Equihash / Octopus / Eaglesong / kHeavyHash PoW "
            "ships on the Android worker (P2 backlog). Connection layer is real."
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

    return router
