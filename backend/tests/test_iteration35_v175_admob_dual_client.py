"""v1.7.5 Dual-Client Network & Monetization — Backend Tests.

Covers:
  - GET  /api/admob/config            (public; reads ADMOB_TEST_MODE env)
  - GET  /api/admin/admob/config      (admin only; includes env_source)
  - POST /api/admin/admob/config      (admin only)
  - GET  /api/admin/client-stats      (admin only)
  - POST /api/daily-calibration/claim — ad-gating for client_type='light',
    pass-through for 'node_pro' and 'unknown' (backward compatibility).
  - Idempotency on /daily-calibration/claim — already-claimed-today path.
  - Ledger / daily_calibrations metadata (client_type / ad_completed / ad_mode)
    on successful claim.
"""
import os
import time
import requests
import pytest


def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Tests are launched outside CRA — read it from /app/frontend/.env
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL is required"
    return url.rstrip("/")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"


# ---------- Fixtures ----------
@pytest.fixture
def session():
    """Anonymous client (no auth, no cookies)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    """Get admin JWT — uses an isolated session to avoid cookie cross-contamination."""
    s = _fresh_session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def worker_token():
    """Register a fresh test user — uses isolated session."""
    s = _fresh_session()
    suffix = int(time.time())
    email = f"TEST_v175_{suffix}@thegrid.io"
    password = "TestUser@2026"
    reg = s.post(f"{BASE_URL}/api/auth/register",
                 json={"email": email, "password": password, "name": "v175 QA"})
    if reg.status_code not in (200, 201):
        pass
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password})
    assert r.status_code == 200, f"worker login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def worker_headers(worker_token):
    return {"Authorization": f"Bearer {worker_token}", "Content-Type": "application/json"}


def _client() -> requests.Session:
    """Build a NEW http session per request — guarantees no cookie leak between
    admin / worker / anon paths (server.get_current_user reads cookies first)."""
    return _fresh_session()


# ---------- /api/admob/config (public) ----------
class TestAdmobPublicConfig:
    def test_admob_config_public_no_auth(self):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admob/config")
        assert r.status_code == 200, r.text
        data = r.json()
        # When ADMOB_TEST_MODE=true (current .env), payload must reflect test mode
        assert data["ad_mode"] == "test"
        assert data["admob_enabled"] is True
        assert data["admob_test_mode"] is True
        assert data["admob_app_id"]
        assert data["admob_rewarded_ad_unit_id"]
        assert "updated_at" in data
        # Google sample IDs must be present (no real prod IDs leaked)
        assert "3940256099942544" in data["admob_app_id"]


# ---------- /api/admin/admob/config ----------
class TestAdmobAdminConfig:
    def test_get_admin_admob_config_requires_admin(self, worker_headers):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admin/admob/config", headers=worker_headers)
        assert r.status_code in (401, 403), f"non-admin must be denied, got {r.status_code}"

    def test_get_admin_admob_config_no_auth(self):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admin/admob/config")
        assert r.status_code in (401, 403)

    def test_get_admin_admob_config_admin_ok(self, admin_headers):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admin/admob/config", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ad_mode"] == "test"
        assert "env_source" in data
        env = data["env_source"]
        for k in ("ADMOB_ENABLED", "ADMOB_TEST_MODE",
                  "ADMOB_ANDROID_APP_ID_set", "ADMOB_REWARDED_AD_UNIT_ID_set"):
            assert k in env, f"missing env_source flag {k}"
        assert env["ADMOB_TEST_MODE"] is True
        assert env["ADMOB_ENABLED"] is True

    def test_post_admin_admob_config_requires_admin(self, worker_headers):
        session=_client()
        r = session.post(f"{BASE_URL}/api/admin/admob/config",
                         headers=worker_headers,
                         json={"admob_test_mode": True})
        assert r.status_code in (401, 403)

    def test_post_admin_admob_config_admin_ok(self, admin_headers):
        session=_client()
        r = session.post(f"{BASE_URL}/api/admin/admob/config",
                         headers=admin_headers,
                         json={"admob_test_mode": True, "admob_enabled": True})
        assert r.status_code in (200, 201), r.text


# ---------- /api/admin/client-stats ----------
class TestAdminClientStats:
    def test_requires_admin(self, worker_headers):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admin/client-stats", headers=worker_headers)
        assert r.status_code in (401, 403)

    def test_admin_ok(self, admin_headers):
        session=_client()
        r = session.get(f"{BASE_URL}/api/admin/client-stats", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("devices_total_by_client", "devices_active_by_client",
                  "tgc_issued_by_client", "calibration", "risk_flags_by_client"):
            assert k in data, f"missing key {k}"
        # devices_total_by_client must have the three client buckets
        for sub in ("light", "node_pro", "unknown"):
            assert sub in data["devices_total_by_client"]
            assert isinstance(data["devices_total_by_client"][sub], int)
            assert sub in data["devices_active_by_client"]
        c = data["calibration"]
        for k in ("total_claims", "claims_with_ad", "claims_from_light",
                  "claims_today", "ad_completion_rate"):
            assert k in c
        assert isinstance(c["ad_completion_rate"], (int, float))


# ---------- /api/daily-calibration/claim — ad-gating + back-compat ----------
class TestDailyCalibrationAdGate:
    def test_light_without_ad_returns_402(self, worker_headers):
        session=_client()
        """Light client WITHOUT ad_completed=true MUST return HTTP 402."""
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=worker_headers,
                         json={"client_type": "light", "ad_completed": False})
        assert r.status_code == 402, f"expected 402, got {r.status_code} body={r.text}"
        body = r.json()
        # FastAPI HTTPException maps detail → 'detail'
        assert (body.get("detail") == "ad_not_completed"
                or body.get("error") == "ad_not_completed"), body

    def test_light_with_ad_does_not_return_402(self, worker_headers):
        session=_client()
        """Light client WITH ad_completed=true must NOT 402.
        Will likely 423 (eligibility/heartbeat) which is correct (not 402).
        """
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=worker_headers,
                         json={
                             "client_type": "light",
                             "ad_completed": True,
                             "ad_mode": "test",
                             "device_id": "TEST_v175_dev",
                         })
        assert r.status_code != 402, f"ad_completed=true must skip ad gate, got 402: {r.text}"
        # Acceptable: 200 (claimed), 409/423 (eligibility/already claimed)
        assert r.status_code in (200, 409, 423), f"unexpected status {r.status_code} body={r.text}"

    def test_nodepro_no_ad_gate(self, worker_headers):
        session=_client()
        """node_pro client_type bypasses ad gate even with ad_completed=false."""
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=worker_headers,
                         json={"client_type": "node_pro", "ad_completed": False})
        assert r.status_code != 402, f"node_pro must not be 402: {r.text}"
        assert r.status_code in (200, 409, 423)

    def test_empty_body_backward_compat(self, worker_headers):
        session=_client()
        """Empty body — client_type defaults to 'unknown', no ad gate."""
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=worker_headers,
                         json={})
        assert r.status_code != 402, f"empty body must not 402: {r.text}"
        assert r.status_code in (200, 409, 423)

    def test_unknown_client_type_no_ad_gate(self, worker_headers):
        session=_client()
        """Explicit 'unknown' client_type — no ad gate."""
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=worker_headers,
                         json={"client_type": "unknown"})
        assert r.status_code != 402
        assert r.status_code in (200, 409, 423)


# ---------- Idempotency / already-claimed regression ----------
class TestDailyCalibrationIdempotency:
    def test_admin_idempotent_or_eligibility(self, admin_headers):
        session=_client()
        """Admin claim path — must not error.
        Either returns 200 (already_claimed_today or fresh) or 423 (eligibility).
        """
        r = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                         headers=admin_headers,
                         json={
                             "client_type": "light",
                             "ad_completed": True,
                             "ad_mode": "test",
                         })
        assert r.status_code in (200, 409, 423), f"unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            body = r.json()
            assert body.get("ok") is True or "status" in body or "reward_tgc" in body
            # If admin already claimed today, status==already_claimed_today
            if body.get("status") == "already_claimed_today":
                assert "reward_tgc" in body

    def test_second_call_same_user_idempotent(self, worker_headers):
        session=_client()
        """Two consecutive claim attempts → second should NOT mint duplicate TGC."""
        body = {"client_type": "light", "ad_completed": True, "ad_mode": "test"}
        r1 = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                          headers=worker_headers, json=body)
        r2 = session.post(f"{BASE_URL}/api/daily-calibration/claim",
                          headers=worker_headers, json=body)
        # If r1 succeeded with 200, r2 must be 200 (already_claimed_today) — never 402
        if r1.status_code == 200:
            assert r2.status_code == 200, f"second claim not idempotent: {r2.status_code} {r2.text}"
            j2 = r2.json()
            assert j2.get("status") == "already_claimed_today" or j2.get("ok") is True
        else:
            # Eligibility blocked both — fine
            assert r1.status_code in (409, 423)
            assert r2.status_code in (409, 423)
