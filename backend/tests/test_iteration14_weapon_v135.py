"""
Iteration 14 — v1.3.5 'WEAPON' sprint backend tests
Covers:
  - /api/admin/randomx-miner/status, /restart  (Plan A xmrig)
  - /api/admin/backend-miner/status (Plan B regression)
  - /api/admin/telegram/status, /test  (notifier env-unconfigured)
  - /api/apk/version v1.3.5 + new feature flags
  - /grid-worker-v1.3.5.apk
  - /api/admin/devices/wipe-all-fake (regex purge)
  - Regression: external-pool, pool/health, devices/live, telemetry, heartbeat, login
"""
import os
import time
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def worker_token():
    return _login(WORKER_EMAIL, WORKER_PASSWORD)


def _ah(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------- RandomX (Plan A) ----------------------------

class TestRandomXMiner:
    def test_status_unauth_rejected(self):
        r = requests.get(f"{BASE_URL}/api/admin/randomx-miner/status", timeout=10)
        assert r.status_code in (401, 403)

    def test_status_worker_forbidden(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/admin/randomx-miner/status", headers=_ah(worker_token), timeout=10)
        assert r.status_code in (401, 403)

    def test_status_admin_payload(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/randomx-miner/status", headers=_ah(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("running", "available", "pool", "user", "algorithm",
                  "accepted_shares", "current_difficulty", "threads", "version"):
            assert k in d, f"missing {k} in {list(d.keys())}"
        assert d["pool"] == "pool.supportxmr.com:443", d["pool"]
        assert d["algorithm"] == "rx/0"
        assert d["threads"] == 1
        assert "v1.3.5" in str(d["version"]).lower() or "weapon" in str(d["version"]).lower()
        assert "THEGRID_WEAPON" in d["user"], d["user"]
        # XMR address present
        assert "48edfHu7V9Z84YzzMa6fUueoELZ9ZRXq9VetWzYGzKt52XU5xvqgzYnDK9URnRoJMk1j8nLwEVsaSWJ4fhdUyZijBGUicoD" in d["user"]
        assert isinstance(d["accepted_shares"], int) and d["accepted_shares"] >= 0

    def test_hashrate_within_warmup_window(self, admin_token):
        # Allow up to 180s for scratchpad warmup
        deadline = time.time() + 180
        last = None
        while time.time() < deadline:
            r = requests.get(f"{BASE_URL}/api/admin/randomx-miner/status", headers=_ah(admin_token), timeout=10)
            if r.status_code == 200:
                last = r.json()
                hps = last.get("hashrate_hps") or last.get("hashrate") or 0
                if hps and float(hps) > 0:
                    return
            time.sleep(5)
        pytest.fail(f"randomx hashrate did not become positive within 180s; last={last}")

    def test_restart_admin(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/randomx-miner/restart", headers=_ah(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("restarted") is True
        assert "status" in d and isinstance(d["status"], dict)

    def test_restart_unauth(self):
        r = requests.post(f"{BASE_URL}/api/admin/randomx-miner/restart", timeout=10)
        assert r.status_code in (401, 403)

    def test_restart_worker_forbidden(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/admin/randomx-miner/restart", headers=_ah(worker_token), timeout=10)
        assert r.status_code in (401, 403)


# ---------------------------- Backend (Plan B) regression ----------------------------

class TestBackendMinerRegression:
    def test_status_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/backend-miner/status", headers=_ah(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("connected") is True, d
        assert d.get("authorized") is True, d


# ---------------------------- Telegram ----------------------------

class TestTelegram:
    def test_status_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/telegram/status", timeout=10)
        assert r.status_code in (401, 403)

    def test_status_admin_unconfigured(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/telegram/status", headers=_ah(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "step_usdt", "token_set", "chat_set", "instructions"):
            assert k in d, f"missing {k} in {list(d.keys())}"
        assert d["enabled"] is False
        assert d["token_set"] is False
        assert d["chat_set"] is False
        assert isinstance(d["instructions"], list) and len(d["instructions"]) > 0

    def test_test_admin_fail_closed(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/telegram/test", headers=_ah(admin_token), timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("sent") is False, d


# ---------------------------- APK v1.3.5 ----------------------------

class TestAPKv135:
    def test_apk_version_metadata(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == "1.3.5", d["version"]
        assert d["download_url"] == "/grid-worker-v1.3.5.apk", d["download_url"]
        assert d["size_bytes"] == 33850, d["size_bytes"]
        feats = d.get("features") or []
        for required in ("plan_a_randomx_engine", "plan_b_backend_compute",
                         "telegram_signal_line", "cyber_cyan_operator_panel"):
            assert required in feats, f"missing feature flag {required} in {feats}"

    def test_apk_download(self):
        r = requests.get(f"{BASE_URL}/grid-worker-v1.3.5.apk", timeout=15, allow_redirects=True)
        assert r.status_code == 200, r.status_code
        # Either content-length header or body length
        cl = r.headers.get("content-length")
        if cl is not None:
            assert int(cl) == 33850, cl
        assert len(r.content) == 33850, len(r.content)


# ---------------------------- Devices Wipe ----------------------------

class TestDevicesWipe:
    def test_wipe_all_fake_unauth(self):
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-all-fake", timeout=10)
        assert r.status_code in (401, 403)

    def test_wipe_all_fake_worker_forbidden(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-all-fake", headers=_ah(worker_token), timeout=10)
        assert r.status_code in (401, 403)

    def test_wipe_all_fake_admin(self, admin_token):
        # First, seed a fake device (heartbeat requires worker auth + prior register)
        wt = _login(WORKER_EMAIL, WORKER_PASSWORD)
        did = "TEST_iter14_fake"
        requests.post(
            f"{BASE_URL}/api/devices/register",
            json={"name": "fake", "model": "fake", "platform": "android",
                  "device_id": did, "app_version": "1.3.5"},
            headers=_ah(wt), timeout=10,
        )
        requests.post(
            f"{BASE_URL}/api/devices/heartbeat",
            json={"device_id": did, "charging": True, "wifi": True, "permission": True,
                  "battery": 80, "worker_state": "active"},
            headers=_ah(wt),
            timeout=10,
        )
        time.sleep(0.5)
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-all-fake", headers=_ah(admin_token), timeout=20)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("ok") is True
        assert "deleted" in d
        # Verify devices/live no longer contains TEST_ prefixed fakes
        live = requests.get(f"{BASE_URL}/api/admin/devices/live", headers=_ah(admin_token), timeout=10)
        assert live.status_code == 200
        ldata = live.json()
        # Accept either list or {devices:[]} shape
        items = ldata if isinstance(ldata, list) else ldata.get("devices", [])
        for dev in items:
            did = dev.get("id", "") or dev.get("device_id", "")
            # fake devices matching the regex must be gone OR be is_real_apk=true
            if re.match(r"^(TEST_|test_|hb-iter|native-iter|burst-|emu-|TEST-)", did):
                assert dev.get("is_real_apk") is True, f"fake survived: {did} -> {dev}"


# ---------------------------- Regression: existing endpoints ----------------------------

class TestRegression:
    def test_external_pool(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/external-pool", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_external_pool_history(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/external-pool/history", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_external_pool_snippet(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/external-pool/miner-snippet", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_admin_pool_status(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_public_pool_health(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        assert r.status_code == 200
        body = r.text.lower()
        for banned in ("usdt", "sha256", "unmineable", "stratum", "0xea625"):
            assert banned not in body, f"stealth leak: {banned} in /api/pool/health"

    def test_admin_devices_live(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/devices/live", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_admin_telemetry(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/telemetry", headers=_ah(admin_token), timeout=10)
        assert r.status_code == 200

    def test_devices_heartbeat(self, worker_token):
        did = "TEST_iter14_hb"
        requests.post(
            f"{BASE_URL}/api/devices/register",
            json={"name": "flagship", "model": "flagship", "platform": "android",
                  "device_id": did, "app_version": "1.3.5"},
            headers=_ah(worker_token), timeout=10,
        )
        r = requests.post(
            f"{BASE_URL}/api/devices/heartbeat",
            json={"device_id": did, "charging": True, "wifi": True, "permission": True,
                  "battery": 80, "worker_state": "active"},
            headers=_ah(worker_token),
            timeout=10,
        )
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"

    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_worker_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=10)
        assert r.status_code == 200
        assert "token" in r.json()
