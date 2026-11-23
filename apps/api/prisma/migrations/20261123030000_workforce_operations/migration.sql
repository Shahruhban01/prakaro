-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `reportingTimezone` VARCHAR(100) NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE `workforce_shift` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `timezone` VARCHAR(100) NOT NULL,
    `startLocal` CHAR(5) NOT NULL,
    `endLocal` CHAR(5) NOT NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 0,
    `lateGraceMinutes` INTEGER NOT NULL DEFAULT 0,
    `earlyGraceMinutes` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `workforce_shift_organizationId_name_key`(`organizationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_shift_assignment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NULL,
    `shiftId` VARCHAR(191) NULL,
    `kind` VARCHAR(16) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `localDate` CHAR(10) NOT NULL,
    `timezone` VARCHAR(100) NOT NULL,
    `shiftName` VARCHAR(100) NOT NULL,
    `breakMinutes` INTEGER NOT NULL,
    `lateGraceMinutes` INTEGER NOT NULL,
    `earlyGraceMinutes` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `seriesId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelledAt` DATETIME(3) NULL,

    INDEX `workforce_schedule_employee_range`(`employeeId`, `cancelledAt`, `startsAt`, `endsAt`),
    INDEX `workforce_schedule_org_range`(`organizationId`, `startsAt`, `endsAt`),
    INDEX `workforce_schedule_team_range`(`teamId`, `startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_capacity_plan` (
    `organizationId` VARCHAR(191) NOT NULL,
    `utilizationPercent` INTEGER NOT NULL,
    `trainingMeetingMinutes` INTEGER NOT NULL,
    `fallbackAhtSeconds` INTEGER NULL,
    `queueWeights` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`organizationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_alert_rule` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NULL,
    `metric` VARCHAR(32) NOT NULL,
    `threshold` INTEGER NOT NULL,
    `severity` VARCHAR(12) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `intervalSeconds` INTEGER NOT NULL,
    `cooldownSeconds` INTEGER NOT NULL,
    `nextEvaluationAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revision` INTEGER NOT NULL DEFAULT 1,

    INDEX `workforce_alert_rule_enabled_nextEvaluationAt_idx`(`enabled`, `nextEvaluationAt`),
    INDEX `workforce_alert_rule_organizationId_queueId_idx`(`organizationId`, `queueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workforce_alert_event` (
    `id` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `observed` INTEGER NOT NULL,
    `threshold` INTEGER NOT NULL,
    `severity` VARCHAR(12) NOT NULL,
    `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `workforce_alert_event_activeKey_key`(`activeKey`),
    INDEX `workforce_alert_event_ruleId_triggeredAt_idx`(`ruleId`, `triggeredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workforce_shift` ADD CONSTRAINT `workforce_shift_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_shift_assignment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_shift_assignment_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_shift_assignment_lobId_fkey` FOREIGN KEY (`lobId`) REFERENCES `lobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_shift_assignment_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `workforce_teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_shift_assignment_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `workforce_shift`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `workforce_capacity_plan` ADD CONSTRAINT `workforce_capacity_plan_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_alert_rule` ADD CONSTRAINT `workforce_alert_rule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_alert_rule` ADD CONSTRAINT `workforce_alert_rule_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workforce_alert_event` ADD CONSTRAINT `workforce_alert_event_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `workforce_alert_rule`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `workforce_shift_assignment` ADD CONSTRAINT `workforce_assignment_period_check` CHECK (
  `endsAt` > `startsAt` AND `kind` IN ('SHIFT','OFF','EXCUSED') AND
  ((`kind` = 'SHIFT' AND `shiftId` IS NOT NULL) OR (`kind` <> 'SHIFT' AND `shiftId` IS NULL))
);
ALTER TABLE `workforce_capacity_plan` ADD CONSTRAINT `workforce_capacity_values_check` CHECK (
  `utilizationPercent` BETWEEN 0 AND 100 AND `trainingMeetingMinutes` BETWEEN 0 AND 480
  AND (`fallbackAhtSeconds` IS NULL OR `fallbackAhtSeconds` BETWEEN 1 AND 3600)
);
ALTER TABLE `workforce_alert_event` ADD CONSTRAINT `workforce_alert_lifecycle_check` CHECK (
  (`activeKey` IS NULL AND `resolvedAt` IS NOT NULL)
  OR (`activeKey` IS NOT NULL AND `resolvedAt` IS NULL)
);

