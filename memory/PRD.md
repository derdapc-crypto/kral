# THE GRID — PRD

## Original Problem Statement
Build "THE GRID" — investor-grade decentralized supercomputer connecting 1M smartphones. Cyber-gold/obsidian theme. Real working compute loop with matrix multiplication + SHA-256 hashing tasks. Mocked USDT (TRC-20) wallet with $5 threshold. Admin Command Center. JWT + role-based admin.

**Iter 2**: enterprise customer portal (workload upload, budget, progress), Android APK + setup guide, expanded admin (Jobs/Ledger/Device Health), end-to-end pipeline.

**Iter 3**: APK auto-update banner + version metadata, admin auto-mining toggle + 30-min hashrate chart, customer priority tiers (economy/standard/instant), result export (JSON/CSV), customer API keys, full referral system (10% lifetime + share-card with QR), brute-force lockout, X-Forwarded-For-aware rate limits.

## Architecture
- FastAPI + MongoDB + JWT (PyJWT/bcrypt) + deterministic mulberry32 PRNG (browser parity).
- React 19 + Tailwind + Shadcn primitives + lucide-react icons + recharts.
- Browser-as-device worker; matching `lib/compute.js` and backend signatures.

## Personas
- **Worker** — registers, runs node, earns USDT, refers others (10%).
- **Customer / Enterprise** — uploads workloads, sets priority/budget, exports results, API key.
- **Admin / CEO** — approves jobs, toggles baseline mining, monitors hashrate/ledger/fraud.

## Implemented (2026-02)
### Iteration 1 (MVP)
- JWT auth, admin seeded.
- Devices: register, heartbeat, Golden Rule.
- Real compute: matrix mul + SHA-256 PoW (deterministic verification).
- Wallet, war map, payouts, fraud shield, users.
- Landing: hero, profit calc, power counter, AWS/GCP comparison.

### Iteration 2 (Enterprise pipeline)
- `/customer` portal — drag-drop upload, progress, status pills.
- Role-aware register; APK download + setup guide modal.
- Admin Jobs (approve/reject), Ledger (revenue vs payouts), Device Health (brand/OS/thermal).
- Customer→admin→worker→ledger pipeline live-verified.

### Iteration 3 (Production polish + viral growth)
- **APK metadata**: `/api/apk/version` returns version 1.0.2, abi list, min SDK 26, signed=False (transparent placeholder).
- **APK auto-update banner** on landing; download tracking with X-Forwarded-For-aware rate limit (5/min/IP).
- **Admin Auto-Mining** toggle — when no enterprise jobs, baseline tasks dispatched so network always under load.
- **Hashrate time-series chart** (recharts area chart, 30-min buckets).
- **Priority tiers** — economy 0.7×, standard 1.0×, instant 2.5× — multiplies worker payout.
- **Result export** — JSON + CSV download per job (cross-customer 404).
- **Customer API keys** — get/regenerate, X-API-Key header support; surfaced in Customer Portal.
- **Referral system** — every user has unique code; 10% lifetime commission credited on every referee's verified task; share-card SVG with QR pattern at `/api/referrals/share-card`; `/referrals` page with copy-link, tweet, download-card.
- **Brute-force lockout** — 5 fails / 15 min, X-Forwarded-For-keyed.
- Centralized `_client_ip(request)` helper.

## Backlog
### P1
- **Real signed Android APK build** — currently a placeholder zip; needs Android Studio + signing infra (not feasible in sandbox).
- Tier-aware Fraud Shield thresholds (currently flat 1ms matrix / 15ms hash).
- Atomic `findOneAndUpdate` on `jobs.processed_units` for race safety.
- Tighten `JobCreateIn.workload_type` and `priority` to `Literal[...]`.
- Federated Learning real workload type (currently routes random kind).
- Admin endpoint to view top referrers / set per-user override.
- Real TRC-20 payout integration.

### P2
- Split server.py (~1080 lines) into routers (auth/devices/tasks/jobs/admin/referrals/apk).
- Real device geocoding for the war map.
- Earnings recharts on Dashboard.
- Pagination for `/api/jobs/{id}/results.*` (currently capped at 10000).
- `total_earned` separated into `lifetime_compute` vs `lifetime_referral`.
- Native mobile worker (RN / Flutter).

## Test Status
- Backend: **67 passed / 1 skipped** across `tests/test_grid_backend.py` + `test_iteration2_customer_jobs.py` + `test_iteration3_features.py`.
- Frontend: e2e screenshot validated — admin command center showing 84 devices / 63 active / 57 pending jobs / $28.5 revenue / 13 K H/s / completed jobs at 100% with INSTANT/STANDARD priority badges; referrals page with QR-coded share card and live commission tracking.
