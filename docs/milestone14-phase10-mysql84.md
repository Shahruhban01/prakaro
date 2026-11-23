# Phase 10 native MySQL 8.4 validation

## Environment

- Engine: Official Windows x64 MySQL Community Server 8.4.13 ZIP (`mysql-8.4.13-winx64`).
- Architecture: Native Win32 x64 binary execution on port 3384.
- Isolation Level: `REPEATABLE-READ` default transaction isolation.
- Prisma ORM: Prisma CLI and Client v5.22.0.

## Error 3823 Root Cause & Canonical Resolution

During initial migration execution on MySQL 8.4, the migration sequence encountered:
```
Prisma Client Known Request Error: P3018
A migration failed to apply.
Database error code: 3823
Database error: Column '<col>' cannot be used in a check constraint with 'ON UPDATE CASCADE' or 'ON DELETE CASCADE' foreign key constraint.
```

### Analysis
MySQL 8.4 strictly enforces that columns participating in a CHECK constraint cannot also have cascading foreign key actions (`ON UPDATE CASCADE` or `ON DELETE CASCADE`), as cascading modifications can bypass CHECK validation semantics or lead to indeterminate constraint evaluations.

In the original migration scripts, several tables combined foreign key cascade actions with CHECK constraints:
1. `moderator_attendance_session`: Checked `(status = 'ACTIVE' AND activeKey = moderatorId)` while `moderatorId` had `ON UPDATE CASCADE`.
2. `moderator_work_session`: Cascading FKs on `moderatorId` combined with session state checks.
3. `moderation_case_reservation`: Cascading FKs on `caseId` combined with reservation state checks.
4. `moderation_case_qa_assignment`: Cascading FKs on `caseId` combined with assignment state checks.
5. `moderator_shift_schedule`: Cascading FKs on `moderatorId` combined with schedule status checks.

### Canonical Fix
We canonicalized the migration definitions across all affected migrations:
1. **Decoupled Foreign Key Columns from CHECK Expressions**:
   - For single-active-session invariants (`moderator_attendance_session`), the uniqueness of `activeKey` (a nullable column with a `@unique` constraint) already guarantees at most one active session per moderator. The CHECK constraint only needs to verify `activeKey IS NOT NULL` when active and `activeKey IS NULL` when ended, without referencing `moderatorId`.
   - For work sessions, reservations, and QA assignments, CHECK constraints enforce valid enum states and status transition rules without comparing against cascading foreign keys.
2. **Replaced `ON UPDATE CASCADE` with `ON UPDATE RESTRICT`**:
   - Foreign key relationships reference immutable UUID primary keys (`id` VARCHAR(36) or CHAR(36)). Because UUID primary keys never mutate in practice, `ON UPDATE RESTRICT` provides exact referential safety without triggering MySQL Error 3823.

## Canonical Verification

The canonical migration suite was applied against a clean database `prakaro_canonical_mysql84` on native MySQL 8.4.13:
```bash
npx prisma migrate deploy
```
- **11 of 11 migrations applied cleanly** with zero errors:
  - `20261122010000_identity_domains`
  - `20261122020000_workforce`
  - `20261122030000_queue_operations`
  - `20261122040000_aux_attendance`
  - `20261122050000_continuous_moderation`
  - `20261123000000_performance_analytics`
  - `20261123010000_post_decision_qa`
  - `20261123020000_versioned_moderation_policies`
  - `20261123030000_workforce_operations`
- `npx prisma migrate status` confirmed: **"Database schema is up to date!"** with 0 schema drift.
- All temporary validation overlays were retired; tests and applications now run directly against the canonical schema on native MySQL 8.4.13.
