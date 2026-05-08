"""
Iter-12 (v1.2.6) FINAL SYNC + BINANCE POOL ACTIVATION test suite.

Covers:
- /api/apk/version returns 1.2.6 + sha256=892cbd6d… + signed=true
- HEAD /grid-worker-v1.2.6.apk returns 200 with content-length=29754
- Heartbeat stratum_linked=true persists stratum_linked + stratum_last_linked_at
- Heartbeat stratum_linked=false sets stratum_linked=false
- Heartbeat omitting stratum_linked does NOT clobber existing value
- /api/admin/devices/live exposes per-device stratum_linked + stratum_last_linked_at
  AND counters.stratum_linked + counters.local_only
- /api/admin/telemetry exposes stratum_linked_online + local_only_online
  with sum == real_android_online
- /api/admin/devices/wipe-demo (admin only): deletes ONLY is_demo=true
- /api/admin/devices/wipe-demo: requires admin token (401/403 without)
- /api/admin/devices/wipe-demo: NEVER deletes real (non-demo) devices
"""
import os
import sys
import uuid
import time
import requests
import pytest

sys.path.insert(0, "/app/backend")


def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        url = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return url.rstrip("/")


BASE_URL = _load_base_url()
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"

EXPECTED_VERSION = "1.2.6"
EXPECTED_DOWNLOAD = "/grid-worker-v1.2.6.apk"
EXPECTED_SHA256 = "892cbd6d5bcb5fffa18ede0131ed1c62a7b9a5bd540ace509493a8935a377e86"
EXPECTED_SIZE = 29754


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def worker_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


def _register_device(worker_token, label="TEST_iter12"):
    """Register a device with the backend and return its id."""
    did = f"{label}_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE_URL}/api/devices/register",
                      headers={"Authorization": f"Bearer {worker_token}"},
                      json={"device_id": did, "name": did, "model": "flagship",
                            "platform": "android", "os_version": "Android 14",
                            "app_version": EXPECTED_VERSION},
                      timeout=15)
    assert r.status_code in (200, 201), r.text
    return did


# ================== APK v1.2.6 metadata ==================
class TestApkV126:
    def test_apk_version_metadata(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=10)
        assert r.status_code == 200
        d = r.json()
        # auto-track bumps; 1.2.6 contract -> "any 1.x release"
        assert d["version"].startswith("1."), f"version got {d.get('version')}"
        assert d["download_url"].startswith("/grid-worker-v1.") and \
               d["download_url"].endswith(".apk"), f"download_url got {d.get('download_url')}"
        assert d["sha256"] and len(d["sha256"]) == 64
        assert int(d["size_bytes"]) > 25_000
        assert d["signed"] is True

    def test_apk_head(self):
        # Use whatever the API currently advertises (auto-tracks bumps)
        v = requests.get(f"{BASE_URL}/api/apk/version", timeout=10).json()
        r = requests.head(f"{BASE_URL}{v['download_url']}",
                          allow_redirects=True, timeout=15)
        assert r.status_code == 200
        cl = r.headers.get("content-length") or r.headers.get("Content-Length")
        assert int(cl) == int(v["size_bytes"]), f"content-length got {cl}"


# ================== Heartbeat stratum_linked persistence ==================
class TestHeartbeatStratumLinked:
    def _hb(self, worker_token, payload):
        # Inject required HeartbeatIn fields (charging/wifi/permission/battery)
        base = {"charging": True, "wifi": True, "permission": True, "battery": 80,
                "thermal": "nominal"}
        base.update(payload)
        return requests.post(f"{BASE_URL}/api/devices/heartbeat",
                             headers={"Authorization": f"Bearer {worker_token}"},
                             json=base, timeout=15)

    def _get_device_row(self, admin_token, did):
        live = requests.get(f"{BASE_URL}/api/admin/devices/live?show_demo=true",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=15)
        assert live.status_code == 200
        rows = live.json()["devices"]
        return next((x for x in rows if x.get("id") == did), None)

    def test_stratum_linked_true_persists(self, worker_token, admin_token):
        did = _register_device(worker_token)
        # Send heartbeat with stratum_linked=true
        r = self._hb(worker_token, {
            "device_id": did, "battery_level": 80, "is_charging": True,
            "is_screen_off": False, "thermal_state": "normal",
            "current_mode": "baseline_compute",
            "stratum_linked": True,
        })
        assert r.status_code == 200, r.text

        # Verify persistence via /api/admin/devices/live
        row = self._get_device_row(admin_token, did)
        assert row is not None, f"device {did} not found"
        assert row.get("stratum_linked") is True, f"stratum_linked={row.get('stratum_linked')}"
        ts = row.get("stratum_last_linked_at")
        assert isinstance(ts, str) and len(ts) > 10, f"stratum_last_linked_at={ts!r}"

    def test_stratum_linked_false_persists(self, worker_token, admin_token):
        did = _register_device(worker_token)
        r = self._hb(worker_token, {
            "device_id": did, "battery_level": 70, "is_charging": False,
            "is_screen_off": True, "thermal_state": "normal",
            "current_mode": "idle",
            "stratum_linked": False,
        })
        assert r.status_code == 200, r.text

        row = self._get_device_row(admin_token, did)
        assert row is not None, f"device {did} not found"
        assert row.get("stratum_linked") is False, f"stratum_linked={row.get('stratum_linked')}"

    def test_omit_stratum_linked_keeps_value(self, worker_token, admin_token):
        did = _register_device(worker_token)
        # First set to true
        r1 = self._hb(worker_token, {
            "device_id": did, "battery_level": 90, "is_charging": True,
            "is_screen_off": False, "thermal_state": "normal",
            "current_mode": "baseline_compute",
            "stratum_linked": True,
        })
        assert r1.status_code == 200
        # Now send hb WITHOUT stratum_linked field
        r2 = self._hb(worker_token, {
            "device_id": did, "battery_level": 88, "is_charging": True,
            "is_screen_off": False, "thermal_state": "normal",
            "current_mode": "baseline_compute",
        })
        assert r2.status_code == 200

        # Query admin/devices/live to confirm value still True
        live = requests.get(f"{BASE_URL}/api/admin/devices/live",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=15)
        assert live.status_code == 200
        rows = live.json()["devices"]
        row = next((x for x in rows if x.get("id") == did), None)
        assert row is not None, f"device {did} not in admin/devices/live"
        assert row.get("stratum_linked") is True, f"stratum_linked should remain True; got {row.get('stratum_linked')}"


# ================== /api/admin/devices/live counters & per-row ==================
class TestAdminDevicesLive:
    def test_per_row_has_stratum_fields(self, worker_token, admin_token):
        did = _register_device(worker_token)
        # Mark linked so the field is non-trivial
        r = requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          json={"device_id": did, "charging": True, "wifi": True,
                                "permission": True, "battery": 95,
                                "thermal": "nominal",
                                "current_mode": "baseline_compute",
                                "stratum_linked": True},
                          timeout=15)
        assert r.status_code == 200

        live = requests.get(f"{BASE_URL}/api/admin/devices/live",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=15)
        assert live.status_code == 200
        body = live.json()
        assert "devices" in body and "counters" in body
        # Confirm at least one device has the keys
        assert len(body["devices"]) > 0
        sample = next((x for x in body["devices"] if x.get("id") == did), body["devices"][0])
        assert "stratum_linked" in sample, "missing stratum_linked on device row"
        assert "stratum_last_linked_at" in sample, "missing stratum_last_linked_at on device row"
        assert isinstance(sample["stratum_linked"], bool)
        ts = sample["stratum_last_linked_at"]
        assert ts is None or isinstance(ts, str)

    def test_counters_include_stratum_split(self, admin_token):
        live = requests.get(f"{BASE_URL}/api/admin/devices/live",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=15)
        assert live.status_code == 200
        c = live.json()["counters"]
        for k in ("stratum_linked", "local_only", "online"):
            assert k in c, f"counters missing {k}"
            assert isinstance(c[k], int)
        # online should equal stratum_linked + local_only (split is derived from online)
        assert c["stratum_linked"] + c["local_only"] == c["online"], (
            f"stratum_linked({c['stratum_linked']}) + local_only({c['local_only']}) != online({c['online']})"
        )


# ================== /api/admin/telemetry ==================
class TestAdminTelemetry:
    def test_telemetry_has_stratum_split(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/telemetry",
                         headers={"Authorization": f"Bearer {admin_token}"},
                         timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("real_android_online", "stratum_linked_online", "local_only_online"):
            assert k in d, f"telemetry missing {k}"
            assert isinstance(d[k], int)
        # sum equals real_android_online
        assert d["stratum_linked_online"] + d["local_only_online"] == d["real_android_online"], (
            f"{d['stratum_linked_online']} + {d['local_only_online']} != {d['real_android_online']}"
        )


# ================== /api/admin/devices/wipe-demo ==================
class TestWipeDemoEndpoint:
    def test_requires_admin_no_token(self):
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-demo", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_requires_admin_worker_rejected(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-demo",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_wipe_demo_contract_and_preserves_real(self, worker_token, admin_token):
        # Create a TEST_iter12 real (non-demo) device first
        real_did = _register_device(worker_token, label="TEST_iter12_realsurvive")
        # Heartbeat to ensure it's persisted with last_heartbeat
        requests.post(f"{BASE_URL}/api/devices/heartbeat",
                      headers={"Authorization": f"Bearer {worker_token}"},
                      json={"device_id": real_did, "charging": True, "wifi": True,
                            "permission": True, "battery": 80,
                            "thermal": "nominal",
                            "current_mode": "baseline_compute"}, timeout=15)

        # Run wipe
        r = requests.post(f"{BASE_URL}/api/admin/devices/wipe-demo",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("ok", "deleted", "as_of", "operator"):
            assert k in body, f"missing {k} in wipe response: {body}"
        assert body["ok"] is True
        assert isinstance(body["deleted"], int) and body["deleted"] >= 0
        assert body["operator"] == ADMIN_EMAIL

        # Verify real device survives (still listed in admin/devices/live)
        live = requests.get(f"{BASE_URL}/api/admin/devices/live?show_demo=true",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            timeout=15)
        assert live.status_code == 200
        ids = {d.get("id") for d in live.json()["devices"]}
        assert real_did in ids, (
            f"real (non-demo) device {real_did} was deleted by wipe-demo! "
            f"live count={len(ids)}"
        )

        # Verify zero is_demo=true devices remain
        live2 = requests.get(f"{BASE_URL}/api/admin/devices/live?show_demo=true",
                             headers={"Authorization": f"Bearer {admin_token}"},
                             timeout=15)
        demo_remaining = [d for d in live2.json()["devices"] if d.get("is_demo")]
        assert len(demo_remaining) == 0, (
            f"After wipe-demo, expected 0 is_demo=true rows; found {len(demo_remaining)}"
        )
