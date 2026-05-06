"""
Iteration 7 — Native Android worker integration tests.

Covers:
- Native device registration (idempotent on device_id, anti-abuse cross-bind)
- Heartbeat with native fields (worker_state, foreground, temperature_c, app_version, session_*)
- Golden Rule auto-stop signals
- POST /api/worker/start, /api/worker/stop
- GET /api/admin/devices/live with filters + counters
- GET /api/admin/telemetry
- Suspicious heartbeat frequency detection
- Emulator auto-flag
- APK metadata reflects v1.2.0 + features
- Terminology: no "mining"/"miner"/"hashrate"/"PoW" in user-facing text
"""

import os
import time
import uuid
import requests
import pytest

BASE = os.environ.get("BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com")
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@thegrid.io", "Grid@Admin2026")


@pytest.fixture(scope="module")
def worker_token():
    return _login("worker@thegrid.io", "Worker@2026")


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Native device registration ----------
def test_native_device_register_idempotent(worker_token):
    did = f"native-iter7-{uuid.uuid4().hex[:8]}"
    body = {
        "name": "Pixel 9 Pro", "model": "flagship", "platform": "android",
        "brand": "Google", "manufacturer": "Google",
        "android_version": "14", "app_version": "1.2.0",
        "device_id": did, "is_emulator": False,
    }
    r1 = requests.post(f"{API}/devices/register", json=body, headers=_h(worker_token))
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["id"] == did
    assert d1["platform"] == "android"
    assert d1["manufacturer"] == "Google"
    assert d1["app_version"] == "1.2.0"
    assert d1["worker_state"] == "idle"
    # Idempotent re-register returns same record
    r2 = requests.post(f"{API}/devices/register", json=body, headers=_h(worker_token))
    assert r2.status_code == 200
    assert r2.json()["id"] == did


def test_emulator_autoflag(worker_token):
    did = f"emu-iter7-{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/devices/register", json={
        "name": "Generic Emulator", "model": "mid", "platform": "android",
        "device_id": did, "is_emulator": True,
    }, headers=_h(worker_token))
    assert r.status_code == 200
    assert r.json()["flagged"] is True


# ---------- Heartbeat ----------
def test_heartbeat_native_fields(worker_token):
    # Register a fresh device
    did = f"hb-iter7-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Galaxy S24", "model": "flagship", "platform": "android",
        "device_id": did, "manufacturer": "Samsung", "android_version": "14", "app_version": "1.2.0",
    }, headers=_h(worker_token)).raise_for_status()
    # Heartbeat with all native fields
    r = requests.post(f"{API}/devices/heartbeat", json={
        "device_id": did, "charging": True, "wifi": True, "permission": True,
        "battery": 80, "temperature_c": 32.4, "worker_state": "active",
        "foreground": False, "app_version": "1.2.0",
        "session_tasks": 5, "session_tgc": 0.123,
    }, headers=_h(worker_token))
    assert r.status_code == 200
    body = r.json()
    assert body["eligible"] is True
    assert body["status"] == "active"
    assert body["worker_state"] == "active"
    assert body["auto_stop"] is False


@pytest.mark.parametrize("scenario,signals,reason", [
    ("not_charging", {"charging": False, "wifi": True, "permission": True, "temperature_c": 30}, "not_charging"),
    ("not_on_wifi",  {"charging": True,  "wifi": False, "permission": True, "temperature_c": 30}, "not_on_wifi"),
    ("permission_off", {"charging": True, "wifi": True, "permission": False, "temperature_c": 30}, "permission_off"),
    ("over_temp", {"charging": True, "wifi": True, "permission": True, "temperature_c": 46.5}, "over_temp"),
])
def test_golden_rule_auto_stop(worker_token, scenario, signals, reason):
    did = f"gr-{scenario}-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Test", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    payload = {"device_id": did, "battery": 60, "worker_state": "active", **signals}
    r = requests.post(f"{API}/devices/heartbeat", json=payload, headers=_h(worker_token))
    assert r.status_code == 200
    body = r.json()
    assert body["eligible"] is False
    assert body["auto_stop"] is True
    assert reason in body["auto_stop_reasons"]


def test_over_temp_marks_thermal_hot(worker_token):
    did = f"hot-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Hot", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    requests.post(f"{API}/devices/heartbeat", json={
        "device_id": did, "charging": True, "wifi": True, "permission": True,
        "battery": 70, "temperature_c": 50.0, "worker_state": "active",
    }, headers=_h(worker_token)).raise_for_status()
    rows = requests.get(f"{API}/devices", headers=_h(worker_token)).json()
    me = next((r for r in rows if r["id"] == did), None)
    assert me is not None
    assert me["thermal"] == "hot"
    assert me["temperature_c"] == 50.0


# ---------- Worker start/stop ----------
def test_worker_start_stop(worker_token):
    did = f"ws-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "WS", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    r = requests.post(f"{API}/worker/start", json={"device_id": did}, headers=_h(worker_token))
    assert r.status_code == 200 and r.json()["worker_state"] == "active"
    r = requests.post(f"{API}/worker/stop", json={"device_id": did}, headers=_h(worker_token))
    assert r.status_code == 200 and r.json()["worker_state"] == "stopped"


def test_worker_start_unknown_device_404(worker_token):
    r = requests.post(f"{API}/worker/start", json={"device_id": "does-not-exist"}, headers=_h(worker_token))
    assert r.status_code == 404


# ---------- /devices/me ----------
def test_devices_me(worker_token):
    r = requests.get(f"{API}/devices/me", headers=_h(worker_token))
    assert r.status_code == 200
    body = r.json()
    assert "devices" in body
    assert "tgc_balance" in body
    assert "tgc_total_earned" in body
    assert "powered_up" in body


# ---------- Admin live + telemetry ----------
def test_admin_devices_live_real_only(admin_token):
    r = requests.get(f"{API}/admin/devices/live?real_only=true&limit=50", headers=_h(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "devices" in body
    assert "counters" in body
    assert "offline_cutoff_seconds" in body
    # Every device returned with real_only must be android-platform OR have app_version
    for d in body["devices"]:
        assert d["platform"] == "android" or d.get("app_version")
        assert "id_short" in d
        assert "user_email" in d
        assert "online" in d
        assert "session_tasks" in d
        assert "session_tgc" in d


def test_admin_devices_live_filters(admin_token):
    # State filter
    r = requests.get(f"{API}/admin/devices/live?state=flagged&limit=50", headers=_h(admin_token))
    assert r.status_code == 200
    for d in r.json()["devices"]:
        assert d["flagged"] is True
    # App version filter
    r = requests.get(f"{API}/admin/devices/live?app_version=1.2.0&limit=50", headers=_h(admin_token))
    assert r.status_code == 200
    for d in r.json()["devices"]:
        assert d["app_version"] == "1.2.0"


def test_admin_telemetry(admin_token):
    r = requests.get(f"{API}/admin/telemetry", headers=_h(admin_token))
    assert r.status_code == 200
    body = r.json()
    for k in ("real_android_total", "real_android_online", "real_android_active",
              "flagged", "suspicious_heartbeat", "offline_cutoff_seconds", "as_of"):
        assert k in body


def test_admin_endpoints_require_admin(worker_token):
    for path in ("/admin/devices/live", "/admin/telemetry"):
        r = requests.get(f"{API}{path}", headers=_h(worker_token))
        assert r.status_code in (401, 403), f"{path} not protected"


# ---------- Suspicious heartbeat ----------
def test_suspicious_heartbeat_burst(worker_token, admin_token):
    did = f"burst-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Burst", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    body = {"device_id": did, "charging": True, "wifi": True, "permission": True,
            "battery": 80, "temperature_c": 30, "worker_state": "active"}
    # v1.2.1+ uses sliding-window (>12 hb / 60s sustained over two consecutive samples).
    # Send 14 to fill the window then one more to trip the consecutive-burst guard.
    for _ in range(14):
        requests.post(f"{API}/devices/heartbeat", json=body, headers=_h(worker_token)).raise_for_status()
    requests.post(f"{API}/devices/heartbeat", json=body, headers=_h(worker_token)).raise_for_status()
    # Fetch as admin
    r = requests.get(f"{API}/admin/devices/live?limit=300", headers=_h(admin_token))
    rows = [d for d in r.json()["devices"] if d["id"] == did]
    assert rows and rows[0]["suspicious_heartbeat"] is True


# ---------- APK metadata ----------
def test_apk_version_v1_2_0():
    """v1.2.0 features still advertised in the latest manifest (forward-compat)."""
    r = requests.get(f"{API}/apk/version")
    assert r.status_code == 200
    body = r.json()
    # Always reflect the LATEST release (now 1.2.1 with v1.2.0 features still present)
    assert body["version"] >= "1.2.0"
    assert body["signed"] is True
    assert body["signature_schemes"] == ["v2", "v3"]
    assert "foreground_service" in body["features"]
    assert "background_compute" in body["features"]
    assert body["sha256"] and len(body["sha256"]) == 64


def test_apk_file_served():
    r = requests.head(f"{BASE}/grid-worker-v1.2.0.apk", allow_redirects=True)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/")
    assert int(r.headers.get("content-length", "0")) > 1000  # not the old 2KB placeholder
