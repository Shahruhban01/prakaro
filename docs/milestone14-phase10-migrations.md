# Phase 10 migration verification & safety

## Verification Process

Canonical migration verification is performed using:
```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```
These commands run from `apps/api` with dedicated credentials pointing to an isolated native MySQL 8.4 instance.

## Resolved Referential & Check Constraint Invariants

### Problem Resolution (MySQL Error 3823)
In native MySQL 8.4.13, attempting to define a CHECK constraint on columns governed by `ON UPDATE CASCADE` or `ON DELETE CASCADE` yields error 3823.

To guarantee deterministic, production-grade schema enforcement across MySQL 8.4:
1. **Immutable UUID References**:
   All entity references (`moderatorId`, `caseId`, `sessionId`, `ruleId`, `policyId`) point to UUIDs generated at insertion. Since primary keys never update, `ON UPDATE RESTRICT` replaces `ON UPDATE CASCADE`.
2. **Decoupled Constraint Semantics**:
   - `moderator_attendance_session`: Single-active session is enforced by `activeKey VARCHAR(64) UNIQUE` where active sessions set `activeKey = moderatorId` and ended sessions set `activeKey = NULL`. The CHECK constraint verifies `(status = 'ACTIVE' AND activeKey IS NOT NULL) OR (status = 'ENDED' AND activeKey IS NULL)`.
   - `moderation_case_reservation`: Lease and completion invariants enforce valid enum statuses, server-authoritative timestamps, and release conditions without coupling to cascading FK updates.
   - `moderation_case_qa_assignment`: QA assignment statuses (`ASSIGNED`, `COMPLETED`, `DISPUTED`, `EXPIRED`) and review records enforce required field combinations cleanly.
   - `workforce_alert_rule` and `moderator_shift_schedule`: Lifecycle states and thresholds maintain data integrity without constraint conflicts.

## Verification Checklist & Results

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| `prisma validate` | Valid schema | Valid schema | PASS |
| `prisma generate` | Types regenerated | Types regenerated | PASS |
| `prisma migrate deploy` | 11 migrations applied | 11 migrations applied | PASS |
| `prisma migrate status` | Up to date, 0 drift | Database schema is up to date | PASS |
| Triggers defined | 2 triggers | 2 triggers active | PASS |
| Referential integrity | 92 foreign keys | 92 foreign keys enforced | PASS |
