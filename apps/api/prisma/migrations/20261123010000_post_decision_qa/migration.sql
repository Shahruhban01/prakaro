-- AlterTable
ALTER TABLE `moderation_decision_version` ADD COLUMN `publicationLabelId` VARCHAR(191) NULL,
    ADD COLUMN `qaSnapshot` JSON NULL;

-- CreateTable
CREATE TABLE `qa_policy` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NULL,
    `queueId` VARCHAR(191) NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `rate` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `passScore` INTEGER NOT NULL DEFAULT 100,
    `failScore` INTEGER NOT NULL DEFAULT 0,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveTo` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `qa_policy_activeKey_key`(`activeKey`),
    INDEX `qa_policy_organizationId_effectiveFrom_idx`(`organizationId`, `effectiveFrom`),
    UNIQUE INDEX `qa_policy_scopeKey_version_key`(`scopeKey`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qa_sample` (
    `id` VARCHAR(191) NOT NULL,
    `decisionId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `lobId` VARCHAR(191) NOT NULL,
    `queueId` VARCHAR(191) NOT NULL,
    `moderatorId` VARCHAR(191) NOT NULL,
    `policyId` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `evaluatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sampledAt` DATETIME(3) NULL,
    `draw` INTEGER NULL,
    `selection` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `assignedTo` VARCHAR(191) NULL,
    `activeReviewer` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `assignmentVersion` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `qa_sample_decisionId_key`(`decisionId`),
    UNIQUE INDEX `qa_sample_activeReviewer_key`(`activeReviewer`),
    INDEX `qa_sample_organizationId_completedAt_idx`(`organizationId`, `completedAt`),
    INDEX `qa_sample_organizationId_lobId_status_sampledAt_idx`(`organizationId`, `lobId`, `status`, `sampledAt`),
    INDEX `qa_sample_queueId_completedAt_idx`(`queueId`, `completedAt`),
    INDEX `qa_sample_moderatorId_completedAt_idx`(`moderatorId`, `completedAt`),
    INDEX `qa_sample_organizationId_status_leaseUntil_idx`(`organizationId`, `status`, `leaseUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qa_assessment` (
    `id` VARCHAR(191) NOT NULL,
    `sampleId` VARCHAR(191) NOT NULL,
    `auditorId` VARCHAR(191) NOT NULL,
    `originalOutcome` VARCHAR(191) NOT NULL,
    `originalScore` INTEGER NOT NULL,
    `finalOutcome` VARCHAR(191) NULL,
    `finalScore` INTEGER NULL,
    `finalizedAt` DATETIME(3) NULL,
    `category` VARCHAR(191) NULL,
    `severity` VARCHAR(191) NULL,
    `policyReference` VARCHAR(240) NULL,
    `notes` VARCHAR(500) NULL,
    `proposedAction` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handlingSeconds` INTEGER NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,

    UNIQUE INDEX `qa_assessment_sampleId_key`(`sampleId`),
    INDEX `qa_assessment_auditorId_submittedAt_idx`(`auditorId`, `submittedAt`),
    INDEX `qa_assessment_finalOutcome_finalizedAt_idx`(`finalOutcome`, `finalizedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qa_dispute` (
    `id` VARCHAR(191) NOT NULL,
    `sampleId` VARCHAR(191) NOT NULL,
    `openedBy` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedBy` VARCHAR(191) NULL,
    `resolution` VARCHAR(500) NULL,
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `qa_dispute_sampleId_key`(`sampleId`),
    INDEX `qa_dispute_status_openedAt_idx`(`status`, `openedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qa_correction` (
    `id` VARCHAR(191) NOT NULL,
    `sampleId` VARCHAR(191) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `evidenceIds` JSON NOT NULL,
    `expectedRevision` INTEGER NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewerId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `handlingSeconds` INTEGER NULL,
    `publicationLabelId` VARCHAR(191) NULL,
    `resultDecisionId` VARCHAR(191) NULL,

    UNIQUE INDEX `qa_correction_sampleId_key`(`sampleId`),
    UNIQUE INDEX `qa_correction_resultDecisionId_key`(`resultDecisionId`),
    INDEX `qa_correction_approvedAt_requestedAt_idx`(`approvedAt`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `decision_case_version_unique` ON `moderation_decision_version`(`caseId`, `version`);

-- AddForeignKey
ALTER TABLE `qa_policy` ADD CONSTRAINT `qa_policy_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_policy` ADD CONSTRAINT `qa_policy_lobId_fkey` FOREIGN KEY (`lobId`) REFERENCES `lobs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `qa_policy` ADD CONSTRAINT `qa_policy_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_decisionId_fkey` FOREIGN KEY (`decisionId`) REFERENCES `moderation_decision_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_lobId_fkey` FOREIGN KEY (`lobId`) REFERENCES `lobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `qa_policy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_assignedTo_fkey` FOREIGN KEY (`assignedTo`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_assessment` ADD CONSTRAINT `qa_assessment_sampleId_fkey` FOREIGN KEY (`sampleId`) REFERENCES `qa_sample`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_assessment` ADD CONSTRAINT `qa_assessment_auditorId_fkey` FOREIGN KEY (`auditorId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_dispute` ADD CONSTRAINT `qa_dispute_sampleId_fkey` FOREIGN KEY (`sampleId`) REFERENCES `qa_sample`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_correction` ADD CONSTRAINT `qa_correction_sampleId_fkey` FOREIGN KEY (`sampleId`) REFERENCES `qa_sample`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qa_correction` ADD CONSTRAINT `qa_correction_resultDecisionId_fkey` FOREIGN KEY (`resultDecisionId`) REFERENCES `moderation_decision_version`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `qa_policy` ADD CONSTRAINT `qa_policy_bounds` CHECK (
    `rate` BETWEEN 0 AND 10000 AND `passScore` BETWEEN 0 AND 100 AND `failScore` BETWEEN 0 AND `passScore`
    AND `version` >= 1 AND (`lobId` IS NULL OR `queueId` IS NULL)
    AND ((`activeKey` IS NOT NULL AND `effectiveTo` IS NULL) OR (`activeKey` IS NULL AND `effectiveTo` >= `effectiveFrom`))
);
ALTER TABLE `qa_sample` ADD CONSTRAINT `qa_sample_status_integrity` CHECK (
    ((`sampledAt` IS NULL AND `status` IS NULL AND `selection` IN ('NO_POLICY','NOT_SELECTED'))
      OR (`sampledAt` IS NOT NULL AND `status` IN ('PENDING','ASSIGNED','IN_REVIEW','COMPLETED','DISPUTED','CLOSED')
        AND `selection` IN ('SELECTED','MANUAL')))
    AND (`draw` IS NULL OR `draw` BETWEEN 0 AND 9999)
    AND ((`status` IN ('ASSIGNED','IN_REVIEW') AND `activeReviewer` IS NOT NULL
          AND `leaseUntil` IS NOT NULL)
       OR ((`status` IS NULL OR `status` NOT IN ('ASSIGNED','IN_REVIEW')) AND `activeReviewer` IS NULL))
);
ALTER TABLE `qa_assessment` ADD CONSTRAINT `qa_assessment_integrity` CHECK (
    `originalOutcome` IN ('PASS','FAIL') AND `originalScore` BETWEEN 0 AND 100 AND `handlingSeconds` >= 0
    AND (`originalOutcome` <> 'FAIL' OR (`category` IS NOT NULL AND `severity` IS NOT NULL
        AND `policyReference` IS NOT NULL AND `notes` IS NOT NULL))
    AND ((`finalOutcome` IS NULL AND `finalScore` IS NULL AND `finalizedAt` IS NULL)
       OR (`finalOutcome` IN ('PASS','FAIL') AND `finalScore` BETWEEN 0 AND 100 AND `finalizedAt` IS NOT NULL))
);
ALTER TABLE `qa_correction` ADD CONSTRAINT `qa_correction_integrity` CHECK (
    (`approvedAt` IS NULL AND `resultDecisionId` IS NULL)
    OR (`approvedAt` IS NOT NULL AND `resultDecisionId` IS NOT NULL AND `reviewerId` IS NOT NULL
      AND `startedAt` IS NOT NULL AND `handlingSeconds` >= 0)
);

