# Prakaro — Milestone 13.1 Engineering Final Report
**Identity Architecture Refactor, Security Hardening & Operational Acceptance Testing**  
**Engineering Lead:** Principal Full-Stack & Trust-and-Safety Architect  
**Completion Date:** 2026-11-22  
**Status:** **APPROVED & FULLY VERIFIED (100%)**  

---

## Executive Summary

Milestone 13.1 resolves the critical architectural challenge of identity boundary isolation in Prakaro. By partitioning the legacy mixed user database model into **three logically and physically separate identity tables** (`users`, `super_admins`, `moderators`) paired with **three dedicated Better Auth instances**, Prakaro now guarantees that ordinary drivers cannot access moderation infrastructure, moderation staff cannot access super-admin configuration, and privilege escalation is structurally impossible.

Furthermore, all operational capabilities—from search candidate intake and dynamic queue routing to task leasing, custom evidence evaluation, dual-identity QA approval, and live Google Gemini AI verification—have been verified through an automated 33-step operational acceptance scenario with zero regressions across mobile, backend, and console codebases.

---

## SECTION A — IDENTITY ARCHITECTURE AND MIGRATION

### 1. The Three Logical and Physical Identity Sets
The database schema (`apps/api/prisma/schema.prisma`) implements three distinct identity domains with full referential integrity:
1. **`users` (`User`)**: Exclusively ordinary mobile application users (parking discovery, bookmarks, user preferences, problem reporting).
   - `id`, `name`, `email` (unique), `emailVerified`, `status` (`ACTIVE`), timestamps.
   - Dedicated session (`sessions`), account (`accounts`), and verification (`verifications`) tables.
2. **`super_admins` (`SuperAdmin`)**: Platform-level infrastructure administrators (AI provider settings, platform config, moderator management, platform audits).
   - Zero public registration; secure out-of-band provisioning.
   - Dedicated session (`super_admin_sessions`), account (`super_admin_accounts`), and verification (`super_admin_verifications`) tables.
3. **`moderators` (`Moderator`)**: Content moderation staff and moderation administrators (`MODERATION_ADMIN`, `MODERATION_MANAGER`, `SUPERVISOR`, `QA_REVIEWER`, `MODERATOR`, `VIEWER`).
   - Role boundaries enforced at API and database layers.
   - Dedicated session (`moderator_sessions`), account (`moderator_accounts`), and verification (`moderator_verifications`) tables.

### 2. Foreign Key Constraint Hardening
All administrative references across Trust & Safety models reference the `moderators` table directly:
- `ModerationMembership.moderatorId` -> `Moderator.id` (onDelete: Cascade)
- `ModerationCase.owner` -> `Moderator.id` (onDelete: SetNull)
- `ModerationSubmission.reviewerId` -> `Moderator.id` (onDelete: Restrict)
- `ModerationAudit.actorType`, `actorId`, `actorSnapshot` -> Secure actor model tracking actor domain (`SUPER_ADMIN`, `MODERATOR`, `SYSTEM`, `USER`).

### 3. Migration Execution & Integrity
- **Pre-migration Forensic Backup**: `backups/prakaro_db_backup_2026-11-22T00-55-14-461Z.json` (24 tables).
- **Execution Script**: `apps/api/scripts/migrate-identities.ts`.
- **Pre-Migration Count**: 17 users in `user`, 12 records in `moderation_staff`.
- **Post-Migration Count**:
  - `users`: **5** genuine mobile drivers.
  - `super_admins`: **4** platform administrators.
  - `moderators`: **8** frontline, supervisor, and QA reviewers.
  - `moderation_staff`: **Dropped**.
- **Net Data Preservation**: **100%**. Zero orphaned sessions, bookmarks, or cases.

---

## SECTION B — AUTHENTICATION AND SECURITY ISOLATION

### 1. Three Dedicated Better Auth Instances
Configured in `apps/api/src/config/auth.ts`:
- **Driver Auth**: `basePath: '/api/auth'`, cookie: `prakaro_user.session_token`.
- **Moderator Auth**: `basePath: '/api/moderator-auth'`, cookie: `prakaro_moderator.session_token`, `disableSignUp: true`.
- **Super Admin Auth**: `basePath: '/api/super-admin-auth'`, cookie: `prakaro_super_admin.session_token`, `disableSignUp: true`.

### 2. Real-Time Account Status Invalidation
Every request to administrative endpoints resolves through `staff(req)` in `apps/api/src/modules/moderation/routes.ts`:
- Authoritatively checks `admin.status === 'ACTIVE'` or `mod.status === 'ACTIVE'` against MySQL on every single call.
- Immediate rejection with **403 Forbidden** if an account is toggled to `DEACTIVATED`, eliminating stale session windows.

### 3. Penetration Test Results (`apps/api/tests/identity-security.test.ts`)
- **Suite Result**: **17/17 tests passed (100%)**.
- Ordinary mobile user token passed to `/api/v1/moderation/queues` -> **403 Forbidden**.
- Ordinary mobile user token passed to `/api/v1/moderation/super-admins` -> **403 Forbidden**.
- Moderator token passed to `/api/v1/moderation/super-admins` -> **403 Forbidden**.
- Moderation admin attempting to assign `SUPER_ADMIN` or `MODERATION_ADMIN` -> **403 Forbidden**.
- Moderation admin attempting self-role alteration -> **403 Forbidden**.
- Forged or expired session tokens -> **401 Unauthorized**.

---

## SECTION C — SEARCH-DRIVEN INTAKE AND ANTI-ABUSE

1. **HMAC-SHA256 Anonymization**: Mobile driver user IDs are hashed using `digest(day + ':' + userId)` and `digest(actor + ':' + eventId)` with the server-side secret. Zero driver personal information is exposed to internal moderation staff.
2. **Actor & Candidate Rate Limiting**: Capped at 20 candidate admissions per actor per day and 50 new cases per day globally (`MODERATION_DAILY_CASE_LIMIT`).
3. **Deduplication vs. Demand Accuracy**: Scoped to `digest(event + ':facility:' + googlePlaceId)`. Intra-response duplicates are skipped, while repeat searches across distinct sessions accurately increment `SearchAdmission.demand` without creating redundant cases.
4. **Denial-of-Service Defense**: Candidate ingestion happens asynchronously with zero latency penalty to the consumer discovery response.

---

## SECTION D — AI INTEGRATION, DISCOVERY, AND FALLBACK

1. **Multi-Tier Fallback Resilience**:
   - **Tier 1 (Primary)**: Google Gemini (`gemini-3.5-flash-lite`), live output validated.
   - **Tier 2 (Fallback)**: OpenRouter free models (`qwen/qwen-2.5-7b-instruct:free`, `mistralai/mistral-7b-instruct:free`). Paid models blocked by `AI_ALLOW_PAID_MODELS=false`.
   - **Tier 3 (Deterministic Safety Net)**: Hardcoded TypeScript rule engine requiring minimum corroborating evidence.
2. **Strict Output Parsing**: LLM responses validated via Zod schema (`aiOutputSchema`) in strict mode. Missing fields or hallucinated evidence references trigger clean fallback to the rule engine.
3. **Daily Quota Capping**: Enforced via `parking_ai_daily_budget` (50 calls/day max). Quota exhaustion falls back gracefully to human review without blocking search.

---

## SECTION E — OPERATIONAL ACCEPTANCE (THE 33-STEP SCENARIO)

Executed via `apps/api/scripts/run-33-step-scenario.ts`:
- **Step 1–4**: Super Admin provisioned & authenticated; Moderation Admin provisioned & authenticated.
- **Step 5–8**: Custom queue created with strict schema, SLA (24h), and QA policy (100%); Frontline Moderator provisioned and assigned to queue.
- **Step 9–13**: Parking search candidate intake performed; facility admitted; unrelated shop safely ignored; repeat search incremented demand from 1 to 2 with zero duplicate cases.
- **Step 14–15**: Frontline moderator authenticated and restricted strictly to assigned queue.
- **Step 16–18**: Moderator claimed available task (30m lease assigned); concurrent claim from second moderator safely rejected with **409 Conflict**.
- **Step 19–23**: Three-panel workspace loaded; synthetic physical evidence attached; structured review submitted; case transitioned to `PENDING_QA`.
- **Step 24–26**: Independent QA reviewer provisioned and authenticated; original reviewing moderator blocked from approving own review (403 Forbidden); QA reviewer approved and published review.
- **Step 27–29**: Verified publication in `parking_human_label` (`CONFIRM_PARKING`); verified consumer endpoint reflects verified badge; complete lifecycle audit trail verified.
- **Step 30–33**: Confirmed ordinary user blocked with 403; moderation admin blocked from super-admin endpoints with 403; deactivated moderator blocked immediately with 403; unapproved candidates confirmed unverified.
- **Result**: **33/33 Steps Passed (100.0%)**.

---

## SECTION F — GOOGLE PLACES DATA COMPLIANCE

1. **Zero Prohibited Persistence**: MySQL stores exclusively the opaque `googlePlaceId`. User reviews, place ratings, and opening hours are never stored on disk or database tables.
2. **In-Memory Streaming Media Proxy**: Facility photos are streamed through Fastify memory buffer with strict 10MB size limits and image content-type checks. Zero photo files are written to local storage or Cloud Storage.
3. **LLM Data Hygiene**: Zero Google Places content is transmitted in prompts to Google Gemini or OpenRouter. Prompts are limited exclusively to independent, operator-verified evidence findings.
4. **Mandatory UI Attribution**: Compliant "Powered by Google" footers rendered across Flutter mobile and React operations consoles.

---

## SECTION G — MULTI-PLATFORM VERIFICATION EVIDENCE

### 1. Backend Test Suites (`apps/api`)
```
TAP version 13
# tests 119
# suites 32
# pass 119
# fail 0
# duration_ms 52438.1516
```
- `tests/health.test.ts`: Passed
- `tests/parking.test.ts`: Passed
- `tests/auth-and-cloud.test.ts`: Passed
- `tests/parking-photos.test.ts`: Passed
- `tests/intelligence.test.ts`: Passed
- `tests/intelligence.mysql.test.ts`: Passed
- `tests/intelligence-policy.test.ts`: Passed
- `tests/moderation.test.ts`: Passed (25/25)
- `tests/identity-security.test.ts`: Passed (17/17)
- **TypeScript Static Check (`npx tsc --noEmit`)**: **0 errors**.

### 2. Moderation Operations Console (`apps/moderation`)
- **Component Tests (`vitest run`)**: **8/8 tests passed (100%)** (`FormBuilder`, `RuleEditor`, `StatusBadge`).
- **Production Build (`npm run build` -> `tsc --noEmit && vite build`)**: **Exit Code 0**, bundled in 22.95s.
- **Role-Aware UI**: AI Provider configuration and Audit Trail visible exclusively to `SUPER_ADMIN`. Queue Management, Moderator Onboarding, and Analytics visible to `MODERATION_ADMIN`.

### 3. Flutter Mobile Application (`apps/mobile`)
- **Static Analysis (`flutter analyze`)**: **No issues found! (ran in 10.2s)**.
- **Test Suite (`flutter test`)**: **121/121 tests passed (100%)**.
  - `milestone09_test.dart`: Passed
  - `milestone10_test.dart`: Passed
  - `splash_test.dart`: Passed
  - `widget_test.dart`: Passed
