"""
Iteration 31 - v1.4.9 TGC Economy Refresh
Tests:
 - APK version 1.4.9
 - /api/wallet new TGC ledger keys
 - /api/tier/forecast monthly_forecast_range_tgc + payout_value_usdt
 - /api/node/drip persistent credit with state-aware multipliers
 - /api/wallet/payout-address validation
 - /api/wallet/withdraw threshold (1000 TGC = $10)
 - /api/devices/heartbeat new fields incl. engaged_standby
 - /api/admin/mobile-mining/metrics engaged_phones + engine_active_phones honest split
 - Regression auth/refresh/admin console/pool health/devices
"""
import os
import re
import pytest
import requests

def _read_env_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '').strip()
    if url:
        return url.rstrip('/')
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass
    return ''


BASE_URL = _read_env_url()
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASSWORD = "Worker@2026"


@pytest.fixture(scope="module")
def worker_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Worker login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- APK version ----------
class TestAPKVersion:
    def test_apk_version_149(self):
        r = requests.get(f"{BASE_URL}/api/apk/version", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("version") == "1.4.9", f"Expected 1.4.9, got {data.get('version')}"
        assert data.get("native_lib_embedded") is True
        assert int(data.get("size_bytes", 0)) >= 380_000
        sha = data.get("sha256", "")
        assert isinstance(sha, str) and len(sha) == 64


# ---------- /api/wallet ledger keys ----------
class TestWalletLedger:
    def test_wallet_has_all_tgc_keys(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=H(worker_token), timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        required = [
            "tgc_balance", "tgc_balance_usdt_value", "lifetime_tgc", "today_tgc",
            "pending_tgc", "available_tgc", "monthly_forecast_tgc", "monthly_forecast_usdt",
            "payout_progress_tgc", "payout_progress_pct", "payout_threshold_tgc",
            "payout_value_usdt", "withdraw_threshold_tgc", "withdraw_threshold_usdt",
            "tgc_per_usdt", "usdt_per_tgc", "can_withdraw", "payout_eligibility",
            "device_tier",
        ]
        missing = [k for k in required if k not in w]
        assert not missing, f"Missing wallet keys: {missing}"

        assert float(w["payout_threshold_tgc"]) == 1000.0
        assert float(w["payout_value_usdt"]) == 10.0
        assert float(w["withdraw_threshold_tgc"]) == 1000.0
        assert float(w["withdraw_threshold_usdt"]) == 10.0
        assert float(w["tgc_per_usdt"]) == 100.0
        assert float(w["usdt_per_tgc"]) == 0.01
        assert w["payout_eligibility"] in ("locked", "eligible")


# ---------- /api/tier/forecast ----------
class TestTierForecast:
    def _get(self, tier, tok):
        r = requests.get(f"{BASE_URL}/api/tier/forecast", params={"tier": tier},
                         headers=H(tok), timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_mid_tier(self, worker_token):
        d = self._get("mid", worker_token)
        assert abs(float(d["daily_tgc"]) - 8.0) < 0.01
        assert abs(float(d["monthly_tgc"]) - 240.0) < 0.1
        assert abs(float(d["monthly_usdt"]) - 2.40) < 0.01
        rng = d.get("monthly_forecast_range_tgc")
        assert rng == [220, 260] or rng == (220, 260) or list(rng) == [220, 260]
        assert float(d.get("payout_value_usdt", 0)) == 10.0
        tiers = d.get("tiers", {})
        for t in ["core", "flagship", "mid", "budget"]:
            assert t in tiers, f"tiers missing {t}"

    def test_flagship_tier(self, worker_token):
        d = self._get("flagship", worker_token)
        assert abs(float(d["daily_tgc"]) - 10.5) < 0.01
        assert abs(float(d["monthly_tgc"]) - 315.0) < 0.1

    def test_core_tier(self, worker_token):
        d = self._get("core", worker_token)
        assert abs(float(d["daily_tgc"]) - 12.0) < 0.01
        assert abs(float(d["monthly_tgc"]) - 360.0) < 0.1

    def test_budget_tier(self, worker_token):
        d = self._get("budget", worker_token)
        assert abs(float(d["daily_tgc"]) - 4.5) < 0.01
        assert abs(float(d["monthly_tgc"]) - 135.0) < 0.1


# ---------- /api/node/drip ----------
class TestNodeDrip:
    def test_drip_engaged_full_mid_60s(self, worker_token):
        # Persist tier=mid on the user (tier/forecast updates device_tier)
        requests.get(f"{BASE_URL}/api/tier/forecast", params={"tier": "mid"},
                     headers=H(worker_token), timeout=15)
        # Get current balance first
        w0 = requests.get(f"{BASE_URL}/api/wallet", headers=H(worker_token), timeout=15).json()
        bal0 = float(w0["tgc_balance"])

        r = requests.post(f"{BASE_URL}/api/node/drip",
                          headers=H(worker_token),
                          json={"state": "engaged_full", "elapsed_seconds": 60, "tier": "mid"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        expected = 8.0 / 86400.0 * 60.0  # ~0.005555
        credited = float(d.get("credited_tgc", 0))
        assert abs(credited - expected) < 0.0005, f"credited={credited} expected~{expected}"

        # Response should include ledger fields
        for k in ["tgc_balance", "lifetime_tgc", "payout_progress_tgc",
                  "payout_progress_pct", "can_withdraw", "rate_tgc_per_hour",
                  "payout_threshold_tgc"]:
            assert k in d, f"drip missing {k}"
        assert float(d["payout_threshold_tgc"]) == 1000.0

        # Server-side persistence: wallet reflects increment
        w1 = requests.get(f"{BASE_URL}/api/wallet", headers=H(worker_token), timeout=15).json()
        bal1 = float(w1["tgc_balance"])
        assert bal1 >= bal0 + credited - 0.0001, f"persistence fail: {bal0} -> {bal1}, credited {credited}"

    def test_drip_engaged_eco_is_half(self, worker_token):
        requests.get(f"{BASE_URL}/api/tier/forecast", params={"tier": "mid"},
                     headers=H(worker_token), timeout=15)
        r = requests.post(f"{BASE_URL}/api/node/drip",
                          headers=H(worker_token),
                          json={"state": "engaged_eco", "elapsed_seconds": 60, "tier": "mid"},
                          timeout=15)
        assert r.status_code == 200, r.text
        credited = float(r.json().get("credited_tgc", 0))
        expected_eco = 8.0 / 86400.0 * 60.0 * 0.5
        assert abs(credited - expected_eco) < 0.0005, f"eco credited={credited} expected~{expected_eco}"

    @pytest.mark.parametrize("state", ["paused_battery", "paused_power", "paused_thermal", "idle"])
    def test_drip_no_credit_states(self, worker_token, state):
        r = requests.post(f"{BASE_URL}/api/node/drip",
                          headers=H(worker_token),
                          json={"state": state, "elapsed_seconds": 60, "tier": "mid"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d.get("credited_tgc", 0)) == 0.0
        assert d.get("reason") == "no_credit_for_state"

    def test_drip_elapsed_cap_180s(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/node/drip",
                          headers=H(worker_token),
                          json={"state": "engaged_full", "elapsed_seconds": 600, "tier": "mid"},
                          timeout=15)
        assert r.status_code == 200, r.text
        credited = float(r.json().get("credited_tgc", 0))
        # 180s cap @ 8/86400 = ~0.01666
        max_expected = 8.0 / 86400.0 * 180.0
        assert credited <= max_expected + 0.0005, f"elapsed not capped: credited={credited}"


# ---------- /api/wallet/payout-address ----------
class TestPayoutAddress:
    def test_invalid_network(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/wallet/payout-address",
                          headers=H(worker_token),
                          json={"address": "0x" + "a" * 40, "network": "ETH_BAD"},
                          timeout=15)
        assert r.status_code == 400, r.text

    def test_invalid_address_too_short(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/wallet/payout-address",
                          headers=H(worker_token),
                          json={"address": "0xshort", "network": "BEP20"},
                          timeout=15)
        assert r.status_code == 400

    def test_invalid_address_too_long(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/wallet/payout-address",
                          headers=H(worker_token),
                          json={"address": "0x" + "a" * 100, "network": "BEP20"},
                          timeout=15)
        assert r.status_code == 400

    def test_valid_address_bep20(self, worker_token):
        addr = "0x" + "a" * 40
        r = requests.post(f"{BASE_URL}/api/wallet/payout-address",
                          headers=H(worker_token),
                          json={"address": addr, "network": "BEP20"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert "address_masked" in d
        assert d.get("network") == "BEP20"

        # /wallet reflects saved address
        w = requests.get(f"{BASE_URL}/api/wallet", headers=H(worker_token), timeout=15).json()
        assert w.get("payout_wallet_address") or w.get("payout_wallet_network")
        # network at least matches if present
        if w.get("payout_wallet_network"):
            assert w["payout_wallet_network"] == "BEP20"


# ---------- /api/wallet/withdraw threshold ----------
class TestWithdraw:
    def test_withdraw_under_1000_tgc(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/wallet/withdraw",
                          headers=H(worker_token),
                          json={"address": "0x" + "a" * 40},
                          timeout=15)
        # Worker should not have 1000 TGC; expect 400
        if r.status_code == 200:
            pytest.skip("Worker already has >=1000 TGC, skipping threshold test")
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or r.json().get("message") or "").lower()
        assert "1000" in msg and "tgc" in msg, f"Expected 1000 TGC msg, got: {msg}"


# ---------- /api/devices/heartbeat new fields ----------
class TestHeartbeat:
    @pytest.fixture(scope="class")
    def device_id(self, worker_token):
        # Register a device
        r = requests.post(f"{BASE_URL}/api/devices/register",
                          headers=H(worker_token),
                          json={"name": "TEST_v149_dev", "device_type": "android",
                                "model": "Pixel-Test", "os_version": "14"},
                          timeout=15)
        if r.status_code not in (200, 201):
            # fallback: get list
            r2 = requests.get(f"{BASE_URL}/api/devices", headers=H(worker_token), timeout=15)
            if r2.status_code == 200 and r2.json():
                lst = r2.json()
                if isinstance(lst, list) and lst:
                    return lst[0].get("id") or lst[0].get("device_id")
            pytest.skip(f"Could not register device: {r.text}")
        d = r.json()
        return d.get("id") or d.get("device_id")

    def test_heartbeat_engaged_standby_preserved(self, worker_token, device_id):
        payload = {
            "device_id": device_id,
            "charging": True,
            "wifi": True,
            "permission": True,
            "battery": 80,
            "node_engaged": True,
            "node_state": "engaged_standby",
            "eco_mode": False,
            "allow_on_battery": True,
            "active_threads": 2,
            "app_version": "1.4.9",
            "native_pow": False,
            "local_hashrate_hps": 0,
        }
        r = requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          headers=H(worker_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # Verify it stuck — fetch device list
        lst = requests.get(f"{BASE_URL}/api/devices", headers=H(worker_token), timeout=15).json()
        found = None
        for d in (lst if isinstance(lst, list) else []):
            if (d.get("id") or d.get("device_id")) == device_id:
                found = d
                break
        if found:
            ns = found.get("node_state") or ""
            assert ns == "engaged_standby" or ns == "" , f"node_state was normalized: {ns}"


# ---------- Admin mobile mining metrics ----------
class TestAdminMobileMetrics:
    def test_metrics_shape_and_honest_split(self, admin_token, worker_token):
        # Send a heartbeat as v1.4.9 device with engaged + no native engine
        # (Use worker session to register device)
        reg = requests.post(f"{BASE_URL}/api/devices/register",
                            headers=H(worker_token),
                            json={"name": "TEST_v149_metrics_dev", "device_type": "android",
                                  "model": "Pixel-Metrics", "os_version": "14"},
                            timeout=15)
        if reg.status_code in (200, 201):
            did = reg.json().get("id") or reg.json().get("device_id")
            requests.post(f"{BASE_URL}/api/devices/heartbeat",
                          headers=H(worker_token),
                          json={"device_id": did, "charging": True, "wifi": True,
                                "permission": True, "battery": 80,
                                "node_engaged": True,
                                "node_state": "engaged_full", "app_version": "1.4.9",
                                "native_pow": False, "local_hashrate_hps": 0,
                                "mining_requested": True},
                          timeout=15)

        r = requests.get(f"{BASE_URL}/api/admin/mobile-mining/metrics",
                         headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()

        bc = d.get("backend_compute") or {}
        assert bc.get("label") == "Backend Compute"
        assert "randomx_running" in bc
        assert "sha256_running" in bc

        mc = d.get("mobile_compute") or {}
        for k in ("connected_phones", "engaged_phones", "engine_active_phones"):
            assert k in mc, f"mobile_compute missing {k}"

        # honest split: engine_active <= engaged <= connected
        assert int(mc["engine_active_phones"]) <= int(mc["engaged_phones"])
        assert int(mc["engaged_phones"]) <= int(mc["connected_phones"])

        # miners[] should expose node_state/node_engaged/engine_active
        miners = d.get("miners") or []
        if miners:
            m0 = miners[0]
            # at least one of these keys should be present
            keys = set(m0.keys())
            assert keys & {"node_state", "node_engaged", "engine_active"}, \
                f"miners entries lack node_state/node_engaged/engine_active: {keys}"


# ---------- Regression ----------
class TestRegression:
    def test_auth_me(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(worker_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == WORKER_EMAIL

    def test_auth_refresh(self, worker_token):
        r = requests.post(f"{BASE_URL}/api/auth/refresh", headers=H(worker_token), timeout=15)
        assert r.status_code in (200, 401)  # depends on cookie presence

    def test_pool_health(self):
        r = requests.get(f"{BASE_URL}/api/pool/health", timeout=15)
        assert r.status_code == 200

    def test_admin_console_snapshot(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/console/snapshot", headers=H(admin_token), timeout=15)
        assert r.status_code == 200

    def test_devices_list(self, worker_token):
        r = requests.get(f"{BASE_URL}/api/devices", headers=H(worker_token), timeout=15)
        assert r.status_code == 200
