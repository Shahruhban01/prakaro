-- AlterTable
ALTER TABLE `moderation_queue` ADD COLUMN `intakeEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `queue_lob_access` (
    `queueId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(191) NOT NULL,

    INDEX `queue_lob_access_lobId_revokedAt_idx`(`lobId`, `revokedAt`),
    PRIMARY KEY (`queueId`, `lobId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queue_subscription` (
    `moderatorId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `subscribedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unsubscribedAt` DATETIME(3) NULL,

    INDEX `queue_subscription_queueId_unsubscribedAt_idx`(`queueId`, `unsubscribedAt`),
    PRIMARY KEY (`moderatorId`, `queueId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `queue_configuration_version` (
    `queueId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`queueId`, `version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `moderation_queue_organizationId_status_idx` ON `moderation_queue`(`organizationId`, `status`);

-- CreateIndex
CREATE UNIQUE INDEX `moderation_queue_id_organizationId_key` ON `moderation_queue`(`id`, `organizationId`);

-- CreateIndex
CREATE INDEX `moderation_task_queueId_caseId_idx` ON `moderation_task`(`queueId`, `caseId`);

-- AddForeignKey
ALTER TABLE `queue_lob_access` ADD CONSTRAINT `queue_lob_access_queueId_organizationId_fkey` FOREIGN KEY (`queueId`, `organizationId`) REFERENCES `moderation_queue`(`id`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `queue_lob_access` ADD CONSTRAINT `queue_lob_access_lobId_organizationId_fkey` FOREIGN KEY (`lobId`, `organizationId`) REFERENCES `lobs`(`id`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `queue_subscription` ADD CONSTRAINT `queue_subscription_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_subscription` ADD CONSTRAINT `queue_subscription_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `queue_configuration_version` ADD CONSTRAINT `queue_configuration_version_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

