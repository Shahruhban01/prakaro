# Milestone 14 Phase 4: Database Schema & Migration Specification

## 1. Migration Overview

Migration: `20261122050000_continuous_moderation`
Location: `apps/api/prisma/migrations/20261122050000_continuous_moderation/migration.sql`

This migration provisions the high-concurrency reservation and session tables while preserving zero schema drift against prior identity, workforce, and queue migrations.

---

## 2. Table Definitions & Constraints

### 2.1 `moderation_work_session`
Tracks moderator work sessions scoped to a queue:
```sql
CREATE TABLE `moderation_work_session` (
  `id` VARCHAR(191) NOT NULL,
  `queueId` VARCHAR(191) NOT NULL,
  `moderatorId` VARCHAR(191) NOT NULL,
  `attendanceSessionId` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,
  `endReason` VARCHAR(191) NULL,
  `casesCompleted` INTEGER NOT NULL DEFAULT 0,
  `submitAndLeaveCount` INTEGER NOT NULL DEFAULT 0,
  `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activeKey` VARCHAR(191) NULL,

  UNIQUE INDEX `moderation_work_session_activeKey_key`(`activeKey`),
  INDEX `moderation_work_session_queueId_status_idx`(`queueId`, `status`),
  INDEX `moderation_work_session_moderatorId_status_idx`(`moderatorId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
- `activeKey`: Unique nullable column set to `moderatorId` when `status = 'ACTIVE'`, and `NULL` when `ENDED`. Ensures a moderator cannot hold multiple active continuous sessions across queues.

---

### 2.2 `moderation_case_reservation`
Guarantees atomic, non-overlapping case assignments:
```sql
CREATE TABLE `moderation_case_reservation` (
  `id` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `moderatorId` VARCHAR(191) NOT NULL,
  `queueId` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'COMPLETED', 'RELEASED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseExpiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `activeCaseKey` VARCHAR(191) NULL,
  `activeModeratorKey` VARCHAR(191) NULL,

  UNIQUE INDEX `moderation_case_reservation_activeCaseKey_key`(`activeCaseKey`),
  UNIQUE INDEX `moderation_case_reservation_activeModeratorKey_key`(`activeModeratorKey`),
  INDEX `moderation_case_reservation_queueId_status_leaseExpiresAt_idx`(`queueId`, `status`, `leaseExpiresAt`),
  INDEX `moderation_case_reservation_sessionId_status_idx`(`sessionId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
- `activeCaseKey`: Unique nullable column set to `caseId` when `status = 'ACTIVE'`, and `NULL` upon completion/release/expiration.
- `activeModeratorKey`: Unique nullable column set to `moderatorId` when `status = 'ACTIVE'`, and `NULL` upon completion/release/expiration.

---

### 2.3 `case_handling_record`
Captures server-authoritative handling intervals strictly in seconds:
```sql
CREATE TABLE `case_handling_record` (
  `id` VARCHAR(191) NOT NULL,
  `reservationId` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `queueId` VARCHAR(191) NOT NULL,
  `moderatorId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `durationSeconds` INTEGER NOT NULL,
  `outcome` VARCHAR(191) NOT NULL,
  `isSubmitAndLeave` BOOLEAN NOT NULL DEFAULT false,
  `startedAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `case_handling_record_reservationId_key`(`reservationId`),
  INDEX `case_handling_record_queueId_createdAt_idx`(`queueId`, `createdAt`),
  INDEX `case_handling_record_moderatorId_createdAt_idx`(`moderatorId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

### 2.4 `moderation_decision_version`
Stores immutable versioned review submissions:
```sql
CREATE TABLE `moderation_decision_version` (
  `id` VARCHAR(191) NOT NULL,
  `caseId` VARCHAR(191) NOT NULL,
  `reservationId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `evidenceIds` JSON NOT NULL,
  `answers` JSON NOT NULL,
  `moderatorId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `moderation_decision_version_caseId_version_key`(`caseId`, `version`),
  INDEX `moderation_decision_version_caseId_idx`(`caseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 3. CHECK Constraints (MySQL 8.4)
Enforces database-level state validation:
```sql
ALTER TABLE `moderation_case_reservation`
  ADD CONSTRAINT `chk_reservation_active_keys`
  CHECK (
    (status = 'ACTIVE' AND activeCaseKey IS NOT NULL AND activeModeratorKey IS NOT NULL) OR
    (status != 'ACTIVE' AND activeCaseKey IS NULL AND activeModeratorKey IS NULL)
  );

ALTER TABLE `moderation_work_session`
  ADD CONSTRAINT `chk_session_active_key`
  CHECK (
    (status = 'ACTIVE' AND activeKey IS NOT NULL) OR
    (status != 'ACTIVE' AND activeKey IS NULL)
  );
```
