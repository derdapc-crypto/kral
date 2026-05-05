"""
THE GRID backend tests.
Covers auth, devices, heartbeat golden-rule, task request/submit with
real compute emulation (mulberry32 matrix + SHA-256 hash), wallet, stats,
and admin RBAC. USDT payouts are mocked (DB only).
"""
import os
import hashlib
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"


# ---------- Helpers ----------
def mulberry32(seed: int):
    state = [seed & 0xFFFFFFFF]

    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nxt


def matrix_signature(seed: int, size: int) -> str:
    rng = mulberry32(seed)
    n = size * size
    a = [int(rng() * 10) for _ in range(n)]
    b = [int(rng() * 10) for _ in range(n)]
    total = 0
    trace = 0
    for i in range(size):
        for j in range(size):
            s = 0
            row = i * size
            for k in range(size):
                s += a[row + k] * b[k * size + j]
            total += s
            if i == j:
                trace += s
    return f"{total}:{trace}"


def hash_signature(nonce: str, difficulty: int) -> str:
    prefix = "0" * difficulty
    i = 0
    while i < 2_000_000:
        h = hashlib.sha256(f"{nonce}:{i}".encode()).hexdigest()
        if h.startswith(prefix):
            return f"{i}:{h}"
        i += 1
    return f"{i}:{hashlib.sha256(f'{nonce}:{i}'.encode()).hexdigest()}"


def _auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def user_token():
    email = f"test_user_{uuid.uuid4().hex[:8]}@grid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "Test User"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "id": data["id"], "email": email}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "admin"
    return d["token"]


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_token_and_cookies(self):
        email = f"test_reg_{uuid.uuid4().hex[:8]}@grid.io"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "Reg User"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == email
        assert d["role"] == "user"
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        # httpOnly cookies
        cookies = r.cookies
        assert "access_token" in cookies
        assert "refresh_token" in cookies
        assert "_id" not in d

    def test_login_valid(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "admin"
        assert "token" in d

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL, "password": "wrong-pass"
        })
        assert r.status_code == 401

    def test_me_with_bearer(self, user_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_header(user_token["token"]))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == user_token["email"]
        assert "_id" not in u
        assert "password_hash" not in u

    def test_devices_unauth(self):
        r = requests.get(f"{API}/devices")
        assert r.status_code == 401


# ---------- Devices + Heartbeat ----------
class TestDevices:
    def test_register_all_three_models(self, user_token):
        ids = {}
        for model in ["flagship", "mid", "budget"]:
            r = requests.post(f"{API}/devices/register",
                              headers=_auth_header(user_token["token"]),
                              json={"name": f"TEST_{model}", "model": model})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["model"] == model
            assert d["user_id"] == user_token["id"]
            assert "_id" not in d
            ids[model] = d["id"]
        user_token["devices"] = ids

    def test_register_invalid_model(self, user_token):
        r = requests.post(f"{API}/devices/register",
                          headers=_auth_header(user_token["token"]),
                          json={"name": "bad", "model": "ultra"})
        assert r.status_code == 400

    def test_list_only_current_user(self, user_token):
        r = requests.get(f"{API}/devices", headers=_auth_header(user_token["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 3
        for row in rows:
            assert row["user_id"] == user_token["id"]
            assert "_id" not in row

    def test_heartbeat_eligible(self, user_token):
        dev_id = user_token["devices"]["mid"]
        r = requests.post(f"{API}/devices/heartbeat",
                          headers=_auth_header(user_token["token"]),
                          json={"device_id": dev_id, "charging": True,
                                "wifi": True, "permission": True, "battery": 95})
        assert r.status_code == 200
        d = r.json()
        assert d["eligible"] is True
        assert d["status"] == "active"

    def test_heartbeat_ineligible_when_any_false(self, user_token):
        dev_id = user_token["devices"]["budget"]
        for combo in [(False, True, True), (True, False, True), (True, True, False)]:
            r = requests.post(f"{API}/devices/heartbeat",
                              headers=_auth_header(user_token["token"]),
                              json={"device_id": dev_id, "charging": combo[0],
                                    "wifi": combo[1], "permission": combo[2], "battery": 80})
            assert r.status_code == 200
            d = r.json()
            assert d["eligible"] is False
            assert d["status"] == "idle"


# ---------- Tasks (real compute) ----------
class TestTasks:
    def test_request_requires_golden_rule(self, user_token):
        dev_id = user_token["devices"]["flagship"]
        # Ensure ineligible
        requests.post(f"{API}/devices/heartbeat",
                      headers=_auth_header(user_token["token"]),
                      json={"device_id": dev_id, "charging": False,
                            "wifi": True, "permission": True, "battery": 90})
        r = requests.post(f"{API}/tasks/request",
                          headers=_auth_header(user_token["token"]),
                          params={"device_id": dev_id})
        assert r.status_code == 400

    def test_matrix_and_hash_verified(self, user_token):
        """End-to-end: request many tasks until we get both a matrix AND a hash
        task, execute them via the same algorithms as the browser, submit, and
        assert verified=True with earnings credited."""
        dev_id = user_token["devices"]["mid"]
        # Make eligible
        requests.post(f"{API}/devices/heartbeat",
                      headers=_auth_header(user_token["token"]),
                      json={"device_id": dev_id, "charging": True,
                            "wifi": True, "permission": True, "battery": 90})

        # Initial balance
        w0 = requests.get(f"{API}/wallet", headers=_auth_header(user_token["token"])).json()
        bal0 = w0["balance_usdt"]

        kinds_done = set()
        attempts = 0
        while kinds_done != {"matrix", "hash"} and attempts < 20:
            attempts += 1
            r = requests.post(f"{API}/tasks/request",
                              headers=_auth_header(user_token["token"]),
                              params={"device_id": dev_id})
            assert r.status_code == 200, r.text
            task = r.json()
            assert "expected" not in task  # server must not leak expected
            assert task["kind"] in ("matrix", "hash")
            if task["kind"] in kinds_done:
                # submit garbage to finalize and loop
                requests.post(f"{API}/tasks/submit",
                              headers=_auth_header(user_token["token"]),
                              json={"task_id": task["id"], "device_id": dev_id,
                                    "result": "nope", "compute_ms": 500})
                continue

            if task["kind"] == "matrix":
                result = matrix_signature(task["payload"]["seed"], task["payload"]["size"])
            else:
                result = hash_signature(task["payload"]["nonce"], task["payload"]["difficulty"])

            sr = requests.post(f"{API}/tasks/submit",
                               headers=_auth_header(user_token["token"]),
                               json={"task_id": task["id"], "device_id": dev_id,
                                     "result": result, "compute_ms": 500})
            assert sr.status_code == 200, sr.text
            sd = sr.json()
            assert sd["verified"] is True, f"kind={task['kind']} failed verification: {sd}"
            assert sd["earned_usdt"] > 0
            kinds_done.add(task["kind"])

        assert kinds_done == {"matrix", "hash"}, f"did not complete both kinds: {kinds_done}"

        # Balance increased
        w1 = requests.get(f"{API}/wallet", headers=_auth_header(user_token["token"])).json()
        assert w1["balance_usdt"] > bal0
        assert w1["total_earned"] >= w1["balance_usdt"]

    def test_incorrect_result_rejected(self, user_token):
        dev_id = user_token["devices"]["mid"]
        r = requests.post(f"{API}/tasks/request",
                          headers=_auth_header(user_token["token"]),
                          params={"device_id": dev_id})
        assert r.status_code == 200
        task = r.json()
        sr = requests.post(f"{API}/tasks/submit",
                           headers=_auth_header(user_token["token"]),
                           json={"task_id": task["id"], "device_id": dev_id,
                                 "result": "wrong:wrong", "compute_ms": 300})
        assert sr.status_code == 200
        assert sr.json()["verified"] is False
        assert sr.json()["earned_usdt"] == 0.0

    def test_fraud_shield_flags_on_fast_correct(self, user_token):
        """Submit correct result with absurdly low compute_ms -> device flagged."""
        # Use a fresh device so we don't interfere with other tests
        reg = requests.post(f"{API}/devices/register",
                            headers=_auth_header(user_token["token"]),
                            json={"name": "TEST_fraud", "model": "mid"}).json()
        dev_id = reg["id"]
        requests.post(f"{API}/devices/heartbeat",
                      headers=_auth_header(user_token["token"]),
                      json={"device_id": dev_id, "charging": True,
                            "wifi": True, "permission": True, "battery": 99})

        # Keep trying until we get a matrix task (fast to compute here)
        flagged = False
        for _ in range(15):
            r = requests.post(f"{API}/tasks/request",
                              headers=_auth_header(user_token["token"]),
                              params={"device_id": dev_id})
            if r.status_code != 200:
                break
            task = r.json()
            if task["kind"] == "matrix":
                result = matrix_signature(task["payload"]["seed"], task["payload"]["size"])
            else:
                result = hash_signature(task["payload"]["nonce"], task["payload"]["difficulty"])
            sr = requests.post(f"{API}/tasks/submit",
                               headers=_auth_header(user_token["token"]),
                               json={"task_id": task["id"], "device_id": dev_id,
                                     "result": result, "compute_ms": 5})
            if sr.status_code == 200 and sr.json().get("verified"):
                # Fetch devices and see if flagged
                devs = requests.get(f"{API}/devices",
                                    headers=_auth_header(user_token["token"])).json()
                d = next((x for x in devs if x["id"] == dev_id), None)
                if d and d.get("flagged"):
                    flagged = True
                    break
        assert flagged, "Fraud Shield did not flag device for compute_ms < threshold"


# ---------- Wallet ----------
class TestWallet:
    def test_wallet_structure(self, user_token):
        r = requests.get(f"{API}/wallet", headers=_auth_header(user_token["token"]))
        assert r.status_code == 200
        w = r.json()
        for k in ("balance_usdt", "total_earned", "withdraw_threshold",
                  "can_withdraw", "payouts"):
            assert k in w
        assert w["withdraw_threshold"] == 5.0

    def test_withdraw_below_threshold(self, user_token):
        r = requests.post(f"{API}/wallet/withdraw",
                          headers=_auth_header(user_token["token"]),
                          json={"address": "TXyz1234567890abcdef"})
        # Balance is tiny from compute -> should be 400
        assert r.status_code == 400

    def test_withdraw_success_when_bumped(self, user_token):
        """Bump balance via DB-less path is not possible; instead verify the path
        where balance < threshold is 400 above. For >= threshold, we'd need direct
        DB write which is out of scope. Skip as documented."""
        pytest.skip("Requires direct DB bump; covered by threshold test above")


# ---------- Stats ----------
class TestStats:
    def test_network_stats(self):
        r = requests.get(f"{API}/stats/network")
        assert r.status_code == 200
        s = r.json()
        for k in ("total_devices", "active_devices", "total_tasks",
                  "total_users", "live_petaflops"):
            assert k in s


# ---------- Admin RBAC ----------
class TestAdmin:
    def test_non_admin_forbidden(self, user_token):
        endpoints = ["/admin/devices", "/admin/users", "/admin/payouts", "/admin/fraud"]
        for ep in endpoints:
            r = requests.get(f"{API}{ep}", headers=_auth_header(user_token["token"]))
            assert r.status_code == 403, f"{ep} did not return 403 for user, got {r.status_code}"

    def test_admin_can_access(self, admin_token):
        for ep in ["/admin/devices", "/admin/users", "/admin/payouts", "/admin/fraud"]:
            r = requests.get(f"{API}{ep}", headers=_auth_header(admin_token))
            assert r.status_code == 200, f"{ep} failed for admin: {r.status_code}"
            body = r.json()
            # Ensure no _id leakage
            if isinstance(body, list):
                for row in body[:3]:
                    assert "_id" not in row
            elif isinstance(body, dict):
                for v in body.values():
                    if isinstance(v, list):
                        for row in v[:3]:
                            if isinstance(row, dict):
                                assert "_id" not in row

    def test_admin_flag_and_unflag(self, admin_token, user_token):
        dev_id = list(user_token["devices"].values())[0]
        r = requests.post(f"{API}/admin/devices/{dev_id}/flag",
                          headers=_auth_header(admin_token))
        assert r.status_code == 200
        r = requests.post(f"{API}/admin/devices/{dev_id}/unflag",
                          headers=_auth_header(admin_token))
        assert r.status_code == 200

    def test_non_admin_cannot_approve_payout(self, user_token):
        r = requests.post(f"{API}/admin/payouts/{uuid.uuid4()}/approve",
                          headers=_auth_header(user_token["token"]))
        assert r.status_code == 403
