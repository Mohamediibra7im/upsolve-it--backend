# Backend Security & Best-Practices Review — Remediation Report

**Project:** `upsolve-it--backend` (NestJS 11 + Mongoose 9, deployed on Fly.io)
**Date:** 2026-07-12
**Scope:** Authentication/authorization, data layer, infrastructure, controllers.
**Result:** All HIGH, MEDIUM, and LOW findings fixed. Build passes, 29/29 tests pass.

> Note: One CRITICAL account-takeover issue was found during review. Because it
> shared the same root cause as the token handling, it was fixed together with
> the HIGH items (see Fix #1). Two items require infrastructure and are
> documented as **Deferred** at the bottom — they were not silently skipped.

---

## Summary of changes

| # | Severity | Area | File(s) |
|---|----------|------|---------|
| 1 | CRITICAL | JWT token scoping (takeover) | `auth.service.ts` |
| 2 | HIGH | Permanent account-lockout DoS removed | `auth.service.ts` |
| 3 | HIGH | Trust proxy + real client IP | `main.ts`, `auth.controller.ts`, `rate-limiter.guard.ts` |
| 4 | HIGH | CORS wildcard narrowed | `main.ts` |
| 5 | HIGH | Contact/admin input validation (DTOs) | `contact.controller.ts`, `admin.controller.ts`, new DTOs |
| 6 | HIGH | Mail header-injection hardening | `contact.service.ts` |
| 7 | MED | Global default rate limit | `rate-limiter.guard.ts` |
| 8 | MED | Env var name reconciliation | `env.validation.ts` |
| 9 | MED | `listUsers` unbounded load bounded | `admin.controller.ts`, `admin.service.ts` |
| 10 | MED | Docker: non-root + prod-only deps | `Dockerfile` |
| 11 | MED | Batch sync N+1 writes → bulk | `admin.service.ts`, `audit-logs.service.ts` |
| 12 | LOW | Duplicate logging middleware removed | `app.module.ts`, deleted `logging.middleware.ts` |
| 13 | LOW | Refresh-token reuse detection | `auth.service.ts` |
| 14 | LOW | Request body size limit | `main.ts` |
| 15 | LOW | Case-insensitive login | `auth.service.ts` |
| 16 | LOW | `.env` file permissions → 600 | filesystem |

---

## Details

### 1. CRITICAL — Password-reset/verify tokens usable as session tokens (account takeover)
**Was:** `initiate-reset` (unauthenticated) issued a JWT signed with the same
`JWT_SECRET` as access tokens. `verifyAccessToken()` accepted *any* valid JWT
containing `userId`. An attacker could request a reset token for any handle and
present it as the `accessToken` cookie to authenticate as that user — no
password, no Codeforces proof.
**Now:** Every token carries a `type` claim (`access` / `verify` / `reset`).
`verifyAccessToken()` rejects anything that isn't `type:'access'`. Reset and
verify handlers likewise assert their expected type. All `verifyAsync` calls
pin `algorithms: ['HS256']` to prevent algorithm-confusion.

### 2. HIGH — Permanent account-lockout DoS
**Was:** 5 failed logins set `locked:true` permanently in the DB. Anyone knowing
a handle could permanently lock any account (admins included); only an admin
could unlock.
**Now:** Failed logins use the existing per-user in-memory throttle with a
**temporary** block that auto-clears. Permanent `locked` is reserved for
deliberate admin action.

### 3. HIGH — Client-spoofable IP / broken rate limiting behind proxy
**Was:** Client IP read from raw `x-forwarded-for` header (spoofable → bypass
rate limits). The guard used `request.ip` without `trust proxy`, so all traffic
appeared to originate from the Fly proxy.
**Now:** `app.set('trust proxy', 1)` in `main.ts`; controllers and guard use
`req.ip`. Guard keys per-user on `_id` (was a non-existent `.id`, always
`anonymous`).

### 4. HIGH — Over-permissive CORS with credentials
**Was:** `^https?://…\.(vercel\.app|hnuicpc\.tech)$` allowed **any** Vercel or
subdomain site (incl. `http`) to make credentialed requests to auth cookies.
**Now:** Two tight allowlists — this project's Vercel previews
(`upsolve-i{1,2}t*.vercel.app`) and our own `*.hnuicpc.tech`, HTTPS only.

### 5. HIGH — Missing input validation
**Was:** Contact endpoint typed its body as an interface (so `ValidationPipe`
did nothing — no length/email checks). Admin role/batch/reply bodies were raw
inline types.
**Now:** `SendContactDto` (`@IsEmail`, `@MaxLength`), `UpdateRoleDto`
(`@IsIn(['admin','user'])`, `@IsMongoId`), `SyncBatchDto`
(`@IsMongoId({each})`, `@ArrayMaxSize(500)`), `ReplyMessageDto`.

### 6. HIGH — Mail header injection
**Was:** User `name`/`email`/`subject` interpolated into `From`/`Reply-To`/
`Subject`.
**Now:** `headerSafe()` strips CR/LF from all header-bound fields (HTML body
escaping via `esc()` was already present).

### 7. MED — Endpoints with no rate limit
**Was:** Only ~9 hand-listed routes were throttled.
**Now:** Guard returns a broad default (120 req/min/IP) for any unlisted route,
so nothing is completely unthrottled. Specific routes keep their tighter limits.

### 8. MED — Env validation didn't match code
**Was:** Schema validated `EMAIL_HOST/USER/PASS/FROM`; the app actually reads
`SMTP_EMAIL`/`SMTP_PASSWORD`. Email config was effectively unvalidated.
**Now:** Schema validates `SMTP_EMAIL`, `SMTP_PASSWORD`, `CODEFORCES_API_KEY`,
`CODEFORCES_API_SECRET` — the vars the code and `.env` actually use.

### 9. MED — `listUsers` unbounded
**Was:** Default `limit=0` returned the entire users collection.
**Now:** Controller defaults to 100 (max 5000); service caps even the
explicit "all" path at 5000.

### 10. MED — Docker container hardening
**Was:** Ran as **root**; final image copied the whole `/app` including dev
dependencies and source.
**Now:** `npm prune --omit=dev` before the final stage; copies only
`dist` + prod `node_modules` + `package.json`; runs as `USER node`.

### 11. MED — N+1 writes in batch rating sync
**Was:** `syncBatchUserRatings` did one `findByIdAndUpdate` + one `logAction`
per user (2N round-trips).
**Now:** A single `bulkWrite` for updates and a single `insertMany` for audit
logs (new `AuditLogsService.logActions`).

### 12–16. LOW / hardening
- Removed the custom `LoggingMiddleware` (duplicated `nestjs-pino`; used
  `Math.random` IDs and monkey-patched `res.send`).
- Refresh-token **reuse detection**: replaying an already-rotated token now
  revokes the whole token family for that user.
- `express.json`/`urlencoded` bounded to **100 kb**.
- Login lookup uses **collation** (`en`, strength 2) to match the
  case-insensitive unique index — prevents login failing on case variance.
- `.env` permissions tightened to **600** (was world-readable `755`).

---

## Verification
- `npm run build` — clean.
- `npm test` — **6 suites, 29 tests, all passing** (two `login` spec mocks
  updated for the new collation chain).

---

## Deferred — needs infrastructure (not applied)

These are real and worth doing, but require provisioning and a new dependency,
so they were **not** silently changed:

1. **Distributed rate limiting (MED).** Limiters use `RateLimiterMemory`. With
   Fly `min_machines_running=0` + autoscaling, counters are per-instance and
   reset on restart. `REDIS_URL` is defined but unused, and no Redis client is
   installed. **Recommendation:** add `ioredis`, provision Redis, switch to
   `RateLimiterRedis` (already available in `rate-limiter-flexible`).

2. **CSRF (MED).** Because the frontend and API are on different domains,
   cookies use `sameSite:'none'`, which keeps some CSRF surface. The narrowed
   CORS (Fix #4) mitigates it. **Recommendation:** for mutations, prefer the
   `Authorization` header over cookies, or add CSRF tokens.

## Suggested follow-ups (low priority)
- User enumeration: `initiate-reset` returns "User not found" vs generic. Make
  responses uniform if enumeration is a concern.
- Consider raising bcrypt cost from 10 → 12.
