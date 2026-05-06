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

## Test Status
- Backend: **115 / 116 collected, 0 failures, 1 intentional skip** across 6 test files (iter 1: 21, iter 2: 20, iter 3: 26, iter 4: 22, iter 5: 13, iter 6: 13 TGC suite).
- Frontend: testing-agent iteration 6 — Mining tab loads without crash; Kill/Resume verified (P0 fixed); Admin Shield panel applies factor + reflects margin; Dashboard + /mobile show TGC counter, Power-Up card, Tier Forecast (flagship/mid/budget bars).
