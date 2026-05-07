"""
Pool router — Binance Pool / RVN stratum proxy status.

Two endpoints:
- GET  /api/admin/pool/status   → admin-only, full proxy state (still NEVER returns the password)
- GET  /api/pool/health         → public, minimal honest connection state for the Landing badge.
                                  Exposes ONLY: configured/enabled/connected/message/account_masked
                                  (no full account, no URL — just enough to prove the link is real).

This is the first router extracted from server.py as part of the v1.2.4 modularization.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from pool_proxy import get_status as pool_get_status


def _mask_account(acct: str | None) -> str | None:
    if not acct:
        return None
    if len(acct) <= 4:
        return "•" * len(acct)
    return f"{acct[:2]}{'•' * (len(acct) - 4)}{acct[-2:]}"


def _build_message(s: dict) -> str:
    if not s["configured"]:
        return "Pool not configured · set RVN_STRATUM_URL + RVN_POOL_ACCOUNT in backend env"
    if not s["enabled"]:
        return "Pool disabled · set ENABLE_REAL_POOL=true in backend env"
    if not s["connected"]:
        return f"Disconnected · last error: {s.get('last_error') or 'reconnecting'}"
    return f"Connected · {s['workers_registered']} worker{'s' if s['workers_registered'] != 1 else ''} registered"


def build_router(require_admin) -> APIRouter:
    """
    Factory so we can inject the admin dependency without circular import.
    server.py imports this and calls build_router(require_admin).
    """
    router = APIRouter(prefix="/api", tags=["pool"])

    @router.get("/admin/pool/status")
    async def admin_pool_status(user: dict = Depends(require_admin)):
        """
        Live Binance-Pool stratum status. Honest contract:
          - configured=false  → credentials missing in env. UI shows "Pool not configured".
          - enabled=false     → ENABLE_REAL_POOL is false (operator opt-out).
          - connected/subscribed/authorized are real socket-level booleans.
          - accepted_shares / rejected_shares / last_share_at reflect upstream ACKs.
          - stratum_url is REDACTED (no userinfo, no query string) — see pool_proxy._redact_stratum_url.
          - The pool password is NEVER included in this response.
        """
        s = pool_get_status()
        s["message"] = _build_message(s)
        return s

    @router.get("/pool/health")
    async def public_pool_health():
        """
        Minimal public honest connection state — designed for the landing-page
        "Live Pool Connection" badge. No auth, no leaks.
        Returns ONLY:
          - configured (bool)
          - enabled    (bool)
          - connected  (bool)
          - workers_registered (int) — global counter, not per-account
          - account_masked (string|None) — first2…last2 only, e.g. "11•••••10"
          - message    (humane string)
          - as_of      (server-side timestamp would require datetime, omitted to keep this leaf-only)
        Explicitly does NOT return: stratum_url, full pool_account, last_error, share counters,
        connected_at, attempts, handshake state.
        """
        s = pool_get_status()
        return {
            "configured": s["configured"],
            "enabled": s["enabled"],
            "connected": s["connected"],
            "workers_registered": s["workers_registered"],
            "account_masked": _mask_account(s.get("pool_account")),
            "message": _build_message(s),
        }

    return router
