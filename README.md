# [ UPSOLVE.it ] | Intelligence Engine

> **Backend Protocol: NEXUS-CORE v2.0**
> The scalable intelligence engine powering the Upsolve.it tactical platform.

---

## 🛠️ Core Infrastructure

- **Framework**: NestJS 11 (Node.js)
- **Database**: MongoDB (via Mongoose)
- **Authentication**: JWT (JSON Web Tokens) with Passport strategy + automatic token refresh
- **Communication**: Nodemailer (SMTP) for Signal Support processing
- **Validation**: Zod for environment variables, class-validator for DTOs
- **Logging**: Pino with structured JSON output

### 🛰️ API Documentation (Swagger)

The full API specification is available via Swagger. When the backend is running, you can access the interactive documentation directly at:

- **Direct**: `https://api.hnuicpc.tech/` (Root access)

## 📡 Key Modules

### 1. Authentication & Verification
Identity management with JWT auth, password reset, and a Codeforces profile verification system. Verification generates timed codes that users paste into their CF profile for identity proof. Awards +50 XP upon successful verification.

- **Endpoints**: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `POST /api/auth/reset-pin`, `POST /api/auth/sync-profile`, `POST /api/auth/generate-verification-code`, `POST /api/auth/verify-codeforces-profile`

### 2. Friends System
Full friend request lifecycle — send, accept, decline, cancel, and remove. Supports viewing friends' training statistics for social competitive tracking.

- **Endpoints**: `POST /api/friends/requests`, `POST /api/friends/requests/:id/accept`, `POST /api/friends/requests/:id/decline`, `DELETE /api/friends/requests/:id`, `GET /api/friends`, `GET /api/friends/:id/stats`, `DELETE /api/friends/:id`

### 3. Roadmap (Learning Trail)
Admin-managed curriculum of levels and topics. Tracks per-user progress, XP accumulation, and level unlocks. Provides public browsable trail and a competitive leaderboard.

- **Admin**: Create/update/delete levels and topics, manage ordering, attach problem sheets
- **Public**: Browse levels, view topic progress, leaderboard summary
- **Progress**: Manual problem solve tracking, XP calculation, level completion detection

### 4. Training Levels
Configurable difficulty parameters defining problem rating matrices (P1–P4), performance requirements, and time constraints per level. Auto-seeded with default levels.

- **Endpoints**: `GET /api/training-levels`

### 5. Training Sessions
Core training engine managing problem generation, session lifecycle (start/stop/finish), submission status polling, and performance calculation across five training modes.

- **Endpoints**: Training CRUD, session management, problem generation

### 6. Upsolve Tracking
Tracks unsolved problems from training sessions for later practice. Supports creation, deletion, and solve-status synchronization with Codeforces.

- **Endpoints**: `GET /api/upsolve`, `POST /api/upsolve`, `DELETE /api/upsolve/:id`, `POST /api/upsolve/refresh`

### 7. User Statistics
Aggregated training statistics per user — total sessions, problems solved, performance averages, and per-mode breakdowns. Powers the friends stats view.

### 8. Contact & Signal Support
Handles incoming support signals, generates premium HTML email templates, and routes transmissions to the HNU ICPC intelligence center.

- **Endpoints**: `POST /api/contact`

### 9. Notification Engine
Tactical broadcast system for community announcements and maintenance alerts.

### 10. Audit Logging
Real-time tracking of administrative actions and system anomalies for high-fidelity security monitoring.

### 11. Health Checks
Kubernetes-ready health endpoints for monitoring and load balancers.

- **Endpoints**: `GET /api/health`, `GET /api/health/ready`, `GET /api/health/live`

## Infrastructure Features

- **Per-endpoint Rate Limiting**: Configurable rate limits for auth (5/15min), registration (3/hr), contact (3/hr)
- **Request Logging**: Structured logs with request IDs, method, URL, status code, and duration
- **Global Exception Filter**: Sanitized error responses in production mode
- **Environment Validation**: Zod-based schema validation at startup

## 🚀 Deployment Protocol

### Rate Limiting

Per-endpoint rate limits are enforced via in-memory tracking:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/login` | 5 requests | 15 minutes |
| `POST /api/auth/register` | 3 requests | 1 hour |
| `POST /api/auth/refresh` | 10 requests | 15 minutes |
| `POST /api/auth/generate-verification-code` | 3 requests | 1 hour |
| `POST /api/auth/verify-codeforces-profile` | 5 requests | 1 hour |
| `POST /api/contact` | 3 requests | 1 hour |
| `POST /api/friends/requests` | 10 requests | 1 hour |
| `POST /api/trainings/start` | 20 requests | 1 hour |
| `POST /api/upsolve` | 30 requests | 1 hour |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in all responses. When exceeded, a `429 Too Many Requests` is returned with a `Retry-After` header.

## Environment Setup

1. **Environment Setup**:
   Create `.env`:

   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_secret
   SMTP_EMAIL=upsolve.it.1@gmail.com
   SMTP_PASSWORD=your_app_password
   FRONTEND_ORIGIN=http://localhost:3000
   ```

2. **Initialization**:
   ```bash
   npm install
   npm run start:dev
   ```

## 🔧 Scripts

- `scripts/award-verification-xp.js` — Migration script to retroactively award verification XP to existing verified users.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start development server |
| `npm run build` | Production build |
| `npm run start:prod` | Start production server |
| `npm run lint` | Run ESLint |

## 📂 API Structure

All routes are prefixed with `/api` as per global configuration.

- `/api/auth`: Identity management & verification
- `/api/friends`: Social connections & friend stats
- `/api/roadmap`: Learning trail levels, topics & leaderboard
- `/api/training-levels`: Difficulty parameters
- `/api/trainings`: Training sessions & problem generation
- `/api/upsolve`: Unsolved problem tracking
- `/api/contact`: Signal Support processing
- `/api/notifications`: Community broadcasts
- `/api/admin`: Intelligence oversight & audit logs

---

<div align="center">
  <p>Standardizing Competitive Excellence • 2026</p>
</div>

