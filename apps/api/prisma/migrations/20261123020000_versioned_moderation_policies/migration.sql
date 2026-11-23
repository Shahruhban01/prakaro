-- AlterTable
ALTER TABLE `moderation_case_reservation` ADD COLUMN `pinnedPolicyId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `moderation_decision_version` ADD COLUMN `pinnedPolicyId` VARCHAR(191) NULL,
    ADD COLUMN `policyTags` JSON NULL;

-- CreateTable
CREATE TABLE `moderation_policy` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `moderation_policy_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    UNIQUE INDEX `moderation_policy_organizationId_name_key`(`organizationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_version` (
    `id` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL,
    `document` JSON NOT NULL,
    `changeSummary` VARCHAR(500) NOT NULL,
    `contentHash` CHAR(64) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `publisherId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `policy_version_policyId_status_number_idx`(`policyId`, `status`, `number`),
    UNIQUE INDEX `policy_version_policyId_number_key`(`policyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_assignment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NULL,
    `queueId` VARCHAR(191) NULL,
    `activeKey` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveTo` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `policy_assignment_activeKey_key`(`activeKey`),
    INDEX `policy_assignment_scopeKey_effectiveFrom_idx`(`scopeKey`, `effectiveFrom`),
    INDEX `policy_assignment_organizationId_effectiveTo_idx`(`organizationId`, `effectiveTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_clarification` (
    `id` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `supervisorId` VARCHAR(191) NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `policy_clarification_reservationId_key`(`reservationId`),
    INDEX `policy_clarification_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
    INDEX `policy_clarification_lobId_queueId_createdAt_idx`(`lobId`, `queueId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clarification_message` (
    `id` VARCHAR(191) NOT NULL,
    `clarificationId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `text` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `clarification_message_clarificationId_createdAt_id_idx`(`clarificationId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `moderation_case_reservation` ADD CONSTRAINT `moderation_case_reservation_pinnedPolicyId_fkey` FOREIGN KEY (`pinnedPolicyId`) REFERENCES `policy_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_decision_version` ADD CONSTRAINT `moderation_decision_version_pinnedPolicyId_fkey` FOREIGN KEY (`pinnedPolicyId`) REFERENCES `policy_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_policy` ADD CONSTRAINT `moderation_policy_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_version` ADD CONSTRAINT `policy_version_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `moderation_policy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_assignment` ADD CONSTRAINT `policy_assignment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_assignment` ADD CONSTRAINT `policy_assignment_lobId_fkey` FOREIGN KEY (`lobId`) REFERENCES `lobs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `policy_assignment` ADD CONSTRAINT `policy_assignment_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `policy_assignment` ADD CONSTRAINT `policy_assignment_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `policy_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clarification` ADD CONSTRAINT `policy_clarification_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `moderation_case_reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clarification` ADD CONSTRAINT `policy_clarification_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clarification` ADD CONSTRAINT `policy_clarification_lobId_fkey` FOREIGN KEY (`lobId`) REFERENCES `lobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clarification` ADD CONSTRAINT `policy_clarification_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clarification` ADD CONSTRAINT `policy_clarification_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `policy_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clarification_message` ADD CONSTRAINT `clarification_message_clarificationId_fkey` FOREIGN KEY (`clarificationId`) REFERENCES `policy_clarification`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `policy_version` ADD CONSTRAINT `policy_version_state_check` CHECK (
  (`status` IN ('DRAFT','IN_REVIEW') AND `publishedAt` IS NULL AND `contentHash` IS NULL AND `publisherId` IS NULL AND `archivedAt` IS NULL)
  OR (`status` IN ('PUBLISHED','ARCHIVED') AND `publishedAt` IS NOT NULL AND `contentHash` IS NOT NULL AND `publisherId` IS NOT NULL
      AND ((`status` = 'PUBLISHED' AND `archivedAt` IS NULL) OR (`status` = 'ARCHIVED' AND `archivedAt` IS NOT NULL AND `archivedAt` >= `publishedAt`)))
);
ALTER TABLE `policy_assignment` ADD CONSTRAINT `policy_assignment_scope_check` CHECK (
  (`lobId` IS NULL OR `queueId` IS NULL)
  AND ((`effectiveTo` IS NULL AND `activeKey` IS NOT NULL AND `activeKey` = `scopeKey`)
       OR (`effectiveTo` IS NOT NULL AND `effectiveTo` >= `effectiveFrom` AND `activeKey` IS NULL))
);

CREATE TRIGGER `policy_version_preserve_publication` BEFORE UPDATE ON `policy_version` FOR EACH ROW
BEGIN
  SET NEW.id = OLD.id, NEW.policyId = OLD.policyId, NEW.number = OLD.number,
      NEW.createdBy = OLD.createdBy, NEW.createdAt = OLD.createdAt,
      NEW.status = IF(OLD.`status` = 'ARCHIVED', 'ARCHIVED', NEW.`status`),
      NEW.archivedAt = IF(OLD.`status` = 'ARCHIVED', OLD.archivedAt, NEW.archivedAt),
      NEW.document = IF(OLD.publishedAt IS NULL, NEW.document, OLD.document),
      NEW.changeSummary = IF(OLD.publishedAt IS NULL, NEW.changeSummary, OLD.changeSummary),
      NEW.contentHash = IF(OLD.publishedAt IS NULL, NEW.contentHash, OLD.contentHash),
      NEW.publishedAt = IF(OLD.publishedAt IS NULL, NEW.publishedAt, OLD.publishedAt),
      NEW.publisherId = IF(OLD.publishedAt IS NULL, NEW.publisherId, OLD.publisherId);
END;

CREATE TRIGGER `policy_version_retain_history` BEFORE DELETE ON `policy_version` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Policy version history is retained';

