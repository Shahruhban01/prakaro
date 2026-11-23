-- AlterTable
ALTER TABLE `moderators` ADD COLUMN `employeeCode` VARCHAR(191) NULL,
    ADD COLUMN `lobId` VARCHAR(191) NULL,
    ADD COLUMN `organizationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `moderation_queue` ADD COLUMN `organizationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `moderation_audit` ADD COLUMN `organizationId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `organizations` (
    `queueDelegated` BOOLEAN NOT NULL DEFAULT false,
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lobs` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `organizationId` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lobs_code_key`(`code`),
    UNIQUE INDEX `lobs_id_organizationId_key`(`id`, `organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_teams` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `organizationId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workforce_teams_organizationId_code_key`(`organizationId`, `code`),
    UNIQUE INDEX `workforce_teams_id_organizationId_key`(`id`, `organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_team_links` (
    `teamId` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`teamId`, `moderatorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `moderators_employeeCode_key` ON `moderators`(`employeeCode`);

-- CreateIndex
CREATE UNIQUE INDEX `moderators_id_organizationId_key` ON `moderators`(`id`, `organizationId`);

-- AddForeignKey
ALTER TABLE `moderators` ADD CONSTRAINT `moderators_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `moderators` ADD CONSTRAINT `moderators_lobId_organizationId_fkey` FOREIGN KEY (`lobId`, `organizationId`) REFERENCES `lobs`(`id`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `moderation_queue` ADD CONSTRAINT `moderation_queue_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lobs` ADD CONSTRAINT `lobs_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_teams` ADD CONSTRAINT `workforce_teams_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_team_links` ADD CONSTRAINT `workforce_team_links_teamId_organizationId_fkey` FOREIGN KEY (`teamId`, `organizationId`) REFERENCES `workforce_teams`(`id`, `organizationId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_team_links` ADD CONSTRAINT `workforce_team_links_moderatorId_organizationId_fkey` FOREIGN KEY (`moderatorId`, `organizationId`) REFERENCES `moderators`(`id`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

UPDATE `moderators` SET `status` = 'PENDING_ASSIGNMENT' WHERE `status` = 'ACTIVE' AND (`organizationId` IS NULL OR `lobId` IS NULL);
ALTER TABLE `moderators` ADD CONSTRAINT `moderators_active_membership_check` CHECK (`status` <> 'ACTIVE' OR (`organizationId` IS NOT NULL AND `lobId` IS NOT NULL));
