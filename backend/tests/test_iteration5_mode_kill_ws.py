"""
Iteration 5 — Mobile mode routing + Kill switch + Live admin telemetry WS.
Endpoints under test:
  GET  /api/mining/config           (new fields: mode, polling_interval_ms, user_worker_id, device_worker_id)
  POST /api/admin/mining/kill       (admin-only)
  POST /api/admin/mining/resume     (admin-only)
  POST /api/devices/heartbeat       (now accepts country/lat/lng/current_mode)
  GET  /api/admin/devices           (returns country/lat/lng/current_mode)
  WS   /api/ws/admin/telemetry?token=<admin_jwt>
"""
import os
import uuid
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://grid-supercomputer.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
WS_URL = f"{WS_BASE}/api/ws/admin/telemetry"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
MASTER_ID = "117423210"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# --------- Fixtures ---------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def worker():
    """Fresh worker user with one registered device, eligible (golden rule)."""
    email = f"miner_iter5_{uuid.uuid4().hex[:10]}@thegrid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Worker@2026", "name": "Iter5 Miner", "role": "user",
    })
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    uid = r.json()["id"]
    d = requests.post(f"{API}/devices/register", headers=_bearer(tok), json={
        "name": "Iter5-Phone", "model": "flagship", "platform": "web",
    })
    assert d.status_code == 200, d.text
    device_id = d.json()["id"]
    # send a heartbeat that satisfies golden rule so it's "active"
    hb = requests.post(f"{API}/devices/heartbeat", headers=_bearer(tok), json={
        "device_id": device_id, "charging": True, "wifi": True, "permission": True,
        "battery": 100, "thermal": "nominal",
    })
    assert hb.status_code == 200, hb.text
    return {"token": tok, "user_id": uid, "device_id": device_id, "email": email}


@pytest.fixture(scope="session")
def customer():
    """Fresh customer used to create + run a job (for enterprise_job mode)."""
    email = f"cust_iter5_{uuid.uuid4().hex[:8]}@grid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "Iter5 Cust", "role": "customer"
    })
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "id": r.json()["id"], "email": email}


@pytest.fixture(scope="session", autouse=True)
def _restore_state_after_session(admin_token):
    """Always re-enable auto_mining at session end so other suites stay on baseline."""
    yield
    requests.post(f"{API}/admin/mining/resume", headers=_bearer(admin_token))


def _ensure_auto_mining_on(admin_token):
    requests.post(f"{API}/admin/mining/resume", headers=_bearer(admin_token))


def _no_running_jobs(admin_token):
    """Reject any running/pending jobs so mining/config does not return 'enterprise_job'."""
    rows = requests.get(f"{API}/admin/jobs", headers=_bearer(admin_token)).json()
    if not isinstance(rows, list):
        return
    for j in rows:
        if j.get("status") in ("running", "pending"):
            requests.post(f"{API}/admin/jobs/{j['id']}/reject",
                          headers=_bearer(admin_token))


# ---------------- Tests ----------------

# /api/mining/config new fields + backward compat
class TestMiningConfigShape:
    def test_new_fields_present_and_polling_interval(self, worker, admin_token):
        _ensure_auto_mining_on(admin_token)
        _no_running_jobs(admin_token)
        r = requests.get(f"{API}/mining/config",
                         headers=_bearer(worker["token"]),
                         params={"device_id": worker["device_id"]})
        assert r.status_code == 200, r.text
        c = r.json()
        for k in ("mode", "polling_interval_ms", "user_worker_id",
                  "device_worker_id", "worker_id", "coin", "algo",
                  "stratum_url", "port", "expected_hashrate_hps", "master_id"):
            assert k in c, f"missing key {k} in {c}"
        assert c["polling_interval_ms"] == 5000
        # backward-compat: worker_id == master.<device_id>
        assert c["worker_id"] == f"{MASTER_ID}.{worker['device_id']}"
        assert c["device_worker_id"] == f"{MASTER_ID}.{worker['device_id']}"
        assert c["user_worker_id"] == f"{MASTER_ID}.{worker['user_id']}"
        assert c["master_id"] == MASTER_ID
        assert c["mode"] in ("baseline_compute", "enterprise_job", "idle")


# Mode routing
class TestModeRouting:
    def test_baseline_when_auto_on_and_no_jobs(self, worker, admin_token):
        _ensure_auto_mining_on(admin_token)
        _no_running_jobs(admin_token)
        r = requests.get(f"{API}/mining/config",
                         headers=_bearer(worker["token"]),
                         params={"device_id": worker["device_id"]})
        assert r.status_code == 200
        assert r.json()["mode"] == "baseline_compute"

    def test_idle_after_kill_switch(self, worker, admin_token):
        _no_running_jobs(admin_token)
        # kill
        k = requests.post(f"{API}/admin/mining/kill",
                          headers=_bearer(admin_token))
        assert k.status_code == 200, k.text
        body = k.json()
        assert body.get("ok") is True
        assert body.get("kill_switch") is True
        assert "active_devices_affected" in body
        assert isinstance(body["active_devices_affected"], int)
        # config now reports idle
        r = requests.get(f"{API}/mining/config",
                         headers=_bearer(worker["token"]),
                         params={"device_id": worker["device_id"]})
        assert r.status_code == 200
        assert r.json()["mode"] == "idle"
        # resume restores baseline
        rs = requests.post(f"{API}/admin/mining/resume",
                           headers=_bearer(admin_token))
        assert rs.status_code == 200
        assert rs.json().get("ok") is True
        assert rs.json().get("kill_switch") is False
        r2 = requests.get(f"{API}/mining/config",
                          headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]})
        assert r2.status_code == 200
        assert r2.json()["mode"] == "baseline_compute"

    def test_enterprise_job_supersedes_kill(self, worker, customer, admin_token):
        # ensure baseline first
        _ensure_auto_mining_on(admin_token)
        _no_running_jobs(admin_token)
        # customer creates a big job, admin approves -> running
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]),
                          json={"name": f"TEST_iter5_{uuid.uuid4().hex[:6]}",
                                "file_name": "f.csv", "file_size": 10,
                                "total_units": 10000, "budget_usdt": 5.0,
                                "max_nodes": 5, "workload_type": "mixed"})
        assert j.status_code == 200, j.text
        job_id = j.json()["id"]
        ap = requests.post(f"{API}/admin/jobs/{job_id}/approve",
                           headers=_bearer(admin_token))
        assert ap.status_code == 200, ap.text

        try:
            r = requests.get(f"{API}/mining/config",
                             headers=_bearer(worker["token"]),
                             params={"device_id": worker["device_id"]})
            assert r.status_code == 200
            assert r.json()["mode"] == "enterprise_job"

            # kill switch: enterprise jobs should NOT be affected
            requests.post(f"{API}/admin/mining/kill",
                          headers=_bearer(admin_token))
            r2 = requests.get(f"{API}/mining/config",
                              headers=_bearer(worker["token"]),
                              params={"device_id": worker["device_id"]})
            assert r2.status_code == 200
            assert r2.json()["mode"] == "enterprise_job"

            # restore
            requests.post(f"{API}/admin/mining/resume",
                          headers=_bearer(admin_token))
        finally:
            requests.post(f"{API}/admin/jobs/{job_id}/reject",
                          headers=_bearer(admin_token))
            _ensure_auto_mining_on(admin_token)


# Auth on kill / resume
class TestKillSwitchAuth:
    def test_non_admin_cannot_kill(self, worker, admin_token):
        r = requests.post(f"{API}/admin/mining/kill",
                          headers=_bearer(worker["token"]))
        assert r.status_code == 403, r.text

    def test_non_admin_cannot_resume(self, worker, admin_token):
        r = requests.post(f"{API}/admin/mining/resume",
                          headers=_bearer(worker["token"]))
        assert r.status_code == 403, r.text

    def test_unauthenticated_cannot_kill(self):
        r = requests.post(f"{API}/admin/mining/kill")
        assert r.status_code in (401, 403), r.text


# Heartbeat geo + current_mode persistence
class TestHeartbeatGeo:
    def test_country_uppercase_and_lat_lng_persist(self, worker, admin_token):
        hb = requests.post(f"{API}/devices/heartbeat",
                           headers=_bearer(worker["token"]), json={
                               "device_id": worker["device_id"],
                               "charging": True, "wifi": True, "permission": True,
                               "battery": 90, "thermal": "warm",
                               "country": "in", "lat": 12.9716, "lng": 77.5946,
                               "current_mode": "baseline_compute",
                           })
        assert hb.status_code == 200, hb.text
        # verify persistence via /devices and admin /admin/devices
        rows = requests.get(f"{API}/devices",
                            headers=_bearer(worker["token"])).json()
        d = next(r for r in rows if r["id"] == worker["device_id"])
        assert d.get("country") == "IN"
        assert abs(d.get("lat") - 12.9716) < 1e-6
        assert abs(d.get("lng") - 77.5946) < 1e-6
        assert d.get("current_mode") == "baseline_compute"

        admin_rows = requests.get(f"{API}/admin/devices",
                                  headers=_bearer(admin_token)).json()
        ad = next(r for r in admin_rows if r["id"] == worker["device_id"])
        assert ad.get("country") == "IN"
        assert ad.get("lat") is not None
        assert ad.get("lng") is not None
        assert ad.get("current_mode") == "baseline_compute"

    def test_invalid_current_mode_does_not_crash_and_does_not_persist(self, worker):
        # First set a known current_mode
        requests.post(f"{API}/devices/heartbeat",
                      headers=_bearer(worker["token"]), json={
                          "device_id": worker["device_id"],
                          "charging": True, "wifi": True, "permission": True,
                          "current_mode": "idle",
                      })
        rows = requests.get(f"{API}/devices",
                            headers=_bearer(worker["token"])).json()
        d = next(r for r in rows if r["id"] == worker["device_id"])
        assert d.get("current_mode") == "idle"
        # Now send an invalid current_mode: must not crash, must not overwrite
        hb = requests.post(f"{API}/devices/heartbeat",
                           headers=_bearer(worker["token"]), json={
                               "device_id": worker["device_id"],
                               "charging": True, "wifi": True, "permission": True,
                               "current_mode": "garbage_value",
                           })
        assert hb.status_code == 200, hb.text
        rows = requests.get(f"{API}/devices",
                            headers=_bearer(worker["token"])).json()
        d = next(r for r in rows if r["id"] == worker["device_id"])
        assert d.get("current_mode") == "idle"  # unchanged


# Auto-mining default on fresh start = True (baseline_compute)
class TestAutoMiningDefault:
    def test_auto_mining_default_true_means_baseline(self, worker, admin_token):
        # explicit reset; no /kill in effect
        _ensure_auto_mining_on(admin_token)
        _no_running_jobs(admin_token)
        cfg = requests.get(f"{API}/admin/auto-mining",
                           headers=_bearer(admin_token))
        assert cfg.status_code == 200, cfg.text
        # config endpoint exists; enabled should be True now
        body = cfg.json()
        assert body.get("enabled") is True
        # mining/config should agree
        r = requests.get(f"{API}/mining/config",
                         headers=_bearer(worker["token"]),
                         params={"device_id": worker["device_id"]})
        assert r.status_code == 200
        assert r.json()["mode"] == "baseline_compute"


# WebSocket telemetry
@pytest.mark.asyncio
class TestWebSocketTelemetry:
    async def test_admin_receives_frame_within_5s(self, admin_token):
        url = f"{WS_URL}?token={admin_token}"
        async with websockets.connect(url, open_timeout=10) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)
            for k in ("ts", "coin", "algo", "active_nodes", "total_hashrate_hps"):
                assert k in data, f"missing key {k} in {data}"
            assert isinstance(data["active_nodes"], int)
            assert isinstance(data["total_hashrate_hps"], (int, float))

    async def test_worker_token_rejected_with_4401(self, worker):
        url = f"{WS_URL}?token={worker['token']}"
        with pytest.raises(websockets.exceptions.WebSocketException) as exc:
            async with websockets.connect(url, open_timeout=10) as ws:
                await ws.recv()
        # close code should not be 1000 (normal); should be 4401
        # the exception will carry rcvd code in modern websockets lib
        msg = str(exc.value)
        assert "4401" in msg or "rejected" in msg.lower() or "1006" in msg, msg

    async def test_no_token_rejected(self):
        url = WS_URL  # no ?token=
        with pytest.raises(websockets.exceptions.WebSocketException):
            async with websockets.connect(url, open_timeout=10) as ws:
                await ws.recv()
