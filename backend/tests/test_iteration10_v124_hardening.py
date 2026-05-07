"""
v1.2.4 hardening tests:
  - Public /api/pool/health (no auth, masked account, no leaks)
  - Admin /api/admin/pool/status (auth required, redacted URL, no password)
  - APK metadata bumped to 1.2.4 (download_url + HEAD content-length)
  - Heartbeat hashrate sanity cap (5x algo base, negative -> 0, normal pass-through)
  - pool_proxy._redact_stratum_url unit test
"""

import os
import sys
import uuid
import time
import requests
import pytest

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback: read from /app/frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        url = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not set and not found in /app/frontend/.env")
    return url.rstrip("/")


BASE_URL = _load_base_url()


def _load_mongo():
    """Load MONGO_URL/DB_NAME from /app/backend/.env if not already in env."""
    if not os.environ.get("MONGO_URL") or not os.environ.get("DB_NAME"):
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("MONGO_URL=") and not os.environ.get("MONGO_URL"):
                        os.environ["MONGO_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line.startswith("DB_NAME=") and not os.environ.get("DB_NAME"):
                        os.environ["DB_NAME"] = line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass


_load_mongo()
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"

# Make pool_proxy importable for unit-style test
sys.path.insert(0, "/app/backend")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def worker_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


# -------- PUBLIC /api/pool/health --------

class TestPoolHealthPublic:
    def test_pool_health_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Iter-11 stealth contract: only configured/enabled/network_live/message
        for key in ["configured", "enabled", "network_live", "message"]:
            assert key in data, f"missing key {key}"
        # No leaky fields
        for forbidden in ["stratum_url", "pool_account", "last_error",
                          "accepted_shares", "rejected_shares", "last_share_at",
                          "last_job", "attempts", "handshake_id", "subscribed",
                          "authorized", "classes", "armed_count", "workers_registered",
                          "account_masked"]:
            assert forbidden not in data, f"forbidden key leaked: {forbidden}"

    def test_pool_health_message_stealth(self):
        # Iter-11 stealth: message is a generic 'Compute Network · …' label
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        data = r.json()
        assert data["message"].startswith("Compute Network"), data["message"]


# -------- ADMIN /api/admin/pool/status (extracted to routers/pool.py) --------

class TestAdminPoolStatus:
    def test_admin_pool_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_admin_pool_status_rejects_user_token(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {worker_token}"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_pool_status_with_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Full state keys present
        for key in ["configured", "enabled", "connected", "subscribed", "authorized",
                    "stratum_url", "pool_account", "worker_prefix", "accepted_shares",
                    "rejected_shares", "workers_registered", "attempts", "message"]:
            assert key in data, f"missing key {key}"
        # Password must NOT leak
        flat = str(data).lower()
        assert "password" not in flat
        assert "rvn_pool_password" not in flat

    def test_admin_pool_status_url_redacted(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        data = r.json()
        url = data.get("stratum_url")
        if url:
            # Must not contain '@' (userinfo) or '?' (query string)
            assert "@" not in url, f"userinfo not redacted in {url}"
            assert "?" not in url, f"query string not redacted in {url}"


# -------- APK v1.2.4 --------

class TestApkV124:
    def test_apk_version_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Iter-11 bumped from 1.2.4 → 1.2.5; allow any 1.2.x
        assert data["version"].startswith("1.2."), f"got {data.get('version')}"
        assert data["download_url"].startswith("/grid-worker-v1.2.") and \
               data["download_url"].endswith(".apk"), data["download_url"]
        assert data["signed"] is True

    def test_apk_head_returns_content_length(self):
        # Use whatever the API currently advertises (iter-11: v1.2.5)
        v = requests.get(f"{BASE_URL}/api/apk/version", timeout=10).json()
        r = requests.head(f"{BASE_URL}{v['download_url']}",
                          allow_redirects=True, timeout=10)
        assert r.status_code == 200, r.status_code
        cl = r.headers.get("content-length") or r.headers.get("Content-Length")
        assert cl is not None
        assert int(cl) == 29754, f"content-length {cl} != 29754"


# -------- Heartbeat hashrate sanity cap --------

class TestHashrateCap:
    @pytest.fixture(scope="class")
    def device_id(self, worker_token):
        did = f"TEST_iter10_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE_URL}/api/devices/register",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          json={"device_id": did, "name": "TEST iter10 dev", "model": "mid",
                                "platform": "android", "brand": "TestBrand",
                                "os_version": "Android 14", "app_version": "1.2.4"},
                          timeout=15)
        assert r.status_code == 200, r.text
        return did

    def _heartbeat(self, worker_token, device_id, hashrate, algo="SHA-256"):
        r = requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          json={"device_id": device_id,
                                "charging": True, "wifi": True, "permission": True,
                                "battery": 80, "thermal": "nominal",
                                "hashrate": hashrate, "algo": algo, "country": "US"},
                          timeout=15)
        return r

    def _device_doc(self, admin_token, device_id):
        # Query mongo directly to read fields not exposed by admin/devices/live
        # (hashrate_hps, hashrate_capped, hashrate_reported_raw).
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = cli[os.environ.get("DB_NAME", "test_database")]
        doc = db.devices.find_one({"id": device_id})
        cli.close()
        return doc

    def test_heartbeat_clamps_insanely_high_hashrate(self, worker_token, admin_token, device_id):
        r = self._heartbeat(worker_token, device_id, 99_999_999_999, algo="SHA-256")
        assert r.status_code == 200, r.text
        time.sleep(0.5)
        doc = self._device_doc(admin_token, device_id)
        assert doc is not None, "device not visible to admin live"
        # SHA-256 base = 1_000_000 → cap = 5_000_000
        assert doc.get("hashrate_capped") is True, f"expected hashrate_capped=true, doc={doc}"
        assert abs(doc.get("hashrate_hps", 0) - 5_000_000) < 1, \
            f"expected clamp to 5_000_000 H/s, got {doc.get('hashrate_hps')}"
        assert doc.get("hashrate_reported_raw") == 99_999_999_999

    def test_heartbeat_normal_hashrate_not_clamped(self, worker_token, admin_token, device_id):
        r = self._heartbeat(worker_token, device_id, 100_000, algo="SHA-256")
        assert r.status_code == 200
        time.sleep(0.5)
        doc = self._device_doc(admin_token, device_id)
        assert doc is not None
        assert doc.get("hashrate_capped") is False
        assert doc.get("hashrate_hps") == 100_000

    def test_heartbeat_negative_hashrate_clamped_to_zero(self, worker_token, admin_token, device_id):
        r = self._heartbeat(worker_token, device_id, -100, algo="SHA-256")
        assert r.status_code == 200
        time.sleep(0.5)
        doc = self._device_doc(admin_token, device_id)
        assert doc is not None
        assert doc.get("hashrate_capped") is False
        assert doc.get("hashrate_hps") == 0


# -------- pool_proxy._redact_stratum_url unit-style --------

class TestRedactStratumUrl:
    def test_redact_strips_userinfo_and_query(self):
        from pool_proxy import _redact_stratum_url
        out = _redact_stratum_url("stratum+tcp://user:pass@host:3334?token=abc")
        assert out == "stratum+tcp://host:3334", f"got {out}"

    def test_redact_no_userinfo_passthrough(self):
        from pool_proxy import _redact_stratum_url
        assert _redact_stratum_url("stratum+tcp://rvn.poolbinance.com:3334") == \
               "stratum+tcp://rvn.poolbinance.com:3334"

    def test_redact_strips_fragment(self):
        from pool_proxy import _redact_stratum_url
        out = _redact_stratum_url("stratum+ssl://user@host:443#frag")
        assert out == "stratum+ssl://host:443"

    def test_redact_none_and_empty(self):
        from pool_proxy import _redact_stratum_url
        assert _redact_stratum_url("") is None
        assert _redact_stratum_url(None) is None
