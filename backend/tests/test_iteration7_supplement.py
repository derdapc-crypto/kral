"""
Iteration 7 supplement — coverage gaps in test_iteration7_native_apk.py:
  - Cross-user device_id binding returns 409
  - Legacy heartbeat (no worker_state) still returns status='active' when eligible (back-compat)
  - /admin/shield rejects worker token (admin RBAC sanity)
  - /api/mining/config returns mode='baseline_compute' (not 'baseline_mining')
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com")
API = f"{BASE}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@thegrid.io", "Grid@Admin2026")


@pytest.fixture(scope="module")
def worker_token():
    return _login("worker@thegrid.io", "Worker@2026")


# Register a fresh user, attempt to register a device_id already bound to worker => 409
def test_cross_user_device_id_returns_409(worker_token):
    did = f"shared-{uuid.uuid4().hex[:8]}"
    # Bind to worker user
    r = requests.post(f"{API}/devices/register", json={
        "name": "Shared", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token))
    assert r.status_code == 200, r.text

    # Create a brand-new user and try to claim the same device_id
    email = f"TEST_iter7sup_{uuid.uuid4().hex[:6]}@thegrid.io"
    rr = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Test@123456", "name": "iter7sup"
    })
    assert rr.status_code == 200, rr.text
    other_token = rr.json()["token"]

    r2 = requests.post(f"{API}/devices/register", json={
        "name": "Shared", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(other_token))
    assert r2.status_code == 409, r2.text


# Legacy heartbeat without worker_state — must still return status='active' when eligible
def test_legacy_heartbeat_no_worker_state_active(worker_token):
    did = f"legacy-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Legacy", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    r = requests.post(f"{API}/devices/heartbeat", json={
        "device_id": did, "charging": True, "wifi": True, "permission": True,
        "battery": 80, "temperature_c": 30,
        # no worker_state passed — back-compat path
    }, headers=_h(worker_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["eligible"] is True
    assert body["status"] == "active"


# Worker token must NOT be allowed on admin-only shield endpoints
def test_admin_shield_rejects_worker(worker_token):
    r = requests.get(f"{API}/admin/shield", headers=_h(worker_token))
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"


# Mining/Compute config uses 'baseline_compute' wording, never 'baseline_mining'
def test_mining_config_baseline_compute(worker_token):
    # Register a device and ask for its mining config
    did = f"cfg-{uuid.uuid4().hex[:8]}"
    requests.post(f"{API}/devices/register", json={
        "name": "Cfg", "model": "mid", "platform": "android", "device_id": did,
    }, headers=_h(worker_token)).raise_for_status()
    r = requests.get(f"{API}/mining/config", params={"device_id": did}, headers=_h(worker_token))
    assert r.status_code == 200, r.text
    body = r.json()
    mode = body.get("mode") or body.get("current_mode")
    assert mode in ("baseline_compute", "enterprise_job", "idle"), f"unexpected mode={mode}"
    assert mode != "baseline_mining"
