-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `session_token_key`(`token`),
    INDEX `session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_parking` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'google',
    `providerPlaceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_parking_userId_idx`(`userId`),
    UNIQUE INDEX `saved_parking_userId_provider_providerPlaceId_key`(`userId`, `provider`, `providerPlaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recent_search` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `radiusMeters` INTEGER NOT NULL DEFAULT 3000,
    `originType` VARCHAR(191) NOT NULL DEFAULT 'explicitAreaSearch',
    `providerPlaceId` VARCHAR(191) NULL,
    `destinationLabel` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recent_search_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_preference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `recentSearchEnabled` BOOLEAN NOT NULL DEFAULT false,
    `defaultRadiusMeters` INTEGER NOT NULL DEFAULT 3000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_preference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_intelligence_case` (
    `id` VARCHAR(191) NOT NULL,
    `reviewRevision` INTEGER NOT NULL DEFAULT 0,
    `googlePlaceId` VARCHAR(191) NULL,

    UNIQUE INDEX `parking_intelligence_case_googlePlaceId_key`(`googlePlaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_evidence_reference` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `reference` VARCHAR(500) NOT NULL,
    `finding` VARCHAR(50) NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `parking_evidence_reference_caseId_expiresAt_idx`(`caseId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_human_label` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `reviewedAt` DATETIME(3) NOT NULL,
    `classification` VARCHAR(30) NOT NULL,
    `access` VARCHAR(20) NOT NULL,
    `pricing` VARCHAR(10) NOT NULL,
    `decision` VARCHAR(30) NOT NULL,
    `evidenceReferences` JSON NOT NULL,
    `notes` TEXT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `revision` INTEGER NULL,
    `expiresAt` DATETIME(3) NULL,
    `evidenceFingerprint` CHAR(64) NULL,
    `policyVersion` VARCHAR(60) NULL,

    INDEX `parking_human_label_caseId_reviewedAt_idx`(`caseId`, `reviewedAt`),
    UNIQUE INDEX `parking_human_label_caseId_revision_key`(`caseId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_verification_version` (
    `id` VARCHAR(191) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `promptVersion` VARCHAR(60) NOT NULL,

    UNIQUE INDEX `parking_verification_version_model_promptVersion_key`(`model`, `promptVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_verification_run` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `evidenceFingerprint` CHAR(64) NOT NULL,
    `utcDay` CHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(32) NOT NULL DEFAULT 'STARTED',
    `outcome` VARCHAR(30) NULL,
    `calls` INTEGER NOT NULL DEFAULT 0,
    `callsWithTokenUsage` INTEGER NOT NULL DEFAULT 0,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `latencyMs` INTEGER NOT NULL DEFAULT 0,

    INDEX `parking_verification_run_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `parking_run_daily_evidence_key`(`caseId`, `versionId`, `evidenceFingerprint`, `utcDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_evaluation_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `datasetVersion` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metrics` JSON NOT NULL,

    INDEX `parking_evaluation_metrics_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parking_ai_daily_budget` (
    `utcDay` CHAR(10) NOT NULL,
    `calls` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`utcDay`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_parking` ADD CONSTRAINT `saved_parking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recent_search` ADD CONSTRAINT `recent_search_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_preference` ADD CONSTRAINT `user_preference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_evidence_reference` ADD CONSTRAINT `parking_evidence_reference_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `parking_intelligence_case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_human_label` ADD CONSTRAINT `parking_human_label_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `parking_intelligence_case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_verification_run` ADD CONSTRAINT `parking_verification_run_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `parking_intelligence_case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_verification_run` ADD CONSTRAINT `parking_verification_run_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `parking_verification_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parking_evaluation_metrics` ADD CONSTRAINT `parking_evaluation_metrics_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `parking_verification_version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

