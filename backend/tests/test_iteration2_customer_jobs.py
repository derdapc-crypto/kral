"""
Iteration 2 — Customer Portal, Jobs, Admin Ledger, Device Health fields.
Extends test_grid_backend.py without touching it. Each test creates a fresh
customer per run (UUID email) so it is independent.
"""
import os
import uuid
import hashlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grid-supercomputer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASSWORD = "Grid@Admin2026"


# ---------- Compute helpers (mirror backend) ----------
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


def hash_signature(nonce: str, difficulty: int) -> str:
    prefix = "0" * difficulty
    i = 0
    while i < 2_000_000:
        h = hashlib.sha256(f"{nonce}:{i}".encode()).hexdigest()
        if h.startswith(prefix):
            return f"{i}:{h}"
        i += 1
    return f"{i}:{hashlib.sha256(f'{nonce}:{i}'.encode()).hexdigest()}"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def customer():
    """Fresh customer for every test."""
    email = f"test_cust_{uuid.uuid4().hex[:8]}@grid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "Cust",
        "role": "customer", "company": "TEST_Acme"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "customer"
    return {"token": d["token"], "id": d["id"], "email": email}


@pytest.fixture(scope="session")
def worker():
    """Fresh worker user with one ready device. Eligible (charging+wifi+permission)."""
    email = f"test_worker_{uuid.uuid4().hex[:8]}@grid.io"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "Worker"
    })
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    uid = r.json()["id"]
    dev = requests.post(f"{API}/devices/register", headers=_bearer(tok),
                        json={"name": "TEST_w_dev", "model": "mid",
                              "brand": "Samsung", "os_version": "Android 14"}).json()
    requests.post(f"{API}/devices/heartbeat", headers=_bearer(tok),
                  json={"device_id": dev["id"], "charging": True, "wifi": True,
                        "permission": True, "battery": 90,
                        "thermal": "warm", "brand": "Samsung", "os_version": "Android 14"})
    return {"token": tok, "id": uid, "email": email, "device_id": dev["id"]}


# ---------- 1. Register role handling ----------
class TestRegisterRoles:
    def test_register_customer(self):
        email = f"test_role_c_{uuid.uuid4().hex[:8]}@grid.io"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "C", "role": "customer"
        })
        assert r.status_code == 200
        assert r.json()["role"] == "customer"

    def test_register_user_default(self):
        email = f"test_role_u_{uuid.uuid4().hex[:8]}@grid.io"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "U"
        })
        assert r.status_code == 200
        assert r.json()["role"] == "user"

    def test_register_admin_self_assign_blocked(self):
        email = f"test_role_a_{uuid.uuid4().hex[:8]}@grid.io"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "A", "role": "admin"
        })
        assert r.status_code == 200
        assert r.json()["role"] == "user"  # falls back

    def test_customer_login_routes_role(self):
        email = f"test_login_c_{uuid.uuid4().hex[:8]}@grid.io"
        requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "C", "role": "customer"
        })
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"})
        assert r.status_code == 200
        assert r.json()["role"] == "customer"


# ---------- 2. Job creation + listing + ownership ----------
class TestJobsCRUD:
    def test_create_job_pending_with_rate(self, customer):
        payload = {
            "name": "TEST_Job1", "file_name": "data.csv", "file_size": 1024,
            "description": "demo", "total_units": 4, "budget_usdt": 2.0,
            "max_nodes": 5, "workload_type": "matrix_compute"
        }
        r = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "pending"
        assert j["customer_id"] == customer["id"]
        assert j["processed_units"] == 0
        assert j["spent_usdt"] == 0.0
        # rate = 2.0 / 4 = 0.5
        assert abs(j["rate_per_unit"] - 0.5) < 1e-9
        assert j["workload_type"] == "matrix_compute"
        assert "_id" not in j

    def test_list_jobs_only_owned(self, customer):
        # create 2 jobs as customer
        for i in range(2):
            requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
                "name": f"TEST_OwnJob{i}", "file_name": "x.csv", "file_size": 10,
                "total_units": 2, "budget_usdt": 1.0, "max_nodes": 1
            })
        # second isolated customer
        email2 = f"test_other_{uuid.uuid4().hex[:8]}@grid.io"
        r2 = requests.post(f"{API}/auth/register", json={
            "email": email2, "password": "Passw0rd!", "name": "O", "role": "customer"
        }).json()
        requests.post(f"{API}/jobs", headers=_bearer(r2["token"]), json={
            "name": "TEST_OtherJob", "file_name": "y.csv", "file_size": 10,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        })

        rows = requests.get(f"{API}/jobs", headers=_bearer(customer["token"])).json()
        assert isinstance(rows, list)
        assert all(j["customer_id"] == customer["id"] for j in rows)
        assert any(j["name"].startswith("TEST_OwnJob") for j in rows)
        assert not any(j["name"] == "TEST_OtherJob" for j in rows)

    def test_get_job_by_id_and_404_for_other(self, customer):
        # create
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Get", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        }).json()
        # owner gets it
        r = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"]))
        assert r.status_code == 200
        assert r.json()["id"] == j["id"]

        # other customer
        email2 = f"test_otherget_{uuid.uuid4().hex[:8]}@grid.io"
        r2 = requests.post(f"{API}/auth/register", json={
            "email": email2, "password": "Passw0rd!", "name": "O", "role": "customer"
        }).json()
        rother = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(r2["token"]))
        assert rother.status_code == 404

    def test_worker_cannot_create_job(self, worker):
        r = requests.post(f"{API}/jobs", headers=_bearer(worker["token"]), json={
            "name": "TEST_Forbidden", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        })
        assert r.status_code == 403
        assert "Customer access required" in r.text


# ---------- 3. Admin jobs / approve / reject ----------
class TestAdminJobs:
    def test_non_admin_cannot_list_admin_jobs(self, customer):
        r = requests.get(f"{API}/admin/jobs", headers=_bearer(customer["token"]))
        assert r.status_code == 403

    def test_admin_lists_all_jobs(self, admin_token, customer):
        # Ensure at least one job exists
        requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_AdminList", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        })
        r = requests.get(f"{API}/admin/jobs", headers=_bearer(admin_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        assert all("_id" not in j for j in rows[:5])

    def test_approve_pending_to_running(self, admin_token, customer):
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Appr", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        }).json()
        a = requests.post(f"{API}/admin/jobs/{j['id']}/approve", headers=_bearer(admin_token))
        assert a.status_code == 200
        # verify via customer GET
        got = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
        assert got["status"] == "running"
        assert got.get("approved_by") == ADMIN_EMAIL
        assert got.get("approved_at")
        # cleanup: reject so remaining tests aren't polluted by a running job
        requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))

    def test_reject_then_re_approve(self, admin_token, customer):
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Rej", "file_name": "f", "file_size": 1,
            "total_units": 1, "budget_usdt": 1.0, "max_nodes": 1
        }).json()
        # reject pending
        r = requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))
        assert r.status_code == 200
        got = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
        assert got["status"] == "rejected"
        # approve from rejected -> running (per code)
        r2 = requests.post(f"{API}/admin/jobs/{j['id']}/approve", headers=_bearer(admin_token))
        assert r2.status_code == 200
        got2 = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
        assert got2["status"] == "running"
        # cleanup
        requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))


# ---------- 4. Worker task assignment respects active job ----------
def _drain_running_jobs(admin_token):
    """Reject all currently running jobs so subsequent tests start clean."""
    rows = requests.get(f"{API}/admin/jobs", headers=_bearer(admin_token)).json()
    for j in rows:
        if j.get("status") == "running":
            requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))


class TestWorkerJobBinding:
    def test_no_running_jobs_task_has_null_job_id(self, admin_token, worker):
        _drain_running_jobs(admin_token)
        r = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t.get("job_id") is None
        assert t["kind"] in ("matrix", "hash")
        # finalize task with garbage so it doesn't linger
        requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                      json={"task_id": t["id"], "device_id": worker["device_id"],
                            "result": "x", "compute_ms": 200})

    def test_matrix_workload_forces_matrix_kind(self, admin_token, customer, worker):
        _drain_running_jobs(admin_token)
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Matrix", "file_name": "m", "file_size": 1,
            "total_units": 5, "budget_usdt": 1.0, "max_nodes": 1,
            "workload_type": "matrix_compute"
        }).json()
        requests.post(f"{API}/admin/jobs/{j['id']}/approve", headers=_bearer(admin_token))

        r = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]})
        assert r.status_code == 200
        t = r.json()
        assert t["kind"] == "matrix"
        assert t["job_id"] == j["id"]
        # finalize garbage so we don't increment job
        requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                      json={"task_id": t["id"], "device_id": worker["device_id"],
                            "result": "bad", "compute_ms": 200})
        # cleanup
        requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))

    def test_hash_workload_forces_hash_kind(self, admin_token, customer, worker):
        _drain_running_jobs(admin_token)
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Hash", "file_name": "h", "file_size": 1,
            "total_units": 5, "budget_usdt": 1.0, "max_nodes": 1,
            "workload_type": "hash_compute"
        }).json()
        requests.post(f"{API}/admin/jobs/{j['id']}/approve", headers=_bearer(admin_token))

        r = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]})
        assert r.status_code == 200
        t = r.json()
        assert t["kind"] == "hash"
        assert t["job_id"] == j["id"]
        requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                      json={"task_id": t["id"], "device_id": worker["device_id"],
                            "result": "bad", "compute_ms": 200})
        requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))

    def test_incorrect_result_does_not_increment_job(self, admin_token, customer, worker):
        _drain_running_jobs(admin_token)
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_NoInc", "file_name": "n", "file_size": 1,
            "total_units": 3, "budget_usdt": 1.5, "max_nodes": 1,
            "workload_type": "matrix_compute"
        }).json()
        requests.post(f"{API}/admin/jobs/{j['id']}/approve", headers=_bearer(admin_token))

        t = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                          params={"device_id": worker["device_id"]}).json()
        sr = requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                           json={"task_id": t["id"], "device_id": worker["device_id"],
                                 "result": "wrong", "compute_ms": 300})
        assert sr.status_code == 200 and sr.json()["verified"] is False

        got = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
        assert got["processed_units"] == 0
        assert got["spent_usdt"] == 0.0
        # cleanup
        requests.post(f"{API}/admin/jobs/{j['id']}/reject", headers=_bearer(admin_token))


# ---------- 5. End-to-end golden flow (3 units, budget 1.5) ----------
class TestGoldenFlow:
    def test_full_customer_to_completion(self, admin_token, customer, worker):
        _drain_running_jobs(admin_token)
        j = requests.post(f"{API}/jobs", headers=_bearer(customer["token"]), json={
            "name": "TEST_Golden", "file_name": "g.csv", "file_size": 100,
            "total_units": 3, "budget_usdt": 1.5, "max_nodes": 2,
            "workload_type": "matrix_compute"
        }).json()
        assert abs(j["rate_per_unit"] - 0.5) < 1e-9
        assert requests.post(f"{API}/admin/jobs/{j['id']}/approve",
                             headers=_bearer(admin_token)).status_code == 200

        for unit_idx in range(3):
            t = requests.post(f"{API}/tasks/request", headers=_bearer(worker["token"]),
                              params={"device_id": worker["device_id"]}).json()
            assert t["job_id"] == j["id"], f"task {unit_idx} not bound to job"
            assert t["kind"] == "matrix"
            result = matrix_signature(t["payload"]["seed"], t["payload"]["size"])
            sr = requests.post(f"{API}/tasks/submit", headers=_bearer(worker["token"]),
                               json={"task_id": t["id"], "device_id": worker["device_id"],
                                     "result": result, "compute_ms": 500}).json()
            assert sr["verified"] is True
            assert sr["job_id"] == j["id"]

            got = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
            assert got["processed_units"] == unit_idx + 1
            if unit_idx < 2:
                assert got["status"] == "running"
            else:
                assert got["status"] == "completed"
                assert got.get("completed_at")

        final = requests.get(f"{API}/jobs/{j['id']}", headers=_bearer(customer["token"])).json()
        assert final["status"] == "completed"
        assert final["processed_units"] == 3
        # spent_usdt = 3 * 0.5 = 1.5
        assert abs(final["spent_usdt"] - 1.5) < 1e-6


# ---------- 6. Admin Ledger ----------
class TestAdminLedger:
    def test_ledger_structure(self, admin_token):
        r = requests.get(f"{API}/admin/ledger", headers=_bearer(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("revenue_usdt", "worker_owed_usdt", "worker_paid_usdt",
                  "worker_total_earned_usdt", "pending_withdrawals_usdt",
                  "platform_margin_usdt"):
            assert k in d, f"missing key {k}"
            assert isinstance(d[k], (int, float))
        assert d["platform_margin_usdt"] >= 0
        # Margin = max(0, revenue - total_earned)
        assert d["platform_margin_usdt"] == round(max(0.0, d["revenue_usdt"] - d["worker_total_earned_usdt"]), 6)

    def test_non_admin_cannot_see_ledger(self, customer):
        r = requests.get(f"{API}/admin/ledger", headers=_bearer(customer["token"]))
        assert r.status_code == 403


# ---------- 7. Device health fields ----------
class TestDeviceHealth:
    def test_heartbeat_persists_brand_os_thermal(self, worker, admin_token):
        # Send heartbeat with explicit fields
        r = requests.post(f"{API}/devices/heartbeat", headers=_bearer(worker["token"]),
                          json={"device_id": worker["device_id"],
                                "charging": True, "wifi": True, "permission": True,
                                "battery": 77, "thermal": "hot",
                                "brand": "Pixel", "os_version": "Android 15"})
        assert r.status_code == 200

        # via owner /devices
        rows = requests.get(f"{API}/devices", headers=_bearer(worker["token"])).json()
        d = next(x for x in rows if x["id"] == worker["device_id"])
        assert d["brand"] == "Pixel"
        assert d["os_version"] == "Android 15"
        assert d["thermal"] == "hot"
        assert d["battery"] == 77

        # via /admin/devices
        admin_rows = requests.get(f"{API}/admin/devices", headers=_bearer(admin_token)).json()
        ad = next(x for x in admin_rows if x["id"] == worker["device_id"])
        for k in ("brand", "os_version", "thermal", "battery"):
            assert k in ad
        assert ad["brand"] == "Pixel"
        assert ad["thermal"] == "hot"
