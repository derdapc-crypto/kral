# THE GRID — Product Requirements Document

> Distributed phone-based supercomputer network.  Q3 2027 narrative RETIRED
> (v1.5.4 "Absolute Authority").  New narrative: milestone-driven,
> 1,000,000 verified active node target → Snapshot Readiness → conditional
> roadmap progression.

## Original Problem Statement
Build a real, working, phone-based distributed compute network that:
- Looks like a premium cyber terminal, not a generic Android app
- Uses milestone-driven (verified node growth) narrative, not date-based countdowns
- Frames token as "Compute-Time Receipt", never as a coin / guaranteed price
- Survives Turkish ISP DPI WebSocket blocks (HTTP polling fallback)
- Survives Android Doze (battery exemption + foreground service + watchdogs)
- Has separate strict B2B vocabulary for enterprise customer portal
- Foundation Buyback Program is conditional, never guaranteed

## Core User Personas
1. **Hayal Kırıklığına Uğramış Pi Avcısı** — wants to contribute real compute, sees TGC accumulating
2. **Teknik Üniversite Öğrencisi** — reads contracts, audits, milestones
3. **B2B Enterprise Customer** — uploads AI workloads, pays in Compute Credits, sees SaaS panel

## Tech Stack
- Backend: FastAPI + MongoDB + Supervisor + xmrig (4-thread, internal compute pool)
- Frontend: React + Tailwind + lucide-react (cyber terminal aesthetic)
- Android: WebView shell + native librandomx.so + foreground service + JS bridge
- Bridge: WebSocket primary + HTTPS long-polling fallback (v1.5.7+)

## Architecture
```
/app/
├── backend/
│   ├── server.py                        # Main FastAPI app (3993 lines, needs router refactor)
│   ├── mobile_mining/bridge.py          # WS+HTTP stratum proxy → SupportXMR
│   ├── miner/                           # Embedded xmrig binary (4 threads)
│   └── notifications/
├── frontend/
│   ├── public/
│   │   ├── grid-worker-v1.5.8.apk       # Latest APK (390 KB, SHA e92223...)
│   │   └── (older versions retained)
│   └── src/
│       ├── pages/Token.jsx              # v1.5.4 milestone narrative
│       ├── pages/Mobile.jsx             # v1.5.8 cyber terminal UI
│       ├── pages/Landing.jsx            # v1.5.4 scarcity progress
│       ├── pages/CustomerPortal.jsx     # v1.5.4 strict B2B vocab
│       └── components/LiveFleetGlobe.jsx
└── android-client/
    ├── build-apk.sh                     # CLI-only pipeline (aapt+d8+zipalign+apksigner)
    └── wrapper/src/io/thegrid/worker/
        ├── MainActivity.java            # v1.5.8 WebView host + JS bridge
        ├── GridWorkerService.java       # Foreground service + heartbeat
        ├── MobileBridgeClient.java      # WS + HTTP polling fallback
        └── (other watchdog files)
```

## Key API Endpoints
- `GET /api/network/scarcity-progress`     — 1M verified node milestone (v1.5.4)
- `GET /api/foundation/buyback-status`     — config-driven buyback program
- `POST /api/foundation/buyback-apply`     — contributor application
- `GET/POST /api/admin/foundation/buyback-config` — operator window control
- `GET /api/token/launch`                  — milestone-driven narrative (no dates)
- `GET /api/apk/version`                   — current APK version + SHA-256
- `WS  /api/mobile-mining/worker/ws`       — primary stratum bridge
- `POST /api/mobile-mining/poll/job`       — long-poll fallback (v1.5.7)
- `POST /api/mobile-mining/poll/submit`    — share submission fallback
- `GET /api/admin/mobile-mining/diagnostics`

## v1.6.4 "Operator-Tunable Mining Policy" — Feb 2026 ✅
- Admin → Mining Config tab: global kill switch + CPU throttle (5-100%)
  + max threads (1-8) + min battery + max temperature + require_wifi /
  require_charging / allow_mobile_data toggles + poll interval.
- Endpoints: GET /api/mining/config (public), GET/POST /api/admin/mining/config.
- New collection `mining_config` (single doc id="global"), defaults backfilled.
- APK GridWorkerService.java replaced hardcoded `charging && onWifi`
  eligibility with config-driven policy. refreshMiningConfig() polls every
  N seconds. **Cellular mining now permitted when allow_mobile_data=true.**

## v1.6.2 "Daily Grid Calibration + Public Ledger Counter" — Feb 2026 ✅
- **Daily Grid Calibration**: cyber "node sync reactor" dial (NOT a wheel of
  fortune). Segmented rotating protocol ring + neon beacon + pulsing node core.
  States: idle → syncing → complete → locked (with live UTC countdown).
- Backend: weighted server-side reward (8 tiers, 0.00010 TGC @ 35% → 1.00000 TGC
  @ 0.2%), strict same-day idempotency via unique `(user_id, date_key)` index,
  eligibility = not banned + not risk_flagged + 24h heartbeat.
- New collection `daily_calibrations` + `tgc_ledger` row `kind='daily_calibration_bonus'`.
- **Public TGC Counter**: real aggregations from `tgc_ledger` — `total_tgc_issued`,
  `total_tgc_burned`, `circulating_tgc`, plus per-kind breakdown (compute,
  calibration, drops, buyback burn). NO hardcoded values.
- Premium monospace count-up animation, used on Landing (hero strip + scarcity
  console mega), Token (slot scarcity), Dashboard, Admin Ledger tab.

### New Endpoints (v1.6.2)
- `GET  /api/daily-calibration/status` (eligibility + last claim)
- `POST /api/daily-calibration/claim`  (server-side weighted random, idempotent)
- `GET  /api/stats/public`             (ledger totals only)
- `GET  /api/network/scarcity-progress` (now ALSO includes ledger totals)

## v1.6.1 "Desktop Scale Normalization" — Feb 2026 ✅
- Container max-width 1400 → **1240**, padding `lg:px-10` → `lg:px-8`
- Section vertical padding `py-28/py-32` → **`py-20`** across all landing/token sections
- Hero clamp `56-8.4vw-124` → **`38-5.6vw-84`**; Token hero `48-8vw-132` → **`40-6vw-96`**
- Mega verified count `72-11vw-160` → **`56-8vw-112`**; section H2's reduced ~25%
- Hero `min-h-screen` → `min-h-[88vh]`; Final CTA `72vh/py-32` → `60vh/py-24`
- NavBar h-16 → **h-14**, items gap-7 → gap-5, smaller logo/text
- NetworkTopology hero panel `max-w-none` → **`max-w-[520px]`** + `maxHeight: min(64vh, 520px)`
- Live command feed `text-[18px]` → `text-[15px]`, py-4 → py-3
- Body text 17px → 15px; section descriptions 14px → 13px

Result: at 100% browser zoom the site now reads like the previous 80% zoom — premium, cinematic, but not aggressive.

## v1.6.0 "Operator Control" Sprint — Feb 2026 ✅
- Fixed horizontal overflow at 1920px: tightened mega-clamp() font sizes on
  Landing & Token, added global `html,body,#root { overflow-x:hidden; max-width:100vw }`.
- Admin → Users tab now lists `tgc_balance` + ban status + Suspend/Reinstate
  buttons. Admins cannot be suspended.
- Banned accounts: `is_banned: true` flag → blocked at `/auth/login` (403) AND
  at every `get_current_user` protected endpoint (existing tokens fail immediately).
- Admin → Buybacks tab: lists Foundation Buyback applications with Approve and
  Reject buttons. Approval inserts a negative `tgc_ledger` row
  (`kind: buyback_burn`) and atomically decrements `users.tgc_balance` by the
  eligibility threshold. Approval is idempotent.

### New Endpoints (v1.6.0)
- `POST /api/admin/users/{user_id}/ban`
- `POST /api/admin/users/{user_id}/unban`
- `GET  /api/admin/buybacks`
- `POST /api/admin/buybacks/{application_id}/approve`
- `POST /api/admin/buybacks/{application_id}/reject`

## v1.5.4 "Absolute Authority" Sprint — COMPLETED (Feb 2026)

### Faz 1 — Public Web Surface ✅
- /token page rewritten: countdown REMOVED → "TGC is not a coin / record of useful compute" hero
- Network Scarcity Progress card (verified_active_nodes / 1,000,000)
- Foundation Buyback Program card (config-driven, never guaranteed)
- Milestone-based roadmap (no dates): Verified Node Growth → Snapshot Readiness Review → Audit → Governance → Mainnet Candidate
- Risk/Clarity disclaimer block
- Landing: earnings table REMOVED → LandingScarcityCard
- /mobile Rewards: "Token Launch Q3 2026" banner → "FOUNDATION · BUYBACK PROGRAM"
- /dashboard: "Locked" button → "Pre-Mainnet · Buyback Closed"

### Faz 2 — Backend Endpoints ✅
- /api/network/scarcity-progress (live verified_active_nodes count, no fake inflation)
- /api/foundation/buyback-status (config-driven)
- /api/foundation/buyback-apply (window-gated, eligibility-gated)
- /api/admin/foundation/buyback-config (operator-only flip)
- /api/token/launch — narrative_model: milestone_driven

### Faz 3 — B2B Vocabulary Sweep ✅
Customer Portal strict mapping applied:
- Hash/PoW → Verified Compute Throughput
- Total Jobs/Running/Completed/Spend USDT → Workload Queue/Active Workloads/Completed Dataset Batches/Compute Credits Used
- Budget USDT → Compute Credit Budget (CC)
- Max Nodes → Max Edge Compute Nodes
- Rate/unit → Rate/Verified Unit
- "dispatching to nodes" → "dispatch to the edge node fleet"

### Faz 4 — Global Style Pass ✅
- Global subtle scanline + grain texture (body::before/::after, inline SVG noise)
- LiveFleetGlobe: comments + "AWAITING VERIFIED NODES" overlay when zero nodes
- Landing milestones: per-tier USDT promises REMOVED → "verified nodes / growing-reached"
- Mobile.jsx: $TGC airdrop → contribution receipt sweep

### Faz 5 — APK v1.5.8 Build ✅
APK file: `/app/frontend/public/grid-worker-v1.5.8.apk`
Size: 390,299 bytes
SHA-256: `e92223271886bd4ce7717b23ab5c93a63fd5862eb46b2786f3ded58192517c52`
- Premium cyber terminal UI (deep black + matrix green + cyber cyan)
- 4 live CPU thread monitor bars (visual telemetry layer, does NOT touch native engine)
- Central ENGAGE NODE button (neon green glow)
- TGC balance 5-decimal precision (0.00000 TGC)
- Terminal activity log: [OK] GATEWAY_CONNECTED, [VERIFIED] TELEMETRY UNIT SUBMITTED, [SYNC] TGC_LEDGER_UPDATED, [SAFE] BATTERY_GUARD_ACTIVE, [READY] EDGE_NODE_STANDING_BY
- Strict vocab purge: no mining/miner/hash/RandomX/pool/share in user-facing surface
- v2+v3 signed
- libRandomX / WS bridge / heartbeat preserved (not touched)

## v1.5.7 Additions (still active)
- HTTP long-polling fallback for ISP DPI WebSocket blocks
- Android NetworkCallback for Wi-Fi/Cellular auto-switching

## Roadmap (P0/P1/P2)
### P0 — Blockers / Verification Pending
- User verification of v1.5.8 APK on physical device
- Production re-deploy (preview is fully green)

### P1 — Next Sprint
- Stripe Premium Tier ($5/month, 2x TGC multiplier, Premium badge)
- Email capture form on /token (Mainnet Snapshot announcements)
- Admin UI for opening Foundation Buyback Window

### P2 — Backlog
- PC Web Miner (WASM RandomX) for desktop browser users
- Genesis NFT (BSC smart contract, first 1000 users)
- Telegram bot integration (auto-announce Drop winners)
- server.py modular router refactor

### P3 — Future
- Multi-chain mainnet candidate (BSC vs Solana vote)
- DAO governance contracts deployment
- Independent audit firm engagement
