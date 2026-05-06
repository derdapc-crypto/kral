"""Iteration 6 — TGC Prestige Pi-economy backend tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["token"], r.json()["id"]


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return tok


@pytest.fixture(scope="module")
def worker():
    # use seeded worker; fall back to creating one if missing
    try:
        tok, uid = _login(WORKER_EMAIL, WORKER_PASSWORD)
    except AssertionError:
        email = f"worker_{uuid.uuid4().hex[:8]}@thegrid.io"
        rr = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"email": email, "password": "Worker@2026", "name": "W", "role": "user"}, timeout=20)
        assert rr.status_code == 200, rr.text
        tok, uid = rr.json()["token"], rr.json()["id"]
    return {"token": tok, "id": uid, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module", autouse=True)
def reset_shield(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    requests.post(f"{BASE_URL}/api/admin/shield", json={"difficulty_factor": 1.0}, headers=h, timeout=20)
    yield
    requests.post(f"{BASE_URL}/api/admin/shield", json={"difficulty_factor": 1.0}, headers=h, timeout=20)


# ---------- Wallet TGC fields ----------
class TestWalletTGC:
    def test_wallet_returns_tgc_fields(self, worker):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=worker["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        for f in ("tgc_balance", "tgc_total_earned", "tgc_balance_usdt_value",
                  "withdraw_threshold_tgc", "withdraw_threshold_usdt",
                  "tgc_per_usdt", "usdt_per_tgc", "can_withdraw",
                  "powered_up", "power_up_at", "power_up_seconds_remaining",
                  "device_tier"):
            assert f in d, f"missing {f}"
        assert d["withdraw_threshold_tgc"] == 200
        assert d["withdraw_threshold_usdt"] == 10.0
        assert d["tgc_per_usdt"] == 20.0
        assert d["usdt_per_tgc"] == 0.05


# ---------- Power-Up ----------
class TestPowerUp:
    def test_power_up_first_then_already_active(self, worker):
        r1 = requests.post(f"{BASE_URL}/api/wallet/power-up", headers=worker["headers"], timeout=20)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["powered_up"] is True
        # already_active may be True if previously powered up in this DB. Allow both, but ensure shape.
        assert "already_active" in d1
        assert d1.get("expires_in_seconds", 0) > 0

        r2 = requests.post(f"{BASE_URL}/api/wallet/power-up", headers=worker["headers"], timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["already_active"] is True
        assert d2["powered_up"] is True
        assert d2["expires_in_seconds"] > 0
        assert d2["expires_in_seconds"] <= 86400

    def test_power_up_status(self, worker):
        r = requests.get(f"{BASE_URL}/api/wallet/power-up/status", headers=worker["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["window_hours"] == 24
        assert "powered_up" in d
        assert "expires_in_seconds" in d


# ---------- Tier Forecast ----------
class TestTierForecast:
    @pytest.mark.parametrize("tier,daily_tgc,daily_usdt", [
        ("flagship", 6.0, 0.30), ("mid", 3.6, 0.18), ("budget", 2.0, 0.10),
    ])
    def test_tier_forecast(self, worker, tier, daily_tgc, daily_usdt):
        r = requests.get(f"{BASE_URL}/api/tier/forecast?tier={tier}", headers=worker["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["tier"] == tier
        assert abs(d["daily_tgc"] - daily_tgc) < 0.01
        assert abs(d["daily_usdt"] - daily_usdt) < 0.01
        assert "tiers" in d and set(d["tiers"].keys()) == {"flagship", "mid", "budget"}
        assert "shield_factor" in d


# ---------- Admin Shield ----------
class TestAdminShield:
    def test_admin_shield_get(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/shield", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["profit_floor"] == 0.30
        assert d["admin_binance_id"] == "117423210"
        assert "difficulty_factor" in d
        assert "current_margin" in d

    def test_admin_shield_set_halves_forecast(self, admin_token, worker):
        h = {"Authorization": f"Bearer {admin_token}"}
        rs = requests.post(f"{BASE_URL}/api/admin/shield", json={"difficulty_factor": 2.0}, headers=h, timeout=20)
        assert rs.status_code == 200
        assert rs.json()["difficulty_factor"] == 2.0
        # flagship 6 -> 3 TGC/day
        rf = requests.get(f"{BASE_URL}/api/tier/forecast?tier=flagship", headers=worker["headers"], timeout=20)
        assert rf.status_code == 200
        assert abs(rf.json()["daily_tgc"] - 3.0) < 0.01
        # reset
        rr = requests.post(f"{BASE_URL}/api/admin/shield", json={"difficulty_factor": 1.0}, headers=h, timeout=20)
        assert rr.status_code == 200

    def test_admin_shield_rejects_non_admin(self, worker):
        r1 = requests.get(f"{BASE_URL}/api/admin/shield", headers=worker["headers"], timeout=20)
        assert r1.status_code in (401, 403)
        r2 = requests.post(f"{BASE_URL}/api/admin/shield", json={"difficulty_factor": 1.5}, headers=worker["headers"], timeout=20)
        assert r2.status_code in (401, 403)
        # Unauth
        r3 = requests.get(f"{BASE_URL}/api/admin/shield", timeout=20)
        assert r3.status_code in (401, 403)


# ---------- TGC accrual via task submit ----------
class TestTGCAccrual:
    def _setup_device(self, headers, tier="flagship"):
        d = requests.post(f"{BASE_URL}/api/devices/register",
                          json={"name": "TEST_dev", "model": tier}, headers=headers, timeout=20)
        assert d.status_code == 200, d.text
        did = d.json()["id"]
        h = requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          json={"device_id": did, "charging": True, "wifi": True, "permission": True, "battery": 90},
                          headers=headers, timeout=20)
        assert h.status_code == 200 and h.json()["eligible"] is True
        return did

    def _submit_task(self, headers, did):
        rt = requests.post(f"{BASE_URL}/api/tasks/request?device_id={did}", headers=headers, timeout=20)
        assert rt.status_code == 200, rt.text
        task = rt.json()
        kind = task["kind"]
        if kind == "matrix":
            seed = task["payload"]["seed"]; size = task["payload"]["size"]
            expected = _matrix_signature(seed, size)
        else:
            nonce = task["payload"]["nonce"]; difficulty = task["payload"]["difficulty"]
            expected = _hash_signature(nonce, difficulty)
        sub = requests.post(f"{BASE_URL}/api/tasks/submit",
                            json={"task_id": task["id"], "device_id": did, "result": expected, "compute_ms": 250},
                            headers=headers, timeout=30)
        assert sub.status_code == 200, sub.text
        return sub.json()

    def test_accrual_with_power_up(self, worker):
        # Ensure powered up
        requests.post(f"{BASE_URL}/api/wallet/power-up", headers=worker["headers"], timeout=20)
        did = self._setup_device(worker["headers"], "flagship")
        before = requests.get(f"{BASE_URL}/api/wallet", headers=worker["headers"], timeout=20).json()["tgc_balance"]
        res = self._submit_task(worker["headers"], did)
        assert res.get("verified") is True
        assert res["powered_up"] is True
        assert res["earned_tgc"] > 0
        after = requests.get(f"{BASE_URL}/api/wallet", headers=worker["headers"], timeout=20).json()["tgc_balance"]
        assert after >= before  # rounding may be 0 for very small drips, but should not decrease


# ---------- Withdrawal ----------
class TestWithdraw:
    def test_withdraw_below_threshold_rejected(self, worker):
        r = requests.post(f"{BASE_URL}/api/wallet/withdraw",
                          json={"address": "TXxxxxxxxxxxxxxxxxxx"}, headers=worker["headers"], timeout=20)
        # could be 400 (below threshold) — message must mention 200 TGC
        if r.status_code == 400:
            assert "200" in r.text and "TGC" in r.text
        else:
            # If somehow >=200 already, ok; assert success shape
            assert r.status_code == 200
            d = r.json()
            assert "amount_tgc" in d and "amount_usdt" in d


# ---------- Mining Kill/Resume idempotent (P0 backend) ----------
class TestKillResume:
    def test_kill_and_resume(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        k = requests.post(f"{BASE_URL}/api/admin/mining/kill", headers=h, timeout=20)
        assert k.status_code == 200 and k.json()["kill_switch"] is True
        r = requests.post(f"{BASE_URL}/api/admin/mining/resume", headers=h, timeout=20)
        assert r.status_code == 200 and r.json()["kill_switch"] is False


# ---------- inline matrix/hash sig (matches server) ----------
def _mulberry32(seed):
    state = [seed & 0xFFFFFFFF]
    def nx():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nx


def _matrix_signature(seed, size):
    rng = _mulberry32(seed)
    n = size * size
    a = [int(rng() * 10) for _ in range(n)]
    b = [int(rng() * 10) for _ in range(n)]
    total = 0; trace = 0
    for i in range(size):
        for j in range(size):
            s = 0; row = i * size
            for k in range(size):
                s += a[row + k] * b[k * size + j]
            total += s
            if i == j: trace += s
    return f"{total}:{trace}"


def _hash_signature(nonce, difficulty):
    import hashlib
    i = 0
    while True:
        h = hashlib.sha256(f"{nonce}:{i}".encode()).hexdigest()
        if h.startswith("0" * difficulty):
            return f"{i}:{h}"
        i += 1
        if i > 2_000_000:
            return f"{i}:{h}"
