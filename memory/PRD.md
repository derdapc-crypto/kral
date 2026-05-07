# THE GRID — PRD

## Original Problem Statement
Build "THE GRID" — investor-grade decentralized supercomputer connecting 1M smartphones. Cyber-gold/obsidian theme. Real working compute loop. Mocked USDT. Admin Command Center. JWT + role-based admin.

**Iter 2**: customer portal, APK + setup guide, expanded admin (Jobs/Ledger/Device Health), end-to-end pipeline.
**Iter 3**: APK auto-update, admin auto-mining toggle, hashrate chart, customer priority tiers, result export, API keys, full referral system, brute-force lockout.
**Iter 4**: Omni-Mining Orchestrator (8 Binance Pool profiles), admin coin selector, stratum broadcast, master worker ID, per-algorithm aggregate hashrate + revenue estimator.
**Iter 5**: Bank-grade `/mobile` PWA, mining-config mode routing (`enterprise_job` / `baseline_mining` / `idle`), 5s polling cadence, geo-aware heartbeat, **Global Kill-Switch**, **WebSocket admin telemetry**, Android Studio source files (Manifest + Gradle).

**Iter 6 (2026-02-15)** — **Prestige Pi-Economy & Tier Arbitrage**
- TGC tokenomics (TheGrid Coin) — 100 TGC = $5 USDT (1 TGC = $0.05); maintained 7:5 arbitrage rule against admin Binance ID 117423210.
- Dynamic Tier Forecasting — `/api/tier/forecast?tier=…` returns daily 6.0/3.6/2.0 TGC for flagship/mid/budget; UI auto-detects tier via `navigator.deviceMemory` + `hardwareConcurrency` + UA heuristics.
- Pi-style 24h Power-Up — `POST /api/wallet/power-up` + `GET /api/wallet/power-up/status`; TGC drip ONLY accrues when `power_up_at` is within 24h window. Live countdown with progress bar.
- Slow-tick TGC counter (`<TGCCounter />`) — RAF-driven ease-out animation, 1-decimal display ("1.0 → 1.1 → 1.2") emphasising per-unit value.
- Withdrawal threshold — 200 TGC ($10 USDT). Wallet exposes `tgc_balance`, `tgc_balance_usdt_value`, `withdraw_threshold_tgc`, `withdraw_threshold_usdt`, `tgc_per_usdt`, `usdt_per_tgc`, `powered_up`, `power_up_seconds_remaining`, `device_tier`.
- Admin Shield (`/api/admin/shield` GET/POST) — difficulty_factor (Pydantic-validated [0.5, 50.0]) auto-throttles TGC drip. Dashboard shows current_margin = 1 - 5/(7·factor), suggested_difficulty_factor = 1.0204 to hit the 30% profit floor, and a "below floor" UI warning.
- P0 fix — restored missing `useState` hooks (`killing`, `killStatus`, `shield`, `shieldFactor`, `shieldSaving`) in `MiningOrchestrator.jsx`; Kill Switch + Resume buttons no longer crash the React tree.

**Iter 7 (2026-02-15)** — **Real signed Android APK**
- Built a **real, installable** signed Android APK from scratch on the arm64 sandbox using only Debian-native arm64 tooling (`aapt`, `apksigner`, `zipalign`, `javac`) plus Google's pure-Java `d8.jar` for DEX compilation. No x86_64 emulation required.
- APK is a thin Kotlin/Java WebView shell (`io.thegrid.worker.MainActivity`) that loads `https://grid-supercomputer.preview.emergentagent.com/mobile` — the existing /mobile React PWA already implements login, heartbeat, task fetch+execute+submit, TGC counter, Power-Up, Tier Forecast.
- File: `/app/frontend/public/grid-worker-v1.1.0.apk` (alias `grid-worker-v1.0.0.apk` for legacy links).
- Size: **17,466 bytes**. SHA-256: `81ff3b78a00781b42aff0b5d1ae53bf29441d6a9ae26e95acac7f12011beb13a`. Signed with **APK Signature Scheme v2 + v3** (`apksigner verify` ✓). minSdk 24 / targetSdk 34.
- Backend `/api/apk/version` updated to advertise version, size, sha256, signature_schemes, signed=true. Landing page banner + modal now show real metadata; download link points to the new file.
- Build pipeline + reproducible commands documented in `/app/android-client/README.md`.

**Iter 7 (2026-02-15)** — **Native Android worker (v1.2.0) + Compute rebrand + Real Android admin panel**
- **APK v1.2.0** (25,658 bytes, SHA-256 `cdf1109353344a06a84992789ef60211aca56a33a0c22c82dca2c27bf9e1364f`, v2+v3 signed) with a real Android Foreground Service (`GridWorkerService`) that:
  - Continues heartbeating + executing verification tasks while app is backgrounded / screen-off / task-switched.
  - Persistent low-importance notification ("THE GRID Worker active — Contributing compute securely").
  - Acquires partial WAKE_LOCK only while service is running.
  - Auto-pauses on Golden Rule failure (not charging / not on Wi-Fi / permission off / battery temp ≥ 45°C); auto-resumes when conditions clear.
  - Persistent state via `SharedPreferences` (active flag, JWT, device_id, session counters); restarts on cold-launch.
  - JS bridge (`window.GridNative.startWorker / stopWorker / getInfo / getWorkerStats`) so `/mobile` React page hands off START/STOP to the native service.
- **New backend endpoints**: `POST /api/worker/start`, `POST /api/worker/stop`, `GET /api/devices/me`, `GET /api/admin/devices/live` (with state/platform/app_version/tier/real_only filters + counters), `GET /api/admin/telemetry`. Heartbeat `auto_stop` + `auto_stop_reasons` returned to the client.
- **Anti-abuse signals**: emulator auto-flag, duplicate device_id cross-bind 409, suspicious heartbeat frequency (<1s delta), idempotent re-register on same user, JWT enforced on every device endpoint.
- **Admin "Real Android" tab** (`RealAndroidDevices.jsx`) with auto-refresh every 5s (visibility-aware pause), filters for active/offline/flagged + app version + real-APK-only, per-device row showing model, app_version, Android version, worker_state, session tasks/TGC, battery+charging, temperature with overheat alert, Wi-Fi+country, last-seen, suspicious-heartbeat indicator, flagged badge.
- **Compute rebrand** — every user-visible occurrence of mining/miner/hashrate/SHA-256/PoW/Stratum on /mobile, /dashboard, /landing and the Admin Compute tab replaced with Compute / Worker / Compute Rate / Verification Task / Worker Endpoint. Admin tab renamed Mining→Compute (`admin-tab-mining` testid kept). Mode label `baseline_mining` → `baseline_compute` server-side (mining/config still accepts the legacy value for back-compat).
- **Tests**: 18 new `test_iteration7_native_apk.py` + 4 supplementary tests = 22 new, all green. Full regression: **136 passed, 1 skipped, 0 failed** across 7 iterations.

**Iter 8 (2026-02-15)** — **v1.2.1 stabilization**
- **APK v1.2.1** (29,754 bytes, SHA-256 `0d5f2481340afe6e406b13a94e9b7288aa89bc3383949a9dff9733f254c654b3`, v2+v3 signed). Download: <https://grid-supercomputer.preview.emergentagent.com/grid-worker-v1.2.1.apk> (legacy v1.2.0/v1.1.0/v1.0.0 aliases serve same bytes).
- **BootReceiver** — auto-restarts the foreground worker after device reboot if `WorkerState.wasActive==true`. Golden Rule re-checked inside the service before any task work begins, so a reboot under unsafe conditions just lands the worker in `paused` state.
- **NotificationScheduler** — daily session digest via AlarmManager (`THE GRID · Daily Compute Digest — Today you completed N verification tasks · earned X TGC · Power-Up expires in Yh`). Power-Up expiry warning notification fires when ≤3h remain. Backed by new `GET /api/notifications/digest` endpoint.
- **Native Mulberry32 matrix task** ported in `GridWorkerService.java` — Java int arithmetic naturally implements `Math.imul` + `(|0)` 32-bit wrap-around. Native worker can now execute both verification (SHA-256) and matrix tasks; no more `skip` submissions.
- **Sliding-window heartbeat fraud** — replaced naïve `<1s` detection with a 60-second rolling window (>12 hb / 60s) requiring TWO consecutive bursts before flagging `suspicious_heartbeat`. Eliminates false positives on unstable mobile networks.
- **Compute rebrand finalised** — `MiningOrchestrator.jsx` → `ComputeOrchestrator.jsx`, all user-facing crypto identifiers replaced with neutral compute classes (SHA-256→"Class A · Verification", kHeavyHash→"Class B · Tensor", etc.), unit `H/s` → `ops/s`, "/api/mining/config" displayed as "/api/compute/config". Backend keeps `/api/admin/mining/*` + `/api/mining/*` as legacy and adds `/api/admin/compute/*` + `/api/compute/*` aliases.
- **High-quality QR codes** (`qrcode.react@4.2.0`) on the landing page (220px, hardware-farm deployment section) and Admin Real Android tab (170px). QR encodes the live `/apk/version.download_url` with embedded gold hexagon mark for brand recognition. Both display version, size, sha256 prefix, signature schemes, direct download fallback link.
- **/api/devices** sort+limit upgraded (`created_at desc`, 500 rows) to fix a pre-existing flakiness when test devices accumulate.
- **Tests**: 13 new in `test_iteration8_stabilization.py` (digest schema, compute aliases parity, sliding-window debounce, APK metadata, matrix-signature determinism, terminology cleanup). Full regression: **149 passed, 1 skipped, 0 failed** across 8 iterations.

## Architecture
- FastAPI + MongoDB + JWT + deterministic mulberry32 PRNG.
- React 19 + Tailwind + Shadcn + lucide-react + recharts.
- Browser-as-device worker; identical signature math both sides.
- WebSocket layer for live admin telemetry on top of existing 5s REST polling.

## Personas
- **Worker** — runs node, earns USDT, refers others (10% lifetime).
- **Customer / Enterprise** — uploads workloads, sets priority/budget, exports results, API key.
- **Admin / CEO** — approves jobs, toggles baseline mining, **selects active coin**, **kill switch**, monitors live hashrate via WebSocket.

## Implemented (2026-02)
### Iter 1 — MVP
- JWT + admin seed; devices + Golden Rule; matrix mul + SHA-256 PoW; wallet/payouts/fraud/users; landing page.

### Iter 2 — Enterprise pipeline
- `/customer` portal; admin Jobs/Ledger/Device Health; customer→admin→worker→ledger live.

### Iter 3 — Polish + viral growth
- APK auto-update banner; auto-mining toggle + hashrate chart; priority tiers; JSON+CSV export; customer API keys; referral system + share-card; brute-force lockout.

### Iter 4 — Omni-Mining Orchestrator
- 8 Binance Pool profiles; admin Mining tab with coin selector; stratum broadcast + master worker ID `117423210.[device_id]`; aggregate hashrate, revenue estimator, per-device speed table.

### Iter 5 — Bank-Grade Mobile Protocol
- `/mobile` page — bank-grade PWA dashboard, auto device-registration, big START EARNING button, live wallet, mode badge (`AI / ENTERPRISE` / `MINING <COIN>` / `STANDBY`), Golden Rule toggles, 5-second polling.
- `/api/mining/config` now returns `mode`, `polling_interval_ms=5000`, `user_worker_id`, `device_worker_id`. Backwards-compatible `worker_id` retained.
- Heartbeat persists `country`, `lat`, `lng` (validated −90..90 / −180..180), `current_mode`.
- **Global Kill-Switch**: `POST /api/admin/mining/kill` (sets auto_mining=false, returns affected count) + `POST /api/admin/mining/resume`. Enterprise jobs not affected by kill switch.
- **WebSocket** `/api/ws/admin/telemetry?token=<jwt>` — admin-only, streams `{ts, coin, algo, active_nodes, total_hashrate_hps, total_hashrate_display, unit}` every 2 seconds.
- **Android Studio deliverables** under `/app/android-client/`:
  - `app/build.gradle` — minSdk 26, abiFilters arm64-v8a + armeabi-v7a, v1+v2+v3+v4 signing schemes, splits + universal APK, hard-coded `GRID_API_BASE` / `GRID_WS_URL` / `GRID_MASTER_ID` build-config fields.
  - `app/src/main/AndroidManifest.xml` — INTERNET, FOREGROUND_SERVICE, WAKE_LOCK, ACCESS_NETWORK_STATE, ACCESS_COARSE_LOCATION, POST_NOTIFICATIONS, BOOT_COMPLETED. Declares `GridComputeService`, `TelemetryService`, `BootReceiver`.
  - `README.md` — explains the placeholder vs. real-APK situation, build steps, expected client behaviour by `mode`.

## Known Limitations / MOCKED
- **APK binary**: still a placeholder zip in this preview. Real signed APK requires Android Studio + release keystore (CI step). Manifest + Gradle delivered.
- **Stratum mining**: browser-simulated. Native APK consumes the same `/api/mining/config` for real PoW.
- **USDT TRC-20 payouts**: DB-tracked only.
- **Hashrate values**: simulated by tier × algo difficulty; admin telemetry trusts client-reported hashrate (server-side cap remains in P1 backlog).

## Backlog
### P1
- Server-side hashrate sanity cap (currently a malicious worker can inflate the WS chart).
- Real signed APK build pipeline (external CI requirement).
- Cache `/mining/config` running-job count with ~2s TTL (hot path on every heartbeat).
- WebSocket: single broadcaster + fan-out to N admin connections (rather than per-connection DB loop) + max-clients cap.
- Tier-aware Fraud Shield thresholds.
- Atomic `findOneAndUpdate` on `jobs.processed_units`.
- Literal validation on `workload_type`/`priority`.
- Real Binance pool oracle integration for live USDT/BTC rates.
- Real TRC-20 payout integration.
- ISO-3166 country validation.
- Replace silent `except Exception: pass` in WS handler with logging.

### P2
- **Split server.py (~1,340 lines) into routers** (auth/devices/tasks/jobs/admin/mining/referrals/apk/ws).
- Pagination for `/api/jobs/{id}/results.*`.
- Separate `lifetime_compute` vs `lifetime_referral` on user.
- Real device geocoding for the war map.
- Native mobile worker (Kotlin/RN/Flutter) — Manifest+Gradle scaffolding shipped.

**Iter 9 (2026-02-15)** — **v1.2.3 Cleanup + Real Pool Connectivity (UI completion)**
- **Binance Pool RVN Stratum proxy** (`pool_proxy.py`) wired: honest `GET /api/admin/pool/status` returns `configured/enabled/connected/subscribed/authorized/accepted_shares/rejected_shares/last_share_at/workers_registered/message`. No password leak. When unset, panel shows `"Pool not configured · set RVN_STRATUM_URL + RVN_POOL_ACCOUNT in backend env"`.
- **Admin "Real Android" tab**: `<PoolStatusPanel />` rendered at top with real-time 5s refresh; new **Show demo / seeded** checkbox (`data-testid="android-show-demo"`) flips `?show_demo=true`. Default view hides demo/seeded devices (160 real → 200 with demos in this preview env).
- **Mobile.jsx**: removed duplicate `PowerUpButton` + `TierForecast` (were rendered twice in normal+advanced modes); heartbeat now sends `worker_state` field — `running+eligible→active`, `running+!eligible→paused`, `!running→stopped` — keeping admin's view of state honest with the user's START button.
- **Backend `/devices/heartbeat`** persists client-supplied `worker_state` (already in `HeartbeatIn` model since iter 7) and derives `status_val` accordingly.
- **APK v1.2.3** (29.1 KB, signed v2+v3) — no functional change vs v1.2.1; version bump aligns with the rebrand cleanup. Test assertions now use `body["version"].startswith("1.2.")` instead of hard-coded `"1.2.1"`.
- **Tests**: 12 new in `test_iteration9_pool_cleanup.py`. Full regression: **172 passed, 1 skipped, 0 failed** across 9 iterations.

## Test Status
- Backend: **172 / 173 collected, 0 failures, 1 intentional skip** across 9 iterations.
- Frontend: testing-agent iteration 9 — Pool panel renders with "Not configured" badge + config hint; Show-demo checkbox toggles 160→200 rows; Mobile v1.2.3 footer 5-tap toggles advanced; PowerUp×1 + TierForecast×1 (no duplicates); heartbeat sends worker_state honestly.
