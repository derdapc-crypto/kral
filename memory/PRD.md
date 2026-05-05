# THE GRID — PRD

## Original Problem Statement
Build "THE GRID" — investor-grade decentralized supercomputer connecting 1M smartphones. Cyber-gold/obsidian theme. Real working compute loop. Mocked USDT (TRC-20). Admin Command Center. JWT + role-based admin.

**Iter 2**: customer portal, APK + setup guide, expanded admin (Jobs/Ledger/Device Health), end-to-end pipeline.

**Iter 3**: APK auto-update banner, admin auto-mining toggle, hashrate chart, customer priority tiers, result export, API keys, full referral system, brute-force lockout.

**Iter 4**: Omni-Mining Orchestrator with 8 Binance Pool profiles, admin coin selector, stratum broadcast, master worker ID `117423210.[device_id]`, per-algorithm aggregate hashrate + revenue estimator, per-device mining-speed/thermal table, simulated hashrate reporting honored on heartbeat.

## Architecture
- FastAPI + MongoDB + JWT (PyJWT/bcrypt) + deterministic mulberry32 PRNG.
- React 19 + Tailwind + Shadcn primitives + lucide-react + recharts.
- Browser-as-device worker; identical signature math on both sides.

## Personas
- **Worker** — runs node, earns USDT, refers others (10% lifetime).
- **Customer / Enterprise** — uploads workloads, sets priority/budget, exports results, API key.
- **Admin / CEO** — approves jobs, toggles baseline mining, **selects active coin**, monitors hashrate/ledger/fraud.

## Implemented (2026-02)
### Iteration 1 — MVP
- JWT auth, admin seeded; devices + Golden Rule; real matrix mul + SHA-256 PoW; wallet/payouts/fraud/users; landing.

### Iteration 2 — Enterprise pipeline
- `/customer` portal; admin Jobs/Ledger/Device Health; customer→admin→worker→ledger pipeline live.

### Iteration 3 — Polish + viral growth
- APK auto-update; admin Auto-Mining toggle + hashrate chart; priority tiers; result export (JSON/CSV); customer API keys; referral system + share-card; brute-force lockout.

### Iteration 4 — Omni-Mining Orchestrator
- **8 Binance Pool profiles** pre-configured (BTC/BCH/LTC/ZEC/ETC/RVN/DASH/KAS) with stratum URL, port, algo, base hashrate, reward rate, native unit.
- **Admin Mining tab** with selector grid, active coin display, live stratum broadcast (URL + port + master worker ID `117423210.[device_id]`).
- **Aggregate hashrate** card + **per-device speed table** (tier-aware: flagship 3× / mid 1.8× / budget 1×) + thermal status.
- **Revenue estimator** — daily/monthly/yearly USDT plus native-symbol rate.
- **Worker heartbeat** now polls `/api/mining/config` and reports simulated hashrate + algo; device terminal shows active-coin banner + worker ID.
- **API endpoints**: `/api/mining/profiles`, `/api/mining/active`, `/api/mining/config`, `/api/admin/mining/{select,stats,revenue}`.

## Known Limitations / MOCKED
- **APK** is a placeholder zip (no real Android signing infra in sandbox).
- **Stratum mining** is browser-simulated — browsers cannot speak `stratum+tcp://`. The orchestration layer is fully real; production needs a signed native APK consuming the same `/api/mining/config` endpoint to perform real PoW.
- **USDT TRC-20 payouts** are DB-tracked only; no real on-chain TX.
- **Hashrate values** are simulated by tier × algo difficulty; revenue numbers use hard-coded oracle approximations.

## Backlog
### P1
- Server-side hashrate sanity cap on heartbeat (prevent inflated reports).
- Real signed APK build pipeline (external CI requirement).
- Tier-aware Fraud Shield thresholds.
- Atomic `findOneAndUpdate` on `jobs.processed_units`.
- Literal validation on `workload_type`/`priority`.
- Real Binance pool oracle integration for live USDT/BTC rates.
- Real TRC-20 payout integration.

### P2
- **Split server.py (~1235 lines) into routers** (auth/devices/tasks/jobs/admin/referrals/apk/mining).
- Cache mining stats with TTL to reduce DB pressure.
- Pagination for `/api/jobs/{id}/results.*`.
- Separate `lifetime_compute` vs `lifetime_referral` on user.
- Real device geocoding for the war map.
- Native mobile worker (RN / Flutter / Android Studio APK).

## Test Status
- Backend: **89 / 89 passing** across 4 test files (iter 1: 21, iter 2: 20, iter 3: 26, iter 4: 22), 1 skipped (intentional).
- Frontend: e2e screenshot validated — admin command center → mining tab → live coin switch (RVN→LTC) → stratum URL updates → 23,160 KH/s aggregate → per-device table showing flagship 600 KH/s vs mid 360 KH/s with correct Scrypt algo + nominal thermal.
