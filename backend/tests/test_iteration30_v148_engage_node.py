"""
Iteration 30 / v1.4.8 — Cloud Compute Node overhaul backend tests.
- APK metadata: version=1.4.8, native lib embedded, sha256 truthful, size>=380KB
- Admin metrics: backend_compute / mobile_compute / total_compute lanes
- Heartbeat: new v1.4.8 fields (node_state, eco_mode, allow_on_battery, node_engaged, active_threads)
- APK file reachable via HTTP HEAD
- Regression: /api/auth/me, /api/auth/refresh, /api/pool/health, /api/admin/console/snapshot
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else "https://grid-supercomputer.preview.emergentagent.com"
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def worker_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # try register
        s.post(f"{BASE_URL}/api/auth/register",
               json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD, "name": "Worker", "role": "user"},
               timeout=20)
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Worker login failed: {r.status_code}")
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ------ APK version meta ------
class TestAPKVersion:
    def test_version_148_native_lib(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("version") == "1.4.8", f"version={d.get('version')}"
        assert d.get("native_lib_embedded") is True, "native_lib not embedded"
        assert isinstance(d.get("sha256"), str) and len(d["sha256"]) == 64
        assert int(d.get("size_bytes", 0)) >= 380_000, f"size={d.get('size_bytes')}"

    def test_apk_file_reachable(self):
        url = f"{BASE_URL}/grid-worker-v1.4.8.apk"
        # Try HEAD first; some CDNs only allow GET
        r = requests.head(url, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            r = requests.get(url, timeout=30, stream=True)
        assert r.status_code == 200, f"APK URL HTTP {r.status_code}"
        cl = int(r.headers.get("content-length") or 0)
        if cl:
            assert cl >= 380_000, f"content-length too small: {cl}"
        ct = r.headers.get("content-type", "")
        # Acceptable types
        assert ("vnd.android.package-archive" in ct
                or "octet-stream" in ct
                or "application/zip" in ct
                or ct == ""), f"unexpected content-type: {ct}"


# ------ Admin Mining Metrics 3-lane ------
class TestAdminMobileMiningMetrics:
    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/mobile-mining/metrics", timeout=15)
        assert r.status_code in (401, 403)

    def test_three_lanes_present(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mobile-mining/metrics", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # backend_compute
        bc = d.get("backend_compute")
        assert isinstance(bc, dict), "backend_compute missing"
        for k in ("label", "engines", "hashrate_hps", "accepted_outputs",
                  "randomx_running", "sha256_running", "active"):
            assert k in bc, f"backend_compute missing key: {k}"
        # mobile_compute
        mc = d.get("mobile_compute")
        assert isinstance(mc, dict), "mobile_compute missing"
        for k in ("label", "connected_phones", "engaged_phones", "hashrate_hps",
                  "submitted_outputs", "accepted_outputs", "rejected_outputs", "active"):
            assert k in mc, f"mobile_compute missing key: {k}"
        # total_compute
        tc = d.get("total_compute")
        assert isinstance(tc, dict), "total_compute missing"
        for k in ("label", "hashrate_hps", "accepted_outputs", "active_workers"):
            assert k in tc, f"total_compute missing key: {k}"


# ------ Heartbeat v1.4.8 fields ------
class TestHeartbeatV148:
    @pytest.fixture(scope="class")
    def device_id(self, worker_session):
        # Register a real-apk style device
        did = str(uuid.uuid4())
        payload = {
            "name": "TEST_v148_device",
            "model": "mid",
            "platform": "android",
            "device_id": did,
            "app_version": "1.4.8",
            "brand": "Test",
            "os_version": "Android 14",
        }
        r = worker_session.post(f"{BASE_URL}/api/devices/register", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return did

    def test_heartbeat_with_new_fields(self, worker_session, device_id):
        hb = {
            "device_id": device_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 80,
            "node_state": "engaged_full",
            "eco_mode": False,
            "allow_on_battery": True,
            "node_engaged": True,
            "active_threads": 8,
            "mining_status": "running",
        }
        r = worker_session.post(f"{BASE_URL}/api/devices/heartbeat", json=hb, timeout=15)
        assert r.status_code == 200, r.text

    def test_heartbeat_eco_mode_status(self, worker_session, device_id):
        hb = {
            "device_id": device_id,
            "charging": False, "wifi": True, "permission": True,
            "battery": 60,
            "node_state": "engaged_eco",
            "eco_mode": True,
            "allow_on_battery": True,
            "node_engaged": True,
            "active_threads": 4,
            "mining_status": "eco",
        }
        r = worker_session.post(f"{BASE_URL}/api/devices/heartbeat", json=hb, timeout=15)
        assert r.status_code == 200, r.text

    def test_heartbeat_paused_states(self, worker_session, device_id):
        for ns, ms in (("paused_power", "paused_power"),
                       ("paused_battery", "paused_battery"),
                       ("paused_thermal", "stopped")):
            hb = {
                "device_id": device_id,
                "charging": False, "wifi": True, "permission": True,
                "battery": 20,
                "node_state": ns, "eco_mode": False,
                "allow_on_battery": True, "node_engaged": False,
                "active_threads": 0, "mining_status": ms,
            }
            r = worker_session.post(f"{BASE_URL}/api/devices/heartbeat", json=hb, timeout=15)
            assert r.status_code == 200, f"node_state={ns} -> {r.status_code} {r.text}"

    def test_heartbeat_invalid_node_state_normalized(self, worker_session, device_id):
        hb = {
            "device_id": device_id,
            "charging": True, "wifi": True, "permission": True,
            "battery": 70,
            "node_state": "garbage_state_xyz",
            "active_threads": 99,
        }
        r = worker_session.post(f"{BASE_URL}/api/devices/heartbeat", json=hb, timeout=15)
        # Should accept (200) since server normalizes to 'idle'
        assert r.status_code == 200, r.text


# ------ Regression ------
class TestRegression:
    def test_auth_me(self, worker_session):
        r = worker_session.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json().get("email") == WORKER_EMAIL

    def test_auth_refresh(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=15)
        assert r.status_code == 200
        # Cookies should be set; call refresh
        r2 = s.post(f"{BASE_URL}/api/auth/refresh", timeout=15)
        assert r2.status_code == 200, r2.text
        assert "token" in r2.json()

    def test_pool_health_public(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("configured", "enabled", "network_live", "message"):
            assert k in d

    def test_admin_console_snapshot(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/console/snapshot?limit=10", timeout=15)
        assert r.status_code == 200
        assert "events" in r.json()
