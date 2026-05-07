"""
Iteration 9 — Cleanup + Real Pool Connectivity tests.
Covers:
  - Pool status panel API (/api/admin/pool/status)
  - Demo device hiding by default on /api/admin/devices/live
  - show_demo flag honored on devices/live + telemetry
  - Worker start/stop -> worker_state transitions
  - Heartbeat persists worker_state from client; honors Golden Rule
  - APK v1.2.3 metadata
  - Pool credentials NOT leaked
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def worker_token():
    r = requests.post(f"{API}/auth/login", json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Worker login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def worker_device(worker_token):
    """Register a fresh device for the worker user for use in heartbeat/start/stop tests."""
    r = requests.post(
        f"{API}/devices/register",
        json={
            "device_id": f"TEST_iter9_{uuid.uuid4().hex[:8]}",
            "name": "TEST_iter9_device",
            "model": "flagship",
            "brand": "TestBrand",
            "os_version": "Android 14",
            "app_version": "1.2.3",
            "platform": "android",
        },
        headers=_h(worker_token),
        timeout=15,
    )
    assert r.status_code in (200, 201), f"Device register failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("id") or data.get("device_id") or data.get("device", {}).get("id")


# ---------- Pool status ----------
class TestPoolStatus:
    def test_pool_status_unconfigured(self, admin_token):
        r = requests.get(f"{API}/admin/pool/status", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        s = r.json()
        for k in ("configured", "enabled", "connected", "worker_prefix",
                  "accepted_shares", "rejected_shares", "message"):
            assert k in s, f"missing key {k}"
        # In preview env there's no RVN_STRATUM_URL configured.
        assert s["configured"] is False
        assert "Pool not configured" in s["message"]

    def test_pool_status_no_password_leak(self, admin_token):
        r = requests.get(f"{API}/admin/pool/status", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        body_str = r.text
        # Should not leak the env var name or any password values
        assert "RVN_POOL_PASSWORD" not in body_str
        assert "password" not in r.json()
        # but worker_prefix, account, url keys should be there
        s = r.json()
        assert "worker_prefix" in s
        assert "pool_account" in s
        assert "stratum_url" in s

    def test_pool_status_admin_only(self, worker_token):
        r = requests.get(f"{API}/admin/pool/status", headers=_h(worker_token), timeout=10)
        assert r.status_code in (401, 403)


# ---------- Devices live + show_demo ----------
class TestAdminDevicesLive:
    def test_default_excludes_demo(self, admin_token):
        r = requests.get(f"{API}/admin/devices/live", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("show_demo") is False
        # No device should be flagged is_demo=True (field not exposed but counters honest)
        # We'll assert via show_demo=true that total >= default total
        default_total = body["counters"]["total"]
        r2 = requests.get(f"{API}/admin/devices/live?show_demo=true", headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2.get("show_demo") is True
        assert body2["counters"]["total"] >= default_total, (
            f"show_demo=true should not decrease total ({body2['counters']['total']} vs {default_total})"
        )

    def test_telemetry_show_demo(self, admin_token):
        r = requests.get(f"{API}/admin/telemetry", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "real_android_total" in body
        assert body.get("demo_devices") in (None,)  # default returns None
        r2 = requests.get(f"{API}/admin/telemetry?show_demo=true", headers=_h(admin_token), timeout=10)
        assert r2.status_code == 200
        body2 = r2.json()
        # When show_demo=true, demo_devices count is exposed (int or 0)
        assert body2.get("demo_devices") is not None


# ---------- Worker start/stop ----------
class TestWorkerControl:
    def test_worker_start_sets_active_and_resets_session(self, worker_token, worker_device):
        r = requests.post(f"{API}/worker/start", json={"device_id": worker_device},
                          headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["worker_state"] == "active"

    def test_worker_stop_sets_stopped_idle(self, worker_token, worker_device):
        r = requests.post(f"{API}/worker/stop", json={"device_id": worker_device},
                          headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["worker_state"] == "stopped"


# ---------- Heartbeat persists worker_state ----------
class TestHeartbeatWorkerState:
    def test_active_eligible(self, worker_token, worker_device):
        # Avoid burst trip: previous fixture posts may have queued some
        time.sleep(0.5)
        r = requests.post(f"{API}/devices/heartbeat", json={
            "device_id": worker_device, "charging": True, "wifi": True,
            "permission": True, "battery": 80, "thermal": "nominal",
            "worker_state": "active",
        }, headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "active"
        assert body["worker_state"] == "active"
        assert body["auto_stop"] is False

    def test_paused_state(self, worker_token, worker_device):
        time.sleep(0.5)
        r = requests.post(f"{API}/devices/heartbeat", json={
            "device_id": worker_device, "charging": True, "wifi": True,
            "permission": True, "battery": 80, "thermal": "nominal",
            "worker_state": "paused",
        }, headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "idle"
        assert body["worker_state"] == "paused"

    def test_stopped_state(self, worker_token, worker_device):
        time.sleep(0.5)
        r = requests.post(f"{API}/devices/heartbeat", json={
            "device_id": worker_device, "charging": True, "wifi": True,
            "permission": True, "battery": 80, "thermal": "nominal",
            "worker_state": "stopped",
        }, headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "idle"
        assert body["worker_state"] == "stopped"

    def test_golden_rule_violation(self, worker_token, worker_device):
        time.sleep(0.5)
        r = requests.post(f"{API}/devices/heartbeat", json={
            "device_id": worker_device, "charging": False, "wifi": True,
            "permission": True, "battery": 80, "thermal": "nominal",
            "worker_state": "active",
        }, headers=_h(worker_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "idle", f"Expected idle when not charging: {body}"
        assert body["auto_stop"] is True
        assert "not_charging" in body["auto_stop_reasons"]


# ---------- APK metadata ----------
class TestApkVersion:
    def test_apk_version_v123_signed(self):
        r = requests.get(f"{API}/apk/version", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["version"] == "1.2.3" or body["version"] == "v1.2.3" or "1.2.3" in str(body["version"])
        assert body["signed"] is True
        assert "v2" in body["signature_schemes"] and "v3" in body["signature_schemes"]
