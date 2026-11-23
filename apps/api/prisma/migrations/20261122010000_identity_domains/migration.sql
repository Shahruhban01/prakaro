-- DropForeignKey
ALTER TABLE `account` DROP FOREIGN KEY `account_userId_fkey`;

-- DropForeignKey
ALTER TABLE `moderation_membership` DROP FOREIGN KEY `moderation_membership_queueId_fkey`;

-- DropForeignKey
ALTER TABLE `moderation_membership` DROP FOREIGN KEY `moderation_membership_userId_fkey`;

-- DropForeignKey
ALTER TABLE `moderation_staff` DROP FOREIGN KEY `moderation_staff_userId_fkey`;

-- DropForeignKey
ALTER TABLE `recent_search` DROP FOREIGN KEY `recent_search_userId_fkey`;

-- DropForeignKey
ALTER TABLE `saved_parking` DROP FOREIGN KEY `saved_parking_userId_fkey`;

-- DropForeignKey
ALTER TABLE `session` DROP FOREIGN KEY `session_userId_fkey`;

-- DropForeignKey
ALTER TABLE `user_preference` DROP FOREIGN KEY `user_preference_userId_fkey`;

-- AlterTable
ALTER TABLE `moderation_audit` ADD COLUMN `actorId` VARCHAR(191) NULL,
    ADD COLUMN `actorSnapshot` JSON NULL,
    ADD COLUMN `actorType` VARCHAR(32) NOT NULL DEFAULT 'MODERATOR';

-- AlterTable
ALTER TABLE `moderation_case` ADD COLUMN `metadata` JSON NULL;

ALTER TABLE `moderation_membership` CHANGE COLUMN `userId` `moderatorId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `parking_intelligence_case` ADD COLUMN `displayName` VARCHAR(255) NULL,
    ADD COLUMN `formattedAddress` VARCHAR(500) NULL,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `placeMetadata` JSON NULL;

RENAME TABLE `user` TO `users`;
ALTER TABLE `users` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE';
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
DROP INDEX `user_email_key` ON `users`;

-- CreateTable
CREATE TABLE `super_admins` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdBySuperAdminId` VARCHAR(191) NULL,

    UNIQUE INDEX `super_admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `super_admin_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `super_admin_sessions_token_key`(`token`),
    INDEX `super_admin_sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `super_admin_accounts` (
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

    INDEX `super_admin_accounts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `super_admin_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderators` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `role` VARCHAR(191) NOT NULL DEFAULT 'MODERATOR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `invitedBy` VARCHAR(191) NULL,
    `activatedBy` VARCHAR(191) NULL,
    `deactivatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `moderators_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderator_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `moderator_sessions_token_key`(`token`),
    INDEX `moderator_sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderator_accounts` (
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

    INDEX `moderator_accounts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderator_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve identity references. Legacy operators require fresh workforce credentials.
INSERT INTO `moderators` (`id`,`name`,`email`,`emailVerified`,`image`,`status`,`role`,`createdAt`,`updatedAt`)
SELECT u.id,u.name,u.email,u.emailVerified,u.image,'PENDING_ASSIGNMENT',
  CASE WHEN m.role IN ('SUPER_ADMIN','ADMIN','MODERATION_ADMIN') THEN 'MODERATION_ADMIN' ELSE COALESCE(m.role,'MODERATOR') END,
  u.createdAt,u.updatedAt
FROM `users` u LEFT JOIN `moderation_staff` m ON m.userId=u.id
WHERE m.userId IS NOT NULL
   OR EXISTS (SELECT 1 FROM `moderation_membership` x WHERE x.moderatorId=u.id)
   OR EXISTS (SELECT 1 FROM `moderation_case` x WHERE x.owner=u.id)
   OR EXISTS (SELECT 1 FROM `moderation_submission` x WHERE x.reviewerId=u.id);
DROP TABLE `moderation_staff`;

-- CreateIndex
CREATE INDEX `moderation_audit_actorId_actorType_idx` ON `moderation_audit`(`actorId`, `actorType`);

-- CreateIndex
CREATE INDEX `moderation_case_owner_idx` ON `moderation_case`(`owner`);

-- CreateIndex
CREATE INDEX `moderation_submission_reviewerId_idx` ON `moderation_submission`(`reviewerId`);

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `super_admin_sessions` ADD CONSTRAINT `super_admin_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `super_admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `super_admin_accounts` ADD CONSTRAINT `super_admin_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `super_admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderator_sessions` ADD CONSTRAINT `moderator_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `moderators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderator_accounts` ADD CONSTRAINT `moderator_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `moderators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_parking` ADD CONSTRAINT `saved_parking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recent_search` ADD CONSTRAINT `recent_search_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_preference` ADD CONSTRAINT `user_preference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_membership` ADD CONSTRAINT `moderation_membership_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `moderators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_membership` ADD CONSTRAINT `moderation_membership_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `moderation_queue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_case` ADD CONSTRAINT `moderation_case_owner_fkey` FOREIGN KEY (`owner`) REFERENCES `moderators`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_submission` ADD CONSTRAINT `moderation_submission_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `moderators`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `moderation_membership_queueId_idx` ON `moderation_membership`(`queueId`);

