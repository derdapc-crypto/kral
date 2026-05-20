from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import secrets
import hashlib
import asyncio
import time
import logging
import random
_sysrand = random.SystemRandom()  # cryptographically secure picks/choices
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from pool_proxy import (
    CONNECTOR as POOL_CONNECTOR,
    STATUS as POOL_STATUS,
    get_status as pool_get_status,
    is_enabled as pool_is_enabled,
    register_device as pool_register_device,
    RVN_WORKER_PREFIX,
)


# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@thegrid.io')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# Earnings model: $ per compute-second (TRC20 USDT equivalent)
USDT_PER_COMPUTE_SEC = 0.0005  # tiny but real per-task
WITHDRAW_THRESHOLD = 5.0
OFFLINE_CUTOFF_SEC = 90  # device considered offline if last_heartbeat older than this

# ---------- THE GRID PRESTIGE ECONOMY (TGC - TheGrid Coin) ----------
# v1.4.9 economy: 1000 TGC = $10 USDT (1 TGC = $0.01)
USDT_PER_TGC = 0.01
TGC_PER_USDT = 100.0
WITHDRAW_THRESHOLD_TGC = 1000.0          # 1000 TGC = $10 USDT payout threshold
SECONDS_PER_DAY = 86_400
POWER_UP_WINDOW_HOURS = 24
ADMIN_PROFIT_FLOOR = 0.30               # admin's 30% margin floor (untouchable)
ADMIN_BINANCE_ID = "117423210"
# 7:5 arbitrage rule — every $7 real-mined to admin = 100 TGC ($5) credited to user
ADMIN_ARBITRAGE_REAL_USDT = 7.0
ADMIN_ARBITRAGE_USER_USDT = 5.0
# v1.4.10 network economy: device-class daily TGC targets (soft, not hard caps).
# Monthly forecast = daily × 30 × network_multiplier(N).  See network_multiplier().
# Per-tier daily TGC budget (v1.5.2 — Scarcity-First Token Economics).
# We deliberately keep the daily output VERY LOW to enforce token scarcity.
# A user mining for a full year accumulates only ~110 TGC, ensuring that
# at mainnet launch the circulating supply is small (~50-200M total TGC)
# and each token has meaningful value. Compare with Pi Network (1.0+/hr,
# ~10B+ tokens) — our fixed-supply rarity model targets >100x token value.
TIER_DAILY_TGC = {"core": 0.30, "flagship": 0.20, "mid": 0.15, "budget": 0.05}
# Pre-mainnet TGC has NO USDT redemption price.
TGC_REDEMPTION_LOCKED = True
TGC_LAUNCH_LABEL = "TGC Mainnet · Token Launch Q3 2027"
# Mode multipliers applied on top of base drip during ledger crediting.
# v1.5.2 — ECO mode kaldırıldı, drip multipliers normalize. Eski "eco" değeri
# gelirse 1.0x (FULL ile aynı) uygulanır → kullanıcı algısında her ENGAGE = full power.
MODE_MULTIPLIER = {"eco": 1.0, "full": 1.0, "engaged_eco": 1.0, "engaged_full": 1.0,
                    "paused_power": 0.0, "paused_battery": 0.0, "paused_thermal": 0.0,
                    "idle": 0.0, "engaged_standby": 0.3}

def network_multiplier(active_nodes: int) -> float:
    """
    v1.4.10 NETWORK EFFECT BONUS — single phone earns more as the network grows.

    Tier-stepped logarithmic-ish multiplier. Communicates clearly on landing
    page: a flagship phone earns ~$3/mo solo, ~$5/mo with 100 nodes, ~$8/mo
    with 1k, ~$17/mo with 10k. Sustainable because real XMR revenue scales
    with N too — bonus is just sharing back a larger slice of a larger pie.
    """
    n = int(active_nodes or 0)
    if n >= 50_000: return 8.0     # mega-network "founding nodes" bonus
    if n >= 10_000: return 5.5
    if n >= 5_000:  return 4.0
    if n >= 1_000:  return 2.5
    if n >= 500:    return 2.0
    if n >= 100:    return 1.5
    if n >= 50:     return 1.3
    if n >= 10:     return 1.1
    return 1.0


async def _active_network_size() -> int:
    """Currently-engaged real APK phones (fresh heartbeat, opted-in)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
    try:
        return await db.devices.count_documents({
            "last_heartbeat": {"$gte": cutoff},
            "$or": [{"node_engaged": True}, {"mining_requested": True}],
        })
    except Exception:
        return 0

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="THE GRID API")
# v1.6.3 build fingerprint — 2026-02-19T23:30Z — force orchestrator to allocate
# a fresh deployment job slot (avoids stuck deploy phase from previous d84vgu3).


# v1.6.3 — Kubernetes/Emergent health probes (must respond <1s, no DB calls)
@app.get("/")
async def _root_probe():
    return {"ok": True, "service": "the.grid", "status": "up"}


@app.get("/api/")
async def _api_root_probe():
    return {"ok": True, "service": "the.grid.api", "status": "up"}


@app.get("/api/health")
async def _api_health():
    return {"status": "healthy"}

api = APIRouter(prefix="/api")
logger = logging.getLogger("grid")
logging.basicConfig(level=logging.INFO)


# ---------- Password + JWT ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24 * 7, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # v1.6.0 — banned accounts are blocked at every protected endpoint
        if user.get("is_banned"):
            raise HTTPException(status_code=403, detail="Account suspended. Contact operations@thegrid.io.")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Optional[str] = "user"  # 'user' (worker) | 'customer' (enterprise)
    company: Optional[str] = None
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class DeviceRegisterIn(BaseModel):
    name: str
    model: str  # 'flagship' | 'mid' | 'budget'
    platform: str = "web"
    fingerprint: Optional[str] = None
    brand: Optional[str] = "Apple"
    os_version: Optional[str] = "iOS 17.4"
    # Native client extras (Android worker v1.2+)
    manufacturer: Optional[str] = None
    android_version: Optional[str] = None
    app_version: Optional[str] = None
    device_id: Optional[str] = None  # client-generated stable device id
    is_emulator: Optional[bool] = False
    client_type: Optional[str] = None  # v1.7.5 — "light" | "node_pro" | None


class HeartbeatIn(BaseModel):
    device_id: str
    charging: bool
    wifi: bool
    permission: bool
    battery: int = 100
    thermal: Optional[str] = "nominal"
    brand: Optional[str] = None
    os_version: Optional[str] = None
    hashrate: Optional[float] = None
    algo: Optional[str] = None
    country: Optional[str] = None  # ISO-3166 alpha-2
    lat: Optional[float] = None
    lng: Optional[float] = None
    current_mode: Optional[str] = None  # 'enterprise_job' | 'baseline_compute' | 'idle'
    # Native worker extras
    worker_state: Optional[str] = None  # 'idle' | 'active' | 'paused' | 'stopped'
    foreground: Optional[bool] = None
    temperature_c: Optional[float] = None  # Celsius
    app_version: Optional[str] = None
    session_tasks: Optional[int] = None
    session_tgc: Optional[float] = None
    # iter-12 / v1.2.6 — direct device-side stratum link to Binance Pool
    # True iff the device opened a TCP socket to rvn.poolbinance.com:9000 AND
    # its mining.authorize succeeded — this is what makes the worker appear
    # in the Binance worker list. Surfaced to admin Device Health as LINKED badge.
    stratum_linked: Optional[bool] = None
    # iter-23 / v1.3.7 — native RandomX mobile mining telemetry.
    # `native_pow=True` ONLY when librandomx.so loaded AND JNI bridge running.
    # `mining_status` ∈ {connected_only, stopped, warming, throttled, running}.
    # `local_hashrate_hps` is the device-local RandomX hashrate (0 unless running).
    # accepted/rejected_shares are local pool-submission counters; both stay 0
    # until the v1.3.8 stratum integration ships — that is honest by design.
    native_pow: Optional[bool] = None
    mining_status: Optional[str] = None
    local_hashrate_hps: Optional[float] = None
    accepted_shares: Optional[int] = None
    rejected_shares: Optional[int] = None
    battery_percent: Optional[int] = None
    charging_only: Optional[bool] = None        # safety guard preference
    wifi_only: Optional[bool] = None             # safety guard preference
    network_type: Optional[str] = None           # 'wifi' | 'cellular' | 'ethernet' | 'unknown'
    native_lib_loaded: Optional[bool] = None
    mining_requested: Optional[bool] = None
    # iter-24 / v1.3.8 — anti-spoof v2 hooks.
    # `native_lib_sha256`: phone reports the SHA-256 of its bundled
    # librandomx.so. Server compares against LIBRANDOMX_KNOWN_SHA256 env
    # whitelist; mismatch → mining_status forced to 'unverified' and
    # contribution to mobile metrics is dropped.
    # `mobile_submitted_shares`: monotonic counter from JNI bridge.
    native_lib_sha256: Optional[str] = None
    mobile_submitted_shares: Optional[int] = None
    # iter-30 / v1.4.8 — Compute Node state machine telemetry.
    # `node_state` ∈ {idle, engaged_full, engaged_eco, paused_power,
    #                 paused_battery, paused_thermal, engine_unavailable}.
    # `eco_mode` True when engine is running on battery at 50% threads.
    # `allow_on_battery` reflects the operator toggle (default True).
    # `node_engaged` is the explicit single-tap ENGAGE NODE flag.
    node_state: Optional[str] = None
    eco_mode: Optional[bool] = None
    allow_on_battery: Optional[bool] = None
    node_engaged: Optional[bool] = None
    active_threads: Optional[int] = None


class TaskSubmitIn(BaseModel):
    task_id: str
    device_id: str
    result: str  # hex string or numeric signature
    compute_ms: int


class WithdrawIn(BaseModel):
    address: str = Field(min_length=10)


class JobCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    file_name: str
    file_size: int = Field(ge=0)
    description: Optional[str] = ""
    total_units: int = Field(ge=1, le=10000)
    budget_usdt: float = Field(gt=0, le=1_000_000)
    max_nodes: int = Field(ge=1, le=10000)
    workload_type: str = "federated_learning"
    priority: Optional[str] = "standard"  # 'economy' | 'standard' | 'instant'


# ---------- Constants ----------
PRIORITY_MULT = {"economy": 0.7, "standard": 1.0, "instant": 2.5}
APK_VERSION = "1.6.5"
APK_PATH = "/grid-worker-v1.6.5.apk"
APK_RELEASE_NOTES = "v1.6.5 RUNTIME-CONFIGURABLE BACKEND · APK ilk açılışta veya 'SUNUCU AYARI' butonuyla istediğin backend URL'sine bağlanır · Wi-Fi ZORUNLU DEĞİL (mobil veride de çalışır) · Admin Mining Config sekmesinden tüm fleet'i canlı yönet · v2+v3 signed"


def _compute_apk_meta() -> dict:
    """
    Reads the published APK off disk so /api/apk/version always returns truthful
    size + sha256 + native-lib presence. Keeps the metadata honest across
    rebuilds (no more stale hardcoded constants).
    """
    import hashlib, zipfile
    apk_fs = os.path.join("/app/frontend/public", APK_PATH.lstrip("/"))
    meta = {"size_bytes": 0, "sha256": "", "native_lib_embedded": False,
            "native_lib_sha256": "", "native_lib_size": 0}
    try:
        with open(apk_fs, "rb") as f:
            data = f.read()
        meta["size_bytes"] = len(data)
        meta["sha256"] = hashlib.sha256(data).hexdigest()
        # Inspect the embedded librandomx.so so investors can independently
        # verify the native engine is bundled (constitutional guard for v1.3.8).
        with zipfile.ZipFile(apk_fs) as z:
            names = z.namelist()
            for cand in ("lib/arm64-v8a/librandomx.so", "lib/armeabi-v7a/librandomx.so"):
                if cand in names:
                    so = z.read(cand)
                    meta["native_lib_embedded"] = True
                    meta["native_lib_sha256"] = hashlib.sha256(so).hexdigest()
                    meta["native_lib_size"] = len(so)
                    break
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return meta


APK_META = _compute_apk_meta()
APK_SIZE = APK_META["size_bytes"]
APK_SHA256 = APK_META["sha256"]
APK_NATIVE_EMBEDDED = APK_META["native_lib_embedded"]
APK_NATIVE_SHA256 = APK_META["native_lib_sha256"]
APK_NATIVE_SIZE = APK_META["native_lib_size"]
REFERRAL_RATE = 0.10
LOGIN_LOCK_THRESHOLD = 5
LOGIN_LOCK_MINUTES = 15

# ---------- Mining Profiles (Binance Pool) ----------
# Base per-device-hashrate in H/s (before tier multiplier). These are SIMULATED values
# representing what a mid-tier mobile device could report; a real native APK would
# replace these with measured rates from on-device implementations.
MINING_PROFILES = {
    "BTC": {"coin": "BTC", "name": "Bitcoin", "algo": "SHA-256",
            "stratum_url": "stratum+tcp://bs.binance.com:8888", "port": 8888,
            "base_hashrate_hps": 1_000_000, "reward_per_hps_usdt_day": 2.5e-12,
            "symbol_per_hps_day": 2.5e-17,  # BTC per H/s per day
            "unit": "MH/s", "unit_div": 1_000_000},
    "BCH": {"coin": "BCH", "name": "Bitcoin Cash", "algo": "SHA-256",
            "stratum_url": "stratum+tcp://bch.poolbinance.com:1800", "port": 1800,
            "base_hashrate_hps": 1_000_000, "reward_per_hps_usdt_day": 2.0e-12,
            "symbol_per_hps_day": 4.5e-15, "unit": "MH/s", "unit_div": 1_000_000},
    "LTC": {"coin": "LTC", "name": "Litecoin", "algo": "Scrypt",
            "stratum_url": "stratum+tcp://ltc.poolbinance.com:3333", "port": 3333,
            "base_hashrate_hps": 200_000, "reward_per_hps_usdt_day": 1.0e-9,
            "symbol_per_hps_day": 9.5e-12, "unit": "KH/s", "unit_div": 1_000},
    "ZEC": {"coin": "ZEC", "name": "Zcash", "algo": "Equihash",
            "stratum_url": "stratum+tcp://zec.poolbinance.com:5300", "port": 5300,
            "base_hashrate_hps": 50, "reward_per_hps_usdt_day": 4.0e-6,
            "symbol_per_hps_day": 1.2e-7, "unit": "Sol/s", "unit_div": 1},
    "ETC": {"coin": "ETC", "name": "Ethereum Classic", "algo": "Etchash",
            "stratum_url": "stratum+tcp://etc.poolbinance.com:1800", "port": 1800,
            "base_hashrate_hps": 3_000_000, "reward_per_hps_usdt_day": 5.0e-10,
            "symbol_per_hps_day": 2.1e-11, "unit": "MH/s", "unit_div": 1_000_000},
    "RVN": {"coin": "RVN", "name": "Ravencoin", "algo": "KawPow",
            "stratum_url": "stratum+tcp://rvn.poolbinance.com:9000", "port": 9000,
            "base_hashrate_hps": 1_000_000, "reward_per_hps_usdt_day": 3.0e-10,
            "symbol_per_hps_day": 1.5e-8, "unit": "MH/s", "unit_div": 1_000_000},
    "DASH": {"coin": "DASH", "name": "Dash", "algo": "X11",
             "stratum_url": "stratum+tcp://dash.poolbinance.com:443", "port": 443,
             "base_hashrate_hps": 500_000, "reward_per_hps_usdt_day": 8.0e-10,
             "symbol_per_hps_day": 2.8e-11, "unit": "KH/s", "unit_div": 1_000},
    "KAS": {"coin": "KAS", "name": "Kaspa", "algo": "kHeavyHash",
            "stratum_url": "stratum+tcp://kas.poolbinance.com:443", "port": 443,
            "base_hashrate_hps": 50_000_000, "reward_per_hps_usdt_day": 2.0e-11,
            "symbol_per_hps_day": 8.5e-10, "unit": "MH/s", "unit_div": 1_000_000},
}
MINING_MASTER_ID = "117423210"
DEFAULT_MINING_COIN = "BTC"


# ---------- Task generation ----------
MODEL_MULT = {"flagship": 3.0, "mid": 1.8, "budget": 1.0}


def _mulberry32(seed: int):
    """Same PRNG as the browser client so expected == actual."""
    state = [seed & 0xFFFFFFFF]
    def next_float():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return next_float


def _matrix_signature(seed: int, size: int) -> str:
    """Deterministic matrix signature matching the browser implementation exactly."""
    rng = _mulberry32(seed)
    n = size * size
    a = [int(rng() * 10) for _ in range(n)]
    b = [int(rng() * 10) for _ in range(n)]
    total = 0
    trace = 0
    for i in range(size):
        for j in range(size):
            s = 0
            row = i * size
            for k in range(size):
                s += a[row + k] * b[k * size + j]
            total += s
            if i == j:
                trace += s
    return f"{total}:{trace}"


def _hash_signature(nonce: str, difficulty: int) -> str:
    """Find a hash starting with `difficulty` leading hex zeros (kept small)."""
    i = 0
    while True:
        h = hashlib.sha256(f"{nonce}:{i}".encode()).hexdigest()
        if h.startswith("0" * difficulty):
            return f"{i}:{h}"
        i += 1
        if i > 2_000_000:
            return f"{i}:{h}"


def generate_task(force_kind: Optional[str] = None) -> dict:
    """Create a task with verifiable expected result. Roughly 100-400ms on browser."""
    kind = force_kind if force_kind in ("matrix", "hash") else _sysrand.choice(["matrix", "hash"])
    if kind == "matrix":
        seed = _sysrand.randint(1, 10_000_000)
        size = _sysrand.choice([16, 20, 24])
        expected = _matrix_signature(seed, size)
        payload = {"kind": "matrix", "seed": seed, "size": size}
        flops = size ** 3 * 2
    else:
        nonce = secrets.token_hex(8)
        difficulty = 4  # ~65k hashes
        expected = _hash_signature(nonce, difficulty)
        payload = {"kind": "hash", "nonce": nonce, "difficulty": difficulty}
        flops = 65000 * 64  # approximate SHA ops
    return {
        "id": str(uuid.uuid4()),
        "payload": payload,
        "expected": expected,
        "flops": flops,
        "kind": kind,
    }


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # v1.6.3 — index creation wrapped: in production (Atlas) these can be slow
    # or fail mid-flight; never let it crash the container.  All create_index
    # ops are idempotent so retries on next boot are safe.
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.devices.create_index("id", unique=True)
        await db.devices.create_index("user_id")
        await db.tasks.create_index("id", unique=True)
        await db.tasks.create_index("status")
        await db.tasks.create_index("device_id")
        await db.jobs.create_index("id", unique=True)
        await db.jobs.create_index("customer_id")
        await db.jobs.create_index("status")
        # v1.6.2 — daily calibration idempotency
        await db.daily_calibrations.create_index(
            [("user_id", 1), ("date_key", 1)], unique=True,
        )
        await db.daily_calibrations.create_index("created_at")
        await db.tgc_ledger.create_index("kind")
        await db.tgc_ledger.create_index("user_id")
    except Exception as e:
        logger.warning(f"index creation partial-failure (non-fatal): {e}")

    # Start the Binance-Pool multi-class stratum proxy (no-op if not configured / disabled)
    from pool_proxy import start as pool_start, MULTI as pool_multi

    async def _hashrate_provider():
        """Aggregates currently-LINKED real Android workers' hashrate.
        Returns {device_short_id: hashrate_hps}. Cap at 64 workers per tick.
        """
        try:
            cutoff_iso = (datetime.now(timezone.utc) - timedelta(seconds=OFFLINE_CUTOFF_SEC)).isoformat()
            cur = db.devices.find(
                {"stratum_linked": True, "is_real_apk": True, "last_heartbeat": {"$gte": cutoff_iso}},
                {"_id": 0, "id": 1, "hashrate_hps": 1}
            ).limit(64)
            out = {}
            async for d in cur:
                short = (d.get("id") or "")[:8]
                hr = float(d.get("hashrate_hps") or 0)
                if short and hr > 0:
                    out[short] = hr
            return out
        except Exception:
            return {}

    pool_multi.set_hashrate_provider(_hashrate_provider)
    # v1.6.3 — start pool proxy in background to keep startup <5s for health probes
    try:
        pool_start()
    except Exception as e:
        logger.warning(f"pool_start failed (non-fatal, deploy continues): {e}")

    # iter-18 / v1.3.3: periodic Unmineable balance snapshot loop.
    # Stores {at, balance, balance_payable, paid} in pool_history every 60s
    # so the admin Live Revenue Chart has real on-chain history instead of
    # only the live "now" reading.
    async def _pool_snapshot_loop():
        import httpx
        from config import RVN_PAYOUT_ADDRESS, UNMINEABLE_PAYOUT_COIN
        last_balance: float | None = None
        last_paid: float = 0.0
        while True:
            try:
                if RVN_PAYOUT_ADDRESS:
                    url = f"https://api.unmineable.com/v4/address/{RVN_PAYOUT_ADDRESS}?coin={UNMINEABLE_PAYOUT_COIN}"
                    async with httpx.AsyncClient(timeout=8.0) as c:
                        r = await c.get(url)
                        if r.status_code == 200:
                            d = (r.json() or {}).get("data") or {}
                            doc = {
                                "at": datetime.now(timezone.utc).isoformat(),
                                "balance": float(d.get("balance") or 0),
                                "balance_payable": float(d.get("balance_payable") or 0),
                                "paid": float(d.get("paid") or 0),
                                "coin": UNMINEABLE_PAYOUT_COIN,
                            }
                            await db.pool_history.insert_one(doc)
                            # Cap history at 1000 rows by trimming oldest.
                            cnt = await db.pool_history.count_documents({})
                            if cnt > 1000:
                                excess = cnt - 1000
                                old_ids = await db.pool_history.find({}, {"_id": 1}) \
                                    .sort("at", 1).limit(excess).to_list(excess)
                                if old_ids:
                                    await db.pool_history.delete_many(
                                        {"_id": {"$in": [r["_id"] for r in old_ids]}})

                            # iter-20 / v1.3.5: Telegram step notifier.
                            curr = doc["balance"] + doc["paid"]
                            if last_balance is not None:
                                try:
                                    from notifications.telegram import notify_balance_step, send
                                    fired = await notify_balance_step(last_balance, curr,
                                                                      coin=UNMINEABLE_PAYOUT_COIN)
                                    if fired is not None:
                                        try:
                                            from notifications import console_bus
                                            console_bus.emit("system", "share",
                                                f"USDT milestone {fired:.4f} reached · telegram fired")
                                        except Exception:
                                            pass
                                    # iter-21 / v1.3.6: First-ever paid > 0 → grand op
                                    if doc["paid"] > 0 and last_paid <= 0:
                                        await send(
                                            "🟢 *Büyük Operasyon Tamamlandı*\n"
                                            f"İlk on-chain ödeme alındı: `{doc['paid']:.6f} {UNMINEABLE_PAYOUT_COIN}`\n"
                                            f"Adres: `0xea625c7b…6869`\n"
                                            "Artık operatif kazanç akışı **canlı**."
                                        )
                                        try:
                                            from notifications import console_bus
                                            console_bus.emit("system", "share",
                                                f"BÜYÜK OP · ilk on-chain ödeme {doc['paid']:.6f} {UNMINEABLE_PAYOUT_COIN}")
                                        except Exception:
                                            pass
                                except Exception:
                                    pass
                            last_balance = curr
                            last_paid = doc["paid"]
            except Exception:
                pass
            await asyncio.sleep(60)
    asyncio.create_task(_pool_snapshot_loop())
    # v1.5.1 — auto-run Monthly Contributor Drops when their draw_date passes.
    asyncio.create_task(_auto_draw_loop())
    # iter-21 / v1.3.6: Live Operator Console event bus.
    try:
        from notifications import console_bus
        console_bus.attach_loop(asyncio.get_running_loop())
        console_bus.emit("system", "info", "the.grid command center online · operator armed")
    except Exception as e:
        logger.warning(f"console bus init failed: {e}")

    # v1.6.3 — heavy/blocking startup tasks moved into a fire-and-forget
    # bootstrap task so the FastAPI startup hook returns in <2s.  This is
    # essential for Kubernetes/Emergent health probes (LivenessProbe
    # initialDelaySeconds=10, ReadinessProbe initialDelaySeconds=5).  Any
    # exception inside _deferred_bootstrap is logged but never crashes the
    # container.
    async def _deferred_bootstrap():
        # iter-19 / v1.3.4: Plan B Backend Miner (sha256 → unmineable.com).
        # v1.5.5 — disabled by default, only fired when ENABLE_BACKEND_MINER=true.
        if os.environ.get("ENABLE_BACKEND_MINER", "false").lower() in ("1", "true", "yes"):
            try:
                from miner.sha256_miner import start_in_background as _miner_start
                _miner_start()
                logger.info("Plan B backend miner started (sha256 stratum -> Unmineable)")
            except Exception as e:
                logger.warning(f"Plan B backend miner failed to start: {e}")

        # iter-20 / v1.3.5: Plan A RandomX Miner (xmrig wrapper).
        if os.environ.get("ENABLE_RANDOMX_MINER", "true").lower() in ("1", "true", "yes"):
            try:
                # Kill any stray xmrig instances from a prior uvicorn reload.
                try:
                    import subprocess as _sp
                    _sp.run(["pkill", "-9", "-f", "/app/backend/miner/xmrig"],
                            timeout=5, check=False)
                except Exception:
                    pass
                from miner.randomx_miner import start_in_background as _rx_start
                _rx_start()
                logger.info("Plan A RandomX miner started (xmrig -> SupportXMR rx/0)")
            except Exception as e:
                logger.warning(f"Plan A RandomX miner failed to start: {e}")

        # iter-20 / v1.3.5: demo purge — wipe is_demo=true rows.
        try:
            d_dev = await db.devices.delete_many({"is_demo": True})
            d_job = await db.jobs.delete_many({"is_demo": True})
            d_pay = await db.payouts.delete_many({"is_demo": True})
            if d_dev.deleted_count or d_job.deleted_count or d_pay.deleted_count:
                logger.info(
                    f"Demo purge on boot: devices={d_dev.deleted_count} "
                    f"jobs={d_job.deleted_count} payouts={d_pay.deleted_count}"
                )
        except Exception as e:
            logger.warning(f"Demo purge failed: {e}")

        # Admin seed (idempotent).
        try:
            existing = await db.users.find_one({"email": ADMIN_EMAIL})
            if not existing:
                uid = str(uuid.uuid4())
                await db.users.insert_one({
                    "id": uid,
                    "email": ADMIN_EMAIL,
                    "password_hash": hash_password(ADMIN_PASSWORD),
                    "name": "Grid Admin",
                    "role": "admin",
                    "balance_usdt": 0.0,
                    "total_earned": 0.0,
                    "tgc_balance": 0.0,
                    "tgc_total_earned": 0.0,
                    "power_up_at": None,
                    "device_tier": "mid",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Seeded admin: {ADMIN_EMAIL}")
            else:
                if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
                    await db.users.update_one(
                        {"email": ADMIN_EMAIL},
                        {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin"}},
                    )
        except Exception as e:
            logger.warning(f"Admin seed failed (non-fatal): {e}")

    asyncio.create_task(_deferred_bootstrap())


# ---------- Auth Endpoints ----------
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    role = data.role if data.role in ("user", "customer") else "user"

    # Resolve referral
    referred_by = None
    if data.referral_code:
        ref_user = await db.users.find_one({"referral_code": data.referral_code.upper()}, {"_id": 0, "id": 1})
        if ref_user:
            referred_by = ref_user["id"]

    uid = str(uuid.uuid4())
    referral_code = secrets.token_hex(4).upper()
    api_key = "grid_" + secrets.token_urlsafe(28) if role == "customer" else None
    doc = {
        "id": uid,
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "company": data.company or "",
        "role": role,
        "balance_usdt": 0.0,
        "total_earned": 0.0,
        "tgc_balance": 0.0,
        "tgc_total_earned": 0.0,
        "power_up_at": None,
        "device_tier": "mid",
        "referral_earnings": 0.0,
        "referral_code": referral_code,
        "referred_by": referred_by,
        "api_key": api_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(uid, email, role)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": data.name, "role": role,
            "company": doc["company"], "referral_code": referral_code,
            "balance_usdt": 0.0, "total_earned": 0.0, "token": access,
            "api_key": api_key}


@api.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.lower()
    # Use X-Forwarded-For (kubernetes ingress) to identify real client; fall back to peer IP
    ip = _client_ip(request)
    identifier = f"{ip}:{email}"

    # Brute-force lockout
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt and attempt.get("count", 0) >= LOGIN_LOCK_THRESHOLD:
        locked_until = datetime.fromisoformat(attempt["locked_until"])
        if datetime.now(timezone.utc) < locked_until:
            raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again after {locked_until.strftime('%H:%M:%S UTC')}")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        # Record failed attempt
        new_count = (attempt.get("count", 0) if attempt else 0) + 1
        locked_until = (datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCK_MINUTES)).isoformat() if new_count >= LOGIN_LOCK_THRESHOLD else None
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"count": new_count, "locked_until": locked_until or "",
                      "last_attempt": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        if new_count >= LOGIN_LOCK_THRESHOLD:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Account locked for 15 minutes.")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # v1.6.0 — banned accounts cannot log in
    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail="Account suspended. Contact operations@thegrid.io to reinstate access.")

    # Success: clear attempts
    await db.login_attempts.delete_one({"identifier": identifier})
    access = create_access_token(user["id"], email, user.get("role", "user"))
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {
        "id": user["id"], "email": email, "name": user["name"],
        "role": user.get("role", "user"),
        "balance_usdt": user.get("balance_usdt", 0.0),
        "total_earned": user.get("total_earned", 0.0),
        "referral_code": user.get("referral_code"),
        "api_key": user.get("api_key"),
        "token": access,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(response: Response, request: Request, user: dict = Depends(get_current_user)):
    """
    Returns the current user. Also issues a fresh `token` (and rolls the
    access_token cookie) so the frontend can keep `localStorage.grid_token`
    in sync with the cookie session. This prevents stale tokens from being
    sent to WebSocket endpoints (which were the root cause of 403 floods on
    /api/admin/console/ws).
    """
    fresh_access = create_access_token(user["id"], user["email"], user.get("role", "user"))
    response.set_cookie("access_token", fresh_access, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24, path="/")
    out = dict(user)
    out["token"] = fresh_access
    return out


@api.post("/auth/refresh")
async def auth_refresh(request: Request, response: Response):
    """
    Exchanges the long-lived refresh_token cookie for a brand-new access_token.
    Used by the frontend when localStorage.grid_token is missing or expired so
    that WebSocket auth (which only sees query-string tokens) keeps working.
    """
    rtok = request.cookies.get("refresh_token")
    if not rtok:
        # Fallback: header-based bearer for non-cookie clients
        auth = request.headers.get("X-Refresh-Token", "")
        if auth:
            rtok = auth
    if not rtok:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rtok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        uid = payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user.get("role", "user"))
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"token": access, "id": user["id"], "email": user["email"], "role": user.get("role", "user")}


# ---------- Device Endpoints ----------
@api.post("/devices/register")
async def register_device(data: DeviceRegisterIn, request: Request, user: dict = Depends(get_current_user)):
    if data.model not in MODEL_MULT:
        raise HTTPException(status_code=400, detail="Invalid model tier")
    # Native client may pass a stable device_id (e.g. ANDROID_ID hash). If one is supplied
    # AND already belongs to this user, return it idempotently.
    if data.device_id:
        existing = await db.devices.find_one({"id": data.device_id, "user_id": user["id"]}, {"_id": 0})
        if existing:
            return existing
        # If a different user owns it: refuse to bind (anti-abuse: duplicate device_id)
        cross = await db.devices.find_one({"id": data.device_id}, {"_id": 0, "user_id": 1})
        if cross and cross["user_id"] != user["id"]:
            raise HTTPException(status_code=409, detail="device_id already bound to another account")
    device_id = data.device_id or str(uuid.uuid4())
    ip = _client_ip(request)
    # Real Android APK clients explicitly send platform=android with device_id from the native shell.
    # Anything else is a browser-simulated demo node — flag it so admin views can hide it by default.
    is_real_apk = bool(data.app_version) and (data.platform == "android") and bool(data.device_id)
    is_demo = not is_real_apk
    doc = {
        "id": device_id,
        "user_id": user["id"],
        "name": data.name,
        "model": data.model,
        "platform": data.platform,
        "fingerprint": data.fingerprint or secrets.token_hex(8),
        "brand": data.brand or "Apple",
        "os_version": data.os_version or "iOS 17.4",
        "manufacturer": data.manufacturer,
        "android_version": data.android_version,
        "app_version": data.app_version,
        "is_emulator": bool(data.is_emulator),
        "is_real_apk": is_real_apk,
        "is_demo": is_demo,
        "thermal": "nominal",
        "status": "idle",
        "worker_state": "idle",
        "charging": False,
        "wifi": False,
        "permission": False,
        "battery": 100,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tasks_completed": 0,
        "total_flops": 0,
        "flagged": bool(data.is_emulator),  # auto-flag emulators
        "register_ip": ip,
        "session_tasks": 0,
        "session_tgc": 0.0,
        # v1.7.5 — client type telemetry
        "client_type": data.client_type or "unknown",
    }
    await db.devices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    rows = await db.devices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.get("/devices/me")
async def my_devices_summary(user: dict = Depends(get_current_user)):
    """Compact summary of the caller's devices + worker state — for the native APK."""
    rows = await db.devices.find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "name": 1, "model": 1, "status": 1, "worker_state": 1,
         "tasks_completed": 1, "session_tasks": 1, "session_tgc": 1,
         "last_heartbeat": 1, "flagged": 1, "app_version": 1, "thermal": 1},
    ).to_list(50)
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "tgc_total_earned": 1, "power_up_at": 1})
    return {
        "devices": rows,
        "tgc_balance": (u or {}).get("tgc_balance", 0.0),
        "tgc_total_earned": (u or {}).get("tgc_total_earned", 0.0),
        "powered_up": _is_powered_up((u or {}).get("power_up_at")),
    }


@api.post("/devices/heartbeat")
async def heartbeat(data: HeartbeatIn, request: Request, user: dict = Depends(get_current_user)):
    dev = await db.devices.find_one({"id": data.device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    # ---- Sliding-window fraud detection ----
    # Track timestamps of last N heartbeats; flag only if abnormal frequency persists
    # over a rolling 60-second window. Tolerates mobile network bursts/buffering.
    HB_WINDOW_SEC = 60
    HB_MAX_PER_WINDOW = 12       # cadence is 10–12s ⇒ ~6 hb/min normal; allow 2× margin
    HB_TRACK_LIMIT = 30          # cap stored timestamps
    raw_window = dev.get("hb_window") or []
    cutoff_dt = now_dt - timedelta(seconds=HB_WINDOW_SEC)
    fresh_window = []
    for ts in raw_window:
        try:
            t = datetime.fromisoformat(ts)
            if t.tzinfo is None: t = t.replace(tzinfo=timezone.utc)
            if t >= cutoff_dt:
                fresh_window.append(ts)
        except Exception:
            pass
    fresh_window.append(now_iso)
    # Persistence guard (only flag when burst seen in 2 consecutive windows)
    burst_now = len(fresh_window) > HB_MAX_PER_WINDOW
    prior_burst = bool(dev.get("hb_burst_pending"))
    suspicious_freq = burst_now and prior_burst
    fresh_window = fresh_window[-HB_TRACK_LIMIT:]
    # Golden Rule: only eligible when charging AND wifi AND permission AND temp ≤ 45°C
    over_temp = (data.temperature_c is not None and float(data.temperature_c) > 45.0)
    eligible = data.charging and data.wifi and data.permission and not over_temp
    # Worker state from client; status = active iff worker is not explicitly stopped/paused AND eligible.
    ws = data.worker_state if data.worker_state in ("idle", "active", "paused", "stopped") else dev.get("worker_state", "idle")
    is_running = ws not in ("stopped", "paused")
    status_val = "active" if (is_running and eligible) else "idle"
    update_doc = {
        "charging": data.charging,
        "wifi": data.wifi,
        "permission": data.permission,
        "battery": data.battery,
        "thermal": "hot" if over_temp else (data.thermal or "nominal"),
        "status": status_val,
        "worker_state": ws,
        "last_heartbeat": now_iso,
        "last_ip": _client_ip(request),
        "hb_window": fresh_window,
        "hb_burst_pending": burst_now,
    }
    if data.brand: update_doc["brand"] = data.brand
    if data.os_version: update_doc["os_version"] = data.os_version
    if data.app_version:
        update_doc["app_version"] = data.app_version
        # v1.4.9 fix: any v1.4.x device is a real native APK — auto-upgrade
        # is_real_apk so legacy WebView-registered devices (registered as
        # platform=mobile, is_real_apk=False) start showing up in the admin
        # Mobile Compute lane as soon as they heartbeat with the new client.
        if str(data.app_version).startswith("1.4.") and not dev.get("is_real_apk"):
            update_doc["is_real_apk"] = True
            update_doc["is_real_apk_upgraded_at"] = now_iso
    if data.foreground is not None: update_doc["foreground"] = bool(data.foreground)
    if data.temperature_c is not None: update_doc["temperature_c"] = float(data.temperature_c)
    if data.session_tasks is not None: update_doc["session_tasks"] = int(data.session_tasks)
    if data.session_tgc is not None: update_doc["session_tgc"] = float(data.session_tgc)
    # iter-23 / v1.3.7 — native mining telemetry.  `native_pow` is honored
    # ONLY if the device also reports `native_lib_loaded=True`; this prevents
    # any client-side spoofing of "I'm mining" without the .so actually
    # running. local_hashrate_hps is clamped to a sane mobile ceiling.
    if data.native_lib_loaded is not None:
        update_doc["native_lib_loaded"] = bool(data.native_lib_loaded)
    np = bool(data.native_pow) and bool(data.native_lib_loaded)
    update_doc["native_pow"] = np
    if data.mining_status is not None:
        ms = data.mining_status
        # Normalize: only allow our enum (v1.4.8 adds paused_power/paused_battery/eco)
        if ms not in ("connected_only", "stopped", "warming", "throttled", "running",
                      "unavailable", "paused_power", "paused_battery", "eco"):
            ms = "connected_only"
        update_doc["mining_status"] = ms
    else:
        update_doc["mining_status"] = "running" if np else "connected_only"
    if data.local_hashrate_hps is not None:
        h = float(data.local_hashrate_hps)
        # Mobile RandomX ceiling: cap at 1500 H/s. A modern flagship CPU
        # under-clocked for thermals tops out around 600-900 H/s; 1500 gives
        # 50% headroom so honest reports never get clamped while spoofs do.
        if h < 0: h = 0
        if h > 1500.0: h = 1500.0
        update_doc["local_hashrate_hps"] = h if np else 0.0
    else:
        update_doc["local_hashrate_hps"] = 0.0
    if data.accepted_shares is not None:
        update_doc["mobile_accepted_shares"] = max(0, int(data.accepted_shares))
    if data.rejected_shares is not None:
        update_doc["mobile_rejected_shares"] = max(0, int(data.rejected_shares))
    if data.battery_percent is not None:
        update_doc["battery_percent"] = max(0, min(100, int(data.battery_percent)))
    if data.network_type is not None:
        nt = data.network_type
        if nt not in ("wifi", "cellular", "ethernet", "unknown"):
            nt = "unknown"
        update_doc["network_type"] = nt
    if data.charging_only is not None: update_doc["charging_only_pref"] = bool(data.charging_only)
    if data.wifi_only is not None:    update_doc["wifi_only_pref"]    = bool(data.wifi_only)
    if data.mining_requested is not None: update_doc["mining_requested"] = bool(data.mining_requested)

    # iter-24 / v1.3.8: native lib SHA-256 attestation (anti-spoof v2).
    # If a whitelist is configured (LIBRANDOMX_KNOWN_SHA256 env), the phone
    # MUST report a known hash, otherwise we mark mining_status="unverified"
    # and zero its contribution. If whitelist is empty we're in dev mode and
    # any hash passes — but we still record it for forensic auditing.
    if data.native_lib_sha256:
        update_doc["native_lib_sha256"] = data.native_lib_sha256[:128]
        try:
            from mobile_mining.bridge import is_known_native_lib
            if not is_known_native_lib(data.native_lib_sha256):
                update_doc["mining_status"] = "unverified"
                update_doc["native_pow"] = False
                update_doc["local_hashrate_hps"] = 0.0
        except Exception:
            pass
    if data.mobile_submitted_shares is not None:
        update_doc["mobile_submitted_shares"] = max(0, int(data.mobile_submitted_shares))

    # iter-30 / v1.4.8 — Compute Node state machine telemetry.
    if data.node_state is not None:
        ns = data.node_state
        if ns not in ("idle", "engaged_full", "engaged_eco", "engaged_standby",
                       "paused_power", "paused_battery", "paused_network",
                       "paused_thermal", "engaged"):
            ns = "engaged_full"
        # v1.5.2 — ECO mode kaldırıldı; eski telefonlardan gelen "engaged_eco"
        # backend tarafında "engaged_full"a normalize edilir.
        if ns == "engaged_eco":
            ns = "engaged_full"
        update_doc["node_state"] = ns
    if data.eco_mode is not None:
        update_doc["eco_mode"] = bool(data.eco_mode)
    if data.allow_on_battery is not None:
        update_doc["allow_on_battery"] = bool(data.allow_on_battery)
    if data.node_engaged is not None:
        update_doc["node_engaged"] = bool(data.node_engaged)
    if data.active_threads is not None:
        update_doc["active_threads"] = max(0, min(16, int(data.active_threads)))

    # iter-23 / v1.3.7 — emit notable device events to the live console bus.
    try:
        from notifications import console_bus
        prev_native = bool(dev.get("native_pow"))
        if np and not prev_native:
            console_bus.emit("device", "share",
                f"native mining ENGAGED on {data.device_id} ({update_doc.get('local_hashrate_hps') or 0:.1f} H/s)")
        elif (not np) and prev_native:
            console_bus.emit("device", "info",
                f"native mining DISENGAGED on {data.device_id}")
        prev_acc = int(dev.get("mobile_accepted_shares") or 0)
        new_acc = int(data.accepted_shares or 0)
        if new_acc > prev_acc:
            console_bus.emit("device", "share",
                f"mobile share ACCEPTED on {data.device_id} #{new_acc}")
    except Exception:
        pass
    if data.hashrate is not None:
        # Server-side sanity cap: reject inflated client-reported hashrate.
        # Per algo we trust at most 5× the documented base rate (which already
        # represents a mid-tier device). Anything above that is clamped + flagged.
        hr = float(data.hashrate)
        algo_for_cap = data.algo or dev.get("algo")
        cap_base = None
        if algo_for_cap:
            for prof in MINING_PROFILES.values():
                if prof["algo"] == algo_for_cap:
                    cap_base = prof["base_hashrate_hps"]
                    break
        cap = (cap_base or 1_000_000) * 5.0
        if hr > cap:
            update_doc["hashrate_hps"] = cap
            update_doc["hashrate_capped"] = True
            update_doc["hashrate_reported_raw"] = hr
        else:
            update_doc["hashrate_hps"] = max(0.0, hr)
            update_doc["hashrate_capped"] = False
            # Clear any stale raw value from a previous over-cap heartbeat
            update_doc["hashrate_reported_raw"] = None
    if data.algo: update_doc["algo"] = data.algo
    if data.country: update_doc["country"] = data.country.upper()[:2]
    if data.lat is not None and -90 <= float(data.lat) <= 90:
        update_doc["lat"] = float(data.lat)
    if data.lng is not None and -180 <= float(data.lng) <= 180:
        update_doc["lng"] = float(data.lng)
    if data.current_mode in ("enterprise_job", "baseline_compute", "baseline_mining", "idle"):
        # Normalise legacy "baseline_mining" → new "baseline_compute"
        update_doc["current_mode"] = "baseline_compute" if data.current_mode == "baseline_mining" else data.current_mode
    if data.stratum_linked is not None:
        update_doc["stratum_linked"] = bool(data.stratum_linked)
        if data.stratum_linked:
            update_doc["stratum_last_linked_at"] = now_iso
    if suspicious_freq:
        update_doc["suspicious_heartbeat"] = True
    # Composite update: $set everything, AND $min stratum_first_linked_at on
    # the very first ever LINKED heartbeat for this device. $min only writes
    # when the new value is smaller than any existing one, so once set it
    # NEVER moves forward — even if the device disconnects/reconnects later.
    update_op = {"$set": update_doc}
    if data.stratum_linked:
        update_op["$min"] = {"stratum_first_linked_at": now_iso}
    await db.devices.update_one({"id": data.device_id}, update_op)

    # Register this device in Binance Pool (best-effort, idempotent on the proxy side)
    pool_status = pool_get_status()
    binance_worker_name = None
    if pool_status["configured"] and pool_status["enabled"] and dev.get("is_real_apk"):
        short = (data.device_id or "")[:8]
        # Iter-11 strict format: <account>.<device_short_id>  (no intermediate prefix)
        if pool_status["pool_account"]:
            prefix = pool_status.get("worker_prefix") or ""
            binance_worker_name = (
                f"{pool_status['pool_account']}.{prefix}.{short}"
                if prefix else f"{pool_status['pool_account']}.{short}"
            )
        if pool_status["connected"] and short:
            try:
                await pool_register_device(short)
            except Exception:
                pass
    return {
        "eligible": eligible,
        "status": status_val,
        "worker_state": ws,
        "auto_stop": (ws == "active" and not eligible),
        "auto_stop_reasons": _golden_rule_reasons(data.charging, data.wifi, data.permission, over_temp),
        "pool": {
            "configured": pool_status["configured"],
            "enabled": pool_status["enabled"],
            "connected": pool_status["connected"],
            "binance_worker_name": binance_worker_name,
        },
    }


def _golden_rule_reasons(charging: bool, wifi: bool, permission: bool, over_temp: bool):
    r = []
    if not charging: r.append("not_charging")
    if not wifi: r.append("not_on_wifi")
    if not permission: r.append("permission_off")
    if over_temp: r.append("over_temp")
    return r


# ---------- Worker control (native APK) ----------
class WorkerControlIn(BaseModel):
    device_id: str


@api.post("/worker/start")
async def worker_start(data: WorkerControlIn, user: dict = Depends(get_current_user)):
    dev = await db.devices.find_one({"id": data.device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    if dev.get("flagged"):
        raise HTTPException(status_code=403, detail="Device flagged")
    await db.devices.update_one({"id": data.device_id}, {"$set": {
        "worker_state": "active",
        "session_started_at": datetime.now(timezone.utc).isoformat(),
        "session_tasks": 0,
        "session_tgc": 0.0,
    }})
    return {"ok": True, "worker_state": "active"}


@api.post("/worker/stop")
async def worker_stop(data: WorkerControlIn, user: dict = Depends(get_current_user)):
    dev = await db.devices.find_one({"id": data.device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.devices.update_one({"id": data.device_id}, {"$set": {
        "worker_state": "stopped",
        "status": "idle",
        "session_ended_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True, "worker_state": "stopped"}


# ---------- Task Endpoints ----------
async def _pick_active_job():
    """Pick the oldest running job that still has units to process."""
    return await db.jobs.find_one({
        "status": "running",
        "$expr": {"$lt": ["$processed_units", "$total_units"]},
    }, {"_id": 0})


@api.post("/tasks/request")
async def request_task(device_id: str, user: dict = Depends(get_current_user)):
    dev = await db.devices.find_one({"id": device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    if dev.get("flagged"):
        raise HTTPException(status_code=403, detail="Device flagged by Fraud Shield")
    if not (dev.get("charging") and dev.get("wifi") and dev.get("permission")):
        raise HTTPException(status_code=400, detail="Golden Rule not satisfied")

    # Try to draw a unit from a running customer job first
    job = await _pick_active_job()
    job_id = None
    if job:
        wt = job.get("workload_type", "mixed")
        if wt == "matrix_compute":
            kind_force = "matrix"
        elif wt == "hash_compute":
            kind_force = "hash"
        else:
            kind_force = _sysrand.choice(["matrix", "hash"])
        task = generate_task(force_kind=kind_force)
        job_id = job["id"]
    else:
        # No active customer jobs — fall back to baseline mining if enabled
        cfg = await db.config.find_one({"key": "auto_mining"}, {"_id": 0}) or {}
        if not cfg.get("enabled", True):
            raise HTTPException(status_code=503, detail="No tasks available — baseline mining disabled by admin")
        # Baseline = mostly SHA-256 PoW per spec, but rotate to keep workload diverse
        task = generate_task()

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": task["id"],
        "user_id": user["id"],
        "device_id": device_id,
        "payload": task["payload"],
        "expected": task["expected"],
        "flops": task["flops"],
        "kind": task["kind"],
        "status": "assigned",
        "assigned_at": now,
        "job_id": job_id,
    }
    await db.tasks.insert_one(doc)
    return {
        "id": task["id"],
        "payload": task["payload"],
        "kind": task["kind"],
        "flops": task["flops"],
        "job_id": job_id,
    }


@api.post("/tasks/submit")
async def submit_task(data: TaskSubmitIn, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": data.task_id, "user_id": user["id"], "device_id": data.device_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "assigned":
        raise HTTPException(status_code=400, detail="Task already finalized")

    verified = str(data.result).strip() == str(task["expected"]).strip()
    now = datetime.now(timezone.utc).isoformat()

    if verified:
        dev = await db.devices.find_one({"id": data.device_id}, {"_id": 0})
        device_tier = dev.get("model", "mid")
        model_mult = MODEL_MULT.get(device_tier, 1.0)
        compute_sec = max(0.05, data.compute_ms / 1000.0)
        base_earned = compute_sec * USDT_PER_COMPUTE_SEC * model_mult * 10

        # Priority multiplier from job (or 1.0 for ambient)
        job_id = task.get("job_id")
        priority_mult = 1.0
        revenue = 0.0
        if job_id:
            job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
            if job:
                priority_mult = PRIORITY_MULT.get(job.get("priority", "standard"), 1.0)
                rate = job.get("rate_per_unit", 0.0)
                revenue = round(rate, 6)
                new_processed = (job.get("processed_units", 0) or 0) + 1
                new_status = "completed" if new_processed >= job.get("total_units", 0) else job.get("status", "running")
                await db.jobs.update_one({"id": job_id}, {
                    "$inc": {"processed_units": 1, "spent_usdt": revenue},
                    "$set": {"status": new_status,
                             "completed_at": datetime.now(timezone.utc).isoformat() if new_status == "completed" else job.get("completed_at")},
                })

        earned = round(base_earned * priority_mult, 6)

        # ---------- TGC drip (Prestige Pi-economy) ----------
        # Power-up gating: user must have powered up within last 24h to earn TGC
        u_for_power = await db.users.find_one({"id": user["id"]}, {"_id": 0, "power_up_at": 1, "device_tier": 1})
        powered_up = _is_powered_up(u_for_power.get("power_up_at") if u_for_power else None)
        # Tier preference: device tier > stored user tier > "mid"
        tier_for_drip = device_tier or (u_for_power.get("device_tier") if u_for_power else "mid") or "mid"
        shield = await _get_difficulty_factor()
        tgc_earned = 0.0
        if powered_up:
            daily_tgc = TIER_DAILY_TGC.get(tier_for_drip, TIER_DAILY_TGC["mid"])
            base_drip = (daily_tgc / SECONDS_PER_DAY) * compute_sec * priority_mult
            # Admin shield: throttle drip when difficulty rises (preserves 30% margin floor)
            tgc_earned = round(base_drip / max(1.0, shield), 6)

        await db.tasks.update_one({"id": data.task_id}, {"$set": {
            "status": "verified", "completed_at": now,
            "result": data.result, "compute_ms": data.compute_ms,
            "earned_usdt": earned, "revenue_usdt": revenue,
            "earned_tgc": tgc_earned, "powered_up": powered_up,
            "tier": tier_for_drip, "shield_factor": shield,
        }})
        await db.devices.update_one({"id": data.device_id}, {"$inc": {
            "tasks_completed": 1,
            "total_flops": task["flops"],
            "session_tasks": 1,
            "session_tgc": tgc_earned,
        }})
        await db.users.update_one({"id": user["id"]}, {"$inc": {
            "balance_usdt": earned,
            "total_earned": earned,
            "tgc_balance": tgc_earned,
            "tgc_total_earned": tgc_earned,
        }})

        # Referral commission: 10% lifetime (USDT + TGC)
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referred_by": 1})
        if u and u.get("referred_by"):
            commission = round(earned * REFERRAL_RATE, 6)
            tgc_commission = round(tgc_earned * REFERRAL_RATE, 6)
            await db.users.update_one({"id": u["referred_by"]}, {"$inc": {
                "balance_usdt": commission,
                "total_earned": commission,
                "referral_earnings": commission,
                "tgc_balance": tgc_commission,
                "tgc_total_earned": tgc_commission,
            }})

        # Fraud shield
        expected_min_ms = 15 if task["kind"] == "hash" else 1
        if data.compute_ms < expected_min_ms:
            await db.devices.update_one({"id": data.device_id}, {"$set": {"flagged": True}})

        return {"verified": True, "earned_usdt": earned, "earned_tgc": tgc_earned,
                "powered_up": powered_up, "tier": tier_for_drip,
                "shield_factor": shield, "job_id": job_id, "priority_mult": priority_mult}
    else:
        await db.tasks.update_one({"id": data.task_id}, {"$set": {
            "status": "rejected", "completed_at": now,
            "result": data.result, "compute_ms": data.compute_ms,
        }})
        # Mark suspicious
        await db.devices.update_one({"id": data.device_id}, {"$inc": {"rejections": 1}})
        return {"verified": False, "earned_usdt": 0.0}


@api.get("/tasks/recent")
async def recent_tasks(user: dict = Depends(get_current_user)):
    rows = await db.tasks.find({"user_id": user["id"]}, {"_id": 0, "expected": 0}).sort("assigned_at", -1).to_list(25)
    return rows


# ---------- Wallet ----------
def _is_powered_up(power_up_at: Optional[str]) -> bool:
    if not power_up_at:
        return False
    try:
        ts = datetime.fromisoformat(power_up_at)
    except Exception:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts < timedelta(hours=POWER_UP_WINDOW_HOURS)


def _power_up_remaining_seconds(power_up_at: Optional[str]) -> int:
    if not power_up_at:
        return 0
    try:
        ts = datetime.fromisoformat(power_up_at)
    except Exception:
        return 0
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    expires = ts + timedelta(hours=POWER_UP_WINDOW_HOURS)
    delta = (expires - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(delta))


async def _get_difficulty_factor() -> float:
    """Admin shield multiplier. Auto-throttles TGC drip to preserve 30% admin margin."""
    cfg = await db.config.find_one({"key": "shield"}, {"_id": 0}) or {}
    return float(cfg.get("difficulty_factor", 1.0))


@api.get("/wallet")
async def wallet(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    payouts = await db.payouts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    tgc_balance = float(u.get("tgc_balance", 0.0))
    tgc_total = float(u.get("tgc_total_earned", 0.0))
    pending_tgc = float(u.get("pending_tgc", 0.0))
    powered_up = _is_powered_up(u.get("power_up_at"))
    # today_tgc: TGC accrued since UTC midnight (light, recomputed each call from ledger).
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    today_start = _dt.now(_tz.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_pipe = [
        {"$match": {"user_id": user["id"], "created_at": {"$gte": today_start.isoformat()}, "kind": "drip"}},
        {"$group": {"_id": None, "tgc": {"$sum": "$tgc"}}},
    ]
    today_tgc = 0.0
    try:
        async for row in db.tgc_ledger.aggregate(today_pipe):
            today_tgc = float(row.get("tgc") or 0.0)
    except Exception:
        today_tgc = 0.0
    tier = u.get("device_tier", "mid")
    monthly_forecast_tgc = round(TIER_DAILY_TGC.get(tier, TIER_DAILY_TGC["mid"]) * 30, 2)
    can_withdraw = tgc_balance >= WITHDRAW_THRESHOLD_TGC
    # v1.5.0 — backfill Grid Tickets if user crossed 100-TGC milestones before
    # the feature shipped, then expose ticket summary on wallet response.
    try:
        await _generate_grid_tickets_if_due(user["id"], tgc_total)
    except Exception:
        pass
    grid_tickets_count = await db.grid_tickets.count_documents({
        "user_id": user["id"], "source": "lifetime_tgc",
        "status": {"$in": ["active", "winner"]},
    })
    next_tk_milestone = (int(tgc_total // TICKET_TGC_MILESTONE) + 1) * TICKET_TGC_MILESTONE
    next_tk_tgc_left = max(0.0, next_tk_milestone - tgc_total)
    return {
        # Legacy USDT (kept for compatibility)
        "balance_usdt": u.get("balance_usdt", 0.0),
        "total_earned": u.get("total_earned", 0.0),
        "withdraw_threshold": WITHDRAW_THRESHOLD_TGC,  # now expressed in TGC
        # TGC Prestige economy (v1.4.9: 1000 TGC = $10 USDT, 1 TGC = $0.01)
        "tgc_balance": round(tgc_balance, 4),
        "tgc_total_earned": round(tgc_total, 4),
        "tgc_balance_usdt_value": round(tgc_balance * USDT_PER_TGC, 4),
        "lifetime_tgc": round(tgc_total, 4),
        "lifetime_usdt_value": round(tgc_total * USDT_PER_TGC, 4),
        "today_tgc": round(today_tgc, 4),
        "pending_tgc": round(pending_tgc, 4),
        "available_tgc": round(max(0.0, tgc_balance - pending_tgc), 4),
        "monthly_forecast_tgc": monthly_forecast_tgc,
        "monthly_forecast_usdt": round(monthly_forecast_tgc * USDT_PER_TGC, 2),
        "payout_progress_tgc": round(min(tgc_balance, WITHDRAW_THRESHOLD_TGC), 4),
        "payout_progress_pct": round(min(100.0, (tgc_balance / WITHDRAW_THRESHOLD_TGC) * 100.0), 2),
        "payout_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "payout_value_usdt": round(WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC, 2),
        "withdraw_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "withdraw_threshold_usdt": round(WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC, 2),
        "tgc_per_usdt": TGC_PER_USDT,
        "usdt_per_tgc": USDT_PER_TGC,
        "can_withdraw": False,                 # v1.5.1 — locked until token launch
        "payout_eligibility": "pre_mainnet",    # v1.5.1
        "redemption_locked": True,              # v1.5.1 — frontend gates UI on this
        "token_launch_label": TGC_LAUNCH_LABEL, # v1.5.1
        "token_launch_quarter": "2027-Q3",      # v1.5.1
        # v1.5.0 Grid Tickets summary (Monthly Contributor Drop)
        "grid_tickets": grid_tickets_count,
        "next_ticket_in_tgc": round(next_tk_tgc_left, 2),
        "next_ticket_milestone": next_tk_milestone,
        "tgc_per_ticket": TICKET_TGC_MILESTONE,
        # Power-up state
        "powered_up": powered_up,
        "power_up_at": u.get("power_up_at"),
        "power_up_seconds_remaining": _power_up_remaining_seconds(u.get("power_up_at")),
        "device_tier": tier,
        "payouts": payouts,
        # Saved payout wallet (USDT BEP20/TRC20/Polygon)
        "payout_wallet_address": u.get("payout_wallet_address"),
        "payout_wallet_network": u.get("payout_wallet_network"),
    }


@api.post("/wallet/withdraw")
async def withdraw(data: WithdrawIn, user: dict = Depends(get_current_user)):
    """
    v1.5.1 — USDT redemption is LOCKED in pre-mainnet mode.
    Users save TGC; at TGC token launch (Q3 2026, see /api/token/launch)
    every accumulated TGC will be airdropped 1:1 onto the live token.
    """
    raise HTTPException(
        status_code=503,
        detail={
            "error": "tgc_redemption_locked",
            "message": "USDT çekim, TGC Mainnet launch'a kadar kilitlidir. Bugün biriktirdiğin her TGC, token launch'da 1:1 airdrop edilecek. Cüzdan adresini şimdi kaydet, drop için hazır ol.",
            "launch_label": TGC_LAUNCH_LABEL,
            "expected_launch_quarter": "2027-Q3",
        },
    )


@api.get("/token/launch")
async def token_launch_status():
    """Public TGC narrative status. v1.5.4 — date-based countdown narrative
    is RETIRED.  The new milestone-driven narrative is built around the
    1,000,000 verified active node target. Snapshot Readiness can only be
    pursued once that target is met AND community, legal, technical and
    ecosystem conditions are satisfied."""
    return {
        "status": "pre_mainnet_accumulation",
        "redemption_locked": True,
        "label": "TGC · Pre-Mainnet Contribution Phase",
        "narrative_model": "milestone_driven",
        "primary_milestone": {
            "id": "verified_active_nodes",
            "target": 1_000_000,
            "description": "Snapshot Readiness phase may be pursued once verified active nodes reach 1,000,000.",
        },
        "snapshot_rule": "When the network reaches Snapshot Readiness, the contribution ledger may be sealed and pre-mainnet TGC accumulation may be paused. Mainnet roadmap progression is subject to community, legal, technical and ecosystem conditions.",
        "operator_keep_pct": 15,
        "circulating_at_launch_pct": 70,
        "treasury_pct": 15,
        "guarantees": False,
        "indicative_only": True,
    }


# ---------- v1.5.4 Network Scarcity Progress (replaces countdown) ----------
SCARCITY_TARGET_NODES = 1_000_000


@api.get("/network/scarcity-progress")
async def network_scarcity_progress():
    """Live counter towards the 1,000,000 verified active node milestone.
    Replaces the previous date-based Q3 2027 countdown narrative.

    A node counts as 'verified active' when it has:
      - heart-beated within the last OFFLINE_CUTOFF_SEC window, AND
      - reported a known-good native engine SHA (or no strict whitelist),
        AND has stratum_linked=true OR mining_status='mining'.

    No fake inflation: if the field is unset we count zero.

    v1.6.2 — also returns the live TGC contribution ledger totals.
    v1.7.5 — also returns Light vs Node Pro breakdown for the dual scarcity panel.
    """
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    verified = await db.devices.count_documents({
        "is_real_apk": True,
        "last_heartbeat": {"$gte": cutoff_iso},
        "$or": [
            {"stratum_linked": True},
            {"mining_status": "mining"},
            {"native_pow": True},
        ],
    })
    total_registered = await db.devices.count_documents({})
    pct = (verified / SCARCITY_TARGET_NODES) * 100.0 if SCARCITY_TARGET_NODES else 0.0
    totals = await _tgc_ledger_totals()

    # v1.7.5 — per-flavor breakdown
    light_devices    = await db.devices.count_documents({"client_type": "light"})
    nodepro_devices  = await db.devices.count_documents({"client_type": "node_pro"})
    light_active     = await db.devices.count_documents({
        "client_type": "light",
        "last_heartbeat": {"$gte": cutoff_iso},
    })
    nodepro_active   = await db.devices.count_documents({
        "client_type": "node_pro",
        "last_heartbeat": {"$gte": cutoff_iso},
    })
    light_downloads   = await db.apk_downloads.count_documents({"flavor": "light"})
    nodepro_downloads = await db.apk_downloads.count_documents({"flavor": "node_pro"})

    return {
        "verified_active_nodes": verified,
        "target_active_nodes": SCARCITY_TARGET_NODES,
        "progress_pct": round(min(100.0, max(0.0, pct)), 6),
        "total_registered_nodes": total_registered,
        "phase": (
            "snapshot_ready" if verified >= SCARCITY_TARGET_NODES
            else "growth"
        ),
        "next_milestone": "Snapshot Readiness review",
        "label": "NETWORK SCARCITY PROGRESS",
        "subtitle_long": (
            "The network may enter Snapshot Readiness once 1,000,000 verified "
            "active nodes are reached. Roadmap progression is subject to "
            "community, legal, technical and ecosystem conditions."
        ),
        "guarantees": False,
        "indicative_only": True,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "by_client": {
            "light": {
                "downloads":     light_downloads,
                "registered":    light_devices,
                "active_nodes":  light_active,
            },
            "node_pro": {
                "downloads":     nodepro_downloads,
                "registered":    nodepro_devices,
                "active_nodes":  nodepro_active,
            },
        },
        **totals,
    }


@api.post("/apk/track-download")
async def apk_track_download(payload: dict = None):
    """v1.7.5 — fire-and-forget download counter. Frontend POSTs
    {flavor:'light'|'node_pro'} just before triggering the APK download.
    Counts include both Web preview and Android In-App-Browser hits.
    """
    payload = payload or {}
    flavor = str(payload.get("flavor") or "").lower().strip()
    if flavor not in ("light", "node_pro"):
        return {"ok": False, "reason": "unknown_flavor"}
    await db.apk_downloads.insert_one({
        "id": str(uuid.uuid4()),
        "flavor": flavor,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "flavor": flavor}


# ---------- v1.6.2 TGC Ledger Totals (real, no fake inflation) ----------
async def _tgc_ledger_totals() -> dict:
    """Aggregate every positive / negative entry in `tgc_ledger` into the
    public ledger totals shown on the landing page, /token, /dashboard and
    /admin. No hard-coded numbers — pure aggregation.

    Returns:
        total_tgc_issued, total_tgc_burned, circulating_tgc,
        total_compute_tgc, total_daily_calibration_tgc, total_drop_tgc,
        total_buyback_burned_tgc
    """
    pipeline = [
        {"$group": {
            "_id": "$kind",
            "tgc_sum": {"$sum": "$tgc"},
        }},
    ]
    sums: dict[str, float] = {}
    try:
        async for row in db.tgc_ledger.aggregate(pipeline):
            sums[str(row.get("_id") or "unknown")] = float(row.get("tgc_sum") or 0.0)
    except Exception:
        sums = {}

    total_issued  = sum(v for v in sums.values() if v > 0)
    total_burned  = abs(sum(v for v in sums.values() if v < 0))
    circulating   = max(0.0, total_issued - total_burned)
    compute_tgc   = sums.get("drip", 0.0)
    calib_tgc     = sums.get("daily_calibration_bonus", 0.0)
    drop_tgc      = sums.get("drop_bonus", 0.0) + sums.get("contributor_drop", 0.0)
    buyback_burn  = abs(sums.get("buyback_burn", 0.0))

    return {
        "total_tgc_issued":            round(total_issued, 5),
        "total_tgc_burned":            round(total_burned, 5),
        "circulating_tgc":             round(circulating, 5),
        "total_compute_tgc":           round(compute_tgc, 5),
        "total_daily_calibration_tgc": round(calib_tgc, 5),
        "total_drop_tgc":              round(drop_tgc, 5),
        "total_buyback_burned_tgc":    round(buyback_burn, 5),
    }


@api.get("/stats/public")
async def stats_public():
    """v1.6.2 — Lightweight public stats endpoint exposing only the
    ledger totals (without scarcity payload), for any surface that needs
    just the counter."""
    totals = await _tgc_ledger_totals()
    return {**totals, "as_of": datetime.now(timezone.utc).isoformat()}


# ---------- v1.6.2 Daily Grid Calibration (node sync bonus) ----------
# Strict server-side weighted random reward. Cyber calibration UX in the
# frontend — never a wheel-of-fortune, never gambling language.
_CALIBRATION_REWARDS = [
    # (tier_label,        tgc_amount, weight_percent)
    ("micro_tick",        0.00010,    35.0),
    ("micro_pulse",       0.00050,    25.0),
    ("standard_sync",     0.00100,    18.0),
    ("verified_sync",     0.00500,    10.0),
    ("deep_calibration",  0.01000,     7.0),
    ("protocol_resonance",0.05000,     3.0),
    ("core_alignment",    0.10000,     1.8),
    ("singularity",       1.00000,     0.2),
]


def _calibration_pick_reward() -> tuple[str, float]:
    """Weighted random pick using cumulative thresholds."""
    weights = [w for _, _, w in _CALIBRATION_REWARDS]
    return tuple(_sysrand.choices(
        [(tier, amt) for tier, amt, _ in _CALIBRATION_REWARDS],
        weights=weights, k=1,
    )[0])


def _today_utc_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _seconds_until_next_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    nxt = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(0, int((nxt - now).total_seconds()))


async def _calibration_eligibility(user: dict) -> tuple[bool, str]:
    """Returns (eligible, reason). Reason is a stable code, never a user error string."""
    if user.get("is_banned"):
        return False, "account_suspended"
    if user.get("risk_flagged"):
        return False, "risk_flagged_account"
    # Require at least one valid device heartbeat in the last 24h.
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    hb = await db.devices.count_documents({
        "user_id": user["id"],
        "last_heartbeat": {"$gte": cutoff},
    })
    if hb == 0:
        return False, "no_recent_heartbeat"
    return True, "eligible"


@api.get("/daily-calibration/status")
async def daily_calibration_status(user: dict = Depends(get_current_user)):
    """Return today's calibration eligibility + last claim for the user."""
    eligible, reason = await _calibration_eligibility(user)
    date_key = _today_utc_key()
    today_claim = await db.daily_calibrations.find_one(
        {"user_id": user["id"], "date_key": date_key},
        {"_id": 0},
    )
    last_claim = await db.daily_calibrations.find_one(
        {"user_id": user["id"]},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    return {
        "eligible": eligible and not today_claim,
        "reason": "already_claimed_today" if today_claim else reason,
        "already_claimed_today": bool(today_claim),
        "today_claim": today_claim,
        "last_claim": last_claim,
        "seconds_until_next": _seconds_until_next_utc_midnight() if today_claim else 0,
        "label": "DAILY GRID CALIBRATION",
        "subtitle": "Synchronize your node once per day and receive a small contribution receipt bonus.",
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


@api.post("/daily-calibration/claim")
async def daily_calibration_claim(payload: dict = None, user: dict = Depends(get_current_user)):
    """Atomic daily calibration claim with same-day idempotency.

    v1.7.5 — request body may carry:
      - client_type: "light" | "node_pro" | None
      - ad_completed: bool (Light clients MUST set this true; gated by AdMob
        rewarded ad on device. NodePro and unknown clients ignore it.)
      - device_id: optional
    """
    payload = payload or {}
    client_type = str(payload.get("client_type") or "unknown")
    ad_completed = bool(payload.get("ad_completed", False))
    ad_mode      = str(payload.get("ad_mode") or "unknown")  # 'test' | 'production' | 'disabled' | 'unknown'
    device_id   = payload.get("device_id")

    # Light clients are required to complete a rewarded ad before claim.
    if client_type == "light" and not ad_completed:
        raise HTTPException(status_code=402, detail="ad_not_completed")

    date_key = _today_utc_key()

    # Idempotency: unique (user_id, date_key) — return existing claim instead of dupliacting.
    existing = await db.daily_calibrations.find_one(
        {"user_id": user["id"], "date_key": date_key},
        {"_id": 0},
    )
    if existing:
        return {
            "ok": True,
            "status": "already_claimed_today",
            "reward_tgc": float(existing.get("reward_tgc") or 0.0),
            "reward_tier": existing.get("reward_tier"),
            "claimed_at": existing.get("created_at"),
            "seconds_until_next": _seconds_until_next_utc_midnight(),
        }

    eligible, reason = await _calibration_eligibility(user)
    if not eligible:
        raise HTTPException(status_code=423, detail=reason)

    tier, reward_tgc = _calibration_pick_reward()
    now_iso = datetime.now(timezone.utc).isoformat()
    calib_id = str(uuid.uuid4())
    burn_ledger_id = str(uuid.uuid4())

    # 1. Write calibration record (also acts as idempotency key)
    try:
        await db.daily_calibrations.insert_one({
            "id": calib_id,
            "user_id": user["id"],
            "date_key": date_key,
            "reward_tgc": reward_tgc,
            "reward_tier": tier,
            "device_id": device_id,
            "client_type": client_type,
            "ad_completed": ad_completed,
            "ad_mode": ad_mode,
            "eligible": True,
            "reason": "eligible",
            "created_at": now_iso,
        })
    except Exception:
        # Race condition — another request just claimed it. Return that one.
        existing = await db.daily_calibrations.find_one(
            {"user_id": user["id"], "date_key": date_key},
            {"_id": 0},
        )
        if existing:
            return {
                "ok": True,
                "status": "already_claimed_today",
                "reward_tgc": float(existing.get("reward_tgc") or 0.0),
                "reward_tier": existing.get("reward_tier"),
                "claimed_at": existing.get("created_at"),
                "seconds_until_next": _seconds_until_next_utc_midnight(),
            }
        raise

    # 2. Positive ledger row
    await db.tgc_ledger.insert_one({
        "id": burn_ledger_id,
        "user_id": user["id"],
        "device_id": device_id,
        "tgc": reward_tgc,
        "usdt_value": round(reward_tgc * USDT_PER_TGC, 6),
        "kind": "daily_calibration_bonus",
        "client_type": client_type,
        "ad_completed": ad_completed,
        "ad_mode": ad_mode,
        "reward_source": "daily_calibration",
        "tier": tier,
        "calibration_id": calib_id,
        "created_at": now_iso,
    })

    # 3. Atomic balance increment
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"tgc_balance": reward_tgc, "tgc_total_earned": reward_tgc}},
    )

    return {
        "ok": True,
        "status": "claimed",
        "reward_tgc": reward_tgc,
        "reward_tier": tier,
        "claimed_at": now_iso,
        "calibration_id": calib_id,
        "seconds_until_next": _seconds_until_next_utc_midnight(),
        "message": "Daily calibration receipt added to your contribution ledger.",
    }


# ---------- v1.6.4 Mining Config (admin-controlled, polled by APK) ----------
# Sane defaults — admin can override every field at runtime via /api/admin/mining/config.
_MINING_CONFIG_DEFAULTS = {
    "id": "global",
    "mining_enabled": True,
    "cpu_throttle_pct": 50,    # 0-100, percentage of CPU mining is allowed
    "max_threads": 2,           # 1-8, RandomX threads
    "require_wifi": False,      # if True, Wi-Fi mandatory; if False, mobile data OK
    "require_charging": True,   # if True, device must be plugged in
    "min_battery_pct": 30,      # 0-100, minimum battery level to mine
    "max_temperature_c": 45,    # 30-60, max device temperature
    "allow_mobile_data": True,  # if False, refuse to mine on cellular
    "config_poll_interval_sec": 60,  # how often APK polls this config
    "updated_at": None,
    "updated_by": None,
}


async def _load_mining_config() -> dict:
    row = await db.mining_config.find_one({"id": "global"}, {"_id": 0})
    if not row:
        await db.mining_config.insert_one({**_MINING_CONFIG_DEFAULTS,
                                           "updated_at": datetime.now(timezone.utc).isoformat()})
        return _MINING_CONFIG_DEFAULTS.copy()
    # Backfill any missing field with defaults so APK never sees a null value.
    merged = {**_MINING_CONFIG_DEFAULTS, **row}
    return merged


@api.get("/mining/config")
async def mining_config_public():
    """Public endpoint polled by the APK every N seconds (default 60s).
    Returns the current admin-controlled mining policy.  No auth required —
    the APK calls this before/while running its foreground service."""
    return await _load_mining_config()


@api.get("/admin/mining/config")
async def admin_mining_config_read(user: dict = Depends(require_admin)):
    return await _load_mining_config()


@api.post("/admin/mining/config")
async def admin_mining_config_write(payload: dict, user: dict = Depends(require_admin)):
    """Admin writes any subset of the config fields.  Validation enforces
    sensible ranges so a typo can't brick the entire fleet."""
    allowed_fields = {
        "mining_enabled":           lambda v: bool(v),
        "cpu_throttle_pct":         lambda v: max(0, min(100, int(v))),
        "max_threads":              lambda v: max(1, min(8, int(v))),
        "require_wifi":             lambda v: bool(v),
        "require_charging":         lambda v: bool(v),
        "min_battery_pct":          lambda v: max(0, min(100, int(v))),
        "max_temperature_c":        lambda v: max(30, min(60, int(v))),
        "allow_mobile_data":        lambda v: bool(v),
        "config_poll_interval_sec": lambda v: max(15, min(3600, int(v))),
    }
    update = {}
    for key, coerce in allowed_fields.items():
        if key in payload:
            try:
                update[key] = coerce(payload[key])
            except Exception:
                raise HTTPException(status_code=400, detail=f"invalid value for {key}")
    if not update:
        raise HTTPException(status_code=400, detail="no valid fields supplied")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = user["email"]
    await db.mining_config.update_one(
        {"id": "global"},
        {"$set": update, "$setOnInsert": {"id": "global"}},
        upsert=True,
    )
    return await _load_mining_config()


# ---------- v1.5.4 Foundation Buyback Program (config-driven) ----------
# Defaults stored in DB so the operator can flip the window without redeploy.
_BUYBACK_DEFAULTS = {
    "buyback_target_tgc": 100,
    "buyback_max_usdt": 300,
    "buyback_window_status": "closed",     # closed | open | reviewing
    "buyback_window_label": "Foundation Buyback Window",
    "buyback_terms": (
        "subject to treasury availability, verification, risk review "
        "and regional eligibility"
    ),
}


async def _get_buyback_config() -> dict:
    cfg = await db.config.find_one({"key": "foundation_buyback"}, {"_id": 0}) or {}
    data = dict(_BUYBACK_DEFAULTS)
    for k in _BUYBACK_DEFAULTS:
        if k in cfg:
            data[k] = cfg[k]
    return data


@api.get("/foundation/buyback-status")
async def foundation_buyback_status(user: dict = Depends(get_current_user)):
    """Public buyback program status for the logged-in contributor.

    Window is CLOSED by default. Operator opens it from the admin panel.
    No guaranteed pricing — the UI must show 'Up to $X USDT' framing only.
    """
    cfg = await _get_buyback_config()
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "risk_flagged": 1})
    tgc_balance = float((me or {}).get("tgc_balance") or 0.0)
    risk_flagged = bool((me or {}).get("risk_flagged") or False)

    eligible = (
        cfg["buyback_window_status"] == "open"
        and tgc_balance >= float(cfg["buyback_target_tgc"])
        and not risk_flagged
    )

    return {
        "window_status": cfg["buyback_window_status"],
        "window_label": cfg["buyback_window_label"],
        "target_tgc": cfg["buyback_target_tgc"],
        "max_usdt": cfg["buyback_max_usdt"],
        "current_program_label": f"Up to ${int(cfg['buyback_max_usdt'])} USDT",
        "eligibility_label": f"{int(cfg['buyback_target_tgc'])} TGC required",
        "terms": cfg["buyback_terms"],
        "user_tgc_balance": round(tgc_balance, 5),
        "user_is_eligible": eligible,
        "risk_flagged": risk_flagged,
        "guarantees": False,
        "indicative_only": True,
    }


class BuybackApplyIn(BaseModel):
    payout_wallet: Optional[str] = None
    payout_network: Optional[str] = None    # BEP20 | TRC20 | Polygon
    notes: Optional[str] = None


@api.post("/foundation/buyback-apply")
async def foundation_buyback_apply(payload: BuybackApplyIn, user: dict = Depends(get_current_user)):
    """Contributor applies to the current Foundation Buyback Window.
    Window MUST be 'open' and user MUST meet eligibility — otherwise 423 Locked.
    Application is recorded; settlement is manual / off-platform until further notice.
    """
    cfg = await _get_buyback_config()
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "risk_flagged": 1, "email": 1})
    tgc_balance = float((me or {}).get("tgc_balance") or 0.0)
    risk_flagged = bool((me or {}).get("risk_flagged") or False)

    if cfg["buyback_window_status"] != "open":
        raise HTTPException(status_code=423, detail="buyback_window_closed")
    if tgc_balance < float(cfg["buyback_target_tgc"]):
        raise HTTPException(status_code=403, detail="below_eligibility_threshold")
    if risk_flagged:
        raise HTTPException(status_code=403, detail="risk_flagged_account")

    existing = await db.buyback_applications.find_one(
        {"user_id": user["id"], "window_label": cfg["buyback_window_label"], "status": {"$in": ["pending", "reviewing"]}},
        {"_id": 0},
    )
    if existing:
        return {"ok": True, "status": "already_submitted", "application_id": existing.get("id")}

    app_id = str(uuid.uuid4())
    await db.buyback_applications.insert_one({
        "id": app_id,
        "user_id": user["id"],
        "user_email": (me or {}).get("email"),
        "window_label": cfg["buyback_window_label"],
        "tgc_balance_at_apply": tgc_balance,
        "target_tgc": cfg["buyback_target_tgc"],
        "max_usdt": cfg["buyback_max_usdt"],
        "payout_wallet": payload.payout_wallet,
        "payout_network": payload.payout_network,
        "notes": payload.notes,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "status": "pending_review", "application_id": app_id}


@api.get("/admin/foundation/buyback-config")
async def admin_buyback_config_read(user: dict = Depends(require_admin)):
    return await _get_buyback_config()


@api.post("/admin/foundation/buyback-config")
async def admin_buyback_config_write(payload: dict, user: dict = Depends(require_admin)):
    """Operator-only: flip window status, adjust caps, etc."""
    allowed = set(_BUYBACK_DEFAULTS.keys())
    update = {k: v for k, v in (payload or {}).items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="no_valid_fields")
    await db.config.update_one(
        {"key": "foundation_buyback"},
        {"$set": {**update, "key": "foundation_buyback", "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await _get_buyback_config()


# ---------- v1.4.9 Node Drip + Payout Wallet ----------

class NodeDripIn(BaseModel):
    device_id: Optional[str] = None
    elapsed_seconds: float = 0
    state: Optional[str] = "engaged_full"  # engaged_full | engaged_eco | engaged_standby | paused_*

class PayoutWalletIn(BaseModel):
    address: str
    network: str  # BEP20 | TRC20 | Polygon


@api.post("/node/drip")
async def node_drip(data: NodeDripIn, user: dict = Depends(get_current_user)):
    """
    v1.4.9 — Persistent TGC drip. Mobile client calls this every ~30-60s while
    the node is engaged. Server applies tier × mode multiplier × elapsed and
    credits the TGC ledger PERSISTENTLY (refresh/disengage doesn't reset).
    Soft monthly forecast caps prevent run-away drips.
    """
    elapsed = max(0.0, min(180.0, float(data.elapsed_seconds or 0)))  # cap 3 min per call
    state = (data.state or "engaged_full").lower()
    mult = MODE_MULTIPLIER.get(state, 0.0)
    if mult <= 0 or elapsed <= 0:
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "tgc_total_earned": 1, "device_tier": 1})
        return {
            "credited_tgc": 0.0,
            "tgc_balance": float((u or {}).get("tgc_balance", 0.0)),
            "lifetime_tgc": float((u or {}).get("tgc_total_earned", 0.0)),
            "tier": (u or {}).get("device_tier", "mid"),
            "state": state, "reason": "no_credit_for_state" if mult <= 0 else "no_elapsed",
        }
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "tgc_total_earned": 1, "device_tier": 1})
    tier = (u or {}).get("device_tier", "mid")
    daily_tgc_target = TIER_DAILY_TGC.get(tier, TIER_DAILY_TGC["mid"])
    shield = await _get_difficulty_factor()
    # v1.4.10 NETWORK EFFECT — bigger network = each phone earns more.
    net_size = await _active_network_size()
    net_mult = network_multiplier(net_size)
    base_rate_tgc_sec = (daily_tgc_target / SECONDS_PER_DAY) / max(1.0, shield)
    credited = round(base_rate_tgc_sec * elapsed * mult * net_mult, 6)
    if credited <= 0:
        return {"credited_tgc": 0.0, "tgc_balance": float((u or {}).get("tgc_balance", 0.0)),
                "lifetime_tgc": float((u or {}).get("tgc_total_earned", 0.0)),
                "tier": tier, "state": state}
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"tgc_balance": credited, "tgc_total_earned": credited}},
    )
    await db.tgc_ledger.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "device_id": data.device_id,
        "tgc": credited,
        "usdt_value": round(credited * USDT_PER_TGC, 6),
        "kind": "drip",
        "state": state,
        "tier": tier,
        "elapsed_seconds": elapsed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tgc_balance": 1, "tgc_total_earned": 1})
    tgc_balance = float((updated or {}).get("tgc_balance", 0.0))
    lifetime = float((updated or {}).get("tgc_total_earned", 0.0))
    # v1.5.0 — auto-generate Grid Tickets for every new 100-TGC milestone reached.
    new_tickets = await _generate_grid_tickets_if_due(user["id"], lifetime)
    return {
        "credited_tgc": credited,
        "credited_usdt": round(credited * USDT_PER_TGC, 6),
        "tgc_balance": round(tgc_balance, 4),
        "lifetime_tgc": round(lifetime, 4),
        "new_grid_tickets": new_tickets,
        "tier": tier,
        "state": state,
        "rate_tgc_per_hour": round(base_rate_tgc_sec * 3600 * mult * net_mult, 4),
        "network_size": net_size,
        "network_multiplier": net_mult,
        "payout_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "payout_progress_tgc": round(min(tgc_balance, WITHDRAW_THRESHOLD_TGC), 4),
        "payout_progress_pct": round(min(100.0, (tgc_balance / WITHDRAW_THRESHOLD_TGC) * 100.0), 2),
        "can_withdraw": tgc_balance >= WITHDRAW_THRESHOLD_TGC,
    }


@api.post("/wallet/payout-address")
async def save_payout_address(data: PayoutWalletIn, user: dict = Depends(get_current_user)):
    """Save (or update) the user's USDT payout wallet. Allowed networks: BEP20/TRC20/Polygon."""
    net = (data.network or "").upper().strip()
    if net not in ("BEP20", "TRC20", "POLYGON"):
        raise HTTPException(status_code=400, detail="network must be one of BEP20/TRC20/Polygon")
    addr = (data.address or "").strip()
    if not addr or len(addr) < 20 or len(addr) > 80:
        raise HTTPException(status_code=400, detail="invalid wallet address")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "payout_wallet_address": addr,
        "payout_wallet_network": net,
        "payout_wallet_saved_at": datetime.now(timezone.utc).isoformat(),
    }})
    masked = addr[:5] + "..." + addr[-5:] if len(addr) > 10 else addr
    return {"ok": True, "network": net, "address_masked": masked, "address": addr}


# ---------- Power-Up (Pi-style 24h activation) ----------
@api.post("/wallet/power-up")
async def power_up(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if _is_powered_up(u.get("power_up_at")):
        return {
            "ok": True, "already_active": True,
            "expires_in_seconds": _power_up_remaining_seconds(u.get("power_up_at")),
            "powered_up": True,
        }
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"power_up_at": now}})
    return {
        "ok": True, "already_active": False,
        "powered_up": True,
        "power_up_at": now,
        "expires_in_seconds": POWER_UP_WINDOW_HOURS * 3600,
    }


@api.get("/wallet/power-up/status")
async def power_up_status(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "power_up_at": 1})
    return {
        "powered_up": _is_powered_up(u.get("power_up_at")),
        "power_up_at": u.get("power_up_at"),
        "expires_in_seconds": _power_up_remaining_seconds(u.get("power_up_at")),
        "window_hours": POWER_UP_WINDOW_HOURS,
    }


# ---------- Tier Forecast (Dynamic earnings projection) ----------
@api.get("/tier/forecast")
async def tier_forecast(tier: str = "mid", user: dict = Depends(get_current_user)):
    if tier not in TIER_DAILY_TGC:
        tier = "mid"
    # Persist detected tier on user for drip personalisation
    await db.users.update_one({"id": user["id"]}, {"$set": {"device_tier": tier}})
    shield = await _get_difficulty_factor()
    daily_tgc = TIER_DAILY_TGC[tier] / max(1.0, shield)
    return {
        "tier": tier,
        "daily_tgc": round(daily_tgc, 2),
        "daily_usdt": round(daily_tgc * USDT_PER_TGC, 4),
        "weekly_tgc": round(daily_tgc * 7, 2),
        "monthly_tgc": round(daily_tgc * 30, 2),
        "monthly_usdt": round(daily_tgc * 30 * USDT_PER_TGC, 2),
        # v1.4.9 forecast soft-range per device class (TGC/month). Front-end uses these
        # to render an honest "~240 TGC/month" with a high/low band instead of a precise lie.
        "monthly_forecast_range_tgc": {
            "core":     [350, 450],
            "flagship": [280, 350],
            "mid":      [220, 260],
            "budget":   [100, 180],
        }.get(tier, [220, 260]),
        "tiers": {
            t: {
                "daily_tgc": round(TIER_DAILY_TGC[t] / max(1.0, shield), 2),
                "daily_usdt": round(TIER_DAILY_TGC[t] / max(1.0, shield) * USDT_PER_TGC, 4),
                "monthly_tgc": round(TIER_DAILY_TGC[t] / max(1.0, shield) * 30, 2),
            }
            for t in TIER_DAILY_TGC
        },
        "shield_factor": shield,
        "tgc_value_usdt": USDT_PER_TGC,
        "withdraw_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "withdraw_threshold_usdt": round(WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC, 2),
        "payout_value_usdt": 10.0,
    }


class ShieldUpdateIn(BaseModel):
    difficulty_factor: float = Field(ge=0.5, le=50.0)


# ---------- Admin Shield (difficulty throttle) ----------
@api.get("/admin/shield")
async def get_admin_shield(user: dict = Depends(require_admin)):
    factor = await _get_difficulty_factor()
    # Worker TGC paid (USDT-equivalent) — exclude admin role from the aggregation
    user_owed = await db.users.aggregate([
        {"$match": {"role": {"$ne": "admin"}}},
        {"$group": {"_id": None, "tgc": {"$sum": "$tgc_total_earned"}}},
    ]).to_list(1)
    tgc_paid_value = float(user_owed[0]["tgc"] if user_owed else 0.0) * USDT_PER_TGC
    # 7:5 arbitrage rule × shield: factor > 1 throttles drip, widening admin margin.
    # implied_real_mined = paid * (7/5) * factor   →   margin = 1 - 5/(7·factor)
    implied_real_mined = tgc_paid_value * (ADMIN_ARBITRAGE_REAL_USDT / ADMIN_ARBITRAGE_USER_USDT) * factor
    base_margin = 1.0 - (ADMIN_ARBITRAGE_USER_USDT / (ADMIN_ARBITRAGE_REAL_USDT * factor))
    margin = round(base_margin, 4)
    margin_below_floor = margin < ADMIN_PROFIT_FLOOR
    # Suggested factor to hit the profit floor exactly: 5 / (7 · (1-floor))
    suggested_factor = round(ADMIN_ARBITRAGE_USER_USDT / (ADMIN_ARBITRAGE_REAL_USDT * (1.0 - ADMIN_PROFIT_FLOOR)), 4)
    return {
        "difficulty_factor": factor,
        "profit_floor": ADMIN_PROFIT_FLOOR,
        "current_margin": margin,
        "margin_below_floor": margin_below_floor,
        "suggested_difficulty_factor": suggested_factor,
        "tgc_paid_to_users_usdt": round(tgc_paid_value, 4),
        "implied_real_mined_usdt": round(implied_real_mined, 4),
        "admin_binance_id": ADMIN_BINANCE_ID,
        "shield_active": factor > 1.0,
    }


@api.post("/admin/shield")
async def set_admin_shield(payload: ShieldUpdateIn, user: dict = Depends(require_admin)):
    factor = float(payload.difficulty_factor)
    await db.config.update_one(
        {"key": "shield"},
        {"$set": {
            "key": "shield",
            "difficulty_factor": factor,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user["email"],
        }},
        upsert=True,
    )
    return {"ok": True, "difficulty_factor": factor}


# ---------- Stats / Network ----------
@api.get("/stats/network")
async def network_stats():
    # Real numbers from DB; still looks massive because each active device = simulated FLOPS contribution
    total_devices = await db.devices.count_documents({})
    active_devices = await db.devices.count_documents({"status": "active"})
    total_tasks = await db.tasks.count_documents({"status": "verified"})
    total_users = await db.users.count_documents({"role": "user"})

    # Sum flops across verified tasks
    pipeline = [{"$match": {"status": "verified"}}, {"$group": {"_id": None, "flops": {"$sum": "$flops"}}}]
    agg = await db.tasks.aggregate(pipeline).to_list(1)
    total_flops = agg[0]["flops"] if agg else 0

    # Projected live PetaFLOPS: each active device pretends 1.2 TFLOPS
    live_petaflops = round((active_devices * 1.2) / 1000.0, 4)

    return {
        "total_devices": total_devices,
        "active_devices": active_devices,
        "total_tasks": total_tasks,
        "total_users": total_users,
        "total_flops": total_flops,
        "live_petaflops": live_petaflops,
    }


@api.get("/stats/public")
async def public_stats():
    """
    HONEST live metrics for the public investor landing page. Every field
    either reflects a verified state or is explicitly marked as `pending`.
    No fake petaflops, no extrapolated values.
    """
    # Real device counters
    total_devices = await db.devices.count_documents({})
    active_devices = await db.devices.count_documents({"status": "active"})
    mining_devices = await db.devices.count_documents({
        "$or": [{"native_pow": True}, {"mining_status": "mining"}]
    })

    # Truly accepted mobile shares (only counted on real pool ACK)
    pipeline = [{"$group": {"_id": None, "n": {"$sum": "$accepted_shares"}}}]
    agg = await db.devices.aggregate(pipeline).to_list(1)
    mobile_accepted = int(agg[0]["n"]) if agg and agg[0].get("n") else 0

    # Backend miner truth — read live XMRig status
    backend_running = False
    backend_hashrate = 0.0
    backend_pool = None
    try:
        import json as _json
        rx_path = "/app/backend/miner/randomx_status.json"
        if os.path.exists(rx_path):
            with open(rx_path) as f:
                rx = _json.load(f)
            backend_running = bool(rx.get("running"))
            backend_hashrate = float(rx.get("hashrate_hps") or 0.0)
            backend_pool = rx.get("pool")
    except Exception:
        pass

    mobile_native_hashrate = 0  # only > 0 once a real device heartbeat carries it

    # v1.4.10 — Network Effect Bonus surface for the public landing page.
    network_size = await _active_network_size()
    net_mult = network_multiplier(network_size)
    # Earnings table per tier @ current network size, surfaced on landing
    earnings_table = []
    for tier_id, daily_tgc in TIER_DAILY_TGC.items():
        boosted = daily_tgc * net_mult
        earnings_table.append({
            "tier": tier_id,
            "tier_label": {
                "core": "Core / Top Flagship",
                "flagship": "Flagship (S24, iPhone 15, Pixel 8)",
                "mid": "Standard / Mid-range",
                "budget": "Budget / Entry-level",
            }.get(tier_id, tier_id.title()),
            "daily_tgc": round(boosted, 2),
            "daily_usdt": round(boosted * USDT_PER_TGC, 3),
            "monthly_tgc": round(boosted * 30, 2),
            "monthly_usdt": round(boosted * 30 * USDT_PER_TGC, 2),
            "payout_days": int(round(WITHDRAW_THRESHOLD_TGC / max(0.01, boosted))),
            "base_daily_tgc": daily_tgc,
        })
    # Network milestones to render on landing (shows growth roadmap)
    milestones = [
        {"nodes": 1,      "multiplier": 1.0, "label": "Solo",            "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 1.0 * USDT_PER_TGC, 2)},
        {"nodes": 10,     "multiplier": 1.1, "label": "Seed",            "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 1.1 * USDT_PER_TGC, 2)},
        {"nodes": 50,     "multiplier": 1.3, "label": "Cluster",         "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 1.3 * USDT_PER_TGC, 2)},
        {"nodes": 100,    "multiplier": 1.5, "label": "Network",         "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 1.5 * USDT_PER_TGC, 2)},
        {"nodes": 500,    "multiplier": 2.0, "label": "Mesh",            "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 2.0 * USDT_PER_TGC, 2)},
        {"nodes": 1000,   "multiplier": 2.5, "label": "Grid",            "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 2.5 * USDT_PER_TGC, 2)},
        {"nodes": 5000,   "multiplier": 4.0, "label": "Supercomputer",   "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 4.0 * USDT_PER_TGC, 2)},
        {"nodes": 10000,  "multiplier": 5.5, "label": "Mega Grid",       "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 5.5 * USDT_PER_TGC, 2)},
        {"nodes": 50000,  "multiplier": 8.0, "label": "Founding Era",    "flagship_monthly_usdt": round(TIER_DAILY_TGC["flagship"] * 30 * 8.0 * USDT_PER_TGC, 2)},
    ]

    return {
        "connected_devices": total_devices,
        "active_devices": active_devices,
        "mining_devices": mining_devices,
        # User-facing labels — cloud-compute language only. No H/s, pool, share dialect.
        "mobile_native_hashrate_hps": mobile_native_hashrate,
        "mobile_native_hashrate_label": (
            "Active" if mobile_native_hashrate > 0 else "Waiting for verified output"
        ),
        "accepted_shares_total": mobile_accepted,
        "accepted_shares_label": (
            str(mobile_accepted) if mobile_accepted > 0 else "Waiting for verified output"
        ),
        # v1.4.10 NETWORK ECONOMY
        "network_size": network_size,
        "network_multiplier": net_mult,
        "next_milestone": next(
            (m for m in milestones if m["nodes"] > network_size),
            milestones[-1],
        ),
        "earnings_table": earnings_table,
        "network_milestones": milestones,
        "tgc_to_usdt": USDT_PER_TGC,
        "payout_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "payout_value_usdt": round(WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC, 2),
        "backend_miner": {
            "running": backend_running,
            "hashrate_hps": round(backend_hashrate, 2),
            # internal-only; never rendered as-is on user surface
            "_pool_internal": backend_pool,
            "status_label": (
                "Core engine online" if backend_running
                else "Core engine offline"
            ),
        },
        "apk": {
            "version": APK_VERSION,
            "native_lib_embedded": APK_NATIVE_EMBEDDED,
            "size_bytes": APK_SIZE,
            "download_url": APK_PATH,
        },
        "payout_wallet_verified": bool(os.environ.get("XMR_PAYOUT_ADDRESS")),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


# ---------- Admin ----------
@api.get("/admin/devices")
async def admin_devices(user: dict = Depends(require_admin)):
    rows = await db.devices.find({}, {"_id": 0}).sort("last_heartbeat", -1).to_list(500)
    return rows


@api.get("/admin/devices/live")
async def admin_devices_live(
    user: dict = Depends(require_admin),
    state: Optional[str] = None,            # 'active' | 'offline' | 'flagged' | 'all'
    platform: Optional[str] = None,         # 'android' | 'mobile' | 'web'
    android_version: Optional[str] = None,  # exact match
    app_version: Optional[str] = None,
    tier: Optional[str] = None,             # 'flagship' | 'mid' | 'budget'
    real_only: bool = True,                 # default REAL APK ONLY (v1.2.3 cleanup)
    show_demo: bool = False,                # explicit override to surface demo/test devices
    limit: int = 200,
):
    """
    Admin live device feed. Defaults to real Android APK clients only.
    Pass ?show_demo=true (or ?real_only=false) to include browser-simulated and demo devices.
    """
    now = datetime.now(timezone.utc)
    # iter-15 / v1.2.9: 90s online window (was 15s).  Reasoning — Android
    # APK heartbeats every 10s, JobSchedulerWatchdog can take up to 60s to
    # revive a killed service, so 90s of grace prevents the counter from
    # flapping to 0 during a brief OS-induced restart.
    OFFLINE_CUTOFF_SEC = 90
    offline_cutoff = (now - timedelta(seconds=OFFLINE_CUTOFF_SEC)).isoformat()

    q: dict = {}
    # If show_demo is False (default), exclude demo/seeded devices.
    if not show_demo and real_only:
        q["$or"] = [
            {"is_real_apk": True},
            {"$and": [
                {"platform": "android"},
                {"app_version": {"$exists": True, "$ne": None, "$ne": ""}},
            ]},
        ]
    elif not show_demo:
        # real_only=false but show_demo=false → still hide explicit demos
        q["is_demo"] = {"$ne": True}
    if platform: q["platform"] = platform
    if android_version: q["android_version"] = android_version
    if app_version: q["app_version"] = app_version
    if tier: q["model"] = tier
    if state == "active":
        q["status"] = "active"
        q["last_heartbeat"] = {"$gte": offline_cutoff}
    elif state == "offline":
        q["last_heartbeat"] = {"$lt": offline_cutoff}
    elif state == "flagged":
        q["flagged"] = True

    rows = await db.devices.find(q, {"_id": 0}).sort("last_heartbeat", -1).to_list(min(max(1, limit), 500))

    # Decorate with user email + online flag + age in seconds
    user_ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    users = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
            users[u["id"]] = u

    def _age(ts: Optional[str]) -> int:
        if not ts: return 99999
        try:
            t = datetime.fromisoformat(ts)
            if t.tzinfo is None: t = t.replace(tzinfo=timezone.utc)
            return int((now - t).total_seconds())
        except Exception:
            return 99999

    out = []
    for r in rows:
        u = users.get(r.get("user_id"), {})
        age = _age(r.get("last_heartbeat"))
        online = age <= OFFLINE_CUTOFF_SEC
        out.append({
            "id": r.get("id"),
            "id_short": (r.get("id") or "")[:8],
            "user_email": u.get("email"),
            "user_name": u.get("name"),
            "name": r.get("name"),
            "model": r.get("model"),
            "tier": r.get("model"),
            "platform": r.get("platform"),
            "manufacturer": r.get("manufacturer"),
            "brand": r.get("brand"),
            "android_version": r.get("android_version"),
            "os_version": r.get("os_version"),
            "app_version": r.get("app_version"),
            "is_emulator": bool(r.get("is_emulator")),
            "worker_state": r.get("worker_state", "idle"),
            "status": r.get("status", "idle"),
            "online": online,
            "last_heartbeat": r.get("last_heartbeat"),
            "last_seen_seconds": age,
            "session_tasks": r.get("session_tasks", 0),
            "session_tgc": round(float(r.get("session_tgc", 0.0)), 4),
            "tasks_completed": r.get("tasks_completed", 0),
            "battery": r.get("battery"),
            "charging": bool(r.get("charging")),
            "wifi": bool(r.get("wifi")),
            "permission": bool(r.get("permission")),
            "thermal": r.get("thermal"),
            "temperature_c": r.get("temperature_c"),
            "country": r.get("country"),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "flagged": bool(r.get("flagged")),
            "suspicious_heartbeat": bool(r.get("suspicious_heartbeat")),
            "last_ip": r.get("last_ip"),
            # iter-12 / v1.2.6 — direct stratum link state.
            # LINKED = phone successfully authorized on Binance Pool (worker visible upstream)
            # LOCAL ONLY = phone only talks to our backend, no upstream stratum
            "stratum_linked": bool(r.get("stratum_linked")),
            "stratum_last_linked_at": r.get("stratum_last_linked_at"),
            "assigned_coin": r.get("assigned_coin"),
            "hashrate_hps": float(r.get("hashrate_hps") or 0),
        })
    # Aggregate counters
    counters = {
        "total": len(out),
        "online": sum(1 for d in out if d["online"]),
        "active": sum(1 for d in out if d["status"] == "active"),
        "offline": sum(1 for d in out if not d["online"]),
        "flagged": sum(1 for d in out if d["flagged"]),
        "real_android": sum(1 for d in out if d.get("platform") == "android" or d.get("app_version")),
        # iter-12: split LINKED (real upstream stratum) vs LOCAL-ONLY among ONLINE devices
        "stratum_linked": sum(1 for d in out if d["online"] and d.get("stratum_linked")),
        "local_only": sum(1 for d in out if d["online"] and not d.get("stratum_linked")),
    }
    return {"devices": out, "counters": counters, "offline_cutoff_seconds": OFFLINE_CUTOFF_SEC,
            "show_demo": show_demo, "real_only": real_only}


@api.get("/admin/telemetry")
async def admin_telemetry(user: dict = Depends(require_admin), show_demo: bool = False):
    """High-level telemetry snapshot — defaults to REAL APK devices only."""
    now = datetime.now(timezone.utc)
    # iter-15 / v1.2.9: 90s window aligns with the eternal-worker JobScheduler
    # revival ceiling — counter holds steady through brief OS restarts.
    OFFLINE_CUTOFF_SEC = 90
    cutoff = (now - timedelta(seconds=OFFLINE_CUTOFF_SEC)).isoformat()
    real_q = {"$or": [
        {"is_real_apk": True},
        {"$and": [{"platform": "android"}, {"app_version": {"$exists": True, "$ne": None, "$ne": ""}}]},
    ]}
    real_total = await db.devices.count_documents(real_q)
    real_online = await db.devices.count_documents({**real_q, "last_heartbeat": {"$gte": cutoff}})
    real_active = await db.devices.count_documents({**real_q, "status": "active", "last_heartbeat": {"$gte": cutoff}})
    flagged = await db.devices.count_documents({"flagged": True, **({} if show_demo else {"is_demo": {"$ne": True}})})
    suspicious = await db.devices.count_documents({"suspicious_heartbeat": True})
    demo_total = await db.devices.count_documents({"is_demo": True}) if show_demo else None
    # iter-12: stratum-linked counters (real upstream pool authorized vs local-only)
    stratum_linked_online = await db.devices.count_documents({
        **real_q, "last_heartbeat": {"$gte": cutoff}, "stratum_linked": True
    })
    return {
        "real_android_total": real_total,
        "real_android_online": real_online,
        "real_android_active": real_active,
        "stratum_linked_online": stratum_linked_online,
        "local_only_online": max(0, real_online - stratum_linked_online),
        "flagged": flagged,
        "suspicious_heartbeat": suspicious,
        "demo_devices": demo_total,
        "offline_cutoff_seconds": OFFLINE_CUTOFF_SEC,
        "as_of": now.isoformat(),
    }


# ---------- Admin: Demo Device Wipe (iter-12 / v1.2.6) ----------
@api.post("/admin/devices/wipe-demo")
async def admin_wipe_demo_devices(user: dict = Depends(require_admin)):
    """
    Permanently delete every device flagged is_demo=true.
    Real physical devices (without is_demo flag) are NEVER touched.
    Returns the count deleted so the admin UI can display a confirmation toast.
    """
    res = await db.devices.delete_many({"is_demo": True})
    return {
        "ok": True,
        "deleted": int(res.deleted_count),
        "as_of": datetime.now(timezone.utc).isoformat(),
        "operator": user["email"],
    }


@api.post("/admin/devices/wipe-all-fake")
async def admin_wipe_all_fake_devices(user: dict = Depends(require_admin)):
    """
    Iter-14 / v1.2.8 TOTAL PURGE: delete every device that is NOT a real
    physical Android worker. Combines is_demo, seeded, test, and any device
    whose name starts with the historical seed prefixes. Devices flagged
    is_real_apk=true are NEVER touched.

    Returns per-bucket counts so the admin UI can render an honest summary.
    """
    or_filters = [
        {"is_demo": True},
        {"seeded": True},
        {"is_seed": True},
        {"is_test": True},
        {"id": {"$regex": "^(TEST|test)_"}},  # iter-20: catches every iter-7…13 test device
        {"id": {"$regex": "^(hb-iter|native-iter|burst-|emu-|TEST-)"}},
        {"name": {"$regex": "^(Test|TEST|Seed|Mock|Demo|Iter|Sim|First|Survivor|HappyPath|Cfg|Legacy|Shared|Burst|WS|Hot|Generic)", "$options": "i"}},
        {"name": {"$regex": "^(realsurvive|first_)"}},
    ]
    # iter-14 / v1.2.8 TOTAL PURGE: also remove every device that
    #   - has NEVER linked to Binance Pool (no stratum_first_linked_at), AND
    #   - is running an OUTDATED app_version (< v1.2.5, or missing) — these
    #     can only have come from pre-iter12 testing scripts; an authentic
    #     installer would carry v1.2.5+.
    or_filters.append({
        "$and": [
            {"$or": [
                {"stratum_first_linked_at": {"$exists": False}},
                {"stratum_first_linked_at": None},
            ]},
            {"$or": [
                {"app_version": {"$exists": False}},
                {"app_version": None},
                {"app_version": {"$lt": "1.2.5"}},
            ]},
        ]
    })
    safety = {}
    counts = {}
    for f in or_filters:
        counts[next(iter(f))] = await db.devices.count_documents({**f, **safety})
    res = await db.devices.delete_many({"$or": or_filters, **safety})
    return {
        "ok": True,
        "deleted": int(res.deleted_count),
        "by_bucket": counts,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "operator": user["email"],
    }


@api.post("/admin/devices/{device_id}/assign-class")
async def admin_assign_compute_class(
    device_id: str,
    payload: dict,
    user: dict = Depends(require_admin),
):
    """
    Iter-14 / v1.2.8: dispatch a per-device compute-class directive.
    Body: {"coin": "RVN" | "BTC" | "LTC" | ... | "AUTO"}
    The next /api/mining/config?device_id=... call from the device picks it up
    via device.assigned_coin → mining profile → algo + expected hashrate.
    """
    coin = (payload.get("coin") or "AUTO").strip().upper()
    valid_coins = {"AUTO", "RVN", "BTC", "LTC", "DASH", "KAS", "ETC", "ZEC",
                   "BCH", "CFX", "CKB", "ETHW"}
    if coin not in valid_coins:
        raise HTTPException(status_code=400, detail=f"unknown coin: {coin}")
    upd = {"assigned_coin": None if coin == "AUTO" else coin,
           "assigned_at": datetime.now(timezone.utc).isoformat(),
           "assigned_by": user["email"]}
    res = await db.devices.update_one({"id": device_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="device not found")
    return {"ok": True, "device_id": device_id, "assigned_coin": coin,
            "as_of": upd["assigned_at"], "operator": user["email"]}


# ---------- Admin: First Real Worker (iter-13 / v1.2.6.1) ----------
@api.get("/admin/first-real-worker")
async def admin_first_real_worker(user: dict = Depends(require_admin)):
    """
    Return the FIRST physical device that ever achieved a real Binance Pool
    stratum link (`stratum_first_linked_at` is set ONCE via $min on the very
    first LINKED heartbeat — never overwritten on reconnects).

    Response shape:
      - {first_worker: null, awaiting: true, ...}  → no device has linked yet
      - {first_worker: {...full device profile...}, awaiting: false, ...}
    The 'first_worker' object is admin-curated (no _id, no internal IPs leak).
    """
    now = datetime.now(timezone.utc)
    OFFLINE_CUTOFF_SEC = 60  # First Worker card relaxes online window
    cutoff = (now - timedelta(seconds=OFFLINE_CUTOFF_SEC)).isoformat()
    # Find the device with the smallest stratum_first_linked_at
    dev = await db.devices.find_one(
        {"stratum_first_linked_at": {"$exists": True, "$ne": None}},
        sort=[("stratum_first_linked_at", 1)],
        projection={"_id": 0, "last_ip": 0, "hb_window": 0, "hb_burst_pending": 0},
    )
    total_linked_ever = await db.devices.count_documents(
        {"stratum_first_linked_at": {"$exists": True, "$ne": None}}
    )
    if not dev:
        return {
            "first_worker": None,
            "awaiting": True,
            "total_linked_ever": 0,
            "as_of": now.isoformat(),
            "message": "Awaiting first physical worker · install v1.2.6 APK and tap START on a charged device on Wi-Fi",
        }
    # Decorate with user email + first-link relative time + currently-online flag
    user_doc = await db.users.find_one({"id": dev.get("user_id")}, {"_id": 0, "email": 1, "name": 1, "country": 1})
    last_hb = dev.get("last_heartbeat") or ""
    online = bool(last_hb and last_hb >= cutoff)
    try:
        first_at = datetime.fromisoformat(dev["stratum_first_linked_at"])
        if first_at.tzinfo is None:
            first_at = first_at.replace(tzinfo=timezone.utc)
        seconds_since_first = int((now - first_at).total_seconds())
    except Exception:
        seconds_since_first = None
    payload = {
        "id": dev.get("id"),
        "id_short": (dev.get("id") or "")[:8],
        "name": dev.get("name"),
        "manufacturer": dev.get("manufacturer") or dev.get("brand"),
        "brand": dev.get("brand"),
        "model": dev.get("model"),
        "tier": dev.get("model"),
        "platform": dev.get("platform"),
        "android_version": dev.get("android_version") or dev.get("os_version"),
        "app_version": dev.get("app_version"),
        "country": dev.get("country"),
        "lat": dev.get("lat"),
        "lng": dev.get("lng"),
        "battery": dev.get("battery"),
        "charging": bool(dev.get("charging")),
        "wifi": bool(dev.get("wifi")),
        "temperature_c": dev.get("temperature_c"),
        "user_email": (user_doc or {}).get("email"),
        "user_name": (user_doc or {}).get("name"),
        "stratum_first_linked_at": dev.get("stratum_first_linked_at"),
        "stratum_last_linked_at": dev.get("stratum_last_linked_at"),
        "stratum_linked_now": bool(dev.get("stratum_linked")),
        "online_now": online,
        "last_heartbeat": last_hb,
        "session_tasks": dev.get("session_tasks", 0),
        "session_tgc": round(float(dev.get("session_tgc", 0.0)), 4),
        "binance_worker_name": (
            f"{ADMIN_BINANCE_ID}.{(dev.get('id') or '')[:8]}"
            if dev.get("id") else None
        ),
        "seconds_since_first_link": seconds_since_first,
    }
    return {
        "first_worker": payload,
        "awaiting": False,
        "total_linked_ever": total_linked_ever,
        "as_of": now.isoformat(),
    }


# ---------- Binance-Pool status (RVN stratum proxy) ----------
# The full implementation has been extracted to routers/pool.py as part of the
# v1.2.4 modularization. server.py now just registers the router below.


@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return rows


@api.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, user: dict = Depends(require_admin)):
    """v1.6.0 — Suspend a user. Blocks login + every protected endpoint."""
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="user_not_found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="cannot_ban_admin")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_banned": True,
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "banned_by": user["id"],
        }},
    )
    return {"ok": True, "user_id": user_id, "is_banned": True}


@api.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: str, user: dict = Depends(require_admin)):
    """v1.6.0 — Reinstate a previously suspended user."""
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="user_not_found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_banned": False,
            "unbanned_at": datetime.now(timezone.utc).isoformat(),
            "unbanned_by": user["id"],
        }},
    )
    return {"ok": True, "user_id": user_id, "is_banned": False}


@api.get("/admin/buybacks")
async def admin_buybacks_list(user: dict = Depends(require_admin)):
    """v1.6.0 — All Foundation Buyback applications, newest first."""
    rows = await db.buyback_applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/buybacks/{application_id}/approve")
async def admin_buybacks_approve(application_id: str, user: dict = Depends(require_admin)):
    """v1.6.0 — Approve a Foundation Buyback application.

    On approval we PERMANENTLY burn the eligibility threshold of TGC from the
    contributor's balance (settlement happens off-platform). The deduction is
    written as a negative `tgc_ledger` row (kind='buyback_burn') for audit.
    """
    app_row = await db.buyback_applications.find_one({"id": application_id}, {"_id": 0})
    if not app_row:
        raise HTTPException(status_code=404, detail="application_not_found")
    if app_row.get("status") == "approved":
        return {"ok": True, "status": "already_approved", "application": app_row}

    target_tgc = float(app_row.get("target_tgc") or 0.0)
    user_id = app_row["user_id"]

    me = await db.users.find_one({"id": user_id}, {"_id": 0, "tgc_balance": 1, "email": 1})
    if not me:
        raise HTTPException(status_code=404, detail="contributor_not_found")
    current = float(me.get("tgc_balance") or 0.0)
    if current < target_tgc:
        raise HTTPException(status_code=409, detail="insufficient_tgc_balance")

    # Burn the threshold: negative ledger row + atomic balance decrement
    burn_id = str(uuid.uuid4())
    await db.tgc_ledger.insert_one({
        "id": burn_id,
        "user_id": user_id,
        "device_id": None,
        "tgc": -target_tgc,
        "usdt_value": -round(target_tgc * USDT_PER_TGC, 6),
        "kind": "buyback_burn",
        "application_id": application_id,
        "approved_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"tgc_balance": -target_tgc}},
    )
    await db.buyback_applications.update_one(
        {"id": application_id},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": user["id"],
            "burned_tgc": target_tgc,
            "burn_ledger_id": burn_id,
        }},
    )
    updated = await db.buyback_applications.find_one({"id": application_id}, {"_id": 0})
    return {"ok": True, "status": "approved", "burned_tgc": target_tgc, "application": updated}


@api.post("/admin/buybacks/{application_id}/reject")
async def admin_buybacks_reject(application_id: str, user: dict = Depends(require_admin)):
    """v1.6.0 — Reject a Foundation Buyback application (no TGC deduction)."""
    app_row = await db.buyback_applications.find_one({"id": application_id}, {"_id": 0})
    if not app_row:
        raise HTTPException(status_code=404, detail="application_not_found")
    if app_row.get("status") in ("approved", "rejected"):
        return {"ok": True, "status": app_row["status"], "application": app_row}
    await db.buyback_applications.update_one(
        {"id": application_id},
        {"$set": {
            "status": "rejected",
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "rejected_by": user["id"],
        }},
    )
    updated = await db.buyback_applications.find_one({"id": application_id}, {"_id": 0})
    return {"ok": True, "status": "rejected", "application": updated}


# ---------- v1.7.5 Client Type Telemetry & AdMob Config ----------
@api.get("/admin/client-stats")
async def admin_client_stats(user: dict = Depends(require_admin)):
    """Light vs Node Pro split across the entire network."""
    # Devices by client_type
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    dev_total: dict = {"light": 0, "node_pro": 0, "unknown": 0}
    dev_active: dict = {"light": 0, "node_pro": 0, "unknown": 0}
    async for row in db.devices.aggregate([
        {"$group": {"_id": "$client_type", "count": {"$sum": 1}}},
    ]):
        k = (row["_id"] or "unknown")
        dev_total[k] = dev_total.get(k, 0) + int(row["count"])
    async for row in db.devices.aggregate([
        {"$match": {"last_heartbeat": {"$gte": cutoff_iso}}},
        {"$group": {"_id": "$client_type", "count": {"$sum": 1}}},
    ]):
        k = (row["_id"] or "unknown")
        dev_active[k] = dev_active.get(k, 0) + int(row["count"])

    # TGC issued by client_type (positive entries only)
    tgc_by_client: dict = {}
    async for row in db.tgc_ledger.aggregate([
        {"$match": {"tgc": {"$gt": 0}}},
        {"$group": {"_id": "$client_type", "sum": {"$sum": "$tgc"}}},
    ]):
        tgc_by_client[row["_id"] or "unknown"] = round(float(row["sum"] or 0), 5)

    # Daily calibration breakdown
    calib_total      = await db.daily_calibrations.count_documents({})
    calib_with_ad    = await db.daily_calibrations.count_documents({"ad_completed": True})
    calib_light      = await db.daily_calibrations.count_documents({"client_type": "light"})
    calib_today      = await db.daily_calibrations.count_documents({"date_key": _today_utc_key()})

    # Risk flags by client type
    risk_by_client: dict = {}
    async for row in db.devices.aggregate([
        {"$match": {"risk_flagged": True}},
        {"$group": {"_id": "$client_type", "count": {"$sum": 1}}},
    ]):
        risk_by_client[row["_id"] or "unknown"] = int(row["count"])

    return {
        "devices_total_by_client":  dev_total,
        "devices_active_by_client": dev_active,
        "tgc_issued_by_client":     tgc_by_client,
        "calibration": {
            "total_claims":         calib_total,
            "claims_with_ad":       calib_with_ad,
            "claims_from_light":    calib_light,
            "claims_today":         calib_today,
            "ad_completion_rate":   (calib_with_ad / max(1, calib_total)) if calib_total else 0.0,
        },
        "risk_flags_by_client":     risk_by_client,
        "as_of":                    datetime.now(timezone.utc).isoformat(),
    }


_ADMOB_TEST_APP_ID            = "ca-app-pub-3940256099942544~3347511713"
_ADMOB_TEST_REWARDED_UNIT_ID  = "ca-app-pub-3940256099942544/5224354917"
_ADMOB_TEST_INTERSTITIAL_UNIT = "ca-app-pub-3940256099942544/1033173712"


def _admob_runtime_config() -> dict:
    """Build the AdMob payload that ships to the Light APK.

    Precedence:
      1. If ADMOB_TEST_MODE=true → ALWAYS return Google's official test IDs.
      2. Else use the .env real IDs (ADMOB_ANDROID_APP_ID, ADMOB_REWARDED_AD_UNIT_ID, …).
      3. Else if real IDs are missing while TEST_MODE=false → return ad_mode='disabled'
         so the client falls back to a "config missing" state instead of serving fake ads.
    No real production IDs are ever hardcoded in source — they ONLY come from .env.
    """
    enabled    = (os.environ.get("ADMOB_ENABLED", "true").lower() == "true")
    test_mode  = (os.environ.get("ADMOB_TEST_MODE", "true").lower() == "true")
    real_app   = (os.environ.get("ADMOB_ANDROID_APP_ID")          or "").strip()
    real_rew   = (os.environ.get("ADMOB_REWARDED_AD_UNIT_ID")     or "").strip()
    real_int   = (os.environ.get("ADMOB_INTERSTITIAL_AD_UNIT_ID") or "").strip()

    if not enabled:
        return {
            "id":                             "global",
            "admob_enabled":                  False,
            "admob_test_mode":                False,
            "ad_mode":                        "disabled",
            "admob_app_id":                   "",
            "admob_rewarded_ad_unit_id":      "",
            "admob_interstitial_ad_unit_id":  "",
        }

    if test_mode:
        return {
            "id":                             "global",
            "admob_enabled":                  True,
            "admob_test_mode":                True,
            "ad_mode":                        "test",
            "admob_app_id":                   _ADMOB_TEST_APP_ID,
            "admob_rewarded_ad_unit_id":      _ADMOB_TEST_REWARDED_UNIT_ID,
            "admob_interstitial_ad_unit_id":  _ADMOB_TEST_INTERSTITIAL_UNIT,
        }

    # Production mode — real IDs MUST come from .env. If any is missing, fail safe.
    if not (real_app and real_rew):
        return {
            "id":                             "global",
            "admob_enabled":                  True,
            "admob_test_mode":                False,
            "ad_mode":                        "disabled",
            "admob_app_id":                   "",
            "admob_rewarded_ad_unit_id":      "",
            "admob_interstitial_ad_unit_id":  "",
            "config_error":                   "production_ids_missing_in_env",
        }
    return {
        "id":                             "global",
        "admob_enabled":                  True,
        "admob_test_mode":                False,
        "ad_mode":                        "production",
        "admob_app_id":                   real_app,
        "admob_rewarded_ad_unit_id":      real_rew,
        "admob_interstitial_ad_unit_id":  real_int,
    }


@api.get("/admob/config")
async def admob_config_public():
    """Returned to the Light APK at startup. NodePro never calls this.

    Resolution order:
      1. backend/.env (ADMOB_TEST_MODE, ADMOB_ANDROID_APP_ID, …) — primary
      2. db.admob_config({id:'global'}) — operator runtime override (no redeploy)
    """
    cfg = _admob_runtime_config()
    override = await db.admob_config.find_one({"id": "global"}, {"_id": 0})
    if override:
        # Whitelist of operator-overridable keys.
        for k in ("admob_app_id", "admob_rewarded_ad_unit_id",
                  "admob_interstitial_ad_unit_id", "admob_test_mode",
                  "admob_enabled"):
            if k in override and override[k] not in (None, ""):
                cfg[k] = override[k]
        # Recompute ad_mode after override.
        if cfg.get("admob_enabled") is False:
            cfg["ad_mode"] = "disabled"
        elif cfg.get("admob_test_mode") is True:
            cfg["ad_mode"] = "test"
            # Force test IDs whenever test mode is active.
            cfg["admob_app_id"]                  = _ADMOB_TEST_APP_ID
            cfg["admob_rewarded_ad_unit_id"]     = _ADMOB_TEST_REWARDED_UNIT_ID
            cfg["admob_interstitial_ad_unit_id"] = _ADMOB_TEST_INTERSTITIAL_UNIT
        elif cfg.get("admob_app_id") and cfg.get("admob_rewarded_ad_unit_id"):
            cfg["ad_mode"] = "production"
        else:
            cfg["ad_mode"]       = "disabled"
            cfg["config_error"]  = "production_ids_missing_in_override"
        cfg["override_active"] = True
        cfg["override_updated_at"] = override.get("updated_at")
    cfg["updated_at"] = datetime.now(timezone.utc).isoformat()
    return cfg


@api.get("/admin/admob/config")
async def admob_config_admin(user: dict = Depends(require_admin)):
    cfg = await admob_config_public()
    cfg["env_source"] = {
        "ADMOB_ENABLED":                bool((os.environ.get("ADMOB_ENABLED", "true").lower() == "true")),
        "ADMOB_TEST_MODE":              bool((os.environ.get("ADMOB_TEST_MODE", "true").lower() == "true")),
        "ADMOB_ANDROID_APP_ID_set":     bool((os.environ.get("ADMOB_ANDROID_APP_ID") or "").strip()),
        "ADMOB_REWARDED_AD_UNIT_ID_set":bool((os.environ.get("ADMOB_REWARDED_AD_UNIT_ID") or "").strip()),
    }
    return cfg


@api.post("/admin/admob/config")
async def admob_config_write(payload: dict, user: dict = Depends(require_admin)):
    """Operator override stored in MongoDB (does NOT mutate .env).
    Used for emergency test/production toggles without redeploy.
    """
    allowed = ["admob_app_id", "admob_rewarded_ad_unit_id",
               "admob_interstitial_ad_unit_id", "admob_test_mode", "admob_enabled"]
    update: dict = {k: payload[k] for k in allowed if k in payload}
    if "admob_test_mode" in update:
        update["admob_test_mode"] = bool(update["admob_test_mode"])
    if "admob_enabled" in update:
        update["admob_enabled"] = bool(update["admob_enabled"])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = user["email"]
    await db.admob_config.update_one(
        {"id": "global"},
        {"$set": update, "$setOnInsert": {"id": "global"}},
        upsert=True,
    )
    return await admob_config_public()


@api.get("/admin/payouts")
async def admin_payouts(user: dict = Depends(require_admin)):
    rows = await db.payouts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/payouts/{payout_id}/approve")
async def approve_payout(payout_id: str, user: dict = Depends(require_admin)):
    p = await db.payouts.find_one({"id": payout_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found")
    await db.payouts.update_one({"id": payout_id}, {"$set": {
        "status": "completed",
        "tx_hash": "0x" + secrets.token_hex(32),
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True}


@api.post("/admin/devices/{device_id}/flag")
async def flag_device(device_id: str, user: dict = Depends(require_admin)):
    await db.devices.update_one({"id": device_id}, {"$set": {"flagged": True}})
    return {"ok": True}


@api.post("/admin/devices/{device_id}/unflag")
async def unflag_device(device_id: str, user: dict = Depends(require_admin)):
    await db.devices.update_one({"id": device_id}, {"$set": {"flagged": False}})
    return {"ok": True}


@api.get("/admin/fraud")
async def admin_fraud(user: dict = Depends(require_admin)):
    flagged = await db.devices.find({"flagged": True}, {"_id": 0}).to_list(500)
    rejected_tasks = await db.tasks.count_documents({"status": "rejected"})
    return {"flagged_devices": flagged, "rejected_tasks": rejected_tasks}


# ---------- Customer / Jobs ----------
async def require_customer(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("customer", "admin"):
        raise HTTPException(status_code=403, detail="Customer access required")
    return user


@api.post("/jobs")
async def create_job(data: JobCreateIn, user: dict = Depends(require_customer)):
    rate = round(data.budget_usdt / max(1, data.total_units), 6)
    priority = data.priority if data.priority in PRIORITY_MULT else "standard"
    job_id = str(uuid.uuid4())
    doc = {
        "id": job_id,
        "customer_id": user["id"],
        "customer_email": user["email"],
        "customer_name": user.get("company") or user.get("name") or user["email"],
        "name": data.name,
        "file_name": data.file_name,
        "file_size": data.file_size,
        "description": data.description or "",
        "total_units": data.total_units,
        "processed_units": 0,
        "budget_usdt": data.budget_usdt,
        "spent_usdt": 0.0,
        "rate_per_unit": rate,
        "max_nodes": data.max_nodes,
        "workload_type": data.workload_type,
        "priority": priority,
        "status": "pending",  # pending -> running -> completed | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.jobs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/jobs")
async def list_my_jobs(user: dict = Depends(require_customer)):
    rows = await db.jobs.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@api.get("/jobs/{job_id}")
async def get_my_job(job_id: str, user: dict = Depends(require_customer)):
    j = await db.jobs.find_one({"id": job_id, "customer_id": user["id"]}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    return j


@api.get("/admin/jobs")
async def admin_jobs(user: dict = Depends(require_admin)):
    rows = await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api.post("/admin/jobs/{job_id}/approve")
async def approve_job(job_id: str, user: dict = Depends(require_admin)):
    j = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    if j["status"] not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot approve job in '{j['status']}' state")
    await db.jobs.update_one({"id": job_id}, {"$set": {
        "status": "running",
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": user["email"],
    }})
    return {"ok": True}


@api.post("/admin/jobs/{job_id}/reject")
async def reject_job(job_id: str, user: dict = Depends(require_admin)):
    j = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.jobs.update_one({"id": job_id}, {"$set": {
        "status": "rejected",
        "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejected_by": user["email"],
    }})
    return {"ok": True}


@api.get("/admin/ledger")
async def admin_ledger(user: dict = Depends(require_admin)):
    """Real ledger — excludes is_demo=true jobs/users/payouts so the dashboard
    reflects only authentic compute work, never seeded demo data."""
    real_user_match = {"role": "user", "is_demo": {"$ne": True}}
    real_job_match = {"is_demo": {"$ne": True}}
    real_payout_match = {"is_demo": {"$ne": True}}

    # Revenue from customers = sum of revenue_usdt across verified, real jobs
    rev_pipeline = [{"$match": real_job_match},
                    {"$group": {"_id": None, "total": {"$sum": "$spent_usdt"}}}]
    rev_agg = await db.jobs.aggregate(rev_pipeline).to_list(1)
    revenue = round(rev_agg[0]["total"] if rev_agg else 0.0, 6)

    # Worker payouts owed = sum of real users.balance_usdt
    user_owed = await db.users.aggregate([
        {"$match": real_user_match},
        {"$group": {"_id": None, "owed": {"$sum": "$balance_usdt"},
                    "earned": {"$sum": "$total_earned"}}},
    ]).to_list(1)
    owed = round(user_owed[0]["owed"] if user_owed else 0.0, 6)
    paid_out = await db.payouts.aggregate([
        {"$match": {**real_payout_match, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usdt"}}},
    ]).to_list(1)
    paid = round(paid_out[0]["total"] if paid_out else 0.0, 6)
    total_earned = round((user_owed[0]["earned"] if user_owed else 0.0), 6)

    pending_payouts = await db.payouts.aggregate([
        {"$match": {**real_payout_match, "status": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usdt"}}},
    ]).to_list(1)
    pending = round(pending_payouts[0]["total"] if pending_payouts else 0.0, 6)

    # Real RVN payout pool stats — only meaningful when RVN_PAYOUT_ADDRESS is set.
    rvn_addr = os.environ.get("RVN_PAYOUT_ADDRESS", "").strip() or None
    return {
        "revenue_usdt": revenue,
        "worker_owed_usdt": owed,
        "worker_paid_usdt": paid,
        "worker_total_earned_usdt": total_earned,
        "pending_withdrawals_usdt": pending,
        "platform_margin_usdt": round(max(0.0, revenue - total_earned), 6),
        # iter-16 / v1.3.1: surfaces operator's real RVN payout address
        # (placeholder until set in env). Frontend uses this to swap fake
        # USDT cards for an "External Pool" panel when configured.
        "rvn_payout_address": rvn_addr,
        "external_pool_url": (
            f"https://unmineable.com/coins/RVN/address/{rvn_addr}" if rvn_addr else None
        ),
    }


# ---------- APK Distribution ----------
@api.get("/apk/version")
async def apk_version():
    """Latest APK metadata for the auto-update banner."""
    return {
        "version": APK_VERSION,
        "download_url": APK_PATH,
        "min_android": "7.0",
        "min_sdk": 24,
        "abi": ["arm64-v8a"],
        "release_notes": APK_RELEASE_NOTES,
        "released_at": "2026-05-09",
        "size_bytes": APK_SIZE,
        "sha256": APK_SHA256,
        "signature_schemes": ["v2", "v3"],
        "signed": True,
        "native_lib_embedded": APK_NATIVE_EMBEDDED,
        "native_lib_sha256": APK_NATIVE_SHA256,
        "native_lib_size": APK_NATIVE_SIZE,
        "native_lib_path": "lib/arm64-v8a/librandomx.so",
        "engine": "RandomX (NDK r28, light mode, 1-4 threads)" if APK_NATIVE_EMBEDDED else "wrapper-only (no native engine)",
        "features": [
            "foreground_service",
            "background_heartbeat",
            "background_compute",
            "golden_rule_auto_pause",
            "persistent_state",
            "wake_lock",
            "js_bridge",
            "boot_completed_restart",
            "daily_digest_notification",
            "power_up_expiry_reminder",
            "sliding_window_fraud_detection",
            "native_matrix_task",
            "stop_notification_action",
            "simplified_user_ui",
            "advanced_mode_unlock",
            "binance_pool_worker_registration",
            "plan_a_randomx_engine",
            "plan_b_backend_compute",
            "telegram_signal_line",
            "telegram_milestone_first_payout",
            "live_operator_console_ws",
            "global_cyber_cyan_theme",
            "native_randomx_mobile_jni",
            "explicit_start_stop_mining",
            "mobile_mining_safety_guards",
            "honest_mining_status_telemetry",
            "ws_stratum_bridge_v138",
            "session_nonce_anti_spoof_v2",
            "real_mobile_share_submission",
        ],
    }


# ---------- v1.7.5 Dual-APK metadata ----------
def _apk_flavor_meta(basename: str, expect_native: bool) -> dict:
    """Read live APK off disk for honest size + sha256 + native_lib presence."""
    import hashlib, zipfile
    apk_fs = os.path.join("/app/frontend/public", basename)
    out = {
        "basename":            basename,
        "download_url":        "/" + basename,
        "size_bytes":          0,
        "sha256":              "",
        "native_lib_embedded": False,
        "admob_included":      False,
        "available":           False,
    }
    try:
        with open(apk_fs, "rb") as f:
            data = f.read()
        out["size_bytes"] = len(data)
        out["sha256"]     = hashlib.sha256(data).hexdigest()
        out["available"]  = True
        with zipfile.ZipFile(apk_fs) as z:
            names = z.namelist()
            for cand in ("lib/arm64-v8a/librandomx.so", "lib/armeabi-v7a/librandomx.so"):
                if cand in names:
                    out["native_lib_embedded"] = True
                    break
            # AdMob SDK detection: look for play-services-ads classes inside dex.
            # Simplest heuristic — presence of an AdMob-related META file or
            # class would imply SDK bundling. For the current CLI-only pipeline
            # we just declare based on flavor expectation.
        out["admob_included"] = (basename.endswith("-light.apk"))
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return out


@api.get("/apk/dual-version")
async def apk_dual_version():
    """v1.7.5 — honest metadata for both APK flavors. Used by Landing's
    dual-installer panel so each artifact gets its own QR + checksum."""
    light   = _apk_flavor_meta("grid-worker-light.apk",   expect_native=False)
    nodepro = _apk_flavor_meta("grid-worker-nodepro.apk", expect_native=True)
    return {
        "version":     APK_VERSION,
        "released_at": "2026-05-20",
        "min_android": "7.0",
        "abi":         ["arm64-v8a"],
        "signed":      True,
        "light": {
            **light,
            "package":              "io.thegrid.light",
            "label":                "THE GRID Light",
            "client_type":          "light",
            "tagline":              "Official cloud client · store-safe · NO device-side cryptocurrency mining.",
            "device_side_mining":   False,
            "admob_enabled":        True,
        },
        "node_pro": {
            **nodepro,
            "package":              "io.thegrid.nodepro",
            "label":                "THE GRID Node Pro",
            "client_type":          "node_pro",
            "tagline":              "Direct infrastructure client · explicit opt-in for device-side workloads.",
            "device_side_mining":   True,
            "admob_enabled":        False,
        },
    }


@api.get("/notifications/digest")
async def notifications_digest(user: dict = Depends(get_current_user)):
    """
    Daily session digest payload + Power-Up expiry reminder for the native worker.
    Worker polls this once per ~6h and posts a local notification when due.
    """
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
    # Aggregate today's verified tasks for this user across all devices
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_agg = await db.tasks.aggregate([
        {"$match": {"user_id": user["id"], "status": "verified", "completed_at": {"$gte": start_of_day}}},
        {"$group": {"_id": None, "tasks": {"$sum": 1}, "tgc": {"$sum": "$earned_tgc"}}},
    ]).to_list(1)
    tasks_today = int(today_agg[0]["tasks"]) if today_agg else 0
    tgc_today = round(float(today_agg[0]["tgc"]), 4) if today_agg else 0.0
    pu_seconds = _power_up_remaining_seconds(u.get("power_up_at"))
    pu_hours = round(pu_seconds / 3600, 1)
    powered_up = _is_powered_up(u.get("power_up_at"))
    digest_title = "THE GRID · Daily Compute Digest"
    if tasks_today > 0:
        digest_body = (f"Today you completed {tasks_today} verification "
                       f"task{'s' if tasks_today != 1 else ''} · earned {tgc_today:.2f} TGC")
    else:
        digest_body = "No compute today · tap Power Up to start earning TGC"
    if powered_up and pu_hours > 0:
        digest_body += f" · Power-Up expires in {pu_hours}h"
    elif not powered_up:
        digest_body += " · Power-Up has expired"
    # Power-Up warning: <3h remaining
    pu_warning = None
    if powered_up and 0 < pu_seconds <= 3 * 3600:
        pu_warning = {
            "title": "Power-Up expiring soon",
            "body": f"Tap Power Up — only {pu_hours}h left to keep your worker connected.",
            "expires_in_seconds": pu_seconds,
        }
    return {
        "digest": {"title": digest_title, "body": digest_body,
                   "tasks_today": tasks_today, "tgc_today": tgc_today,
                   "powered_up": powered_up, "power_up_hours_remaining": pu_hours},
        "power_up_warning": pu_warning,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


def _client_ip(request: Request) -> str:
    """Return the real client IP, honoring X-Forwarded-For from the kubernetes ingress."""
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


@api.post("/apk/track-download")
async def track_apk_download(request: Request):
    """Lightweight rate-limited download counter."""
    ip = _client_ip(request)
    now = datetime.now(timezone.utc)
    # Simple rate limit: 5 downloads / IP / minute
    recent = await db.apk_downloads.count_documents({
        "ip": ip,
        "ts": {"$gte": (now - timedelta(minutes=1)).isoformat()},
    })
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Download rate limit hit. Please wait a minute.")
    await db.apk_downloads.insert_one({
        "id": str(uuid.uuid4()),
        "ip": ip,
        "version": APK_VERSION,
        "ts": now.isoformat(),
    })
    total = await db.apk_downloads.count_documents({})
    return {"ok": True, "total_downloads": total}


# ---------- Admin: Auto-Mining + Hashrate ----------
@api.get("/admin/auto-mining")
async def get_auto_mining(user: dict = Depends(require_admin)):
    cfg = await db.config.find_one({"key": "auto_mining"}, {"_id": 0}) or {}
    return {"enabled": cfg.get("enabled", True)}


@api.post("/admin/auto-mining")
async def set_auto_mining(payload: dict, user: dict = Depends(require_admin)):
    enabled = bool(payload.get("enabled", True))
    await db.config.update_one(
        {"key": "auto_mining"},
        {"$set": {"key": "auto_mining", "enabled": enabled,
                  "updated_at": datetime.now(timezone.utc).isoformat(),
                  "updated_by": user["email"]}},
        upsert=True,
    )
    return {"ok": True, "enabled": enabled}


@api.get("/admin/hashrate")
async def hashrate_series(user: dict = Depends(require_admin)):
    """Per-minute hashrate series for the last 30 minutes."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=30)).isoformat()
    rows = await db.tasks.find(
        {"status": "verified", "completed_at": {"$gte": cutoff}},
        {"_id": 0, "completed_at": 1, "flops": 1, "kind": 1, "compute_ms": 1},
    ).to_list(5000)
    buckets = {}
    for i in range(30):
        ts = now - timedelta(minutes=29 - i)
        key = ts.strftime("%H:%M")
        buckets[key] = {"label": key, "hashes": 0, "flops": 0, "tasks": 0}
    for r in rows:
        try:
            ts = datetime.fromisoformat(r["completed_at"])
        except Exception:
            continue
        key = ts.strftime("%H:%M")
        if key in buckets:
            buckets[key]["tasks"] += 1
            buckets[key]["flops"] += r.get("flops", 0)
            if r.get("kind") == "hash":
                # ~65k hashes per task @ difficulty 4
                buckets[key]["hashes"] += 65000
    series = list(buckets.values())
    total_hashrate = sum(b["hashes"] for b in series) / 60.0  # H/s averaged
    return {
        "series": series,
        "total_hashrate_hps": round(total_hashrate, 2),
        "total_tasks": sum(b["tasks"] for b in series),
    }


# ---------- Customer: Job Results Export + API Key ----------
@api.get("/jobs/{job_id}/results.json")
async def export_results_json(job_id: str, user: dict = Depends(require_customer)):
    j = await db.jobs.find_one({"id": job_id, "customer_id": user["id"]}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    rows = await db.tasks.find(
        {"job_id": job_id, "status": "verified"},
        {"_id": 0, "expected": 0},
    ).sort("completed_at", 1).to_list(10000)
    return {"job": j, "results": rows, "count": len(rows)}


@api.get("/jobs/{job_id}/results.csv")
async def export_results_csv(job_id: str, user: dict = Depends(require_customer)):
    from fastapi.responses import StreamingResponse
    import io, csv
    j = await db.jobs.find_one({"id": job_id, "customer_id": user["id"]}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    rows = await db.tasks.find(
        {"job_id": job_id, "status": "verified"},
        {"_id": 0, "expected": 0},
    ).sort("completed_at", 1).to_list(10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["task_id", "kind", "device_id", "compute_ms", "flops", "result", "completed_at", "earned_usdt", "revenue_usdt"])
    for r in rows:
        w.writerow([r.get("id", ""), r.get("kind", ""), r.get("device_id", ""),
                    r.get("compute_ms", ""), r.get("flops", ""),
                    r.get("result", ""), r.get("completed_at", ""),
                    r.get("earned_usdt", ""), r.get("revenue_usdt", "")])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=grid_job_{job_id[:8]}.csv"})


@api.post("/customer/api-key/regenerate")
async def regenerate_api_key(user: dict = Depends(require_customer)):
    new_key = "grid_" + secrets.token_urlsafe(28)
    await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": new_key}})
    return {"api_key": new_key}


@api.get("/customer/api-key")
async def get_api_key(user: dict = Depends(require_customer)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "api_key": 1})
    key = (u or {}).get("api_key")
    if not key:
        key = "grid_" + secrets.token_urlsafe(28)
        await db.users.update_one({"id": user["id"]}, {"$set": {"api_key": key}})
    return {"api_key": key}


# ---------- Referrals ----------
@api.get("/referrals")
async def my_referrals(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    # Backfill referral_code for legacy accounts
    if not u.get("referral_code"):
        new_code = secrets.token_hex(4).upper()
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": new_code}})
        u["referral_code"] = new_code
    referrals = await db.users.find({"referred_by": user["id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1, "total_earned": 1, "created_at": 1}).to_list(500)
    return {
        "referral_code": u.get("referral_code"),
        "referral_link_path": f"/register?ref={u.get('referral_code', '')}",
        "referral_earnings": u.get("referral_earnings", 0.0),
        "referrals": referrals,
        "commission_rate": REFERRAL_RATE,
    }


@api.get("/referrals/share-card")
async def referral_share_card(user: dict = Depends(get_current_user)):
    """Returns SVG markup of a shareable Proof-of-Earning card."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    code = u.get("referral_code", "GRID")
    earned = u.get("total_earned", 0.0)
    name = u.get("name", "Operator")
    # Simple matrix-style QR-like pattern (deterministic from code)
    cells = []
    h = 0
    for ch in code:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    for r in range(11):
        for c in range(11):
            h = (h * 1664525 + 1013904223) & 0xFFFFFFFF
            if (h & 1) and not (r in (0, 10) and c in (0, 10)):
                cells.append((r, c))
    rects = "".join(
        f'<rect x="{420 + c*14}" y="{260 + r*14}" width="12" height="12" fill="#0A0A0A"/>'
        for r, c in cells
    )
    # corner squares
    for cx, cy in [(420, 260), (420 + 10*14, 260), (420, 260 + 10*14)]:
        rects += f'<rect x="{cx}" y="{cy}" width="40" height="40" fill="none" stroke="#0A0A0A" stroke-width="6"/>'
        rects += f'<rect x="{cx+12}" y="{cy+12}" width="16" height="16" fill="#0A0A0A"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="430" viewBox="0 0 600 430">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A0A0A"/>
      <stop offset="100%" stop-color="#1a1208"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F2C94C"/>
      <stop offset="100%" stop-color="#B8860B"/>
    </linearGradient>
  </defs>
  <rect width="600" height="430" fill="url(#bg)" rx="24"/>
  <rect x="2" y="2" width="596" height="426" fill="none" stroke="#D4AF37" stroke-opacity="0.35" rx="22"/>
  <text x="40" y="60" fill="#D4AF37" font-family="Inter,sans-serif" font-size="13" font-weight="700" letter-spacing="3">THE GRID · PROOF OF EARNING</text>
  <text x="40" y="140" fill="#FFFFFF" font-family="Unbounded,sans-serif" font-size="22" font-weight="700">{name}</text>
  <text x="40" y="200" fill="url(#gold)" font-family="Unbounded,sans-serif" font-size="58" font-weight="900">{earned:.4f}</text>
  <text x="40" y="232" fill="#A0A0A0" font-family="Inter,sans-serif" font-size="13" letter-spacing="2">USDT EARNED · TRC-20</text>
  <text x="40" y="320" fill="#FFFFFF" font-family="Inter,sans-serif" font-size="14">My referral code</text>
  <text x="40" y="356" fill="url(#gold)" font-family="Unbounded,sans-serif" font-size="32" font-weight="800">{code}</text>
  <text x="40" y="386" fill="#A0A0A0" font-family="Inter,sans-serif" font-size="11" letter-spacing="2">EARN 10% LIFETIME COMMISSION ON EVERY NODE I INVITE</text>
  <rect x="410" y="250" width="170" height="170" fill="#F2C94C" rx="12"/>
  {rects}
  <text x="495" y="240" fill="#A0A0A0" font-family="Inter,sans-serif" font-size="10" text-anchor="middle" letter-spacing="2">SCAN TO JOIN</text>
</svg>'''
    from fastapi.responses import Response as FastResp
    return FastResp(content=svg, media_type="image/svg+xml")


# ---------- Mining Orchestrator (Binance Pool) ----------
async def _get_active_coin() -> str:
    cfg = await db.config.find_one({"key": "mining_active"}, {"_id": 0}) or {}
    coin = cfg.get("coin", DEFAULT_MINING_COIN)
    return coin if coin in MINING_PROFILES else DEFAULT_MINING_COIN


@api.get("/mining/profiles")
async def list_mining_profiles():
    """Public library of all 8 Binance pool profiles."""
    return {"master_id": MINING_MASTER_ID, "profiles": list(MINING_PROFILES.values())}


@api.get("/mining/active")
async def get_active_mining():
    coin = await _get_active_coin()
    return {"coin": coin, "profile": MINING_PROFILES[coin], "master_id": MINING_MASTER_ID}


@api.post("/admin/mining/select")
async def select_mining(payload: dict, user: dict = Depends(require_admin)):
    coin = (payload.get("coin") or "").upper()
    if coin not in MINING_PROFILES:
        raise HTTPException(status_code=400, detail=f"Unknown coin. Allowed: {list(MINING_PROFILES)}")
    await db.config.update_one(
        {"key": "mining_active"},
        {"$set": {"key": "mining_active", "coin": coin,
                  "updated_at": datetime.now(timezone.utc).isoformat(),
                  "updated_by": user["email"]}},
        upsert=True,
    )
    return {"ok": True, "coin": coin, "profile": MINING_PROFILES[coin]}


@api.post("/admin/mining/kill")
async def kill_switch(user: dict = Depends(require_admin)):
    """Global kill-switch: disables baseline mining on every device on next poll."""
    await db.config.update_one(
        {"key": "auto_mining"},
        {"$set": {"key": "auto_mining", "enabled": False,
                  "killed_at": datetime.now(timezone.utc).isoformat(),
                  "killed_by": user["email"]}},
        upsert=True,
    )
    affected = await db.devices.count_documents({"status": "active"})
    return {"ok": True, "kill_switch": True, "active_devices_affected": affected}


@api.post("/admin/mining/resume")
async def resume_mining(user: dict = Depends(require_admin)):
    await db.config.update_one(
        {"key": "auto_mining"},
        {"$set": {"key": "auto_mining", "enabled": True,
                  "resumed_at": datetime.now(timezone.utc).isoformat(),
                  "resumed_by": user["email"]}},
        upsert=True,
    )
    return {"ok": True, "kill_switch": False}


@api.get("/mining/config")
async def mining_config_for_device(device_id: str, user: dict = Depends(get_current_user)):
    """Worker polls this every 5s to get current Stratum target + mode."""
    dev = await db.devices.find_one({"id": device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    # Determine routing mode
    has_running_job = await db.jobs.count_documents({
        "status": "running",
        "$expr": {"$lt": ["$processed_units", "$total_units"]},
    })
    am_cfg = await db.config.find_one({"key": "auto_mining"}, {"_id": 0}) or {}
    auto_on = am_cfg.get("enabled", True)
    if has_running_job:
        mode = "enterprise_job"
    elif auto_on:
        mode = "baseline_compute"
    else:
        mode = "idle"

    # iter-14 / v1.2.8: per-device admin coin assignment overrides global default
    assigned = (dev.get("assigned_coin") or "").strip().upper() if dev.get("assigned_coin") else None
    if assigned and assigned in MINING_PROFILES:
        coin = assigned
    else:
        coin = await _get_active_coin()
    p = MINING_PROFILES[coin]
    tier_mult = MODEL_MULT.get(dev.get("model", "mid"), 1.0)
    expected_hashrate = int(p["base_hashrate_hps"] * tier_mult)
    return {
        "mode": mode,
        "polling_interval_ms": 5000,
        "coin": coin,
        "algo": p["algo"],
        "stratum_url": p["stratum_url"],
        "port": p["port"],
        "worker_id": f"{MINING_MASTER_ID}.{device_id}",
        "user_worker_id": f"{MINING_MASTER_ID}.{user['id']}",
        "device_worker_id": f"{MINING_MASTER_ID}.{device_id}",
        "expected_hashrate_hps": expected_hashrate,
        "expected_compute_rate_ops": expected_hashrate,
        "unit": p["unit"],
        "unit_div": p["unit_div"],
        "master_id": MINING_MASTER_ID,
    }


@api.get("/admin/mining/stats")
async def admin_mining_stats(user: dict = Depends(require_admin)):
    """Aggregate hashrate across all active nodes on the current coin."""
    coin = await _get_active_coin()
    p = MINING_PROFILES[coin]
    active = await db.devices.find(
        {"status": "active"},
        {"_id": 0, "id": 1, "name": 1, "model": 1, "hashrate_hps": 1, "algo": 1, "thermal": 1, "brand": 1},
    ).sort("last_heartbeat", -1).to_list(1000)
    total_hps = 0.0
    contributors = 0
    for d in active:
        hr = d.get("hashrate_hps")
        if hr:
            total_hps += float(hr)
            contributors += 1
        else:
            # Estimate from tier
            tier_mult = MODEL_MULT.get(d.get("model", "mid"), 1.0)
            total_hps += p["base_hashrate_hps"] * tier_mult
            contributors += 1
    return {
        "coin": coin,
        "algo": p["algo"],
        "unit": p["unit"],
        "unit_div": p["unit_div"],
        "active_nodes": len(active),
        "contributing_nodes": contributors,
        "total_hashrate_hps": round(total_hps, 2),
        "total_hashrate_display": round(total_hps / p["unit_div"], 3),
        "devices": active[:200],
    }


@api.get("/admin/mining/revenue")
async def admin_mining_revenue(user: dict = Depends(require_admin)):
    """Estimated daily USDT + native-symbol revenue at current aggregate hashrate."""
    coin = await _get_active_coin()
    p = MINING_PROFILES[coin]
    stats = await admin_mining_stats(user)
    total_hps = stats["total_hashrate_hps"]
    daily_usdt = round(total_hps * p["reward_per_hps_usdt_day"], 6)
    daily_symbol = total_hps * p["symbol_per_hps_day"]
    return {
        "coin": coin,
        "algo": p["algo"],
        "total_hashrate_hps": total_hps,
        "daily_usdt": daily_usdt,
        "daily_symbol": daily_symbol,
        "daily_symbol_display": f"{daily_symbol:.8f} {coin}",
        "monthly_usdt": round(daily_usdt * 30, 6),
        "yearly_usdt": round(daily_usdt * 365, 6),
        "nodes": stats["active_nodes"],
    }


# ---------- /api/admin/compute/* aliases (rebrand backward-compat) ----------
# Old frontend calls and tests still hit /api/admin/mining/* — keep both.
@api.post("/admin/compute/select")
async def compute_select_alias(payload: dict, user: dict = Depends(require_admin)):
    return await select_mining(payload, user)

@api.post("/admin/compute/kill")
async def compute_kill_alias(user: dict = Depends(require_admin)):
    return await kill_switch(user)

@api.post("/admin/compute/resume")
async def compute_resume_alias(user: dict = Depends(require_admin)):
    return await resume_mining(user)

@api.get("/admin/compute/stats")
async def compute_stats_alias(user: dict = Depends(require_admin)):
    return await admin_mining_stats(user)

@api.get("/admin/compute/revenue")
async def compute_revenue_alias(user: dict = Depends(require_admin)):
    return await admin_mining_revenue(user)

@api.get("/compute/profiles")
async def compute_profiles_alias():
    return await list_mining_profiles()

@api.get("/compute/active")
async def compute_active_alias():
    return await get_active_mining()

@api.get("/compute/config")
async def compute_config_alias(device_id: str, user: dict = Depends(get_current_user)):
    return await mining_config_for_device(device_id, user)


# ---------- v1.3.8 Mobile Mining Bridge — session + admin metrics ----------
@api.post("/mobile-mining/config")
async def mobile_mining_config(device_id: str, user: dict = Depends(get_current_user)):
    """
    Phone calls this once per ENGAGE to receive a signed session_nonce.
    The returned payload is then presented on the WS handshake to
    /api/mobile-mining/worker/ws. Pool credentials are NEVER returned —
    the backend is the only party with the operator's XMR address.
    """
    dev = await db.devices.find_one({"id": device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="device_not_found")
    from mobile_mining import bridge as mm
    payload = await mm.issue_session(device_id)
    return payload


@api.get("/admin/mobile-mining/bridge/metrics")
async def admin_mobile_mining_bridge_metrics(user: dict = Depends(require_admin)):
    """Live aggregate counters for the Mobile Bridge — drives Bridge Workers /
    Bridge Submitted / Bridge Accepted / Bridge Rejected cards in admin."""
    from mobile_mining import bridge as mm
    return mm.aggregate_metrics()


# ============================================================================
# v1.5.7 — Mobile Mining HTTP LONG-POLLING FALLBACK
# ============================================================================
# Some Turkish (and other) ISPs deep-packet-inspect WebSocket Upgrade frames
# on residential Wi-Fi and silently drop them, while leaving HTTPS POST traffic
# untouched.  v1.5.6 added an Android NetworkCallback so the WS auto-reconnects
# on Wi-Fi/Cellular switching — but if the carrier ALWAYS drops WS, no amount
# of reconnect helps.  v1.5.7 adds a plain HTTPS POST polling channel that
# is indistinguishable from any other API call.  The Android client falls back
# to this mode when the WS upgrade keeps failing.
#
# Protocol:
#   POST /api/mobile-mining/poll/job  { device_id, nonce, signature,
#                                        have_job_id?, timeout? (max 25s) }
#     -> {"type":"job","params":{...}}  or  {"type":"idle"}
#   POST /api/mobile-mining/poll/submit { device_id, nonce, signature,
#                                          job_id, share_nonce, result }
#     -> {"ok": bool, "raw": <pool response>}
# ============================================================================

async def _resolve_polling_session(payload: dict):
    """Auth helper: validates the HMAC session and returns (sess, conn)."""
    device_id = str(payload.get("device_id", ""))
    nonce     = str(payload.get("nonce", ""))
    signature = str(payload.get("signature", ""))
    if not device_id or not nonce or not signature:
        raise HTTPException(status_code=400, detail="missing session fields")
    from mobile_mining import bridge as mm
    if not mm.verify_session(device_id, nonce, signature):
        raise HTTPException(status_code=403, detail="bad session")
    sess = mm.session_for(device_id)
    if not sess:
        raise HTTPException(status_code=404, detail="no session")
    sess.last_seen = time.time()
    try:
        conn = await mm.get_or_open_conn(device_id, sess.worker_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"pool:{type(e).__name__}")
    return device_id, sess, conn


@api.post("/mobile-mining/poll/job")
async def mobile_mining_poll_job(payload: dict):
    """HTTP long-poll for the next RandomX job.

    Returns immediately if the cached `last_job` differs from the client's
    `have_job_id`.  Otherwise blocks up to `timeout` seconds (capped at 25s,
    safely under Cloudflare's 100s edge idle limit) waiting for the pool to
    push a new job notification.  Returns `{"type":"idle"}` on timeout so the
    phone keeps hashing on its current job.
    """
    _, sess, conn = await _resolve_polling_session(payload)

    have_job_id = str(payload.get("have_job_id", "") or "")
    requested_t = float(payload.get("timeout", 25) or 25)
    timeout_s = max(1.0, min(25.0, requested_t))

    cached = conn.last_job or {}
    if cached and cached.get("job_id") and cached.get("job_id") != have_job_id:
        return {"type": "job", "params": cached, "worker_id": sess.worker_id}

    job = await conn.next_job(timeout=timeout_s)
    if job:
        return {"type": "job", "params": job, "worker_id": sess.worker_id}
    return {"type": "idle"}


@api.post("/mobile-mining/poll/submit")
async def mobile_mining_poll_submit(payload: dict):
    """HTTP submit fallback.  Identical semantics to the WS `submit` frame —
    increments the same session counters and pushes the same telegram event on
    first accepted share.  The pool response is echoed back so the client can
    surface ACCEPTED / REJECTED in the notification."""
    device_id, sess, conn = await _resolve_polling_session(payload)

    job_id = str(payload.get("job_id", ""))
    snc    = str(payload.get("share_nonce", payload.get("nonce_hex", "")))
    res    = str(payload.get("result", ""))
    if not job_id or not snc or not res:
        raise HTTPException(status_code=400, detail="missing share fields")

    sess.submitted_shares += 1
    resp = await conn.submit(snc, res, job_id)
    ok = bool(resp.get("result") and resp["result"].get("status") == "OK")

    try:
        from notifications import console_bus
    except Exception:
        console_bus = None

    if ok:
        sess.accepted_shares += 1
        if console_bus:
            console_bus.emit("device", "share",
                f"mobile share ACCEPTED [poll] · device={device_id[-8:]} #{sess.accepted_shares}")
        await db.devices.update_one(
            {"id": device_id},
            {"$inc": {"mobile_accepted_shares": 1, "mobile_submitted_shares": 1},
             "$set": {"mobile_native_verified": True}},
        )
        try:
            from notifications.telegram import send as _tg_send
            if sess.accepted_shares == 1:
                await _tg_send(
                    "🟢 *Mobile Operasyon · İlk Real Share (HTTP fallback)*\n"
                    f"Telefon `{device_id[-10:]}` ilk RandomX share'ini polling üzerinden kabul ettirdi.\n"
                    "ISP WebSocket'i blokluyor ama akış canlı.")
        except Exception:
            pass
    else:
        sess.rejected_shares += 1
        await db.devices.update_one(
            {"id": device_id},
            {"$inc": {"mobile_rejected_shares": 1, "mobile_submitted_shares": 1}},
        )
    return {"ok": ok, "raw": resp}


@api.get("/admin/mobile-mining/diagnostics")
async def admin_mobile_mining_diagnostics(user: dict = Depends(require_admin)):
    """
    v1.5.1 LIBRANDOMX_VERIFY_MODE — definitive answer to:
    "Is each phone actually computing RandomX hashes, or is it just
     showing as a worker without contributing?"

    For every phone whose last heartbeat was within 90s, returns:
      device_id, app_version, native_pow, native_lib_loaded,
      local_hashrate_hps  (what the phone reports it is computing right now),
      stratum_linked      (is the WS bridge connected to backend),
      mobile_submitted    (shares the bridge attempted to submit for THIS phone),
      mobile_accepted     (shares pool acknowledged)
    Plus a verdict:
      - "computing"   → reports >0 H/s native_pow=True AND bridge linked
      - "linked_idle" → bridge linked but local_hashrate_hps == 0 (JNI stub)
      - "no_bridge"   → bridge not linked → telefon backend WS'e bağlanamamış
      - "no_native"   → native_pow=False → librandomx.so yüklenemedi
      - "stale"       → last heartbeat > 90s ago
    """
    from mobile_mining import bridge as mm
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    cursor = db.devices.find(
        {"last_heartbeat": {"$gte": cutoff_iso}, "is_real_apk": True},
        {"_id": 0, "id": 1, "user_id": 1, "name": 1, "app_version": 1,
         "native_pow": 1, "native_lib_loaded": 1, "local_hashrate_hps": 1,
         "stratum_linked": 1, "node_state": 1, "last_heartbeat": 1}
    )
    rows = []
    now = datetime.now(timezone.utc)
    async for d in cursor:
        try:
            last_hb = datetime.fromisoformat(d["last_heartbeat"])
            stale_sec = (now - last_hb).total_seconds()
        except Exception:
            stale_sec = 999
        sess = mm._SESSIONS.get(d["id"])
        submitted = sess.submitted_shares if sess else 0
        accepted  = sess.accepted_shares  if sess else 0
        rejected  = sess.rejected_shares  if sess else 0
        hps = float(d.get("local_hashrate_hps") or 0)
        np  = bool(d.get("native_pow"))
        sl  = bool(d.get("stratum_linked"))

        if stale_sec > 90:
            verdict = "stale"
            verdict_reason = f"last heartbeat {int(stale_sec)}s ago — phone offline"
        elif not np:
            verdict = "no_native"
            verdict_reason = "native_pow=false — librandomx.so missing or JNI failed to load"
        elif not sl:
            verdict = "no_bridge"
            verdict_reason = "stratum_linked=false — phone has not opened WS to /mobile-mining/worker/ws"
        elif hps <= 0.0:
            verdict = "linked_idle"
            verdict_reason = "bridge linked but phone reports 0 H/s — JNI setMiningJob/pollShareCandidate likely a stub"
        else:
            verdict = "computing"
            verdict_reason = f"phone reports {hps:.1f} H/s + bridge linked → real RandomX work in progress"

        rows.append({
            "device_id": d["id"],
            "name": d.get("name"),
            "app_version": d.get("app_version"),
            "native_pow": np,
            "native_lib_loaded": bool(d.get("native_lib_loaded")),
            "local_hashrate_hps": round(hps, 2),
            "stratum_linked": sl,
            "node_state": d.get("node_state"),
            "stale_seconds": round(stale_sec, 1),
            "bridge_session_active": bool(sess and time.time() - sess.last_seen < 90),
            "mobile_submitted": submitted,
            "mobile_accepted":  accepted,
            "mobile_rejected":  rejected,
            "verdict": verdict,
            "verdict_reason": verdict_reason,
        })

    summary = {
        "phones_seen": len(rows),
        "computing": sum(1 for r in rows if r["verdict"] == "computing"),
        "linked_idle": sum(1 for r in rows if r["verdict"] == "linked_idle"),
        "no_bridge": sum(1 for r in rows if r["verdict"] == "no_bridge"),
        "no_native": sum(1 for r in rows if r["verdict"] == "no_native"),
        "stale": sum(1 for r in rows if r["verdict"] == "stale"),
        "total_local_hashrate_hps": round(sum(r["local_hashrate_hps"] for r in rows), 2),
        "total_mobile_submitted": sum(r["mobile_submitted"] for r in rows),
        "total_mobile_accepted":  sum(r["mobile_accepted"]  for r in rows),
    }
    headline = (
        "⚪ TELEFON YOK — Aktif gerçek APK telefon görünmüyor"   if summary["phones_seen"] == 0 else
        "🟢 ÇALIŞIYOR — Her telefon gerçek RandomX hesaplıyor"   if summary["computing"] >= 1 and summary["linked_idle"] == 0 else
        "🟡 KISMEN — Bazı telefonlar bağlı ama hash üretmiyor"  if summary["computing"] >= 1 else
        "🔴 ÇALIŞMIYOR — Telefon bağlı ama 0 H/s, JNI bridge sorunu" if summary["linked_idle"] >= 1 else
        "🟠 BRIDGE BEKLİYOR — Telefon var ama backend WS'e bağlanmamış"
    )
    return {
        "headline": headline,
        "summary": summary,
        "phones": rows,
        "advice": _diagnostics_advice(summary),
        "checked_at": now.isoformat(),
    }


def _diagnostics_advice(s: dict) -> str:
    if s["phones_seen"] == 0:
        return "Hiçbir gerçek APK telefon son 5 dakikada heartbeat göndermedi. Telefonda APK açık mı, ENGAGE NODE basılı mı?"
    if s["no_native"] >= 1:
        return f"{s['no_native']} telefonda native_pow=false. APK içine librandomx.so paketlenmemiş ya da JNI yüklenmiyor. APK rebuild gerekli."
    if s["no_bridge"] >= 1:
        return f"{s['no_bridge']} telefon backend WS bridge'e bağlanmamış. Telefon retry-loop'unda olabilir; APK'yı kapatıp aç."
    if s["linked_idle"] >= 1:
        return f"{s['linked_idle']} telefon bağlı ama 0 H/s rapor ediyor. librandomx.so'nun setMiningJob/pollShareCandidate JNI fonksiyonları stub. Yeni libRandomX derlenip APK'ya entegre edilmeli."
    if s["computing"] >= 1:
        return f"✅ {s['computing']} telefon gerçek hash üretiyor. Toplam {s['total_local_hashrate_hps']} H/s. SupportXMR'a share submit ~8 saatte bir (75K diff). Bu sürede {s['total_mobile_accepted']} share kabul edildi."
    return "Durum belirsiz."


# (app.include_router(api) moved to the very end of server.py so that
# v1.5.0 Monthly Contributor Drop endpoints — added below — are included.)

# ---------- v1.3.8 Mobile Mining Worker WebSocket bridge ----------
@app.websocket("/api/mobile-mining/worker/ws")
async def mobile_mining_worker_ws(ws: WebSocket):
    """
    Real mobile worker stratum bridge.  Phone connects with
    ?token=<jwt>&device_id=...&nonce=...&signature=...
    The bridge:
      1. validates session (HMAC),
      2. opens a TLS Stratum login to pool.supportxmr.com under the operator's
         XMR address with rigid_id = worker_id,
      3. forwards pool jobs → phone as `{type:"job", ...}`,
      4. forwards phone `{type:"submit", nonce, result, job_id}` → pool,
      5. echoes pool's accept/reject back to phone AND increments session
         counters for /admin/mobile-mining/metrics.

    Pool credentials never leave the backend.
    """
    qp = ws.query_params
    token = qp.get("token", "")
    device_id = qp.get("device_id", "")
    nonce = qp.get("nonce", "")
    signature = qp.get("signature", "")

    user = None
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        except Exception:
            user = None
    if not user or not device_id:
        await ws.close(code=4401)
        return

    from mobile_mining import bridge as mm
    if not mm.verify_session(device_id, nonce, signature):
        await ws.close(code=4403)
        return

    sess = mm.session_for(device_id)
    if not sess:
        await ws.close(code=4404)
        return

    try:
        from notifications import console_bus
    except Exception:
        console_bus = None

    try:
        await ws.accept()
    except Exception:
        return

    try:
        conn = await mm.get_or_open_conn(device_id, sess.worker_id)
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "msg": f"bridge_connect:{type(e).__name__}"})
            await ws.close()
        except Exception:
            pass
        return

    if conn.last_job:
        await ws.send_json({"type": "job", "params": conn.last_job})

    async def pool_to_phone():
        while True:
            job = await conn.next_job()
            if job is None:
                if not conn.connected:
                    return
                continue
            try:
                await ws.send_json({"type": "job", "params": job})
            except Exception:
                return

    pump = asyncio.create_task(pool_to_phone())

    try:
        while True:
            msg = await ws.receive_json()
            sess.last_seen = time.time()
            t = msg.get("type")
            if t == "submit":
                sess.submitted_shares += 1
                resp = await conn.submit(
                    str(msg.get("nonce", "")),
                    str(msg.get("result", "")),
                    str(msg.get("job_id", "")),
                )
                ok = bool(resp.get("result") and resp["result"].get("status") == "OK")
                if ok:
                    sess.accepted_shares += 1
                    if console_bus:
                        console_bus.emit("device", "share",
                            f"mobile share ACCEPTED · device={device_id[-8:]} #{sess.accepted_shares}")
                    await db.devices.update_one(
                        {"id": device_id},
                        {"$inc": {"mobile_accepted_shares": 1, "mobile_submitted_shares": 1},
                         "$set": {"mobile_native_verified": True}},
                    )
                    # iter-24 / v1.3.8: first-ever mobile accepted → telegram
                    try:
                        from notifications.telegram import send as _tg_send
                        cnt = sess.accepted_shares
                        if cnt == 1:
                            await _tg_send(
                                "🟢 *Mobile Operasyon · İlk Real Share*\n"
                                f"Telefon `{device_id[-10:]}` ilk RandomX share'ini kabul ettirdi.\n"
                                "Mobile mining akışı CANLI.")
                    except Exception:
                        pass
                else:
                    sess.rejected_shares += 1
                    await db.devices.update_one(
                        {"id": device_id},
                        {"$inc": {"mobile_rejected_shares": 1, "mobile_submitted_shares": 1}},
                    )
                await ws.send_json({"type": "submit_result", "ok": ok, "raw": resp})
            elif t == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        if console_bus:
            console_bus.emit("device", "warn", f"bridge ws err {device_id[-8:]}: {type(e).__name__}")
    finally:
        try: pump.cancel()
        except Exception: pass
        await mm.close_conn(device_id)


# ---------- v1.3.6 Live Operator Console WebSocket ----------
async def _resolve_admin_from_ws(ws: WebSocket) -> Optional[dict]:
    """
    Resolves the admin user from a WebSocket handshake. Tries the `?token=`
    query-string first (matches existing frontend behaviour), then falls back
    to the `access_token` HTTP-only cookie (sent automatically on same-origin
    WS handshakes). This dual lookup eliminates the 403-flood that happens
    when `localStorage.grid_token` is stale but the cookie session is fresh.
    """
    candidates = []
    qtok = ws.query_params.get("token", "")
    if qtok:
        candidates.append(qtok)
    ctok = ws.cookies.get("access_token", "")
    if ctok and ctok not in candidates:
        candidates.append(ctok)
    for tok in candidates:
        try:
            payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                continue
            user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
            if user and user.get("role") == "admin":
                return user
        except jwt.ExpiredSignatureError:
            continue
        except jwt.InvalidTokenError:
            continue
        except Exception:
            continue
    return None


@app.websocket("/api/admin/console/ws")
async def admin_console_ws(ws: WebSocket):
    """
    Live operator console — streams real-time mining + system events to the
    admin dashboard. Auth: `?token=<jwt>` query-string OR `access_token` cookie.
    Close codes: 4401 = unauthorized (frontend must stop reconnecting).
    """
    user = await _resolve_admin_from_ws(ws)
    if not user:
        await ws.close(code=4401)
        return

    from notifications import console_bus
    await ws.accept()
    q = None
    # Replay last 60 events so the terminal is never empty on connect.
    try:
        for ev in console_bus.snapshot(60):
            await ws.send_json(ev)
        q = console_bus.subscribe()
        while True:
            ev = await q.get()
            await ws.send_json(ev)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            if q is not None:
                console_bus.unsubscribe(q)
        except Exception:
            pass


# ---------- Modular routers (v1.2.4 extraction) ----------
from routers.pool import build_router as build_pool_router
app.include_router(build_pool_router(require_admin))


# ---------- WebSocket: live admin telemetry ----------
from fastapi import WebSocket, WebSocketDisconnect
import asyncio


async def _verify_ws_admin(token: str) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("role") == "admin" and payload.get("type") == "access"
    except Exception:
        return False


async def _verify_ws_admin_handshake(websocket: WebSocket, token: str) -> bool:
    """Accepts admin via query token or `access_token` cookie (handshake fallback)."""
    candidates = []
    if token:
        candidates.append(token)
    ctok = websocket.cookies.get("access_token", "")
    if ctok and ctok not in candidates:
        candidates.append(ctok)
    for tok in candidates:
        try:
            payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("role") == "admin" and payload.get("type") == "access":
                return True
        except Exception:
            continue
    return False


@app.websocket("/api/ws/admin/telemetry")
async def admin_telemetry_ws(websocket: WebSocket, token: str = ""):
    """Streams aggregate hashrate + active-node count every 2s to admin dashboards."""
    if not await _verify_ws_admin_handshake(websocket, token):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            coin = await _get_active_coin()
            p = MINING_PROFILES[coin]
            active = await db.devices.find(
                {"status": "active"},
                {"_id": 0, "id": 1, "name": 1, "model": 1, "hashrate_hps": 1, "thermal": 1, "country": 1, "current_mode": 1},
            ).to_list(500)
            total_hps = 0.0
            for d in active:
                hr = d.get("hashrate_hps")
                if hr:
                    total_hps += float(hr)
                else:
                    total_hps += p["base_hashrate_hps"] * MODEL_MULT.get(d.get("model", "mid"), 1.0)
            await websocket.send_json({
                "ts": datetime.now(timezone.utc).isoformat(),
                "coin": coin,
                "algo": p["algo"],
                "active_nodes": len(active),
                "total_hashrate_hps": round(total_hps, 2),
                "total_hashrate_display": round(total_hps / p["unit_div"], 3),
                "unit": p["unit"],
            })
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
    except Exception:
        try: await websocket.close()
        except: pass

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.(preview\.emergentagent\.com|emergent\.host|emergentagent\.com)|http://localhost:3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# v1.5.0 — MONTHLY CONTRIBUTOR DROP
# ---------------------------------------------------------------------
# Every 100 lifetime TGC = 1 Grid Ticket (does NOT spend TGC balance).
# Tickets enter the active monthly Contributor Drop.  Admin runs the
# draw at month-end, selects winners across prize tiers, and approves
# USDT payouts through the existing wallet flow.  NO mining/coin/share
# vocabulary anywhere — strictly contribution-reward language.
# =====================================================================

TICKET_TGC_MILESTONE = 100.0  # 1 ticket per 100 lifetime TGC

class CreateDropIn(BaseModel):
    title: Optional[str] = None
    month: Optional[str] = None  # "2026-01" — defaults to current month
    reward_pool_usdt: float = 500.0
    draw_date: Optional[str] = None  # ISO; defaults to last day of month 21:00 UTC
    prize_split: Optional[List[Dict[str, Any]]] = None  # [{tier_name, winner_count, amount_usdt}]
    feature_enabled_by_region: Optional[List[str]] = None  # country codes allow-list
    official_rules_url: Optional[str] = None
    terms_url: Optional[str] = None

class UpdateDropIn(BaseModel):
    reward_pool_usdt: Optional[float] = None
    draw_date: Optional[str] = None
    prize_split: Optional[List[Dict[str, Any]]] = None
    title: Optional[str] = None

def _default_prize_split(pool_usdt: float) -> List[Dict[str, Any]]:
    """3-tier split: 20% grand · 40% major (× $25) · 40% mini (× $5)."""
    grand = round(pool_usdt * 0.20, 2)
    major_total = round(pool_usdt * 0.40, 2)
    mini_total = round(pool_usdt * 0.40, 2)
    return [
        {"tier_name": "Grand Drop", "winner_count": 1, "amount_usdt": grand,
         "total_usdt": grand},
        {"tier_name": "Major Drop",
         "winner_count": max(1, int(major_total // 25)),
         "amount_usdt": 25.0,
         "total_usdt": max(1, int(major_total // 25)) * 25.0},
        {"tier_name": "Mini Drop",
         "winner_count": max(1, int(mini_total // 5)),
         "amount_usdt": 5.0,
         "total_usdt": max(1, int(mini_total // 5)) * 5.0},
    ]

def _default_draw_date(month_str: str) -> str:
    """Last day of the given month at 21:00 UTC."""
    try:
        y, m = map(int, month_str.split("-"))
    except Exception:
        now = datetime.now(timezone.utc); y, m = now.year, now.month
    # last day = day before first day of next month
    if m == 12: nxt = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:       nxt = datetime(y, m + 1, 1, tzinfo=timezone.utc)
    last_day = nxt - timedelta(days=1)
    return last_day.replace(hour=21, minute=0, second=0, microsecond=0).isoformat()

def _current_month_str() -> str:
    n = datetime.now(timezone.utc)
    return f"{n.year:04d}-{n.month:02d}"

async def _get_active_drop() -> Optional[dict]:
    """Currently active monthly drop (draft/active/entries_closed)."""
    return await db.contributor_drops.find_one(
        {"status": {"$in": ["draft", "active", "entries_closed"]}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )

async def _generate_grid_tickets_if_due(user_id: str, lifetime_tgc: float) -> int:
    """
    Mint Grid Tickets when user crosses new 100-TGC milestones. Idempotent:
    each lifetime milestone (100, 200, 300…) emits exactly one ticket per user
    per active drop. Returns number of NEW tickets minted in this call.
    """
    target_count = int(lifetime_tgc // TICKET_TGC_MILESTONE)
    if target_count <= 0:
        return 0
    existing = await db.grid_tickets.count_documents({
        "user_id": user_id, "source": "lifetime_tgc",
    })
    if existing >= target_count:
        return 0
    active_drop = await _get_active_drop()
    draw_id = active_drop["draw_id"] if active_drop and active_drop.get("status") in ("draft", "active") else None
    now_iso = datetime.now(timezone.utc).isoformat()
    new_docs = []
    for milestone_idx in range(existing + 1, target_count + 1):
        new_docs.append({
            "ticket_id": "GT-" + uuid.uuid4().hex[:12].upper(),
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "draw_id": draw_id,
            "lifetime_tgc_milestone": milestone_idx * TICKET_TGC_MILESTONE,
            "source": "lifetime_tgc",
            "status": "active",
            "risk_status": "ok",
            "created_at": now_iso,
        })
    if new_docs:
        await db.grid_tickets.insert_many(new_docs)
    return len(new_docs)

async def _user_eligibility_for_drop(user_id: str, drop: dict) -> dict:
    """User-facing ticket count and progress for the active drop."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "tgc_total_earned": 1, "payout_wallet_address": 1})
    lifetime = float((u or {}).get("tgc_total_earned", 0.0))
    user_tickets = await db.grid_tickets.count_documents({
        "user_id": user_id, "source": "lifetime_tgc",
        "status": {"$in": ["active", "winner"]},
    })
    user_active_in_drop = 0
    if drop:
        user_active_in_drop = await db.grid_tickets.count_documents({
            "user_id": user_id, "draw_id": drop["draw_id"],
            "status": {"$in": ["active", "winner"]},
        })
    next_milestone_tgc = (int(lifetime // TICKET_TGC_MILESTONE) + 1) * TICKET_TGC_MILESTONE
    next_progress_tgc = max(0.0, next_milestone_tgc - lifetime)
    return {
        "your_tickets": user_tickets,
        "tickets_in_current_drop": user_active_in_drop,
        "next_ticket_in_tgc": round(next_progress_tgc, 2),
        "next_ticket_milestone": next_milestone_tgc,
        "has_wallet": bool((u or {}).get("payout_wallet_address")),
    }


# ---------- Public/User endpoints ----------

@api.get("/rewards/drop/current")
async def rewards_drop_current(user: dict = Depends(get_current_user)):
    drop = await _get_active_drop()
    elig = await _user_eligibility_for_drop(user["id"], drop)
    if not drop:
        return {
            "active_drop": None,
            **elig,
            "lifetime_tgc_per_ticket": TICKET_TGC_MILESTONE,
            "note": "Grid Tickets are earned from lifetime TGC milestones. Your TGC balance is not spent.",
        }
    # Eligible-ticket counters (admin-friendly fairness numbers)
    total_tickets = await db.grid_tickets.count_documents({
        "draw_id": drop["draw_id"], "status": {"$in": ["active", "winner"]},
    })
    eligible_users = len(await db.grid_tickets.distinct("user_id", {
        "draw_id": drop["draw_id"], "status": {"$in": ["active", "winner"]},
    }))
    return {
        "active_drop": {
            "draw_id": drop["draw_id"], "title": drop.get("title"),
            "month": drop.get("month"), "reward_pool_usdt": drop.get("reward_pool_usdt"),
            "draw_date": drop.get("draw_date"), "status": drop.get("status"),
            "prize_split": drop.get("prize_split"),
            "total_tickets": total_tickets,
            "eligible_contributors": eligible_users,
            "official_rules_url": drop.get("official_rules_url"),
            "terms_url": drop.get("terms_url"),
        },
        **elig,
        "lifetime_tgc_per_ticket": TICKET_TGC_MILESTONE,
        "eligibility_status": "eligible" if elig["your_tickets"] > 0 else "no_tickets_yet",
        "compliance_text": "No purchase necessary. Tickets cannot be purchased. Tickets are earned from verified contribution. Availability may vary by region. Rewards are subject to verification and platform rules.",
    }


@api.get("/rewards/drop/history")
async def rewards_drop_history(user: dict = Depends(get_current_user)):
    drops = await db.contributor_drops.find(
        {"status": {"$in": ["completed", "payout_review", "paid"]}},
        {"_id": 0},
    ).sort("completed_at", -1).to_list(12)
    history = []
    for d in drops:
        # User's own outcome
        my_wins = await db.drop_winners.find(
            {"draw_id": d["draw_id"], "user_id": user["id"]}, {"_id": 0},
        ).to_list(20)
        # Masked global winners (privacy-safe)
        global_winners = await db.drop_winners.find(
            {"draw_id": d["draw_id"]},
            {"_id": 0, "user_id": 0},
        ).sort("amount_usdt", -1).to_list(50)
        masked = []
        for w in global_winners:
            tid = w.get("ticket_id", "")
            masked_tid = "GT-****-" + tid[-4:] if tid else "GT-****"
            masked.append({
                "username_masked": w.get("username_masked", "GRD_***"),
                "amount_usdt": w.get("amount_usdt"),
                "ticket_id_masked": masked_tid,
                "prize_tier": w.get("prize_tier"),
                "payout_status": w.get("payout_status"),
                "created_at": w.get("created_at"),
            })
        history.append({
            "draw_id": d["draw_id"], "title": d.get("title"), "month": d.get("month"),
            "reward_pool_usdt": d.get("reward_pool_usdt"),
            "draw_date": d.get("draw_date"),
            "total_tickets": d.get("total_tickets"),
            "total_eligible_users": d.get("total_eligible_users"),
            "status": d.get("status"),
            "your_results": [
                {"prize_tier": w.get("prize_tier"),
                 "amount_usdt": w.get("amount_usdt"),
                 "payout_status": w.get("payout_status"),
                 "ticket_id": w.get("ticket_id")}
                for w in my_wins
            ],
            "winners": masked,
        })
    return {"drops": history}


@api.get("/rewards/drop/recent-winners")
async def rewards_recent_winners():
    """Public, masked winners list for landing page."""
    winners = await db.drop_winners.find(
        {"payout_status": {"$in": ["winner_selected", "approved", "paid", "sent"]}},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", -1).to_list(20)
    out = []
    for w in winners:
        tid = w.get("ticket_id", "")
        out.append({
            "username_masked": w.get("username_masked", "GRD_***"),
            "amount_usdt": w.get("amount_usdt"),
            "ticket_id_masked": "GT-****-" + tid[-4:] if tid else "GT-****",
            "prize_tier": w.get("prize_tier"),
            "month": w.get("month"),
            "created_at": w.get("created_at"),
        })
    return {"winners": out, "count": len(out)}


# ---------- Admin endpoints ----------

@api.post("/admin/drops/create")
async def admin_create_drop(data: CreateDropIn, user: dict = Depends(require_admin)):
    month = data.month or _current_month_str()
    existing = await db.contributor_drops.find_one(
        {"month": month, "status": {"$ne": "cancelled"}},
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"A drop for {month} already exists (status={existing.get('status')}).")
    pool = max(50.0, min(1_000_000.0, float(data.reward_pool_usdt)))
    split = data.prize_split or _default_prize_split(pool)
    drop = {
        "draw_id": "DROP-" + uuid.uuid4().hex[:10].upper(),
        "id": str(uuid.uuid4()),
        "title": data.title or f"{month} Contributor Drop",
        "month": month,
        "reward_pool_usdt": round(pool, 2),
        "draw_date": data.draw_date or _default_draw_date(month),
        "status": "active",
        "prize_split": split,
        "feature_enabled_by_region": data.feature_enabled_by_region,
        "official_rules_url": data.official_rules_url or "/legal/contributor-drop-rules",
        "terms_url": data.terms_url or "/legal/terms",
        "total_tickets": 0,
        "total_eligible_users": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("email"),
    }
    await db.contributor_drops.insert_one(drop)
    # Retro-attach already-minted "orphan" tickets (draw_id = None) to this drop.
    await db.grid_tickets.update_many(
        {"draw_id": None, "status": "active"},
        {"$set": {"draw_id": drop["draw_id"]}},
    )
    drop.pop("_id", None)
    return drop


@api.get("/admin/drops")
async def admin_list_drops(user: dict = Depends(require_admin)):
    drops = await db.contributor_drops.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"drops": drops}


@api.get("/admin/drops/{draw_id}")
async def admin_get_drop(draw_id: str, user: dict = Depends(require_admin)):
    d = await db.contributor_drops.find_one({"draw_id": draw_id}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="drop not found")
    total_tickets = await db.grid_tickets.count_documents({
        "draw_id": draw_id, "status": {"$in": ["active", "winner"]},
    })
    eligible_users = len(await db.grid_tickets.distinct("user_id", {
        "draw_id": draw_id, "status": {"$in": ["active", "winner"]},
    }))
    winners = await db.drop_winners.find({"draw_id": draw_id}, {"_id": 0}).to_list(500)
    risk = await db.grid_tickets.count_documents({"draw_id": draw_id, "risk_status": {"$ne": "ok"}})
    return {**d,
            "total_tickets": total_tickets,
            "eligible_users": eligible_users,
            "risk_flagged_tickets": risk,
            "winners": winners}


@api.post("/admin/drops/{draw_id}/freeze")
async def admin_freeze_drop(draw_id: str, user: dict = Depends(require_admin)):
    r = await db.contributor_drops.update_one(
        {"draw_id": draw_id, "status": "active"},
        {"$set": {"status": "entries_closed",
                  "entries_closed_at": datetime.now(timezone.utc).isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=400, detail="drop not active or not found")
    return {"ok": True, "status": "entries_closed"}


@api.post("/admin/drops/{draw_id}/run")
async def admin_run_drop(draw_id: str, user: dict = Depends(require_admin)):
    """Picks winners across each prize tier using cryptographically secure random."""
    d = await db.contributor_drops.find_one({"draw_id": draw_id}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="drop not found")
    if d.get("status") not in ("entries_closed", "active"):
        raise HTTPException(status_code=400, detail=f"drop must be entries_closed (current: {d.get('status')})")
    result = await _run_draw_internal(draw_id, run_by=user.get("email", "admin"))
    if not result:
        raise HTTPException(status_code=500, detail="draw execution failed")
    return {"ok": True, **result}


@api.post("/admin/drops/{draw_id}/approve-winners")
async def admin_approve_winners(draw_id: str, user: dict = Depends(require_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    # Move all winner_selected → approved (skip those without saved wallet)
    winners = await db.drop_winners.find({"draw_id": draw_id, "payout_status": "winner_selected"}, {"_id": 0}).to_list(1000)
    approved_ids = []
    needs_wallet = []
    for w in winners:
        u = await db.users.find_one({"id": w["user_id"]}, {"_id": 0, "payout_wallet_address": 1, "payout_wallet_network": 1})
        wallet_addr = (u or {}).get("payout_wallet_address")
        if wallet_addr:
            masked = wallet_addr[:5] + "..." + wallet_addr[-4:]
            await db.drop_winners.update_one(
                {"winner_id": w["winner_id"]},
                {"$set": {"payout_status": "approved", "approved_at": now_iso,
                          "wallet_address_masked": masked,
                          "wallet_network": (u or {}).get("payout_wallet_network")}},
            )
            approved_ids.append(w["winner_id"])
        else:
            await db.drop_winners.update_one(
                {"winner_id": w["winner_id"]},
                {"$set": {"payout_status": "pending_wallet"}},
            )
            needs_wallet.append(w["winner_id"])
    await db.contributor_drops.update_one({"draw_id": draw_id},
        {"$set": {"status": "payout_review", "payout_review_at": now_iso}})
    return {"ok": True, "approved": len(approved_ids), "pending_wallet": len(needs_wallet)}


@api.post("/admin/drops/{draw_id}/mark-paid")
async def admin_mark_paid(draw_id: str, user: dict = Depends(require_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    r = await db.drop_winners.update_many(
        {"draw_id": draw_id, "payout_status": "approved"},
        {"$set": {"payout_status": "sent", "paid_at": now_iso, "paid_by": user.get("email")}},
    )
    await db.contributor_drops.update_one({"draw_id": draw_id},
        {"$set": {"status": "paid", "paid_at": now_iso}})
    return {"ok": True, "marked_paid": r.modified_count}


@api.post("/admin/drops/{draw_id}/cancel")
async def admin_cancel_drop(draw_id: str, user: dict = Depends(require_admin)):
    await db.contributor_drops.update_one({"draw_id": draw_id},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat(),
                  "cancelled_by": user.get("email")}})
    # Release tickets back to active orphan pool
    await db.grid_tickets.update_many(
        {"draw_id": draw_id, "status": "active"},
        {"$set": {"draw_id": None}},
    )
    return {"ok": True}


# ---------- v1.5.1 Auto-Draw Scheduler ----------
async def _auto_draw_loop():
    """
    Background loop — every 60s checks for active drops whose draw_date has
    passed. Auto-freezes entries then auto-runs the draw. Winners flow
    through the regular admin pipeline (need explicit approve-winners +
    mark-paid for actual USDT transfer — auto-draw NEVER auto-pays).
    """
    while True:
        try:
            await asyncio.sleep(60)
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor = db.contributor_drops.find(
                {"status": {"$in": ["active", "entries_closed"]},
                 "draw_date": {"$lte": now_iso}},
                {"_id": 0, "draw_id": 1, "status": 1, "title": 1},
            )
            async for d in cursor:
                draw_id = d.get("draw_id")
                try:
                    # Freeze if still active
                    if d.get("status") == "active":
                        await db.contributor_drops.update_one(
                            {"draw_id": draw_id, "status": "active"},
                            {"$set": {"status": "entries_closed",
                                      "entries_closed_at": now_iso,
                                      "frozen_by": "auto-scheduler"}},
                        )
                    # Run the draw using the same logic as the admin endpoint.
                    await _run_draw_internal(draw_id, run_by="auto-scheduler")
                    logger.info(f"[auto-draw] completed {draw_id} '{d.get('title')}'")
                except Exception as e:
                    logger.exception(f"[auto-draw] failed for {draw_id}: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception(f"[auto-draw] loop error: {e}")


async def _run_draw_internal(draw_id: str, run_by: str = "admin"):
    """Shared draw-execution helper (called by /admin/drops/{id}/run and by
    the auto-scheduler). Mirrors the admin endpoint logic."""
    import secrets
    d = await db.contributor_drops.find_one({"draw_id": draw_id}, {"_id": 0})
    if not d: return None
    if d.get("status") not in ("entries_closed", "active"):
        return None
    if d.get("status") == "active":
        await db.contributor_drops.update_one({"draw_id": draw_id},
            {"$set": {"status": "entries_closed",
                      "entries_closed_at": datetime.now(timezone.utc).isoformat()}})
    await db.contributor_drops.update_one({"draw_id": draw_id},
        {"$set": {"status": "drawing",
                  "drawing_started_at": datetime.now(timezone.utc).isoformat(),
                  "drawing_by": run_by}})
    tickets = await db.grid_tickets.find(
        {"draw_id": draw_id, "status": "active", "risk_status": "ok"},
        {"_id": 0},
    ).to_list(100_000)
    total_tickets = len(tickets)
    eligible_users = len({t["user_id"] for t in tickets})
    if total_tickets == 0:
        await db.contributor_drops.update_one({"draw_id": draw_id},
            {"$set": {"status": "completed",
                      "completed_at": datetime.now(timezone.utc).isoformat(),
                      "total_tickets": 0, "total_eligible_users": 0}})
        return {"winners": [], "total_tickets": 0}
    winners_pool, consumed_users, consumed_tickets = [], set(), set()
    for tier in d.get("prize_split", []):
        for _ in range(int(tier.get("winner_count", 0))):
            pool = [t for t in tickets if t["user_id"] not in consumed_users
                    and t["ticket_id"] not in consumed_tickets]
            if not pool: break
            chosen = pool[secrets.randbelow(len(pool))]
            consumed_users.add(chosen["user_id"])
            consumed_tickets.add(chosen["ticket_id"])
            uid = chosen["user_id"]
            masked = "GRD_" + uid.replace("-", "")[-4:].upper()
            now_iso = datetime.now(timezone.utc).isoformat()
            doc = {
                "winner_id": "WIN-" + uuid.uuid4().hex[:10].upper(),
                "id": str(uuid.uuid4()),
                "draw_id": draw_id, "month": d.get("month"),
                "ticket_id": chosen["ticket_id"], "user_id": uid,
                "username_masked": masked,
                "prize_tier": tier.get("tier_name"),
                "amount_usdt": float(tier.get("amount_usdt", 0)),
                "payout_status": "winner_selected",
                "wallet_address_masked": None,
                "created_at": now_iso, "approved_at": None, "paid_at": None,
                "selected_by": run_by,
            }
            await db.drop_winners.insert_one(doc)
            await db.grid_tickets.update_one(
                {"ticket_id": chosen["ticket_id"]},
                {"$set": {"status": "winner"}},
            )
            doc.pop("_id", None)
            winners_pool.append(doc)
    await db.contributor_drops.update_one({"draw_id": draw_id}, {"$set": {
        "status": "completed",
        "total_tickets": total_tickets,
        "total_eligible_users": eligible_users,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"winners": winners_pool, "total_tickets": total_tickets,
            "total_eligible_users": eligible_users}


# v1.5.0 — Register API router AFTER all endpoints (including Monthly
# Contributor Drop) have been declared.
app.include_router(api)


@app.on_event("shutdown")
async def shutdown():
    try:
        from pool_proxy import shutdown as pool_shutdown
        await pool_shutdown()
    except Exception:
        pass
    client.close()
