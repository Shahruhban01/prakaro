# Phase 10 test evidence & regression results

## Executive Summary

Complete regression testing has been executed across all layers of the Prakaro monorepo: Node.js/Fastify API, React Moderation Console, Flutter Mobile Application, native MySQL 8.4 schema, and production security probes.

All tests passed with zero failures.

## Test Results by Subsystem

| Subsystem | Suite / Command | Total Tests | Pass | Fail | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| **API Backend** | `npm --prefix apps/api test` | 135 | 135 | 0 | 28 suites, 100% pass on native MySQL 8.4.13 |
| **Moderation Console** | `npm --prefix apps/moderation test` | 58 | 58 | 0 | 12 Vitest suites, component & route guards |
| **Console Production Build** | `npm --prefix apps/moderation run build` | — | PASS | 0 | `tsc --noEmit && vite build` clean exit code 0 |
| **Mobile Flutter App** | `flutter test` (apps/mobile) | 125 | 125 | 0 | All unit, widget, and domain tests pass |
| **Mobile Static Analysis** | `flutter analyze apps/mobile` | — | PASS | 0 | No issues found! (ran in 16.7s) |
| **API Static Analysis** | `npm --prefix apps/api run lint` | — | PASS | 0 | ESLint passed with 0 errors |
| **Production Security Smoke**| `scripts/production-security-smoke.ts` | 6 | 6 | 0 | Readiness, HSTS, no-store, staff cookies, auth throttle |
| **Dependency Security Audit**| `npm audit` (API & Console) | 0 | 0 | 0 | 0 vulnerabilities found in both lockfiles |
| **Database Migrations** | `npx prisma migrate deploy` | 11 | 11 | 0 | Canonical replay on MySQL 8.4.13 with 0 drift |
| **Database Backup & Recovery**| `mysqldump` & `mysql source` | 60 tables | 60 | 0 | All tables and 2 triggers restored with 0 errors |

## Detailed Verification Run Logs

### 1. Backend API Regressions (135/135 Passed)
```bash
> prakaro-api@0.1.0 test
> tsx --import ./tests/setup-env.mjs --test --test-concurrency=1 tests/health.test.ts ... tests/operations.test.ts

# tests 135
# suites 28
# pass 135
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
Verified strict separate identity domains (`users`, `super_admins`, `moderators`), atomic reservations, strict uniform random allocation, AHT strictly in seconds, post-decision QA sampling, durable policy history, and workforce tenant boundaries.

### 2. Frontend Web Console (58/58 Passed)
```bash
> vitest run
✓ 12 test files passed (58 tests)
```
Verified layout guards, global AUX controls, active reservation lockouts, queue routing, and policy version management.

### 3. Mobile Flutter Application (125/125 Passed)
```bash
> flutter test
All tests passed! (125/125 passed in 22s)
```
Verified Google Places compliance, parking verification badge indicators, offline resilience, and search radius filters.

### 4. Production Security Smoke
```bash
Native readiness, HSTS, no-store, secure staff cookies and production auth throttle passed.
```
Verified production config assertions: HTTPS URL enforcement, non-root database credentials, rate limiting (429 `RATE_LIMIT_EXCEEDED` on excessive attempts), HSTS headers, and cache prevention headers.
