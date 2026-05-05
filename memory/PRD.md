# THE GRID — Product Requirements Document

## Original Problem Statement
Build "THE GRID" — an investor-grade decentralized supercomputer platform connecting 1M smartphones. Cyber-gold/obsidian-black aesthetic. Real working compute loop with matrix multiplication + SHA-256 hashing tasks (10–50 devices), real device registration/heartbeat/task distribution/result verification/earnings calculation. Mocked USDT (TRC-20) wallet with $5 withdrawal threshold. Admin Command Center: world map, payouts, fraud shield. JWT auth + role-based admin.

## Architecture
- **Backend**: FastAPI + MongoDB (motor), JWT auth (PyJWT), bcrypt, deterministic mulberry32 PRNG for matrix tasks (browser parity), SHA-256 PoW for hash tasks. All routes under `/api`.
- **Frontend**: React 19 + Tailwind + Shadcn UI primitives + lucide-react icons. Custom theme (Cabinet Grotesk-style display via Unbounded, Inter body, Space Grotesk fallback). Glassmorphism + gold glow.
- **Compute Loop**: Browser is the device. AuthContext + ProtectedRoute. Browser-side `lib/compute.js` runs identical algorithms to backend `_matrix_signature` / `_hash_signature` so submissions verify byte-for-byte.

## Personas
- **Operator (User)**: Registers, adds devices, runs node, withdraws USDT.
- **Admin/CEO**: Monitors fleet via War Map, approves payouts, manages Fraud Shield.

## Implemented (2026-02)
- JWT auth (register/login/logout/me) with httpOnly cookies + Bearer token fallback. Admin seeded on startup (`admin@thegrid.io` / `Grid@Admin2026`). Role-based admin guard.
- Device CRUD: register (3 tiers — flagship 3x / mid 1.8x / budget 1x), heartbeat with Golden Rule (charging+wifi+permission).
- Task orchestrator: real matrix multiplication (16/20/24 size) + SHA-256 PoW (difficulty 4). Verified results credit USDT. Wrong/too-fast results trigger Fraud Shield auto-flag.
- Wallet: balance, total_earned, $5 threshold, mocked TRC-20 withdraw → pending payout queue.
- Stats: live PetaFLOPS, active devices, total tasks/users (real DB counts).
- Admin Command Center: live war map (deterministic dot positions per device), devices table with flag/unflag, payouts approval, fraud panel, users list.
- Landing page: hero with 3D orb + grid lines, profit calculator, live power counter, AWS/GCP comparison, golden rule trio, ticker.

## Backlog
### P0
- (None — core MVP complete & tested green)
### P1
- Brute-force lockout on /api/auth/login (5 fails / 15 min)
- Real TRC-20 payout integration (optional Tron Stripe-Crypto / TronWeb)
- Federated Learning task type (real on-device ML training)
### P2
- Device location geocoding (real coords for the war map)
- Refresh token endpoint usage
- Charts (recharts) on Dashboard for earnings history
- Mobile native client (React Native / Flutter)
- Public leaderboard for top earners

## Test Status
- Backend: 21/21 passed (iteration_1.json)
- Frontend: live e2e screenshot verified — register → device → run → 2 verified tasks → 0.04852 USDT earned in 7s
