# THE GRID — PRD

## Original Problem Statement
Build "THE GRID" — investor-grade decentralized supercomputer connecting 1M smartphones. Cyber-gold/obsidian theme. Real working compute loop with matrix multiplication + SHA-256 hashing tasks. Mocked USDT (TRC-20) wallet with $5 threshold. Admin Command Center. JWT + role-based admin.

**Iteration 2 update**: enterprise customer portal (workload upload, budget, progress), Android APK download + setup guide, expanded admin (Jobs approve/reject, Financial Ledger, Device Health), end-to-end customer→admin→worker→ledger pipeline.

## Architecture
- FastAPI + MongoDB + JWT (PyJWT/bcrypt) + deterministic mulberry32 PRNG (browser parity).
- React 19 + Tailwind + Shadcn primitives + lucide-react icons + glassmorphism.
- Browser-as-device for the worker; matching `lib/compute.js` and backend signatures.

## Personas
- **Worker / Operator** — registers, runs node, earns USDT.
- **Customer / Enterprise** — uploads workloads, sets budget, watches progress.
- **Admin / CEO** — approves jobs, manages payouts, polices fraud, monitors ledger.

## Implemented (2026-02)
### Iteration 1
- JWT auth (register/login/logout/me/refresh); admin seeded (admin@thegrid.io / Grid@Admin2026).
- Devices: register (3 tiers), heartbeat, Golden Rule (charging+wifi+permission).
- Tasks: real matrix mul (mulberry32) + SHA-256 PoW (diff=4); deterministic verification.
- Wallet: balance, $5 mocked TRC-20 withdraw, payout queue.
- Admin: war map, devices, payouts, fraud shield, users.
- Landing: hero + orb, profit calc, live power counter, AWS/GCP comparison, Golden Rule trio, ticker.

### Iteration 2
- **Customer Portal** (`/customer`) — drag-drop upload, units/budget/max_nodes form, real-time progress bars, status pills (pending/running/completed/rejected).
- **Role-aware register** — `Worker / Enterprise` toggle on `/register`; auto-route by role on login.
- **APK distribution** — hero `Download APK` CTA + setup-guide modal (3 steps); placeholder `/grid-worker-v1.0.0.apk` served from `public/`.
- **Admin Jobs tab** — approve/reject pending workloads; pending count badge.
- **Admin Ledger tab** — customer revenue, platform margin, worker owed, paid out, pending withdrawals.
- **Device Health table** — brand, OS, battery, thermal, last-seen, with flag/unflag controls.
- **End-to-end** — approved jobs feed `/tasks/request`; verified submissions increment `processed_units`/`spent_usdt` and post revenue to ledger; auto-completes when units exhausted.
- **Worker telemetry** — heartbeat now reports brand/OS/thermal sourced from `navigator.userAgent`.

## Backlog
### P1
- Tier-aware Fraud Shield thresholds (currently 1ms matrix / 15ms hash flat)
- Atomic `findOneAndUpdate` on jobs.processed_units (race-condition fix)
- Brute-force lockout on `/api/auth/login`
- Federated Learning real workload (current FL workload type falls back to random kind)
- Tighten `JobCreateIn.workload_type` to `Literal[...]`
- Real TRC-20 payout integration

### P2
- Split server.py into routers (auth/devices/tasks/jobs/admin) — file is at ~780 lines
- Real device geocoding for the war map (currently deterministic pseudo-positions)
- Earnings recharts on Dashboard
- Public leaderboard / referral program
- Native mobile worker (RN / Flutter) replacing the placeholder APK

## Test Status
- Backend: 41 passed / 1 skipped (`pytest /app/backend/tests/`).
- Frontend: e2e screenshot validated — customer registers → uploads SDXL workload → 12.50 USDT job appears as PENDING with correct rate.
