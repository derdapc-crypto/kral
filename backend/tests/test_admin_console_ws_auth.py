"""
Regression tests for the Admin Live Operator Console WebSocket auth.

These cover the 403-flood bug: when `localStorage.grid_token` carried a stale
JWT, the browser hammered /api/admin/console/ws every 2.5s. Fix introduced:
  • /auth/me + /auth/refresh roll fresh tokens
  • WS handshake falls back to the access_token cookie if query token is
    missing/expired
  • reconnect loop stops on 4401

Run from /app: `pytest backend/tests/test_admin_console_ws_auth.py -v`
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta

import jwt
import pytest
import requests
import websockets

API = os.environ.get("API_BASE", "https://grid-supercomputer.preview.emergentagent.com")
WS_BASE = API.replace("https", "wss").replace("http", "ws")

ADMIN_EMAIL = "admin@thegrid.io"
ADMIN_PASS = "Grid@Admin2026"


def _read_jwt_secret() -> str:
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("JWT_SECRET="):
                val = line.split("=", 1)[1].strip()
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                elif val.startswith("'") and val.endswith("'"):
                    val = val[1:-1]
                return val
    raise RuntimeError("JWT_SECRET not found")


def _login() -> tuple[requests.Session, str, str]:
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=10)
    r.raise_for_status()
    body = r.json()
    return s, body["token"], body["id"]


def test_login_returns_token_and_role():
    _s, tok, uid = _login()
    assert tok and uid
    payload = jwt.decode(tok, _read_jwt_secret(), algorithms=["HS256"])
    assert payload["sub"] == uid
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_auth_me_rolls_fresh_token():
    s, _, _ = _login()
    r = s.get(f"{API}/api/auth/me", timeout=10)
    assert r.status_code == 200
    assert "token" in r.json(), "/auth/me must return a fresh access token"


def test_auth_refresh_returns_new_token():
    s, _, _ = _login()
    r = s.post(f"{API}/api/auth/refresh", timeout=10)
    assert r.status_code == 200
    assert r.json().get("token")


def test_auth_refresh_without_cookie_returns_401():
    r = requests.post(f"{API}/api/auth/refresh", timeout=10)
    assert r.status_code == 401


def _async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _ws_try(url: str, headers: dict | None = None) -> str:
    try:
        async with websockets.connect(url, additional_headers=headers or {}) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=4)
            return f"OK:{msg[:40]}"
    except websockets.exceptions.InvalidStatus as e:
        return f"REJECT:{e.response.status_code}"
    except Exception as e:
        return f"ERR:{type(e).__name__}"


def test_ws_valid_query_token_connects():
    _s, tok, _ = _login()
    res = _async(_ws_try(f"{WS_BASE}/api/admin/console/ws?token={tok}"))
    assert res.startswith("OK:"), res


def test_ws_expired_query_token_no_cookie_rejects_403():
    _s, _, uid = _login()
    expired = jwt.encode(
        {"sub": uid, "email": ADMIN_EMAIL, "role": "admin",
         "exp": datetime.now(timezone.utc) - timedelta(hours=1), "type": "access"},
        _read_jwt_secret(), algorithm="HS256",
    )
    res = _async(_ws_try(f"{WS_BASE}/api/admin/console/ws?token={expired}"))
    assert res == "REJECT:403", res


def test_ws_expired_query_with_valid_cookie_falls_back_and_connects():
    s, _, uid = _login()
    expired = jwt.encode(
        {"sub": uid, "email": ADMIN_EMAIL, "role": "admin",
         "exp": datetime.now(timezone.utc) - timedelta(hours=1), "type": "access"},
        _read_jwt_secret(), algorithm="HS256",
    )
    cookie_header = "; ".join(f"{k}={v}" for k, v in s.cookies.get_dict().items())
    res = _async(_ws_try(
        f"{WS_BASE}/api/admin/console/ws?token={expired}",
        headers={"Cookie": cookie_header},
    ))
    assert res.startswith("OK:"), res


def test_ws_no_query_token_with_valid_cookie_connects():
    s, _, _ = _login()
    cookie_header = "; ".join(f"{k}={v}" for k, v in s.cookies.get_dict().items())
    res = _async(_ws_try(
        f"{WS_BASE}/api/admin/console/ws",
        headers={"Cookie": cookie_header},
    ))
    assert res.startswith("OK:"), res


def test_ws_non_admin_token_rejected():
    fake_user = jwt.encode(
        {"sub": "00000000-not-real", "email": "x@x", "role": "user",
         "exp": datetime.now(timezone.utc) + timedelta(hours=1), "type": "access"},
        _read_jwt_secret(), algorithm="HS256",
    )
    res = _async(_ws_try(f"{WS_BASE}/api/admin/console/ws?token={fake_user}"))
    assert res == "REJECT:403", res


def test_ws_no_token_rejected():
    res = _async(_ws_try(f"{WS_BASE}/api/admin/console/ws"))
    assert res == "REJECT:403", res
