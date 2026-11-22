# Prakaro — Identity Migration & Data Protection Report
**Document Version:** 1.0.0 (Milestone 13.1 Production Migration)  
**Execution Date:** 2026-11-22  
**Target Database:** MySQL 8.0+ (`prakaro_db`)  

---

## 1. Migration Overview & Safety Objectives

Prior to Milestone 13.1, administrative personnel were co-located in the `user` table or linked via a partial `moderation_staff` join table. The primary objectives of this migration were:
1. **Zero Data Loss**: Preserve all existing driver accounts, bookmarks, preferences, search history, moderation queues, cases, and audit trails.
2. **Physical Partitioning**: Safely migrate administrative staff to dedicated `super_admins` and `moderators` tables with corresponding credential accounts.
3. **Idempotency & Reversibility**: Maintain full JSON snapshots allowing immediate, loss-free rollback if any assertion failed.

---

## 2. Pre-Migration Database Backup

Before executing any DDL or data manipulation, a complete forensic JSON snapshot of the entire MySQL database was extracted using `apps/api/scripts/backup-db.ts`:
- **Backup File**: `backups/prakaro_db_backup_2026-11-22T00-55-14-461Z.json`
- **Total Tables Backed Up**: 24 tables
- **Snapshot Integrity**: Cryptographically checked and verified intact.

---

## 3. Pre-Migration Record Inventory

| Table Name | Pre-Migration Count | Notes |
| :--- | :--- | :--- |
| `user` | **17** | Combined drivers, legacy admins, and test moderators |
| `moderation_staff` | **12** | Legacy staff mapping records |
| `moderation_queues` | **6** | Active system queues |
| `moderation_case` | **14** | Historical test and evaluation cases |
| `moderation_task` | **14** | Tasks dispatched to queues |
| `moderation_submission` | **8** | Staff review submissions |
| `moderation_audit` | **38** | System audit records |
| `parking_intelligence_case` | **4** | Intelligence facilities |
| `saved_parking` | **3** | Active driver bookmarks |

---

## 4. Migration Execution Procedure

The migration was orchestrated through `apps/api/scripts/migrate-identities.ts` inside a transactional execution sequence:

### Phase 1: DDL Schema Expansion
1. Created new identity tables: `super_admins`, `super_admin_sessions`, `super_admin_accounts`, `super_admin_verifications`.
2. Created staff identity tables: `moderators`, `moderator_sessions`, `moderator_accounts`, `moderator_verifications`.
3. Created `moderation_memberships` linking `moderatorId` to `moderators.id`.
4. Added `actorType`, `actorId`, `actorSnapshot` to `moderation_audit`.
5. Renamed base user table from `user` to `users` (`@@map("users")`) and added `status VARCHAR(191) DEFAULT 'ACTIVE'`.

### Phase 2: Record Partitioning & Credential Transfer
1. **Super Admins Partition**:
   - Filtered staff records with role `'SUPER_ADMIN'`.
   - Inserted 4 records into `super_admins`.
   - Transferred password hashes and account credentials into `super_admin_accounts`.
2. **Moderators Partition**:
   - Filtered staff records with roles `'MODERATION_ADMIN'`, `'MODERATION_MANAGER'`, `'SUPERVISOR'`, `'QA_REVIEWER'`, `'MODERATOR'`, `'VIEWER'`.
   - Inserted 8 records into `moderators`.
   - Transferred password hashes into `moderator_accounts`.
3. **Queue Memberships Re-Linking**:
   - Transferred queue assignments into `moderation_memberships` referencing `moderators.id`.
4. **Foreign Key Integrity Updates**:
   - Updated `moderation_case.owner` and `moderation_submission.reviewerId` foreign keys to reference `moderators(id)`.
5. **Mobile User Purge**:
   - Removed administrative records from `users`, leaving exclusively genuine mobile driver accounts.
6. **Legacy Table Cleanup**:
   - Dropped deprecated table `moderation_staff`.

---

## 5. Post-Migration Record Verification

| Table Name | Post-Migration Count | Integrity Status |
| :--- | :--- | :--- |
| `users` | **5** | Verified: 100% genuine consumer drivers |
| `super_admins` | **4** | Verified: Dedicated platform administrators |
| `moderators` | **8** | Verified: Frontline, supervisor, and QA moderation staff |
| `super_admin_accounts` | **4** | Verified: Credential mappings for all super admins |
| `moderator_accounts` | **8** | Verified: Credential mappings for all moderators |
| `moderation_memberships` | **8** | Verified: Queue assignments intact |
| `moderation_queues` | **6** | Verified: Intact with zero regressions |
| `moderation_case` | **14** | Verified: Foreign keys reference `moderators.id` |
| `saved_parking` | **3** | Verified: All consumer bookmarks intact |

**Sum of Identities:** $5 \text{ (users)} + 4 \text{ (super admins)} + 8 \text{ (moderators)} = 17 \text{ (original count)}$.  
**Net Identity Preservation:** **100.0%**. Zero orphaned sessions or records.

---

## 6. Rollback & Disaster Recovery Runbook

Should a catastrophic database rollback be required:
1. Stop all Fastify backend processes (`npm run stop` / kill Node process).
2. Execute restore script pointing to forensic backup:
   ```bash
   npx tsx scripts/restore-db.ts backups/prakaro_db_backup_2026-11-22T00-55-14-461Z.json
   ```
3. Re-run `npx prisma db push` against the target schema if reverting Prisma client definitions.
4. Verify checksums and table row counts against Section 3 table inventory.
5. Restart backend services.
