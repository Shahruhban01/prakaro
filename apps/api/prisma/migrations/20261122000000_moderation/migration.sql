-- CreateTable
CREATE TABLE `moderation_staff` (
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_queue` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `capacity` INTEGER NOT NULL DEFAULT 500,
    `version` INTEGER NOT NULL DEFAULT 1,
    `config` JSON NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `moderation_queue_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_membership` (
    `userId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`userId`, `queueId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_admission` (
    `facilityId` VARCHAR(191) NOT NULL,
    `firstEvent` VARCHAR(191) NOT NULL,
    `demand` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`facilityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_counter` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,

    INDEX `moderation_counter_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_case` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `facilityId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `owner` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `moderation_case_code_key`(`code`),
    UNIQUE INDEX `moderation_case_activeKey_key`(`activeKey`),
    INDEX `moderation_case_status_priority_idx`(`status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_task` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `queueVersion` INTEGER NOT NULL,
    `form` JSON NOT NULL,
    `deadline` DATETIME(3) NOT NULL,

    UNIQUE INDEX `moderation_task_caseId_queueId_key`(`caseId`, `queueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_submission` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `queueVersion` INTEGER NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `answers` JSON NOT NULL,
    `evidenceIds` JSON NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `moderation_submission_caseId_createdAt_idx`(`caseId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_audit` (
    `id` VARCHAR(191) NOT NULL,
    `actor` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `moderation_audit_target_createdAt_idx`(`target`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `moderation_staff` ADD CONSTRAINT `moderation_staff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_membership` ADD CONSTRAINT `moderation_membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `moderation_staff`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_membership` ADD CONSTRAINT `moderation_membership_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `search_admission` ADD CONSTRAINT `search_admission_facilityId_fkey` FOREIGN KEY (`facilityId`) REFERENCES `parking_intelligence_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_case` ADD CONSTRAINT `moderation_case_facilityId_fkey` FOREIGN KEY (`facilityId`) REFERENCES `search_admission`(`facilityId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_task` ADD CONSTRAINT `moderation_task_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_task` ADD CONSTRAINT `moderation_task_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `moderation_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_submission` ADD CONSTRAINT `moderation_submission_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `moderation_case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

