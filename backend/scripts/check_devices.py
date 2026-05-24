"""Quick DB inspection — does heartbeat reach the database, and is the
timezone correct so /admin/mobile-mining/metrics' filter can match it?

Run on the VPS:
    /root/sanctara/backend/.venv/bin/python3 /root/sanctara/backend/scripts/check_devices.py
"""
import os
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient

# Resolve .env regardless of cwd
HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, "..", ".env")
load_dotenv(ENV_PATH)

m = MongoClient(os.environ["MONGO_URL"])
db = m[os.environ["DB_NAME"]]

now_utc = datetime.now(timezone.utc)
cutoff_3m = now_utc - timedelta(minutes=3)
cutoff_10m = now_utc - timedelta(minutes=10)

print("=" * 60)
print("DEVICE DB INSPECTION")
print("=" * 60)
print(f"Total devices:                  {db.devices.count_documents({})}")
print(f"Recent heartbeats  (last 3m):   {db.devices.count_documents({'last_heartbeat': {'$gte': cutoff_3m}})}")
print(f"Recent heartbeats  (last 10m):  {db.devices.count_documents({'last_heartbeat': {'$gte': cutoff_10m}})}")
print(f"native_pow=True (any):          {db.devices.count_documents({'native_pow': True})}")
print(f"local_hashrate_hps > 0 (any):   {db.devices.count_documents({'local_hashrate_hps': {'$gt': 0}})}")
print()
print("Latest 5 devices (any):")
print("-" * 60)
for d in db.devices.find(
    {},
    {
        "_id": 0,
        "device_id": 1,
        "id": 1,
        "last_heartbeat": 1,
        "native_pow": 1,
        "native_lib_loaded": 1,
        "local_hashrate_hps": 1,
        "mining_status": 1,
        "mining_requested": 1,
        "client_type": 1,
        "app_version": 1,
        "status": 1,
    },
).sort("last_heartbeat", -1).limit(5):
    print(d)
    hb = d.get("last_heartbeat")
    if hb:
        try:
            tz = hb.tzinfo
            # If naive, assume UTC for delta calc
            ref = now_utc if tz else datetime.utcnow()
            ago = (ref - hb).total_seconds()
            print(f"  → tzinfo={tz} | {ago:.0f} sec ago")
        except Exception as e:
            print(f"  → tz inspect failed: {e}")
    print()
