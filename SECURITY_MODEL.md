# Upsolve.it — Threat Model

Covers `Mohamediibra7im/upsolve-it` (frontend) and `Mohamediibra7im/upsolve-it--backend` (API). Builds on the backend's `SECURITY_REVIEW.md` (2026-07-12 remediation report), which documents fixed issues and two deferred items. No separate infrastructure repository: deployment config lives in the repos (`fly.toml`, `Dockerfile`, `vercel.json`, `.github/workflows/ci-cd.yml`).

## System overview and trust boundaries

Browser → **Next.js 16 frontend** (Vercel; `upsolve-it.hnuicpc.tech`, `upsolve-iit.vercel.app`) → **NestJS 11 API** (Fly.io `upsolve-it-backend.fly.dev`, also deployable to Vercel via `api/index.ts`) → **MongoDB** (Mongoose 9). External: **Codeforces API** (identity proof, ratings, submissions), **SMTP/Gmail** (contact mail).

Trust boundaries:
1. Internet → frontend Next.js server routes (`app/api/*`).
2. Internet / browser → API (cross-site, credentialed CORS allowlist in `src/common/http/configure-http.ts`).
3. Authenticated user → admin (role check in `src/common/guards/admin.guard.ts`).
4. API → Codeforces / SMTP (untrusted third-party data flows back in: handles, avatars, submissions).

## Components

| Component | Code |
|---|---|
| **Web Frontend** | upsolve-it: `app/`, `components/`, `hooks/`, `lib/`, `services/`, `utils/`, `app/api/profile-image` |
| **Auth & Identity** | backend `src/modules/auth/`, `src/common/guards/`, `src/common/utils/password.ts`, `src/common/decorators/` |
| **Core API** | backend `src/modules/{trainings,upsolve,friends,roadmap (public/progress/access),user-stats,training-levels,xp,suggestions,whats-new,health}`, `src/common/utils/codeforces-api.ts`, `src/common/database/` |
| **Admin** | backend `src/modules/admin/`, `src/modules/roadmap/roadmap-admin.*`, `src/modules/audit-logs/`; frontend `app/admin/`, `hooks/admin/` |
| **Contact & Email** | backend `src/modules/contact/`; frontend `app/api/contact/route.ts` |
| **Infrastructure & CI** | `Dockerfile`, `fly.toml`, `vercel.json`, `.github/workflows/`, backend `src/main.ts`, `src/common/http/configure-http.ts`, `src/config/env.validation.ts`, `api/index.ts`, `package*.json` (dependencies) |

## Entry points and who can reach them

- **Anonymous**: `POST /api/auth/{register,login,refresh,logout,initiate-reset,verify-submission,verify-reset-profile,reset-password}`, `POST /api/contact`, `GET /api/roadmap/{levels,leaderboard,levels/:id...}` (OptionalAuthGuard), `GET /api/health*`, Swagger `/docs` + `/docs-json` (basic auth only if `SWAGGER_USER`/`SWAGGER_PASSWORD` set). Frontend: `POST /api/contact` (Next route, sends via Gmail with `EMAIL_USER`/`EMAIL_PASS`, no rate limit or validation beyond required fields), `GET /api/profile-image?url=` (server-side fetch of Codeforces avatars — SSRF surface, guarded by `lib/profile-image.ts`).
- **Authenticated user** (`AuthGuard`, JWT from `Authorization: Bearer` or `accessToken` cookie): friends, trainings/sessions, upsolve, user stats, roadmap progress, `sync-profile`, Codeforces verification code flow.
- **Admin** (`AuthGuard` + `AdminGuard`): `/api/admin/*` (users, roles, lock, batch sync, levels, logs, contact inbox/replies) and `/api/admin/roadmap/*`.

## Assets (owner: all of them matter)

- User accounts and sessions; **admin role** (admin takeover = full control of users, curriculum, contact inbox).
- Integrity of **Codeforces-verified identity, XP, roadmap progress and leaderboard**.
- Personal data: emails, contact messages, password hashes (bcrypt), refresh tokens, audit logs.
- Secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET` (also signs reset/verify tokens), SMTP credentials, Codeforces API key/secret, MongoDB URI.

## Attacker profiles (owner: all in scope)

- Anonymous internet attacker.
- Registered user trying to cheat (XP/leaderboard/verification) or read/modify other users' data (IDOR on friends stats, upsolve, sessions, restricted roadmap levels).
- **Malicious or compromised admin** — in scope per owner (not treated as fully trusted): admin-only paths that escalate beyond admin intent (e.g. stored XSS into other admins/users, injection, secret exposure) matter.
- Supply chain (npm dependencies; CI runs `npm audit --audit-level=moderate`).

## Existing controls

- JWT HS256 pinned; access tokens verified with `JWT_SECRET` only; reset/verify tokens use `JWT_REFRESH_SECRET` + `type` claim; `authVersion` invalidation; locked users rejected (`auth.service.ts`).
- Refresh-token rotation with reuse detection (token family revoke).
- httpOnly cookies, `secure`, `sameSite=none` in production (`auth.controller.ts`).
- Strict CORS origin allowlist, HTTPS-only in production; `trust proxy 1`; helmet CSP; 100 kb body limit; global `ValidationPipe` (whitelist, forbidNonWhitelisted).
- Per-endpoint + global rate limiting (`rate-limiter.guard.ts`, `RateLimiterMemory`).
- Mail header sanitization (`headerSafe`) and HTML escaping in backend contact; HTML escaping in frontend contact route.
- Docker image runs as `node`, prod deps only; Fly `force_https`.

## Out of scope / accepted risk

- Owner stated **nothing is out of scope or accepted** (the two follow-up answers selected every option including "nothing", read as no exclusions). Findings keep the scanner's severity unless a fact above moves them.
- Known deferred items (SECURITY_REVIEW.md): in-memory rate limiting per instance; CSRF surface from `sameSite=none`. Not accepted as risk by the owner.

## Open questions

- Is `SWAGGER_USER`/`SWAGGER_PASSWORD` set in production (otherwise `/docs` publicly exposes the full API)?
- Is the frontend `app/api/contact` route still used in production, or superseded by backend `POST /api/contact`?
- Where is MongoDB hosted and is it network-restricted to the API?
- Is the Vercel deployment of the backend (`api/index.ts`) live alongside Fly.io?
