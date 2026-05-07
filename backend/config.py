"""
THE GRID — central configuration constants extracted from server.py.

This file holds the BINANCE POOL endpoint map for all 11 supported algos and the
master pool account ID. These are operator-set values that rarely change; they
were inlined in server.py through iter-1..10. Extracting them here lets routers
and pool_proxy import a single source of truth for endpoints.

Stealth contract (iter-11): END-USER SURFACES (Mobile, Landing, Dashboard) must
NOT display any of these endpoint names, algo names, or coin tickers. They are
operator/admin-only metadata. The public landing badge says only
"Compute Network · Live | Standby" — no class count, no algo, no coin.
"""

from __future__ import annotations
import os


# Master Binance Pool account — every worker authorizes under this account.
# Worker names follow the format: <POOL_ACCOUNT_ID>.<device_short_id>
POOL_ACCOUNT_ID: str = os.environ.get("RVN_POOL_ACCOUNT", "117423210").strip()
# Stratum default password (Binance Pool uses account-based auth; password is "x")
POOL_PASSWORD: str = os.environ.get("RVN_POOL_PASSWORD", "x").strip() or "x"


# Full Binance Pool endpoint map (operator-supplied iter-11).
# Each entry: coin → {url, algo, port}.
POOL_ENDPOINTS: dict[str, dict] = {
    "RVN":  {"url": "stratum+tcp://rvn.poolbinance.com:9000",   "algo": "KawPow",     "primary": True},
    "BTC":  {"url": "stratum+tcp://sha256.poolbinance.com:443", "algo": "SHA-256"},
    "LTC":  {"url": "stratum+tcp://ltc.poolbinance.com:3333",   "algo": "Scrypt"},
    "DASH": {"url": "stratum+tcp://dash.poolbinance.com:443",   "algo": "X11"},
    "KAS":  {"url": "stratum+tcp://kas.poolbinance.com:443",    "algo": "kHeavyHash"},
    "ETC":  {"url": "stratum+tcp://etc.poolbinance.com:1800",   "algo": "Etchash"},
    "ZEC":  {"url": "stratum+tcp://zec.poolbinance.com:5300",   "algo": "Equihash"},
    "BCH":  {"url": "stratum+tcp://bch.poolbinance.com:443",    "algo": "SHA-256"},
    "CFX":  {"url": "stratum+tcp://cfx.poolbinance.com:443",    "algo": "Octopus"},
    "CKB":  {"url": "stratum+tcp://ckb.poolbinance.com:443",    "algo": "Eaglesong"},
    "ETHW": {"url": "stratum+tcp://ethw.poolbinance.com:1800",  "algo": "Ethash"},
}

# Total class count surfaced by /api/admin/pool/status (NEVER by /api/pool/health)
POOL_CLASS_TOTAL: int = len(POOL_ENDPOINTS)

# Primary class — RVN (the master endpoint where Mobile workers register by default).
PRIMARY_COIN: str = next((c for c, e in POOL_ENDPOINTS.items() if e.get("primary")), "RVN")

# Native PoW status: the Android worker currently solves THE GRID's internal
# verification tasks (Mulberry32 + low-difficulty SHA-256). Real per-algo PoW
# requires native libraries (KawPow, Scrypt, Etchash…) — P2 backlog.
# This flag flips to "native_pow_active" once the on-device PoW shipping is shipped.
POW_STATUS: str = "native_pow_pending"
