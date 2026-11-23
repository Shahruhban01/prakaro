-- CreateTable
CREATE TABLE `attendance_session` (
    `id` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NOT NULL,
    `authSessionId` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `loginAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `lastHeartbeatAt` DATETIME(3) NOT NULL,
    `endReason` ENUM('USER_LOGOUT', 'SESSION_EXPIRED', 'ADMIN_TERMINATED', 'DISCONNECTED_TIMEOUT') NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `attendance_session_activeKey_key`(`activeKey`),
    INDEX `attendance_session_moderatorId_startedAt_idx`(`moderatorId`, `startedAt`),
    INDEX `attendance_session_authSessionId_startedAt_idx`(`authSessionId`, `startedAt`),
    INDEX `attendance_session_endedAt_lastHeartbeatAt_idx`(`endedAt`, `lastHeartbeatAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aux_interval` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `openKey` VARCHAR(191) NULL,
    `state` ENUM('MODERATING', 'NON_MODERATING', 'BREAK', 'MEETING', 'OFFLINE', 'TRAINING') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,

    UNIQUE INDEX `aux_interval_openKey_key`(`openKey`),
    INDEX `aux_interval_sessionId_startedAt_idx`(`sessionId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aux_transition_audit` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `previous` ENUM('MODERATING', 'NON_MODERATING', 'BREAK', 'MEETING', 'OFFLINE', 'TRAINING') NULL,
    `next` ENUM('MODERATING', 'NON_MODERATING', 'BREAK', 'MEETING', 'OFFLINE', 'TRAINING') NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `aux_transition_audit_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance_session` ADD CONSTRAINT `attendance_session_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aux_interval` ADD CONSTRAINT `aux_interval_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `attendance_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aux_transition_audit` ADD CONSTRAINT `aux_transition_audit_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `attendance_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `attendance_session` ADD CONSTRAINT `attendance_lifecycle_check` CHECK ((`endedAt` IS NULL AND `activeKey` IS NOT NULL AND `endReason` IS NULL) OR (`endedAt` IS NOT NULL AND `endedAt` >= `startedAt` AND `activeKey` IS NULL AND `endReason` IS NOT NULL));
ALTER TABLE `aux_interval` ADD CONSTRAINT `aux_interval_lifecycle_check` CHECK ((`endedAt` IS NULL AND `openKey` IS NOT NULL) OR (`endedAt` IS NOT NULL AND `endedAt` >= `startedAt` AND `openKey` IS NULL));
