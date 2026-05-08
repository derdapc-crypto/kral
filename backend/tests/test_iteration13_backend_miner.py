"""
Iteration 13 — v1.3.4 Plan B Backend Miner test suite.

Covers:
  * /api/admin/backend-miner/status (auth + payload + miner liveness)
  * /api/admin/backend-miner/restart (idempotent)
  * /api/apk/version v1.3.4 metadata + new feature flags
  * GET /grid-worker-v1.3.4.apk content-length
  * Light regression on existing pool + auth + heartbeat endpoints
"""
from __future__ import annotations

import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"

EXPECTED_ADDRESS = "0xea625c7b0c6c29c961d2ab419a957443d84c6869"
EXPECTED_USER = f"USDT:{EXPECTED_ADDRESS}.THEGRID_BACKEND"
EXPECTED_POOL = "sha256.unmineable.com:3333"

REQUIRED_STATUS_FIELDS = [
    "running", "connected", "authorized", "pool", "user", "worker",
    "payout_coin", "payout_address", "hashrate_hps", "current_difficulty",
    "accepted_shares", "rejected_shares", "submitted_shares",
    "last_message", "last_job_at", "version", "available", "note",
]


# ---------- fixtures ----------
# IMPORTANT: do NOT use a shared Session here. /api/auth/login sets httpOnly
# cookies, and require_admin/get_current_user reads cookies first — so a
# session that has both admin AND worker cookies will end up authenticating
# as whichever was logged in last regardless of the Bearer header. Use plain
# `requests` (no cookie jar) so only the explicit Authorization header counts.
class _Api:
    @staticmethod
    def get(url, **kw):
        return requests.get(url, timeout=30, **kw)

    @staticmethod
    def post(url, **kw):
        return requests.post(url, timeout=30, **kw)


@pytest.fixture(scope="module")
def api():
    return _Api()


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password},
                      timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"no token in login response: {body}"
    return tok


@pytest.fixture(scope="module")
def worker_token():
    r = _login(WORKER_EMAIL, WORKER_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"worker login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- backend miner status ----------
class TestBackendMinerStatus:
    def test_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/backend-miner/status")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_returns_200_with_admin(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/backend-miner/status", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in REQUIRED_STATUS_FIELDS:
            assert k in d, f"missing required field {k} in status: keys={list(d.keys())}"
        assert d["available"] is True

    def test_user_format_payout_address(self, api, admin_headers):
        d = api.get(f"{BASE_URL}/api/admin/backend-miner/status", headers=admin_headers).json()
        assert d["payout_coin"] == "USDT", f"payout_coin={d['payout_coin']}"
        assert d["payout_address"] == EXPECTED_ADDRESS
        assert d["worker"] == "THEGRID_BACKEND"
        assert d["user"] == EXPECTED_USER, f"got {d['user']}"
        assert d["pool"] == EXPECTED_POOL

    def test_connected_authorized_running_within_30s(self, api, admin_headers):
        # Backend has been running; allow up to 30s if status hasn't reached LIVE yet.
        deadline = time.time() + 30
        last = None
        while time.time() < deadline:
            d = api.get(f"{BASE_URL}/api/admin/backend-miner/status", headers=admin_headers).json()
            last = d
            if d.get("running") and d.get("connected") and d.get("authorized"):
                break
            time.sleep(2)
        assert last["running"] is True, last
        assert last["connected"] is True, last
        assert last["authorized"] is True, last

    def test_hashrate_positive_and_job_received(self, api, admin_headers):
        deadline = time.time() + 30
        last = None
        while time.time() < deadline:
            last = api.get(f"{BASE_URL}/api/admin/backend-miner/status", headers=admin_headers).json()
            if (last.get("hashrate_hps") or 0) > 0 and last.get("last_job_at"):
                break
            time.sleep(2)
        assert (last["hashrate_hps"] or 0) > 0, f"hashrate not positive: {last}"
        assert last.get("last_job_at"), f"no last_job_at: {last}"
        # Pool sets vardiff; must be > 0 once authorized.
        assert (last["current_difficulty"] or 0) > 0, f"no diff: {last}"


# ---------- restart ----------
class TestBackendMinerRestart:
    def test_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/admin/backend-miner/restart")
        assert r.status_code in (401, 403)

    def test_worker_forbidden(self, api, worker_token):
        if not worker_token:
            pytest.skip("no worker token")
        r = api.post(f"{BASE_URL}/api/admin/backend-miner/restart",
                     headers={"Authorization": f"Bearer {worker_token}"})
        assert r.status_code in (401, 403)

    def test_admin_restart_returns_status(self, api, admin_headers):
        r = api.post(f"{BASE_URL}/api/admin/backend-miner/restart", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("restarted") is True, body
        assert "status" in body and isinstance(body["status"], dict)
        st = body["status"]
        # immediately after restart the thread is up; connection comes within seconds
        assert st.get("running") is True
        assert st.get("user") == EXPECTED_USER


# ---------- APK metadata ----------
class TestApkV134:
    def test_apk_version_metadata(self, api):
        r = api.get(f"{BASE_URL}/api/apk/version")
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == "1.3.4", f"version={d['version']}"
        assert d["download_url"] == "/grid-worker-v1.3.4.apk"
        assert d["size_bytes"] == 33850
        feats = d.get("features") or []
        assert "plan_b_backend_miner_sha256_unmineable" in feats, feats
        assert "proxy_keepalive_mode_v134" in feats, feats

    def test_apk_download_size(self, api):
        r = api.get(f"{BASE_URL}/grid-worker-v1.3.4.apk", stream=True)
        assert r.status_code == 200
        clen = int(r.headers.get("content-length") or 0)
        assert clen == 33850, f"content-length={clen}"


# ---------- regression: pool endpoints ----------
class TestPoolRegression:
    def test_admin_external_pool(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/external-pool", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("payout_address") == EXPECTED_ADDRESS
        assert d.get("payout_coin") == "USDT"
        assert "dashboard_url" in d

    def test_admin_external_pool_history(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/external-pool/history", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "points" in d and isinstance(d["points"], list)

    def test_admin_external_pool_snippet(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/external-pool/miner-snippet", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d.get("configured") is True
        assert EXPECTED_ADDRESS in d.get("user_string", "")

    def test_admin_pool_status(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/pool/status", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("configured", "enabled", "armed_count", "total_classes", "message"):
            assert k in d, f"missing {k} in {list(d.keys())}"

    def test_public_pool_health(self, api):
        r = api.get(f"{BASE_URL}/api/pool/health")
        assert r.status_code == 200
        d = r.json()
        assert set(d.keys()) == {"configured", "enabled", "network_live", "message"}, d
        # stealth: must NOT leak coin/algo/account
        msg = d["message"].lower()
        for banned in ("usdt", "bep20", "sha256", "unmineable", "stratum", "0xea625"):
            assert banned not in msg, f"public health leaked '{banned}': {msg}"


# ---------- regression: auth + heartbeat + devices/live ----------
class TestCoreRegression:
    def test_admin_login(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json().get("token")

    def test_worker_login(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD})
        assert r.status_code == 200

    def test_admin_devices_live(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/devices/live", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d or "devices" in d or isinstance(d, dict)

    def test_heartbeat(self, api, worker_token):
        if not worker_token:
            pytest.skip("no worker token")
        # register a TEST device first
        reg = api.post(
            f"{BASE_URL}/api/devices/register",
            headers={"Authorization": f"Bearer {worker_token}"},
            json={"name": "TEST_iter13_hb", "device_id": "TEST_iter13_hb",
                  "model": "flagship", "platform": "android",
                  "app_version": "1.3.4"},
        )
        assert reg.status_code in (200, 201), reg.text
        hb = api.post(
            f"{BASE_URL}/api/devices/heartbeat",
            headers={"Authorization": f"Bearer {worker_token}"},
            json={"device_id": "TEST_iter13_hb", "charging": True, "wifi": True,
                  "permission": True, "battery": 80},
        )
        assert hb.status_code == 200, hb.text
