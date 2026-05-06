from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import secrets
import hashlib
import logging
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field


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

# ---------- THE GRID PRESTIGE ECONOMY (TGC - TheGrid Coin) ----------
# Fixed exchange: 100 TGC = 5 USDT  (1 TGC = $0.05)
USDT_PER_TGC = 0.05
TGC_PER_USDT = 20.0
WITHDRAW_THRESHOLD_TGC = 200.0          # 200 TGC = $10 USDT equivalent
SECONDS_PER_DAY = 86_400
POWER_UP_WINDOW_HOURS = 24
ADMIN_PROFIT_FLOOR = 0.30               # admin's 30% margin floor (untouchable)
ADMIN_BINANCE_ID = "117423210"
# 7:5 arbitrage rule — every $7 real-mined to admin = 100 TGC ($5) credited to user
ADMIN_ARBITRAGE_REAL_USDT = 7.0
ADMIN_ARBITRAGE_USER_USDT = 5.0
TIER_DAILY_TGC = {"flagship": 6.0, "mid": 3.6, "budget": 2.0}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="THE GRID API")
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
    current_mode: Optional[str] = None  # 'enterprise_job' | 'baseline_mining' | 'idle'


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
APK_VERSION = "1.0.2"
APK_PATH = "/grid-worker-v1.0.0.apk"
APK_RELEASE_NOTES = "Stability fixes · arm64-v8a + armeabi-v7a · Auto-update"
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
    kind = force_kind if force_kind in ("matrix", "hash") else random.choice(["matrix", "hash"])
    if kind == "matrix":
        seed = random.randint(1, 10_000_000)
        size = random.choice([16, 20, 24])
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
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Device Endpoints ----------
@api.post("/devices/register")
async def register_device(data: DeviceRegisterIn, user: dict = Depends(get_current_user)):
    if data.model not in MODEL_MULT:
        raise HTTPException(status_code=400, detail="Invalid model tier")
    device_id = str(uuid.uuid4())
    doc = {
        "id": device_id,
        "user_id": user["id"],
        "name": data.name,
        "model": data.model,
        "platform": data.platform,
        "fingerprint": data.fingerprint or secrets.token_hex(8),
        "brand": data.brand or "Apple",
        "os_version": data.os_version or "iOS 17.4",
        "thermal": "nominal",
        "status": "idle",
        "charging": False,
        "wifi": False,
        "permission": False,
        "battery": 100,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tasks_completed": 0,
        "total_flops": 0,
        "flagged": False,
    }
    await db.devices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    rows = await db.devices.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return rows


@api.post("/devices/heartbeat")
async def heartbeat(data: HeartbeatIn, user: dict = Depends(get_current_user)):
    dev = await db.devices.find_one({"id": data.device_id, "user_id": user["id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    # Golden Rule: only eligible when charging AND wifi AND permission
    eligible = data.charging and data.wifi and data.permission
    status_val = "active" if eligible else "idle"
    update_doc = {
        "charging": data.charging,
        "wifi": data.wifi,
        "permission": data.permission,
        "battery": data.battery,
        "thermal": data.thermal or "nominal",
        "status": status_val,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
    }
    if data.brand: update_doc["brand"] = data.brand
    if data.os_version: update_doc["os_version"] = data.os_version
    if data.hashrate is not None: update_doc["hashrate_hps"] = float(data.hashrate)
    if data.algo: update_doc["algo"] = data.algo
    if data.country: update_doc["country"] = data.country.upper()[:2]
    if data.lat is not None and -90 <= float(data.lat) <= 90:
        update_doc["lat"] = float(data.lat)
    if data.lng is not None and -180 <= float(data.lng) <= 180:
        update_doc["lng"] = float(data.lng)
    if data.current_mode in ("enterprise_job", "baseline_mining", "idle"):
        update_doc["current_mode"] = data.current_mode
    await db.devices.update_one({"id": data.device_id}, {"$set": update_doc})
    return {"eligible": eligible, "status": status_val}


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
            kind_force = random.choice(["matrix", "hash"])
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
    powered_up = _is_powered_up(u.get("power_up_at"))
    return {
        # Legacy USDT (kept for compatibility)
        "balance_usdt": u.get("balance_usdt", 0.0),
        "total_earned": u.get("total_earned", 0.0),
        "withdraw_threshold": WITHDRAW_THRESHOLD_TGC,  # now expressed in TGC
        # TGC Prestige economy
        "tgc_balance": round(tgc_balance, 4),
        "tgc_total_earned": round(tgc_total, 4),
        "tgc_balance_usdt_value": round(tgc_balance * USDT_PER_TGC, 4),
        "withdraw_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
        "withdraw_threshold_usdt": round(WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC, 2),
        "tgc_per_usdt": TGC_PER_USDT,
        "usdt_per_tgc": USDT_PER_TGC,
        "can_withdraw": tgc_balance >= WITHDRAW_THRESHOLD_TGC,
        # Power-up state
        "powered_up": powered_up,
        "power_up_at": u.get("power_up_at"),
        "power_up_seconds_remaining": _power_up_remaining_seconds(u.get("power_up_at")),
        "device_tier": u.get("device_tier", "mid"),
        "payouts": payouts,
    }


@api.post("/wallet/withdraw")
async def withdraw(data: WithdrawIn, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    tgc_bal = float(u.get("tgc_balance", 0.0))
    if tgc_bal < WITHDRAW_THRESHOLD_TGC:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum withdrawal is {int(WITHDRAW_THRESHOLD_TGC)} TGC (${WITHDRAW_THRESHOLD_TGC * USDT_PER_TGC:.2f} USDT)",
        )
    usdt_amount = round(tgc_bal * USDT_PER_TGC, 4)
    payout = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "amount_tgc": round(tgc_bal, 4),
        "amount_usdt": usdt_amount,
        "address": data.address,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payouts.insert_one(payout)
    await db.users.update_one({"id": user["id"]}, {"$set": {"tgc_balance": 0.0}})
    payout.pop("_id", None)
    return payout


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
        "tiers": {
            t: {
                "daily_tgc": round(TIER_DAILY_TGC[t] / max(1.0, shield), 2),
                "daily_usdt": round(TIER_DAILY_TGC[t] / max(1.0, shield) * USDT_PER_TGC, 4),
            }
            for t in TIER_DAILY_TGC
        },
        "shield_factor": shield,
        "tgc_value_usdt": USDT_PER_TGC,
        "withdraw_threshold_tgc": WITHDRAW_THRESHOLD_TGC,
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


# ---------- Admin ----------
@api.get("/admin/devices")
async def admin_devices(user: dict = Depends(require_admin)):
    rows = await db.devices.find({}, {"_id": 0}).sort("last_heartbeat", -1).to_list(500)
    return rows


@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return rows


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
    # Revenue from customers = sum of revenue_usdt across verified tasks (= sum of jobs.spent_usdt)
    rev_pipeline = [{"$group": {"_id": None, "total": {"$sum": "$spent_usdt"}}}]
    rev_agg = await db.jobs.aggregate(rev_pipeline).to_list(1)
    revenue = round(rev_agg[0]["total"] if rev_agg else 0.0, 6)

    # Worker payouts owed = sum of all users.balance_usdt + completed payouts
    user_owed = await db.users.aggregate([
        {"$match": {"role": "user"}},
        {"$group": {"_id": None, "owed": {"$sum": "$balance_usdt"},
                    "earned": {"$sum": "$total_earned"}}},
    ]).to_list(1)
    owed = round(user_owed[0]["owed"] if user_owed else 0.0, 6)
    paid_out = await db.payouts.aggregate([
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usdt"}}},
    ]).to_list(1)
    paid = round(paid_out[0]["total"] if paid_out else 0.0, 6)
    total_earned = round((user_owed[0]["earned"] if user_owed else 0.0), 6)

    pending_payouts = await db.payouts.aggregate([
        {"$match": {"status": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usdt"}}},
    ]).to_list(1)
    pending = round(pending_payouts[0]["total"] if pending_payouts else 0.0, 6)

    return {
        "revenue_usdt": revenue,
        "worker_owed_usdt": owed,
        "worker_paid_usdt": paid,
        "worker_total_earned_usdt": total_earned,
        "pending_withdrawals_usdt": pending,
        "platform_margin_usdt": round(max(0.0, revenue - total_earned), 6),
    }


# ---------- APK Distribution ----------
@api.get("/apk/version")
async def apk_version():
    """Latest APK metadata for the auto-update banner."""
    return {
        "version": APK_VERSION,
        "download_url": APK_PATH,
        "min_android": "8.0",
        "min_sdk": 26,
        "abi": ["arm64-v8a", "armeabi-v7a"],
        "release_notes": APK_RELEASE_NOTES,
        "released_at": "2026-02-15",
        "signed": False,  # MOCKED — real signing infra not available in sandbox
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
        mode = "baseline_mining"
    else:
        mode = "idle"

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
    ).to_list(1000)
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


app.include_router(api)

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


@app.websocket("/api/ws/admin/telemetry")
async def admin_telemetry_ws(websocket: WebSocket, token: str = ""):
    """Streams aggregate hashrate + active-node count every 2s to admin dashboards."""
    if not await _verify_ws_admin(token):
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
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com|http://localhost:3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
