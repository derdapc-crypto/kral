# SANCTARA NETWORK — Go-Live Deployment Guide

This document walks an operator through bringing **SANCTARA** online on a
production domain using a single Ubuntu VPS, MongoDB Atlas, Caddy or Nginx,
and the dual APK distribution pipeline (`grid-worker-light.apk` +
`grid-worker-nodepro.apk`).

> **v1.7.5 Dual-Client Architecture** — Two distinct mobile APKs share the
> same backend, the same MongoDB cluster, and the same user / TGC ledger.
> The Light client is store-safe (no device-side mining, AdMob-monetised);
> Node Pro is direct-download only and uses device compute resources only
> after explicit user opt-in.

---

## 0. Prerequisites

You will need:

| | |
|---|---|
| Domain | e.g. `sanctara.io`, DNS pointed at the VPS |
| Ubuntu VPS | 22.04 LTS, ≥ 2 vCPU, ≥ 4 GB RAM (Hetzner CX21 is fine) |
| MongoDB Atlas | Free `M0` tier to start, upgrade to `M10` once live |
| AdMob | Google AdMob account with a Rewarded Ad unit |
| Google Play Console | $25 one-time, for Light APK submission |

Local tools used in the snippets below: `openssl`, `git`, `ssh`,
`docker`, `docker compose`, `curl`, `python3`.

---

## 1. Provision the VPS

```bash
# (on the VPS, fresh Ubuntu 22.04)
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install ufw curl git python3 python3-venv build-essential \
                        ca-certificates fail2ban
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Optional but recommended:

```bash
# Create a non-root deploy user
sudo adduser --disabled-password --gecos "" grid
sudo usermod -aG sudo grid
sudo rsync --archive --chown=grid:grid ~/.ssh /home/grid
```

---

## 2. Install MongoDB connection (Atlas, RECOMMENDED)

1. https://cloud.mongodb.com → Create a free `M0` cluster
2. Add the VPS IP to the IP Access List (or `0.0.0.0/0` for now)
3. Database Access → create a user with `readWrite` on `sanctara_prod`
4. Get the connection string:
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
5. Save it — it goes into `MONGO_URL` later.

---

## 3. Clone & configure

```bash
sudo -iu grid
git clone <your_repo_url> ~/sanctara
cd ~/sanctara

# Backend env
cp .env.example backend/.env
nano backend/.env   # fill MONGO_URL, JWT_SECRET, CORS_ORIGINS, ADMOB_*

# Generate secrets
echo "JWT_SECRET=$(openssl rand -hex 32)"           # paste into backend/.env
echo "MOBILE_MINING_SECRET=$(openssl rand -hex 32)" # paste into backend/.env

# Frontend env
cat > frontend/.env <<'EOF'
REACT_APP_BACKEND_URL=https://api.sanctara.io
EOF
```

> ⚠️ **JWT_SECRET** rotates ALL sessions out. Pick one and protect it.

---

## 4. Build the frontend

```bash
cd ~/sanctara/frontend
# Use the SAME yarn version listed in package.json
corepack enable
yarn install --frozen-lockfile
yarn build       # → outputs to /home/grid/sanctara/frontend/build
```

The `build/` folder is what Nginx/Caddy serves statically.

---

## 5. Install backend Python deps & run with systemd

```bash
cd ~/sanctara/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
```

Create a systemd unit:

```ini
# /etc/systemd/system/sanctara-backend.service
[Unit]
Description=SANCTARA FastAPI backend
After=network.target

[Service]
User=grid
WorkingDirectory=/home/grid/sanctara/backend
EnvironmentFile=/home/grid/sanctara/backend/.env
ExecStart=/home/grid/sanctara/backend/.venv/bin/uvicorn server:app \
    --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sanctara-backend
sudo systemctl status sanctara-backend   # should be active (running)
```

---

## 6. Reverse proxy + SSL (choose ONE)

### 6a. Caddy (recommended — auto-SSL, two lines)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

```caddy
# /etc/caddy/Caddyfile
sanctara.io, www.sanctara.io {
    encode zstd gzip
    root * /home/grid/sanctara/frontend/build
    try_files {path} /index.html
    file_server
    @apk path *.apk
    header @apk Content-Type "application/vnd.android.package-archive"
    header @apk Content-Disposition "attachment"
}

api.sanctara.io {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8001
}
```

```bash
sudo systemctl reload caddy
```

### 6b. Nginx (manual SSL with certbot)

```nginx
# /etc/nginx/sites-available/thegrid
server {
    listen 80;
    server_name sanctara.io www.sanctara.io;
    root /home/grid/sanctara/frontend/build;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Serve the dual APKs with the correct MIME type
    location ~* \.apk$ {
        types { application/vnd.android.package-archive apk; }
        add_header Content-Disposition attachment;
    }
}

server {
    listen 80;
    server_name api.sanctara.io;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;       # required for SSE / WS
        proxy_read_timeout 1d;
    }

    # WebSocket support (stratum bridge + live console)
    location /ws/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1d;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/thegrid /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo snap install --classic certbot
sudo certbot --nginx -d sanctara.io -d www.sanctara.io -d api.sanctara.io
```

---

## 7. Host the dual APKs

The backend serves them from `/grid-worker-light.apk` and
`/grid-worker-nodepro.apk` — same path you find them under
`/app/frontend/public/` in this repo.

Either:

- copy them to `frontend/build/` after `yarn build`, OR
- serve from a separate CDN bucket (S3 / R2) and set `APK_DOWNLOAD_BASE`
  in `backend/.env`.

Verify:

```bash
curl -I https://sanctara.io/grid-worker-light.apk
# → HTTP/2 200, Content-Type: application/vnd.android.package-archive

curl -s https://api.sanctara.io/api/apk/dual-version | python3 -m json.tool
# → should list both APKs with size + sha256 + flavor metadata
```

---

## 8. Smoke tests

```bash
# Basic
curl -s https://api.sanctara.io/api/                 # → {"message": "Hello World"}
curl -s https://api.sanctara.io/api/health 2>/dev/null || echo "no /health route"
curl -s https://api.sanctara.io/api/apk/version | python3 -m json.tool
curl -s https://api.sanctara.io/api/apk/dual-version | python3 -m json.tool

# AdMob runtime config (must return ad_mode='test' until you flip TEST_MODE)
curl -s https://api.sanctara.io/api/admob/config | python3 -m json.tool

# Scarcity counter (live, no fake inflation)
curl -s https://api.sanctara.io/api/network/scarcity-progress | python3 -m json.tool
```

---

## 9. AdMob production rollout

When ready to switch from Google test IDs to real production IDs:

1. https://apps.admob.com → create an Android app
   `package_name = io.thegrid.light`
2. Create a Rewarded Ad unit → copy the unit ID
3. In `backend/.env`:
   ```ini
   ADMOB_TEST_MODE=false
   ADMOB_ANDROID_APP_ID=ca-app-pub-XXX~YYY
   ADMOB_REWARDED_AD_UNIT_ID=ca-app-pub-XXX/YYY
   ```
4. `sudo systemctl restart sanctara-backend`
5. Verify: `curl … /api/admob/config` → `ad_mode: production`.

> The Light APK reads this at boot — no app update needed.

---

## 10. Privacy + Terms pages

`/privacy` and `/terms` are bundled in the frontend build. Before launch:

- Open `/app/frontend/src/pages/Privacy.jsx` and `/app/frontend/src/pages/Terms.jsx`
- Replace EVERY `[LEGAL_ENTITY_NAME]`, `[JURISDICTION]`, `[REGISTERED_ADDRESS]`,
  `[PRIVACY_CONTACT_EMAIL]`, `[LEGAL_CONTACT_EMAIL]`, `[HOSTING_PROVIDER]`,
  `[REGION]`, `[CDN_PROVIDER]`, `[EMAIL_PROVIDER]`, `[VENUE]` placeholder
- Rebuild the frontend (`yarn build`) and redeploy.

These two URLs are required by Google Play Console (Data Safety Form) and
Google AdMob (consent flow).

---

## 11. MongoDB indexes (one-time)

The backend creates indexes lazily, but for production you SHOULD pre-create:

```js
// In mongosh on Atlas:
use sanctara_prod;
db.users.createIndex({ "email": 1 }, { unique: true });
db.devices.createIndex({ "device_id": 1 }, { unique: true });
db.devices.createIndex({ "user_id": 1 });
db.devices.createIndex({ "last_heartbeat": 1 });
db.devices.createIndex({ "client_type": 1 });
db.tgc_ledger.createIndex({ "user_id": 1, "created_at": -1 });
db.tgc_ledger.createIndex({ "kind": 1 });
db.tgc_ledger.createIndex({ "client_type": 1 });
db.daily_calibrations.createIndex({ "user_id": 1, "date_key": 1 }, { unique: true });
db.apk_downloads.createIndex({ "flavor": 1, "ts": 1 });
```

---

## 12. Backups

Atlas auto-backups every 24h on M10+. On M0 (free tier) you must run
`mongodump` on the VPS as a cron job:

```bash
sudo crontab -e
# 0 3 * * *  mongodump --uri="$MONGO_URL" --archive=/var/backups/sanctara-$(date +\%F).gz --gzip
```

---

## 13. Monitoring (recommended)

- **Sentry**: free 5K events/month. Add `SENTRY_DSN` to backend `.env`
  and wrap FastAPI middleware (5 lines).
- **UptimeRobot**: free uptime monitor → ping `https://api.sanctara.io/api/`.
- **BetterStack / Papertrail**: stream `/var/log/syslog` + journald for log
  aggregation.

---

## 14. Going to Google Play (Light only)

1. Build the signed APK:
   ```bash
   cd android-client
   FLAVOR=light bash build-apk.sh
   ```
2. Sign with your release keystore (NOT the debug one).
3. Upload to Play Console → Internal Testing.
4. Fill Data Safety: collected data per Privacy Policy.
5. Add screenshots, icon, feature graphic.
6. Submit for review (7–14 days typical).

**DO NOT submit `grid-worker-nodepro.apk` to Play Store. It is direct-download only.**

---

## 15. Help & support

- SANCTARA protocol issues: open a GitHub issue against the repo.
- Emergent platform / fork support: support@emergent.sh.
- Trust & Safety re-review (if your account was previously banned):
  email `support@emergent.sh` with your Job ID and a description of the
  v1.7.5 architectural changes (Light = store-safe, Node Pro = opt-in
  direct-download).

---

🏴 May your verified-node count reach 1,000,000.
