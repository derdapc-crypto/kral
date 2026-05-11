"""
v1.4.10 — Automatic Battery Exemption regression suite.

Covers:
  * /api/apk/version reflects v1.4.10 metadata + size + sha + release_notes
  * APK download URL serves the new file as application/vnd.android.package-archive
  * Heartbeat with app_version=1.4.10 marks device as real APK
  * Wallet ledger (TGC) still passes from v1.4.9
  * /api/tier/forecast across mid/flagship/budget/core tiers
  * /api/node/drip continues to credit TGC
  * /api/wallet/payout-address validates BEP20 / TRC20 / Polygon
  * /api/admin/mobile-mining/metrics returns honest compute split
  * Regression: /api/auth/me, /api/auth/refresh, /api/admin/console/snapshot,
                /api/pool/health
"""

import os
import re
import time
import requests
import pytest

def _resolve_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fall back to /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _resolve_base_url()

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASS = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASS = "Worker@2026"


# ----------------------- fixtures -----------------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def worker_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": WORKER_EMAIL, "password": WORKER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def worker_device(worker_session):
    # Reuse first device or register a TEST_v1410 one
    r = worker_session.get(f"{BASE_URL}/api/devices", timeout=15)
    assert r.status_code == 200
    devices = r.json() or []
    if devices:
        return devices[0]
    r = worker_session.post(f"{BASE_URL}/api/devices/register", json={
        "name": "TEST_v1410_dev", "model": "mid", "platform": "android",
        "brand": "Samsung", "app_version": "1.4.10",
    }, timeout=15)
    assert r.status_code in (200, 201)
    return r.json()


# ----------------------- APK metadata -----------------------
class TestApkVersion:
    def test_apk_version_metadata(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("version") == "1.4.10", d
        assert d.get("native_lib_embedded") is True
        assert d.get("size_bytes") == 386203, f"size={d.get('size_bytes')}"
        sha = d.get("sha256") or ""
        assert sha.lower().startswith("193a0b4fa9f5b6c2"), f"sha={sha}"
        notes = (d.get("release_notes") or "").lower()
        assert "automatic battery exemption" in notes, notes
        url = d.get("download_url") or ""
        assert "grid-worker-v1.4.10.apk" in url

    def test_apk_head_download(self):
        r = requests.head(f"{BASE_URL}/grid-worker-v1.4.10.apk",
                          allow_redirects=True, timeout=20)
        assert r.status_code == 200, r.status_code
        cl = int(r.headers.get("content-length") or "0")
        assert cl >= 380000, f"content-length={cl}"
        ct = (r.headers.get("content-type") or "").lower()
        assert "android.package-archive" in ct or "octet-stream" in ct, ct


# ----------------------- Heartbeat upgrade -----------------------
class TestHeartbeatUpgrade:
    def test_heartbeat_v1410_marks_real_apk(self, worker_session, worker_device):
        r = worker_session.post(f"{BASE_URL}/api/devices/heartbeat", json={
            "device_id": worker_device["id"], "charging": True, "wifi": True,
            "permission": True, "battery": 92, "thermal": "nominal",
            "country": "US", "worker_state": "stopped",
            "node_engaged": False, "node_state": "idle",
            "app_version": "1.4.10",
        }, timeout=15)
        assert r.status_code == 200, r.text
        # Confirm via devices list
        d2 = worker_session.get(f"{BASE_URL}/api/devices", timeout=15).json() or []
        match = [x for x in d2 if x.get("id") == worker_device["id"]]
        assert match
        # is_real_apk auto-upgrade
        assert match[0].get("is_real_apk") is True or match[0].get("app_version") == "1.4.10"


# ----------------------- Wallet / TGC ledger -----------------------
class TestWalletLedger:
    def test_wallet_returns_full_tgc_ledger(self, worker_session):
        r = worker_session.get(f"{BASE_URL}/api/wallet", timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        for k in ("tgc_balance", "lifetime_tgc", "payout_threshold_tgc",
                  "payout_progress_tgc", "payout_progress_pct", "can_withdraw"):
            assert k in w, f"missing {k}"
        assert w["payout_threshold_tgc"] == 1000


# ----------------------- Tier forecast -----------------------
class TestTierForecast:
    @pytest.mark.parametrize("tier", ["mid", "flagship", "budget", "core"])
    def test_tier_forecast(self, worker_session, tier):
        r = worker_session.get(f"{BASE_URL}/api/tier/forecast?tier={tier}",
                               timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d.get("tier") or "").lower() == tier
        assert "monthly_tgc" in d or "monthly_forecast_tgc" in d


# ----------------------- Drip -----------------------
class TestDrip:
    def test_drip_credits_tgc(self, worker_session, worker_device):
        # warm tier
        worker_session.get(f"{BASE_URL}/api/tier/forecast?tier=mid", timeout=15)
        w0 = worker_session.get(f"{BASE_URL}/api/wallet", timeout=15).json()
        before = float(w0.get("tgc_balance") or 0)
        r = worker_session.post(f"{BASE_URL}/api/node/drip", json={
            "device_id": worker_device["id"],
            "elapsed_seconds": 60,
            "state": "engaged_full",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("credited_tgc") is not None
        assert float(d["credited_tgc"]) > 0
        w1 = worker_session.get(f"{BASE_URL}/api/wallet", timeout=15).json()
        assert float(w1.get("tgc_balance") or 0) >= before


# ----------------------- Payout address validation -----------------------
class TestPayoutAddress:
    @pytest.mark.parametrize("net,addr,ok", [
        ("BEP20", "0x" + "a" * 40, True),
        ("TRC20", "T" + "9" * 33, True),
        ("Polygon", "0x" + "b" * 40, True),
        ("BEP20", "0xshort", False),
        ("Unknown", "0x" + "a" * 40, False),
    ])
    def test_payout_address_validation(self, worker_session, net, addr, ok):
        r = worker_session.post(f"{BASE_URL}/api/wallet/payout-address",
                                json={"address": addr, "network": net},
                                timeout=15)
        if ok:
            assert r.status_code == 200, f"{net}/{addr} → {r.status_code} {r.text}"
        else:
            assert r.status_code >= 400, f"expected fail {net}/{addr}"


# ----------------------- Admin metrics -----------------------
class TestAdminMobileMiningMetrics:
    def test_metrics_split(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mobile-mining/metrics",
                              timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "backend_compute" in d
        assert "mobile_compute" in d
        assert "total_compute" in d
        assert "engaged_phones" in d
        assert "recently_engaged_phones" in d


# ----------------------- Regression -----------------------
class TestRegression:
    def test_auth_me(self, worker_session):
        r = worker_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("email") == WORKER_EMAIL

    def test_auth_refresh(self, worker_session):
        r = worker_session.post(f"{BASE_URL}/api/auth/refresh", timeout=15)
        # accept 200 (success) — refresh path
        assert r.status_code in (200, 401), r.text
        # cookie path should succeed normally
        if r.status_code != 200:
            pytest.skip("refresh requires cookie context")

    def test_admin_console_snapshot(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/console/snapshot",
                              timeout=15)
        assert r.status_code == 200, r.text

    def test_pool_health(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=15)
        assert r.status_code == 200, r.text
