"""
Iteration 3 — APK metadata + download tracking, Admin Auto-Mining + Hashrate,
Customer priority tiers, Job result export (JSON/CSV), Customer API keys,
Referral system + share-card, Brute-force login lockout.

Each test creates fresh user/customer fixtures (UUID emails) to be order-independent.
"""
import os
import csv
import io
import time
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


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# Mirror server matrix compute helpers (for golden submissions in priority test)
def _mulberry32(seed: int):
    state = [seed & 0xFFFFFFFF]

    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


def _matrix_signature(seed: int, size: int) -> str:
    rng = _mulberry32(seed)
    n = size * size
    a = [int(rng() * 10) for _ in range(n)]
    b = [int(rng() * 10) for _ in range(n)]
    total, trace = 0, 0
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


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session", autouse=True)
def _ensure_auto_mining_on(admin_token):
    """Make sure auto-mining is True at start; restore True at session end."""
    requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})
    yield
    requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})


def _drain_running_jobs(admin_token):
    rows = requests.get(f"{API}/admin/jobs", headers=_bearer(admin_token)).json()
    for j in rows:
        if j.get("status") == "running":
            requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))


def _new_customer():
    email = f"test_cust3_{uuid.uuid4().hex[:8]}@grid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "Cust",
        "role": "customer", "company": "TEST_AcmeIter3"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "id": d["id"], "email": email,
            "referral_code": d.get("referral_code"), "api_key": d.get("api_key")}


def _new_worker(referral_code=None):
    email = f"test_worker3_{uuid.uuid4().hex[:8]}@grid.io"
    payload = {"email": email, "password": "Passw0rd!", "name": "Worker"}
    if referral_code:
        payload["referral_code"] = referral_code
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["token"]
    dev = requests.post(f"{API}/devices/register", headers=_bearer(tok),
                        json={"name": "TEST_w3", "model": "mid",
                              "brand": "Samsung", "os_version": "Android 14"}).json()
    requests.post(f"{API}/devices/heartbeat", headers=_bearer(tok),
                  json={"device_id": dev["id"], "charging": True, "wifi": True,
                        "permission": True, "battery": 90,
                        "thermal": "warm", "brand": "Samsung", "os_version": "Android 14"})
    return {"token": tok, "id": d["id"], "email": email, "device_id": dev["id"],
            "referral_code": d.get("referral_code"), "api_key": d.get("api_key")}


# ====================== 1. APK metadata + download tracking ======================
class TestAPK:
    def test_apk_version_metadata(self):
        r = requests.get(f"{API}/apk/version")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("version", "download_url", "min_android", "min_sdk", "abi", "release_notes", "signed"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["version"], str) and len(d["version"]) > 0
        assert isinstance(d["min_sdk"], int)
        assert "arm64-v8a" in d["abi"]
        assert "armeabi-v7a" in d["abi"]
        assert d["signed"] is True

    def test_apk_track_download_counts_and_rate_limits(self):
        """Hit track endpoint up to 8 times; expect a 429 to engage and totals to grow."""
        success_count = 0
        rate_limited = False
        first_total = None
        for i in range(8):
            r = requests.post(f"{API}/apk/track-download")
            if r.status_code == 200:
                success_count += 1
                d = r.json()
                assert d.get("ok") is True
                assert isinstance(d.get("total_downloads"), int)
                if first_total is None:
                    first_total = d["total_downloads"]
            elif r.status_code == 429:
                rate_limited = True
                break
        # At least one success and rate limit must have engaged within 8 hits
        assert success_count >= 1, "No successful download tracked"
        # Rate limit may not engage if running on shared ingress IP w/ <5 prior hits in window;
        # but with 8 attempts back-to-back from same client IP it should engage.
        assert rate_limited, f"Rate-limit did not engage after {success_count} successful hits"


# ====================== 2. Admin Auto-Mining toggle ======================
class TestAutoMining:
    def test_get_auto_mining_admin_only(self, admin_token):
        # admin can read
        r = requests.get(f"{API}/admin/auto-mining", headers=_bearer(admin_token))
        assert r.status_code == 200
        assert "enabled" in r.json()
        assert isinstance(r.json()["enabled"], bool)
        # non-admin cannot
        cust = _new_customer()
        r2 = requests.get(f"{API}/admin/auto-mining", headers=_bearer(cust["token"]))
        assert r2.status_code == 403

    def test_set_auto_mining_persists(self, admin_token):
        # disable
        r = requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": False})
        assert r.status_code == 200 and r.json()["enabled"] is False
        # read-back
        rb = requests.get(f"{API}/admin/auto-mining", headers=_bearer(admin_token))
        assert rb.json()["enabled"] is False
        # restore
        r2 = requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})
        assert r2.json()["enabled"] is True

    def test_worker_baseline_blocked_when_auto_mining_off(self, admin_token):
        _drain_running_jobs(admin_token)
        # Disable auto-mining
        requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": False})
        try:
            w = _new_worker()
            r = requests.post(f"{API}/tasks/request", headers=_bearer(w["token"]),
                              params={"device_id": w["device_id"]})
            # Endpoint either 204 (no body) or 4xx with detail mentioning baseline mining
            assert r.status_code in (204, 400, 403, 503), f"unexpected {r.status_code}: {r.text}"
            if r.status_code != 204 and r.text:
                detail = ""
                try:
                    detail = r.json().get("detail", "")
                except Exception:
                    detail = r.text
                assert "baseline" in detail.lower() or "disabled" in detail.lower() or "no tasks" in detail.lower(), detail
        finally:
            # Always restore
            requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})

    def test_worker_baseline_allowed_when_auto_mining_on(self, admin_token):
        _drain_running_jobs(admin_token)
        requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})
        w = _new_worker()
        r = requests.post(f"{API}/tasks/request", headers=_bearer(w["token"]),
                          params={"device_id": w["device_id"]})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t.get("job_id") is None
        assert t["kind"] in ("matrix", "hash")
        # finalize garbage
        requests.post(f"{API}/tasks/submit", headers=_bearer(w["token"]),
                      json={"task_id": t["id"], "device_id": w["device_id"],
                            "result": "x", "compute_ms": 500})


# ====================== 3. Admin hashrate series ======================
class TestHashrate:
    def test_hashrate_structure(self, admin_token):
        r = requests.get(f"{API}/admin/hashrate", headers=_bearer(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "series" in d and isinstance(d["series"], list)
        assert len(d["series"]) == 30, f"expected 30 buckets, got {len(d['series'])}"
        for b in d["series"]:
            for k in ("label", "hashes", "tasks"):
                assert k in b
        assert "total_hashrate_hps" in d
        assert "total_tasks" in d
        assert isinstance(d["total_hashrate_hps"], (int, float))

    def test_hashrate_admin_only(self):
        cust = _new_customer()
        r = requests.get(f"{API}/admin/hashrate", headers=_bearer(cust["token"]))
        assert r.status_code == 403


# ====================== 4. Priority tiers ======================
class TestPriority:
    def test_create_job_default_priority_standard(self, admin_token):
        cust = _new_customer()
        r = requests.post(f"{API}/jobs", headers=_bearer(cust["token"]), json={
            "name": "TEST_PrioDefault", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1,
            "workload_type": "matrix_compute"
        })
        assert r.status_code == 200, r.text
        assert r.json().get("priority") == "standard"

    def test_create_job_persists_priority_instant(self, admin_token):
        cust = _new_customer()
        r = requests.post(f"{API}/jobs", headers=_bearer(cust["token"]), json={
            "name": "TEST_PrioInstant", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1,
            "workload_type": "matrix_compute", "priority": "instant"
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("priority") == "instant"
        # Verify persisted via GET
        rb = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(cust["token"]))
        assert rb.json().get("priority") == "instant"

    def test_priority_multiplier_in_submit_response(self, admin_token):
        """Same compute_ms across standard vs instant => priority_mult differs and earned scales."""
        _drain_running_jobs(admin_token)
        cust = _new_customer()
        worker = _new_worker()
        compute_ms = 500

        def _run_one_unit(priority):
            _drain_running_jobs(admin_token)
            j = requests.post(f"{API}/jobs", headers=_bearer(cust["token"]), json={
                "name": f"TEST_Prio_{priority}_{uuid.uuid4().hex[:4]}",
                "file_name": "f", "file_size": 1,
                "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1,
                "workload_type": "matrix_compute", "priority": priority,
            }).json()
            assert requests.post(f"{API}/admin/jobs/{j['id']}/approve",
                                 headers=_bearer(admin_token)).status_code == 200
            t = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                              params={"device_id": worker["device_id"]}).json()
            assert t["job_id"] == j["id"], f"task not bound to {priority} job"
            assert t["kind"] == "matrix"
            result = _matrix_signature(t["payload"]["seed"], t["payload"]["size"])
            sr = requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                               json={"task_id": t["id"], "device_id": worker["device_id"],
                                     "result": result, "compute_ms": compute_ms}).json()
            assert sr["verified"] is True
            return sr

        std = _run_one_unit("standard")
        inst = _run_one_unit("instant")

        assert "priority_mult" in std and abs(std["priority_mult"] - 1.0) < 1e-6
        assert "priority_mult" in inst and abs(inst["priority_mult"] - 2.5) < 1e-6
        # earned_usdt should scale ~2.5x (allow 1% drift)
        ratio = inst["earned_usdt"] / max(std["earned_usdt"], 1e-9)
        assert 2.45 < ratio < 2.55, f"instant/standard earned ratio = {ratio}"


# ====================== 5. Result export JSON & CSV ======================
class TestResultsExport:
    def _create_and_complete_one_unit_job(self, admin_token, customer, worker, name="TEST_Export"):
        _drain_running_jobs(admin_token)
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": f"{name}_{uuid.uuid4().hex[:4]}",
            "file_name": "f.csv", "file_size": 10,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1,
            "workload_type": "matrix_compute"
        }).json()
        assert requests.post(f"{API}/admin/jobs/{j['id']}/approve",
                             headers=_bearer(admin_token)).status_code == 200
        t = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]}).json()
        result = _matrix_signature(t["payload"]["seed"], t["payload"]["size"])
        sr = requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                           json={"task_id": t["id"], "device_id": worker["device_id"],
                                 "result": result, "compute_ms": 500}).json()
        assert sr["verified"] is True
        return j

    def test_results_json_export(self, admin_token):
        cust = _new_customer()
        worker = _new_worker()
        j = self._create_and_complete_one_unit_job(admin_token, cust, worker)
        r = requests.get(f"{API}/jobs/{j['id']}/results.json", headers=_bearer(cust["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("job", "results", "count"):
            assert k in d
        assert d["count"] == 1
        assert len(d["results"]) == 1
        assert d["job"]["id"] == j["id"]
        # No mongodb objectid leakage
        assert "_id" not in d["job"]
        assert all("_id" not in r0 for r0 in d["results"])

    def test_results_csv_export(self, admin_token):
        cust = _new_customer()
        worker = _new_worker()
        j = self._create_and_complete_one_unit_job(admin_token, cust, worker)
        r = requests.get(f"{API}/jobs/{j['id']}/results.csv", headers=_bearer(cust["token"]))
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".csv" in cd
        rows = list(csv.reader(io.StringIO(r.text)))
        assert len(rows) >= 2  # header + at least 1
        header = rows[0]
        # spot-check expected columns
        for col in ("task_id", "kind", "compute_ms", "result", "earned_usdt"):
            assert col in header, f"missing CSV column {col}"

    def test_results_export_other_customer_404(self, admin_token):
        cust_a = _new_customer()
        cust_b = _new_customer()
        worker = _new_worker()
        j = self._create_and_complete_one_unit_job(admin_token, cust_a, worker, name="TEST_ExportPrivate")
        # B requests A's job => 404
        rj = requests.get(f"{API}/jobs/{j['id']}/results.json", headers=_bearer(cust_b["token"]))
        assert rj.status_code == 404
        rc = requests.get(f"{API}/jobs/{j['id']}/results.csv", headers=_bearer(cust_b["token"]))
        assert rc.status_code == 404


# ====================== 6. Customer API keys ======================
class TestApiKey:
    def test_get_api_key_returns_existing_or_generated(self):
        cust = _new_customer()
        r = requests.get(f"{API}/customer/api-key", headers=_bearer(cust["token"]))
        assert r.status_code == 200, r.text
        key = r.json().get("api_key")
        assert isinstance(key, str) and key.startswith("grid_") and len(key) > 10
        # Subsequent GET returns same
        r2 = requests.get(f"{API}/customer/api-key", headers=_bearer(cust["token"]))
        assert r2.json().get("api_key") == key

    def test_regenerate_returns_new_key(self):
        cust = _new_customer()
        r = requests.get(f"{API}/customer/api-key", headers=_bearer(cust["token"]))
        old = r.json()["api_key"]
        rg = requests.post(f"{API}/customer/api-key/regenerate", headers=_bearer(cust["token"]))
        assert rg.status_code == 200
        new = rg.json()["api_key"]
        assert new and new != old
        # GET reflects new
        r2 = requests.get(f"{API}/customer/api-key", headers=_bearer(cust["token"]))
        assert r2.json()["api_key"] == new

    def test_worker_cannot_access_api_key(self):
        w = _new_worker()
        r = requests.get(f"{API}/customer/api-key", headers=_bearer(w["token"]))
        assert r.status_code == 403
        r2 = requests.post(f"{API}/customer/api-key/regenerate", headers=_bearer(w["token"]))
        assert r2.status_code == 403


# ====================== 7. Referrals ======================
class TestReferrals:
    def test_register_returns_referral_code(self):
        w = _new_worker()
        assert w["referral_code"] and len(w["referral_code"]) >= 6

    def test_register_with_referral_links_referrer(self, admin_token):
        a = _new_worker()
        b = _new_worker(referral_code=a["referral_code"])
        # Verify A's referrals listing now includes B
        r = requests.get(f"{API}/referrals", headers=_bearer(a["token"]))
        assert r.status_code == 200
        d = r.json()
        ids = [x["id"] for x in d["referrals"]]
        assert b["id"] in ids, f"B not in A's referrals: {ids}"
        assert d["commission_rate"] == 0.10
        assert d["referral_code"] == a["referral_code"]
        assert d["referral_link_path"].endswith(a["referral_code"])

    def test_referrals_endpoint_basic_structure(self):
        w = _new_worker()
        r = requests.get(f"{API}/referrals", headers=_bearer(w["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("referral_code", "referral_link_path", "referral_earnings", "referrals", "commission_rate"):
            assert k in d
        assert d["commission_rate"] == 0.10
        assert isinstance(d["referrals"], list)

    def test_referral_share_card_svg(self):
        w = _new_worker()
        r = requests.get(f"{API}/referrals/share-card", headers=_bearer(w["token"]))
        assert r.status_code == 200, r.text
        assert "image/svg+xml" in r.headers.get("content-type", "")
        svg = r.text
        assert "<svg" in svg
        assert w["referral_code"] in svg

    def test_referral_commission_credited_on_verified_task(self, admin_token):
        """A refers B; B earns X; A.balance/referral_earnings += 0.10*X; B unchanged."""
        _drain_running_jobs(admin_token)
        # Make sure auto-mining is on so B can earn from baseline (no need for active job).
        requests.post(f"{API}/admin/auto-mining", headers=_bearer(admin_token), json={"enabled": True})
        a = _new_worker()
        b = _new_worker(referral_code=a["referral_code"])

        # Snapshot A
        a_before = requests.get(f"{API}/referrals", headers=_bearer(a["token"])).json()
        a_balance_before = requests.get(f"{API}/auth/me", headers=_bearer(a["token"])).json().get("balance_usdt", 0.0)
        # Snapshot B balance
        b_balance_before = requests.get(f"{API}/auth/me", headers=_bearer(b["token"])).json().get("balance_usdt", 0.0)

        # B requests + submits a baseline matrix task with a verified result
        # Try a few times to land a matrix task (kind is randomized when baseline)
        earned = None
        for _ in range(6):
            tr = requests.post(f"{API}/tasks/request", headers=_bearer(b["token"]),
                               params={"device_id": b["device_id"]})
            if tr.status_code != 200:
                continue
            t = tr.json()
            if t["kind"] != "matrix":
                # finalize garbage so it doesn't linger
                requests.post(f"{API}/tasks/submit", headers=_bearer(b["token"]),
                              json={"task_id": t["id"], "device_id": b["device_id"],
                                    "result": "x", "compute_ms": 500})
                continue
            result = _matrix_signature(t["payload"]["seed"], t["payload"]["size"])
            sr = requests.post(f"{API}/tasks/submit", headers=_bearer(b["token"]),
                               json={"task_id": t["id"], "device_id": b["device_id"],
                                     "result": result, "compute_ms": 500}).json()
            if sr.get("verified"):
                earned = sr.get("earned_usdt", 0.0)
                break

        assert earned and earned > 0, f"could not get B to earn a verified task; last={earned}"

        # Verify B's earnings
        b_balance_after = requests.get(f"{API}/auth/me", headers=_bearer(b["token"])).json().get("balance_usdt", 0.0)
        assert abs((b_balance_after - b_balance_before) - earned) < 1e-4, \
            f"B earned delta != reported (after={b_balance_after}, before={b_balance_before}, earned={earned})"

        # Verify A's referral_earnings += 0.10*earned and balance += same
        a_after = requests.get(f"{API}/referrals", headers=_bearer(a["token"])).json()
        a_balance_after = requests.get(f"{API}/auth/me", headers=_bearer(a["token"])).json().get("balance_usdt", 0.0)
        commission = round(earned * 0.10, 6)
        assert abs((a_after["referral_earnings"] - a_before["referral_earnings"]) - commission) < 1e-4, \
            f"A.referral_earnings delta wrong: before={a_before['referral_earnings']} after={a_after['referral_earnings']} expected={commission}"
        assert abs((a_balance_after - a_balance_before) - commission) < 1e-4, \
            f"A.balance delta wrong: before={a_balance_before} after={a_balance_after} expected={commission}"


# ====================== 8. Brute-force lockout ======================
class TestBruteForceLockout:
    def test_lockout_engages_on_5th_attempt(self):
        # Use a fresh fake email + dedicated fake IP so this test is isolated.
        fake_email = f"test_bf_{uuid.uuid4().hex[:8]}@grid.io"
        fake_ip = f"10.42.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
        headers = {"X-Forwarded-For": fake_ip}
        # 4 wrong attempts -> 401
        for i in range(4):
            r = requests.post(f"{API}/auth/login",
                              json={"email": fake_email, "password": "wrong"},
                              headers=headers)
            assert r.status_code == 401, f"attempt {i+1}: expected 401, got {r.status_code} {r.text}"
        # 5th -> 429
        r5 = requests.post(f"{API}/auth/login",
                           json={"email": fake_email, "password": "wrong"},
                           headers=headers)
        assert r5.status_code == 429, f"attempt 5: expected 429, got {r5.status_code} {r5.text}"
        # 6th -> still 429 (locked)
        r6 = requests.post(f"{API}/auth/login",
                           json={"email": fake_email, "password": "wrong"},
                           headers=headers)
        assert r6.status_code == 429, f"attempt 6: expected 429, got {r6.status_code}"

    def test_successful_login_clears_attempts(self):
        # Register a real user
        email = f"test_bf_ok_{uuid.uuid4().hex[:8]}@grid.io"
        password = "Passw0rd!"
        requests.post(f"{API}/auth/register", json={
            "email": email, "password": password, "name": "BF",
        })
        fake_ip = f"10.43.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
        headers = {"X-Forwarded-For": fake_ip}
        # 4 wrong attempts
        for i in range(4):
            r = requests.post(f"{API}/auth/login",
                              json={"email": email, "password": "wrong"},
                              headers=headers)
            assert r.status_code == 401, f"attempt {i+1}: got {r.status_code}"
        # 1 successful login -> resets counter
        ok = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": password},
                           headers=headers)
        assert ok.status_code == 200, ok.text
        # Subsequent wrong attempt should be 401, NOT 429
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": "wrong"},
                          headers=headers)
        assert r.status_code == 401, f"expected 401 after counter reset, got {r.status_code}"


# ====================== 9. Login response includes new fields ======================
class TestLoginPayload:
    def test_customer_login_includes_referral_code_and_api_key(self):
        cust = _new_customer()
        r = requests.post(f"{API}/auth/login", json={"email": cust["email"], "password": "Passw0rd!"})
        assert r.status_code == 200
        d = r.json()
        assert d.get("referral_code"), "customer login missing referral_code"
        assert d.get("api_key") and d["api_key"].startswith("grid_"), "customer login missing api_key"

    def test_worker_login_includes_referral_code_no_api_key(self):
        w = _new_worker()
        r = requests.post(f"{API}/auth/login", json={"email": w["email"], "password": "Passw0rd!"})
        assert r.status_code == 200
        d = r.json()
        assert d.get("referral_code"), "worker login missing referral_code"
        # api_key should be None or absent for non-customer
        assert not d.get("api_key"), f"worker should not have api_key, got {d.get('api_key')}"
