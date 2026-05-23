#!/usr/bin/env python3
"""List all devices grouped by user with live/stale/dead status."""
import os, sys
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv('/root/sanctara/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ.get('DB_NAME', 'sanctara')]
now = datetime.now(timezone.utc)

users = {}
for u in db.users.find({}, {"id": 1, "user_id": 1, "email": 1, "_id": 1}):
    uid = u.get("id") or u.get("user_id") or str(u.get("_id"))
    users[uid] = u.get("email", "?")

print(f"TOPLAM KULLANICI: {len(users)}")
print(f"TOPLAM CIHAZ:    {db.devices.count_documents({})}")
print()
print(f"{'EMAIL':<30} {'DEV':<10} {'TYPE':<10} {'STATE':<14} {'HB':<8} {'STATUS'}")
print("-" * 90)

live = stale = dead = 0
rows = list(db.devices.find({}, {"_id": 0}).sort("last_heartbeat", -1))
for d in rows:
    uid = d.get("user_id", "?")
    email = (users.get(uid, "unknown") or "unknown")[:29]
    did = (d.get("id") or d.get("device_id", "?") or "?")[:10]
    typ = (d.get("client_type") or "?")[:10]
    state = (d.get("node_state") or "?")[:14]
    hb = d.get("last_heartbeat", "")
    try:
        hbdt = datetime.fromisoformat(hb.replace("Z", "+00:00")) if isinstance(hb, str) else hb
        age = (now - hbdt).total_seconds()
        if age < 90:
            s = "LIVE"
            live += 1
        elif age < 600:
            s = "STALE"
            stale += 1
        else:
            s = "DEAD"
            dead += 1
        agestr = f"{int(age)}s"
    except Exception:
        agestr = "-"
        s = "never"
        dead += 1
    print(f"{email:<30} {did:<10} {typ:<10} {state:<14} {agestr:<8} {s}")

print()
print("-" * 90)
print(f"OZET: LIVE={live}  STALE={stale}  DEAD={dead}  TOPLAM={len(rows)}")
