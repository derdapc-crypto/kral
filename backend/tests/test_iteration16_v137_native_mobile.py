"""
v1.3.7 — Native RandomX Mobile Mining backend tests.

Coverage:
  - POST /api/devices/heartbeat (new fields, anti-spoof, clamps, enum normalization)
  - GET  /api/admin/mobile-mining/metrics (split mobile vs server)
  - GET  /api/apk/version (1.3.7 + features + leak guards)
  - GET  /grid-worker-v1.3.7.apk (binary served, content-length=33850)
  - Regression: /admin/external-pool, /admin/console/snapshot,
    /admin/randomx-miner/status, /admin/backend-miner/status,
    /admin/telegram/status
"""
import os
import re
import time
import uuid
import pytest
import requests

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    # fallback: read frontend/.env
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    try:
        with open(os.path.abspath(env_path)) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASS = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASS = "Worker@2026"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def worker_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": WORKER_EMAIL, "password": WORKER_PASS})
    if r.status_code != 200:
        pytest.skip(f"worker login failed: {r.status_code} {r.text}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _register_device(session, suffix: str) -> str:
    """Create a fresh device row owned by the worker user. Returns device_id."""
    payload = {
        "name": f"TEST_dev_{suffix}",
        "model": "flagship",
        "platform": "android",
        "brand": "Google",
        "os_version": "14",
        "manufacturer": "Google",
        "android_version": "14",
        "app_version": "1.3.7",
        "device_id": f"TEST-{suffix}-{uuid.uuid4().hex[:8]}",
        "is_emulator": False,
    }
    r = session.post(f"{API}/devices/register", json=payload)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("id") or body.get("device_id") or body["device"]["id"]


# ---------- /api/apk/version ----------
class TestApkVersion:
    def test_version_137(self):
        r = requests.get(f"{API}/apk/version")
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == "1.3.7"
        assert d["download_url"] == "/grid-worker-v1.3.7.apk"
        feats = d.get("features") or []
        for required in (
            "native_randomx_mobile_jni",
            "explicit_start_stop_mining",
            "mobile_mining_safety_guards",
            "honest_mining_status_telemetry",
        ):
            assert required in feats, f"missing feature flag: {required}"

    def test_no_secret_leakage_in_release_notes(self):
        r = requests.get(f"{API}/apk/version")
        assert r.status_code == 200
        notes = r.json().get("release_notes", "")
        # No BEP20 0x… address (40 hex)
        assert not re.search(r"0x[a-fA-F0-9]{40}", notes), "BEP20 hash leaked"
        # No XMR base58 address (95 chars starting 4)
        assert not re.search(r"\b4[1-9A-HJ-NP-Za-km-z]{94}\b", notes), "XMR addr leaked"
        # No pool host or worker id
        assert "supportxmr.com" not in notes
        assert "117423210" not in notes
        # No internal hostname (we're public)
        assert "thegrid.io" not in notes


# ---------- /grid-worker-v1.3.7.apk binary ----------
class TestApkBinary:
    def test_apk_binary_served(self):
        r = requests.get(f"{BASE_URL}/grid-worker-v1.3.7.apk", stream=True, timeout=30)
        assert r.status_code == 200
        cl = int(r.headers.get("content-length", "0"))
        assert cl == 33850, f"unexpected content-length: {cl}"


# ---------- /api/devices/heartbeat ----------
class TestHeartbeatNativeFields:
    def test_anti_spoof_native_pow_without_lib(self, worker_session):
        dev_id = _register_device(worker_session, "antispoof")
        # Claim native mining WITHOUT native_lib_loaded → must be clamped
        r = worker_session.post(f"{API}/devices/heartbeat", json={
            "device_id": dev_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 95, "thermal": "nominal",
            "native_pow": True,
            "native_lib_loaded": False,
            "mining_status": "running",
            "local_hashrate_hps": 800.0,
            "accepted_shares": 99,
        })
        assert r.status_code == 200, r.text
        # Re-fetch device list and check stored values
        dl = worker_session.get(f"{API}/devices")
        assert dl.status_code == 200
        device = next((x for x in dl.json() if x.get("id") == dev_id), None)
        assert device is not None
        assert device.get("native_pow") is False, "anti-spoof: native_pow must be False"
        assert float(device.get("local_hashrate_hps") or 0) == 0.0, \
            "anti-spoof: local hashrate must be zeroed when lib not loaded"

    def test_honest_native_mining_counted(self, worker_session):
        dev_id = _register_device(worker_session, "honest")
        r = worker_session.post(f"{API}/devices/heartbeat", json={
            "device_id": dev_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 90, "thermal": "nominal",
            "temperature_c": 36.0,
            "native_pow": True,
            "native_lib_loaded": True,
            "mining_status": "running",
            "local_hashrate_hps": 250.5,
            "accepted_shares": 2, "rejected_shares": 0,
            "battery_percent": 90, "charging_only": True, "wifi_only": True,
            "network_type": "wifi",
        })
        assert r.status_code == 200, r.text
        dl = worker_session.get(f"{API}/devices").json()
        device = next((x for x in dl if x.get("id") == dev_id), None)
        assert device is not None
        assert device.get("native_pow") is True
        assert abs(float(device.get("local_hashrate_hps")) - 250.5) < 0.01
        assert int(device.get("mobile_accepted_shares") or 0) == 2
        assert device.get("mining_status") == "running"
        assert device.get("network_type") == "wifi"

    def test_hashrate_clamp_to_1500(self, worker_session):
        dev_id = _register_device(worker_session, "clamp")
        r = worker_session.post(f"{API}/devices/heartbeat", json={
            "device_id": dev_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 80, "thermal": "nominal",
            "native_pow": True,
            "native_lib_loaded": True,
            "mining_status": "running",
            "local_hashrate_hps": 99999,
        })
        assert r.status_code == 200, r.text
        dl = worker_session.get(f"{API}/devices").json()
        device = next((x for x in dl if x.get("id") == dev_id), None)
        assert device is not None
        assert float(device.get("local_hashrate_hps") or 0) <= 1500.0, \
            f"hashrate not clamped: {device.get('local_hashrate_hps')}"
        assert float(device.get("local_hashrate_hps")) == 1500.0

    def test_mining_status_enum_normalization(self, worker_session):
        dev_id = _register_device(worker_session, "enum")
        r = worker_session.post(f"{API}/devices/heartbeat", json={
            "device_id": dev_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 80,
            "mining_status": "garbage_value",  # invalid
            "native_pow": False,
            "native_lib_loaded": False,
        })
        assert r.status_code == 200
        dl = worker_session.get(f"{API}/devices").json()
        device = next((x for x in dl if x.get("id") == dev_id), None)
        assert device.get("mining_status") in (
            "connected_only", "stopped", "warming", "throttled", "running", "unavailable"
        )


# ---------- /api/admin/mobile-mining/metrics ----------
class TestMobileMiningMetrics:
    def test_requires_admin_auth(self):
        r = requests.get(f"{API}/admin/mobile-mining/metrics")
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_admin_payload_shape(self, admin_session):
        r = admin_session.get(f"{API}/admin/mobile-mining/metrics")
        assert r.status_code == 200, r.text
        d = r.json()
        for key in (
            "connected_phones", "mining_phones", "mobile_native_hashrate_hps",
            "mobile_accepted_shares", "mobile_rejected_shares",
            "server_miner_hashrate_hps", "server_accepted_shares",
            "as_of", "honest_disclosure", "miners",
        ):
            assert key in d, f"missing key: {key}"
        assert isinstance(d["miners"], list)
        # No mobile devices currently connected → 0 expected for mobile metrics
        # (but anti-spoof tests above may have created stale rows; mining_phones
        # should still be 0 because anti-spoofed device is native_pow=False).
        # server_miner_hashrate_hps depends on xmrig running locally; do not assert >0.
        assert d["mobile_native_hashrate_hps"] >= 0
        assert d["server_miner_hashrate_hps"] >= 0

    def test_anti_spoofed_device_not_counted(self, worker_session, admin_session):
        # Create a fresh anti-spoofed device and confirm it is NOT in mining_phones
        dev_id = _register_device(worker_session, "metricspoof")
        worker_session.post(f"{API}/devices/heartbeat", json={
            "device_id": dev_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 95,
            "native_pow": True,
            "native_lib_loaded": False,  # spoof
            "local_hashrate_hps": 999,
        })
        time.sleep(0.5)
        d = admin_session.get(f"{API}/admin/mobile-mining/metrics").json()
        miners_ids = [m.get("device_id") for m in d.get("miners", [])]
        assert dev_id not in miners_ids, "anti-spoofed device leaked into miners list"


# ---------- regression ----------
class TestRegressionEndpoints:
    def test_admin_external_pool(self, admin_session):
        r = admin_session.get(f"{API}/admin/external-pool")
        assert r.status_code == 200, r.text

    def test_admin_console_snapshot(self, admin_session):
        r = admin_session.get(f"{API}/admin/console/snapshot")
        assert r.status_code == 200
        assert "events" in r.json()

    def test_admin_randomx_miner_status(self, admin_session):
        r = admin_session.get(f"{API}/admin/randomx-miner/status")
        assert r.status_code == 200

    def test_admin_backend_miner_status(self, admin_session):
        r = admin_session.get(f"{API}/admin/backend-miner/status")
        assert r.status_code == 200

    def test_admin_telegram_status(self, admin_session):
        r = admin_session.get(f"{API}/admin/telegram/status")
        assert r.status_code == 200
