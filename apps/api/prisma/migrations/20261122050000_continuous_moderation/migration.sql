-- CreateTable
CREATE TABLE `moderation_work_session` (
    `id` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `attendanceSessionId` VARCHAR(191) NULL,
    `activeKey` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'ENDED', 'INTERRUPTED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `endReason` VARCHAR(100) NULL,
    `casesCompleted` INTEGER NOT NULL DEFAULT 0,
    `submitAndLeaveCount` INTEGER NOT NULL DEFAULT 0,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `moderation_work_session_activeKey_key`(`activeKey`),
    INDEX `moderation_work_session_moderatorId_startedAt_idx`(`moderatorId`, `startedAt`),
    INDEX `moderation_work_session_queueId_status_idx`(`queueId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_case_reservation` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'COMPLETED', 'RELEASED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `activeCaseKey` VARCHAR(191) NULL,
    `activeModeratorKey` VARCHAR(191) NULL,
    `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseExpiresAt` DATETIME(3) NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `releaseReason` VARCHAR(255) NULL,

    UNIQUE INDEX `moderation_case_reservation_activeCaseKey_key`(`activeCaseKey`),
    UNIQUE INDEX `moderation_case_reservation_activeModeratorKey_key`(`activeModeratorKey`),
    INDEX `moderation_case_reservation_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `moderation_case_reservation_moderatorId_status_idx`(`moderatorId`, `status`),
    INDEX `moderation_case_reservation_queueId_status_idx`(`queueId`, `status`),
    INDEX `moderation_case_reservation_leaseExpiresAt_idx`(`leaseExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_decision_version` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `moderatorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `evidenceIds` JSON NOT NULL,
    `answers` JSON NOT NULL,
    `policyVersion` INTEGER NOT NULL DEFAULT 1,
    `effective` BOOLEAN NOT NULL DEFAULT true,
    `qaEligible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `moderation_decision_version_caseId_version_idx`(`caseId`, `version`),
    INDEX `moderation_decision_version_moderatorId_createdAt_idx`(`moderatorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_handling_record` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `decisionVersionId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL,
    `durationSeconds` INTEGER NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `actionType` VARCHAR(50) NULL,
    `isSubmitAndLeave` BOOLEAN NOT NULL DEFAULT false,
    `isRemoderation` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `case_handling_record_reservationId_key`(`reservationId`),
    UNIQUE INDEX `case_handling_record_decisionVersionId_key`(`decisionVersionId`),
    INDEX `case_handling_record_moderatorId_submittedAt_idx`(`moderatorId`, `submittedAt`),
    INDEX `case_handling_record_queueId_submittedAt_idx`(`queueId`, `submittedAt`),
    INDEX `case_handling_record_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `moderation_work_session` ADD CONSTRAINT `moderation_work_session_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `moderation_work_session` ADD CONSTRAINT `moderation_work_session_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `moderation_work_session` ADD CONSTRAINT `moderation_work_session_attendanceSessionId_fkey` FOREIGN KEY (`attendanceSessionId`) REFERENCES `attendance_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `moderation_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `moderation_work_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_decision_version` ADD CONSTRAINT `moderation_decision_version_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `moderation_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `moderation_decision_version` ADD CONSTRAINT `moderation_decision_version_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `moderation_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `moderation_work_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `moderation_case_reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `case_handling_record` ADD CONSTRAINT `case_handling_record_decisionVersionId_fkey` FOREIGN KEY (`decisionVersionId`) REFERENCES `moderation_decision_version`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Check Constraints
ALTER TABLE `moderation_work_session` ADD CONSTRAINT `moderation_work_session_lifecycle_check` CHECK ((`endedAt` IS NULL AND `activeKey` IS NOT NULL AND `status` = 'ACTIVE') OR (`endedAt` IS NOT NULL AND `endedAt` >= `startedAt` AND `activeKey` IS NULL AND `status` != 'ACTIVE'));
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_lifecycle_check` CHECK ((`status` = 'ACTIVE' AND `activeCaseKey` IS NOT NULL AND `activeModeratorKey` IS NOT NULL AND `releasedAt` IS NULL) OR (`status` != 'ACTIVE' AND `activeCaseKey` IS NULL AND `activeModeratorKey` IS NULL));
