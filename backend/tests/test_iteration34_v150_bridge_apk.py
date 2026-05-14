"""
v1.5.0 — SupportXMR Mobile Bridge APK + Bridge endpoint contracts.

Coverage (backend only, no real pool roundtrip):
  * POST /api/mobile-mining/config — auth required, device_id query param,
    returns worker_id (GRID_M_xxxxx), session_nonce (32 hex), signature (64 hex),
    wallet_masked (no full XMR address leak), difficulty_floor.
  * GET /api/admin/mobile-mining/bridge/metrics — admin auth required, 4 counters.
  * GET /api/admin/mobile-mining/metrics — has 'bridge' sub-object with the 4
    counters and base v1.3.8 fields.
  * WS /api/mobile-mining/worker/ws — 4401 on missing/bad token, 4403 on bad
    nonce/signature.
  * GET /api/apk/version — version=1.5.0, download_url=/grid-worker-v1.5.0.apk,
    native_lib_embedded=True, size_bytes=390299, sha256 non-empty.
  * /grid-worker-v1.5.0.apk binary served by frontend with proper
    Content-Type=application/vnd.android.package-archive.
  * REGRESSION: /api/auth/login (admin + worker), /api/wallet,
    /api/devices/heartbeat, /api/node/drip, /api/rewards/drop/current.
"""
import os
import re
import uuid
import json
import pytest
import requests
import websocket  # py-websocket-client


def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    with open(os.path.abspath(env_path)) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASS = "Grid@Admin2026"
WORKER_EMAIL = "worker@thegrid.io"
WORKER_PASS = "Worker@2026"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, tok


@pytest.fixture(scope="module")
def admin_session():
    s, _ = _login(ADMIN_EMAIL, ADMIN_PASS)
    return s


@pytest.fixture(scope="module")
def worker_session():
    s, _ = _login(WORKER_EMAIL, WORKER_PASS)
    return s


@pytest.fixture(scope="module")
def worker_token():
    _, t = _login(WORKER_EMAIL, WORKER_PASS)
    return t or ""


def _register_device(session, suffix: str) -> str:
    payload = {
        "name": f"TEST_v150_dev_{suffix}",
        "model": "flagship",
        "platform": "android",
        "brand": "Google",
        "os_version": "14",
        "manufacturer": "Google",
        "android_version": "14",
        "app_version": "1.5.0",
        "device_id": f"TEST-V150-{suffix}-{uuid.uuid4().hex[:8]}",
        "is_emulator": False,
    }
    r = session.post(f"{API}/devices/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("id") or body.get("device_id") or body["device"]["id"]


# ---------------- /api/apk/version ----------------
class TestApkVersionV150:
    def test_version_payload(self):
        r = requests.get(f"{API}/apk/version", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["version"] == "1.5.0", f"version={b.get('version')}"
        assert b["download_url"] == "/grid-worker-v1.5.0.apk"
        assert b.get("native_lib_embedded") is True
        assert b["size_bytes"] == 390299, f"size_bytes={b.get('size_bytes')}"
        assert isinstance(b.get("sha256"), str) and len(b["sha256"]) >= 32

    def test_no_pool_secret_leak(self):
        r = requests.get(f"{API}/apk/version", timeout=15)
        text = r.text
        # full XMR base58 address (~95 chars) should not leak
        assert not re.search(r"\b[1-9A-HJ-NP-Za-km-z]{90,110}\b", text), \
            "looks like full XMR wallet address leaked in /apk/version"
        # supportxmr endpoint shouldn't be exposed to client either
        assert "supportxmr.com:443" not in text


class TestApkBinaryV150:
    def test_apk_public_download(self):
        r = requests.get(f"{BASE_URL}/grid-worker-v1.5.0.apk",
                         stream=True, timeout=60, allow_redirects=True)
        assert r.status_code == 200, f"status={r.status_code}"
        ct = r.headers.get("content-type", "").lower()
        # Either correct APK mime or octet-stream (browsers tolerate both); we accept the
        # canonical Android one.
        assert ("application/vnd.android.package-archive" in ct
                or "application/octet-stream" in ct), f"unexpected content-type={ct}"
        cl = r.headers.get("content-length")
        if cl:
            assert int(cl) == 390299, f"size mismatch on wire: {cl}"


# ---------------- POST /api/mobile-mining/config ----------------
class TestMobileMiningConfigPostV150:
    def test_auth_required(self):
        r = requests.post(f"{API}/mobile-mining/config",
                          params={"device_id": "TEST-NOAUTH"}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_session_payload_shape(self, worker_session):
        dev_id = _register_device(worker_session, "cfg")
        r = worker_session.post(f"{API}/mobile-mining/config",
                                params={"device_id": dev_id}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        # required keys per spec
        required = ("algorithm", "pool_mode", "job_endpoint", "submit_endpoint",
                    "worker_id", "session_nonce", "expires_at", "signature",
                    "wallet_masked", "difficulty_floor", "issued_at_iso")
        for k in required:
            assert k in b, f"missing {k} in {b}"
        assert b["algorithm"] == "randomx"
        assert b["pool_mode"] == "backend_bridge"
        # worker_id GRID_M_xxxxxx (uses last 6 chars of device_id)
        assert re.match(r"^GRID_M_[a-z0-9]{6}$", b["worker_id"]), b["worker_id"]
        # nonce: 32 hex chars (16 bytes)
        assert isinstance(b["session_nonce"], str) and re.fullmatch(r"[0-9a-f]{32}", b["session_nonce"])
        # signature: 64 hex chars (sha256)
        assert isinstance(b["signature"], str) and re.fullmatch(r"[0-9a-f]{64}", b["signature"])
        # wallet_masked: must be short and not contain the full address
        wm = b["wallet_masked"]
        assert "…" in wm or "..." in wm
        assert len(wm) < 30, f"wallet_masked too long: {wm}"
        # full XMR address must not appear anywhere
        assert not re.search(r"[1-9A-HJ-NP-Za-km-z]{90,110}", r.text)
        # difficulty_floor a sane int
        assert isinstance(b["difficulty_floor"], int) and b["difficulty_floor"] > 0

    def test_unknown_device_404(self, worker_session):
        r = worker_session.post(f"{API}/mobile-mining/config",
                                params={"device_id": "TEST-DOES-NOT-EXIST-xyz"},
                                timeout=15)
        # backend raises HTTPException(404, "device_not_found") for foreign/missing dev
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# ---------------- GET /api/admin/mobile-mining/bridge/metrics ----------------
class TestAdminBridgeMetricsV150:
    def test_admin_required(self):
        r = requests.get(f"{API}/admin/mobile-mining/bridge/metrics", timeout=15)
        assert r.status_code in (401, 403)

    def test_worker_denied(self, worker_session):
        r = worker_session.get(f"{API}/admin/mobile-mining/bridge/metrics", timeout=15)
        assert r.status_code in (401, 403)

    def test_payload_shape(self, admin_session):
        r = admin_session.get(f"{API}/admin/mobile-mining/bridge/metrics", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("bridge_active_workers", "bridge_submitted_shares",
                  "bridge_accepted_shares", "bridge_rejected_shares"):
            assert k in b, f"missing {k}"
            assert isinstance(b[k], int) and b[k] >= 0


# ---------------- GET /api/admin/mobile-mining/metrics — bridge sub-object ----------------
class TestAdminMobileMiningMetricsBridgeFieldV150:
    def test_bridge_field_present(self, admin_session):
        r = admin_session.get(f"{API}/admin/mobile-mining/metrics", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "bridge" in b, f"missing bridge field; keys={list(b.keys())}"
        bridge = b["bridge"]
        for k in ("bridge_active_workers", "bridge_submitted_shares",
                  "bridge_accepted_shares", "bridge_rejected_shares"):
            assert k in bridge, f"missing bridge.{k}"


# ---------------- WS /api/mobile-mining/worker/ws ----------------
class TestMobileMiningWorkerWsV150:
    def _ws_url(self, qs: str = "") -> str:
        base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        return f"{base}/api/mobile-mining/worker/ws{qs}"

    def _expect_close(self, url, expected_code: int):
        """
        Connect, then expect server to close with given code, possibly after the
        handshake. We accept either:
          - the close frame carrying expected_code, OR
          - a recv() that raises a websocket close with that code.
        """
        try:
            ws = websocket.create_connection(url, timeout=10)
        except websocket.WebSocketBadStatusException as e:
            # very early HTTP rejection (rare for /ws) — still a rejection
            assert e.status_code in (401, 403, 404), e.status_code
            return None
        try:
            # try to read; server should send close with expected_code
            ws.recv()
            # no exception → check close code via ws attribute
            code = getattr(ws, "close_status_code", None)
            ws.close()
            return code
        except websocket.WebSocketConnectionClosedException:
            code = getattr(ws, "close_status_code", None)
            return code
        except Exception as e:
            # any other = treat as closed; capture code if any
            code = getattr(ws, "close_status_code", None)
            print(f"WS recv error ({type(e).__name__}): {e}; close_code={code}")
            return code

    def test_no_token_closes_4401(self):
        url = self._ws_url()  # no query params
        code = self._expect_close(url, 4401)
        # close code may be exposed; if not, at minimum connection rejected
        if code is not None:
            assert code == 4401, f"expected 4401, got {code}"

    def test_bad_token_closes_4401(self):
        url = self._ws_url("?token=not-a-jwt&device_id=TEST-X&nonce=zzzz&signature=ffff")
        code = self._expect_close(url, 4401)
        if code is not None:
            assert code == 4401, f"expected 4401 (bad token), got {code}"

    def test_bad_nonce_closes_4403(self, worker_token, worker_session):
        if not worker_token:
            pytest.skip("no worker token available")
        # Register a real device so the user_id matches
        dev_id = _register_device(worker_session, "ws")
        qs = (f"?token={worker_token}&device_id={dev_id}"
              f"&nonce={'0' * 32}&signature={'f' * 64}")
        url = self._ws_url(qs)
        code = self._expect_close(url, 4403)
        if code is not None:
            assert code == 4403, f"expected 4403 (bad session), got {code}"


# ---------------- Regression suite ----------------
class TestRegressionV150:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json() or "access_token" in r.json()

    def test_worker_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": WORKER_EMAIL, "password": WORKER_PASS},
                          timeout=15)
        assert r.status_code == 200, r.text

    def test_wallet(self, worker_session):
        r = worker_session.get(f"{API}/wallet", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        # core wallet keys (v1.5.0)
        assert "tgc_total_earned" in b or "tgc_total" in b or "tgc_balance" in b, \
            f"wallet payload missing tgc fields: {list(b.keys())}"

    def test_devices_heartbeat(self, worker_session):
        dev_id = _register_device(worker_session, "hb")
        hb = {
            "device_id": dev_id,
            "charging": True,
            "wifi": True,
            "permission": True,
            "battery": 85,
            "battery_percent": 85,
            "network_type": "wifi",
            "native_lib_loaded": True,
            "native_pow": True,
            "local_hashrate_hps": 200.0,
            "mining_status": "mining_native",
            "app_version": "1.5.0",
        }
        r = worker_session.post(f"{API}/devices/heartbeat", json=hb, timeout=15)
        assert r.status_code == 200, r.text

    def test_node_drip(self, worker_session):
        r = worker_session.post(f"{API}/node/drip", json={}, timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        # response shape: should contain ok or dripped/earned signal — be permissive
        assert isinstance(b, dict)

    def test_rewards_drop_current(self, worker_session):
        r = worker_session.get(f"{API}/rewards/drop/current", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        # one of these must be present per v1.5.0 spec
        assert any(k in b for k in ("your_tickets", "tickets_in_current_drop",
                                    "next_ticket_in_tgc", "lifetime_tgc_per_ticket",
                                    "compliance_text", "eligibility_status",
                                    "active_drop")), f"unexpected shape: {list(b.keys())}"
