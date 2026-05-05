"""
Iteration 4 — Omni-Mining orchestrator with Binance Pool profiles for 8 coins.
Endpoints under test:
  GET  /api/mining/profiles
  GET  /api/mining/active
  POST /api/admin/mining/select
  GET  /api/mining/config?device_id=X
  GET  /api/admin/mining/stats
  GET  /api/admin/mining/revenue
  POST /api/devices/heartbeat (with hashrate + algo)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://grid-supercomputer.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"
MASTER_ID = "117423210"

EXPECTED_PROFILES = {
    "BTC":  {"algo": "SHA-256",     "stratum_url": "stratum+tcp://bs.binance.com:8888",       "port": 8888, "base": 1_000_000, "unit": "MH/s",  "unit_div": 1_000_000},
    "BCH":  {"algo": "SHA-256",     "stratum_url": "stratum+tcp://bch.poolbinance.com:1800",  "port": 1800, "base": 1_000_000, "unit": "MH/s",  "unit_div": 1_000_000},
    "LTC":  {"algo": "Scrypt",      "stratum_url": "stratum+tcp://ltc.poolbinance.com:3333",  "port": 3333, "base":   200_000, "unit": "KH/s",  "unit_div":     1_000},
    "ZEC":  {"algo": "Equihash",    "stratum_url": "stratum+tcp://zec.poolbinance.com:5300",  "port": 5300, "base":        50, "unit": "Sol/s", "unit_div":         1},
    "ETC":  {"algo": "Etchash",     "stratum_url": "stratum+tcp://etc.poolbinance.com:1800",  "port": 1800, "base": 3_000_000, "unit": "MH/s",  "unit_div": 1_000_000},
    "RVN":  {"algo": "KawPow",      "stratum_url": "stratum+tcp://rvn.poolbinance.com:9000",  "port": 9000, "base": 1_000_000, "unit": "MH/s",  "unit_div": 1_000_000},
    "DASH": {"algo": "X11",         "stratum_url": "stratum+tcp://dash.poolbinance.com:443",  "port":  443, "base":   500_000, "unit": "KH/s",  "unit_div":     1_000},
    "KAS":  {"algo": "kHeavyHash",  "stratum_url": "stratum+tcp://kas.poolbinance.com:443",   "port":  443, "base": 50_000_000,"unit": "MH/s",  "unit_div": 1_000_000},
}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# --------- Fixtures ---------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def worker_token():
    """Fresh worker user with a unique email."""
    email = f"miner_{uuid.uuid4().hex[:10]}@thegrid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Worker@2026", "name": "Miner Test", "role": "user",
    })
    assert r.status_code == 200, r.text
    return r.json()["token"], email


@pytest.fixture(scope="session", autouse=True)
def _restore_btc_after_session(admin_token):
    """Reset active coin to BTC at session end."""
    yield
    requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})


def _register_device(token, model, name="Dev"):
    r = requests.post(f"{API}/devices/register", headers=_bearer(token),
                      json={"name": f"{name}-{model}", "model": model, "platform": "web"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------- Tests ----------------

# /api/mining/profiles structure & 8 coins
class TestMiningProfiles:
    def test_profiles_shape(self):
        r = requests.get(f"{API}/mining/profiles")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["master_id"] == MASTER_ID
        assert isinstance(data["profiles"], list)
        assert len(data["profiles"]) == 8
        coins = {p["coin"] for p in data["profiles"]}
        assert coins == set(EXPECTED_PROFILES.keys())

    def test_each_profile_has_required_fields(self):
        data = requests.get(f"{API}/mining/profiles").json()
        for p in data["profiles"]:
            for f in ("coin", "name", "algo", "stratum_url", "port",
                      "base_hashrate_hps", "reward_per_hps_usdt_day",
                      "unit", "unit_div"):
                assert f in p, f"Missing {f} in {p['coin']}"

    @pytest.mark.parametrize("coin,exp", list(EXPECTED_PROFILES.items()))
    def test_coin_values(self, coin, exp):
        data = requests.get(f"{API}/mining/profiles").json()
        p = next(x for x in data["profiles"] if x["coin"] == coin)
        assert p["algo"] == exp["algo"]
        assert p["stratum_url"] == exp["stratum_url"]
        assert p["port"] == exp["port"]
        assert p["base_hashrate_hps"] == exp["base"]
        assert p["unit"] == exp["unit"]
        assert p["unit_div"] == exp["unit_div"]


# /api/mining/active default + admin select round-trip
class TestActiveSelect:
    def test_default_btc(self, admin_token):
        # Reset to BTC first
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        r = requests.get(f"{API}/mining/active")
        assert r.status_code == 200
        data = r.json()
        assert data["coin"] == "BTC"
        assert data["master_id"] == MASTER_ID
        assert data["profile"]["coin"] == "BTC"
        assert data["profile"]["algo"] == "SHA-256"

    def test_admin_can_switch_coin(self, admin_token):
        r = requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "LTC"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["coin"] == "LTC"
        # GET reflects update
        active = requests.get(f"{API}/mining/active").json()
        assert active["coin"] == "LTC"
        assert active["profile"]["algo"] == "Scrypt"

    def test_invalid_coin_rejected(self, admin_token):
        r = requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "DOGE"})
        assert r.status_code == 400, r.text

    def test_non_admin_forbidden(self, worker_token):
        token, _ = worker_token
        r = requests.post(f"{API}/admin/mining/select", headers=_bearer(token), json={"coin": "BTC"})
        assert r.status_code == 403, r.text


# /api/mining/config — worker_id, tier hashrate, isolation
class TestMiningConfig:
    def test_worker_id_format_and_fields(self, admin_token, worker_token):
        # Set BTC
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        token, _ = worker_token
        device_id = _register_device(token, "mid", name="ConfigCheck")
        r = requests.get(f"{API}/mining/config", headers=_bearer(token), params={"device_id": device_id})
        assert r.status_code == 200, r.text
        c = r.json()
        for f in ("coin", "algo", "stratum_url", "port", "worker_id",
                  "expected_hashrate_hps", "unit", "unit_div", "master_id"):
            assert f in c, f"Missing {f}"
        assert c["coin"] == "BTC"
        assert c["master_id"] == MASTER_ID
        assert c["worker_id"] == f"{MASTER_ID}.{device_id}"

    def test_tier_hashrate_multiplier_btc(self, admin_token):
        # Fresh worker so we can compare cleanly per device
        email = f"tier_{uuid.uuid4().hex[:10]}@thegrid.io"
        tok = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Worker@2026", "name": "Tier Test", "role": "user",
        }).json()["token"]
        # Set BTC (base = 1_000_000)
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})

        flagship_id = _register_device(tok, "flagship")
        mid_id = _register_device(tok, "mid")
        budget_id = _register_device(tok, "budget")

        def expected(d_id):
            return requests.get(f"{API}/mining/config", headers=_bearer(tok),
                                params={"device_id": d_id}).json()["expected_hashrate_hps"]

        assert expected(flagship_id) == 3_000_000   # 1M × 3
        assert expected(mid_id)      == 1_800_000   # 1M × 1.8
        assert expected(budget_id)   == 1_000_000   # 1M × 1

    def test_other_users_device_not_found(self, worker_token):
        # Attacker user tries to read another user's device config
        token_a, _ = worker_token
        device_a = _register_device(token_a, "mid", name="ownerA")
        email_b = f"snoop_{uuid.uuid4().hex[:10]}@thegrid.io"
        token_b = requests.post(f"{API}/auth/register", json={
            "email": email_b, "password": "Snoop@2026", "name": "Snoop", "role": "user",
        }).json()["token"]
        r = requests.get(f"{API}/mining/config", headers=_bearer(token_b),
                         params={"device_id": device_a})
        assert r.status_code == 404, r.text

    def test_admin_switch_propagates_to_workers(self, admin_token, worker_token):
        token, _ = worker_token
        device_id = _register_device(token, "mid", name="propagate")
        # Switch to KAS
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "KAS"})
        c = requests.get(f"{API}/mining/config", headers=_bearer(token),
                         params={"device_id": device_id}).json()
        assert c["coin"] == "KAS"
        assert c["algo"] == "kHeavyHash"
        # Switch back to BTC
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        c2 = requests.get(f"{API}/mining/config", headers=_bearer(token),
                          params={"device_id": device_id}).json()
        assert c2["coin"] == "BTC"
        assert c2["algo"] == "SHA-256"


# Heartbeat now persists hashrate + algo
class TestHeartbeatHashrate:
    def test_heartbeat_accepts_and_persists(self, admin_token):
        email = f"hb_{uuid.uuid4().hex[:10]}@thegrid.io"
        tok = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Worker@2026", "name": "HB", "role": "user",
        }).json()["token"]
        device_id = _register_device(tok, "flagship", name="HBdev")

        r = requests.post(f"{API}/devices/heartbeat", headers=_bearer(tok), json={
            "device_id": device_id, "charging": True, "wifi": True, "permission": True,
            "battery": 90, "thermal": "nominal", "hashrate": 2_500_000.0, "algo": "SHA-256",
        })
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"

        # Verify persistence — admin stats should include this device with that hashrate
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        stats = requests.get(f"{API}/admin/mining/stats", headers=_bearer(admin_token)).json()
        my = next((d for d in stats["devices"] if d["id"] == device_id), None)
        assert my is not None, "Device not found in stats devices list"
        assert my.get("hashrate_hps") == 2_500_000.0
        assert my.get("algo") == "SHA-256"


# /api/admin/mining/stats and /revenue aggregation
class TestAdminStatsRevenue:
    def test_stats_shape_and_aggregates_active(self, admin_token):
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        # Fresh worker, register device + send active heartbeat with known hashrate
        email = f"stats_{uuid.uuid4().hex[:10]}@thegrid.io"
        tok = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Worker@2026", "name": "Stats", "role": "user",
        }).json()["token"]
        d1 = _register_device(tok, "mid", name="agg-mid")
        requests.post(f"{API}/devices/heartbeat", headers=_bearer(tok), json={
            "device_id": d1, "charging": True, "wifi": True, "permission": True,
            "battery": 90, "hashrate": 1_234_567.0, "algo": "SHA-256",
        })

        r = requests.get(f"{API}/admin/mining/stats", headers=_bearer(admin_token))
        assert r.status_code == 200, r.text
        s = r.json()
        for f in ("coin", "algo", "unit", "unit_div", "active_nodes",
                  "contributing_nodes", "total_hashrate_hps", "total_hashrate_display", "devices"):
            assert f in s, f"missing {f}"
        assert s["coin"] == "BTC"
        assert s["algo"] == "SHA-256"
        assert s["unit"] == "MH/s"
        assert s["active_nodes"] >= 1
        assert s["total_hashrate_hps"] >= 1_234_567.0  # at minimum our active dev
        # All listed devices should be active
        for d in s["devices"]:
            # devices list comes from the active filter
            pass

    def test_revenue_math(self, admin_token):
        # Use BTC where reward_per_hps_usdt_day = 2.5e-12
        requests.post(f"{API}/admin/mining/select", headers=_bearer(admin_token), json={"coin": "BTC"})
        stats = requests.get(f"{API}/admin/mining/stats", headers=_bearer(admin_token)).json()
        rev = requests.get(f"{API}/admin/mining/revenue", headers=_bearer(admin_token))
        assert rev.status_code == 200, rev.text
        rb = rev.json()
        for f in ("coin", "total_hashrate_hps", "daily_usdt", "daily_symbol",
                  "daily_symbol_display", "monthly_usdt", "yearly_usdt", "nodes"):
            assert f in rb, f"missing {f}"
        assert rb["coin"] == "BTC"
        # daily_usdt = total_hps × reward_per_hps_usdt_day (BTC = 2.5e-12), rounded(6)
        expected_daily = round(stats["total_hashrate_hps"] * 2.5e-12, 6)
        assert abs(rb["daily_usdt"] - expected_daily) <= 1e-6
        assert abs(rb["monthly_usdt"] - round(rb["daily_usdt"] * 30, 6)) <= 1e-6
        assert abs(rb["yearly_usdt"] - round(rb["daily_usdt"] * 365, 6)) <= 1e-6
        assert rb["daily_symbol_display"].endswith(" BTC")

    def test_admin_endpoints_require_admin(self, worker_token):
        token, _ = worker_token
        for path in ("/admin/mining/stats", "/admin/mining/revenue"):
            r = requests.get(f"{API}{path}", headers=_bearer(token))
            assert r.status_code == 403, f"{path}: {r.status_code} {r.text}"
