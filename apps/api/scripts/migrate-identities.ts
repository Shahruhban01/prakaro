import dotenv from 'dotenv';
import path from 'node:path';
import { prisma } from '../src/common/database/prisma';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runMigration() {
  try {
    console.log('--- PHASE 4: IDENTITY ARCHITECTURE MIGRATION ---');

    // 1. Check existing tables
    const existingTables = (await prisma.$queryRawUnsafe<any[]>('SHOW TABLES')) || [];
    const tableNames = existingTables.map((t) => Object.values(t)[0] as string);
    console.log('Current tables:', tableNames.join(', '));

    const userTableName = tableNames.includes('users') ? 'users' : 'user';
    console.log(`Using user table: ${userTableName}`);

    // 2. Create super_admins tables if not exist
    console.log('Creating super_admins table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`super_admins\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`email\` VARCHAR(191) NOT NULL,
        \`emailVerified\` BOOLEAN NOT NULL DEFAULT false,
        \`image\` VARCHAR(191) NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        \`lastLoginAt\` DATETIME(3) NULL,
        \`createdBySuperAdminId\` VARCHAR(191) NULL,
        UNIQUE INDEX \`super_admins_email_key\`(\`email\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating super_admin_sessions table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`super_admin_sessions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`token\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        \`ipAddress\` VARCHAR(191) NULL,
        \`userAgent\` VARCHAR(191) NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        UNIQUE INDEX \`super_admin_sessions_token_key\`(\`token\`),
        INDEX \`super_admin_sessions_userId_idx\`(\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`super_admin_sessions_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`super_admins\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating super_admin_accounts table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`super_admin_accounts\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`accountId\` VARCHAR(191) NOT NULL,
        \`providerId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`accessToken\` TEXT NULL,
        \`refreshToken\` TEXT NULL,
        \`idToken\` TEXT NULL,
        \`accessTokenExpiresAt\` DATETIME(3) NULL,
        \`refreshTokenExpiresAt\` DATETIME(3) NULL,
        \`scope\` VARCHAR(191) NULL,
        \`password\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        INDEX \`super_admin_accounts_userId_idx\`(\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`super_admin_accounts_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`super_admins\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating super_admin_verifications table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`super_admin_verifications\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`identifier\` VARCHAR(191) NOT NULL,
        \`value\` TEXT NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // 3. Create moderators tables if not exist
    console.log('Creating moderators table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`moderators\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`email\` VARCHAR(191) NOT NULL,
        \`emailVerified\` BOOLEAN NOT NULL DEFAULT false,
        \`image\` VARCHAR(191) NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        \`role\` VARCHAR(191) NOT NULL DEFAULT 'MODERATOR',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        \`lastLoginAt\` DATETIME(3) NULL,
        \`invitedBy\` VARCHAR(191) NULL,
        \`activatedBy\` VARCHAR(191) NULL,
        \`deactivatedAt\` DATETIME(3) NULL,
        UNIQUE INDEX \`moderators_email_key\`(\`email\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating moderator_sessions table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`moderator_sessions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`token\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        \`ipAddress\` VARCHAR(191) NULL,
        \`userAgent\` VARCHAR(191) NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        UNIQUE INDEX \`moderator_sessions_token_key\`(\`token\`),
        INDEX \`moderator_sessions_userId_idx\`(\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`moderator_sessions_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`moderators\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating moderator_accounts table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`moderator_accounts\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`accountId\` VARCHAR(191) NOT NULL,
        \`providerId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`accessToken\` TEXT NULL,
        \`refreshToken\` TEXT NULL,
        \`idToken\` TEXT NULL,
        \`accessTokenExpiresAt\` DATETIME(3) NULL,
        \`refreshTokenExpiresAt\` DATETIME(3) NULL,
        \`scope\` VARCHAR(191) NULL,
        \`password\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        INDEX \`moderator_accounts_userId_idx\`(\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`moderator_accounts_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`moderators\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    console.log('Creating moderator_verifications table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`moderator_verifications\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`identifier\` VARCHAR(191) NOT NULL,
        \`value\` TEXT NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    // 4. Add status to user table if missing
    const userCols = (await prisma.$queryRawUnsafe<any[]>(`SHOW COLUMNS FROM \`${userTableName}\``)) || [];
    const userColNames = userCols.map((c) => c.Field);
    if (!userColNames.includes('status')) {
      console.log(`Adding status column to ${userTableName}...`);
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${userTableName}\` ADD COLUMN \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE'`);
    }

    // 5. Add actor columns to moderation_audit if missing
    const auditCols = (await prisma.$queryRawUnsafe<any[]>('SHOW COLUMNS FROM `moderation_audit`')) || [];
    const auditColNames = auditCols.map((c) => c.Field);
    if (!auditColNames.includes('actorType')) {
      console.log('Adding actorType, actorId, actorSnapshot to moderation_audit...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`moderation_audit\`
        ADD COLUMN \`actorType\` VARCHAR(32) NOT NULL DEFAULT 'MODERATOR',
        ADD COLUMN \`actorId\` VARCHAR(191) NULL,
        ADD COLUMN \`actorSnapshot\` JSON NULL;
      `);
      await prisma.$executeRawUnsafe('ALTER TABLE `moderation_audit` ADD INDEX `moderation_audit_actorId_actorType_idx`(`actorId`, `actorType`);');
    }

    // 6. Migrate existing moderation staff
    if (tableNames.includes('moderation_staff')) {
      console.log('Migrating staff records from moderation_staff...');
      const staffRows = (await prisma.$queryRawUnsafe<any[]>('SELECT * FROM `moderation_staff`')) || [];
      console.log(`Found ${staffRows.length} staff records to migrate.`);

      const migratedUserIds: string[] = [];

      for (const staff of staffRows) {
        migratedUserIds.push(staff.userId);

        const users = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \`${userTableName}\` WHERE \`id\` = ?`, staff.userId)) || [];
        const user = users[0];
        if (!user) {
          console.warn(`User ${staff.userId} for staff role ${staff.role} not found in ${userTableName}`);
          continue;
        }

        const accounts = (await prisma.$queryRawUnsafe<any[]>('SELECT * FROM `account` WHERE `userId` = ?', staff.userId)) || [];

        if (staff.role === 'SUPER_ADMIN') {
          console.log(`Migrating super admin: ${user.email} (${user.id})`);
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO \`super_admins\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`image\`, \`status\`, \`createdAt\`, \`updatedAt\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`status\` = VALUES(\`status\`), \`updatedAt\` = VALUES(\`updatedAt\`)
          `,
            user.id,
            user.name,
            user.email,
            user.emailVerified,
            user.image,
            staff.active ? 'ACTIVE' : 'DEACTIVATED',
            user.createdAt,
            user.updatedAt,
          );

          for (const acc of accounts) {
            await prisma.$executeRawUnsafe(
              `
              INSERT INTO \`super_admin_accounts\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`accessToken\`, \`refreshToken\`, \`idToken\`, \`accessTokenExpiresAt\`, \`refreshTokenExpiresAt\`, \`scope\`, \`password\`, \`createdAt\`, \`updatedAt\`)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE \`password\` = VALUES(\`password\`), \`updatedAt\` = VALUES(\`updatedAt\`)
            `,
              acc.id,
              acc.accountId,
              acc.providerId,
              acc.userId,
              acc.accessToken,
              acc.refreshToken,
              acc.idToken,
              acc.accessTokenExpiresAt,
              acc.refreshTokenExpiresAt,
              acc.scope,
              acc.password,
              acc.createdAt,
              acc.updatedAt,
            );
          }
        } else {
          const mappedRole = staff.role === 'ADMIN' ? 'MODERATION_ADMIN' : staff.role;
          console.log(`Migrating moderator (${mappedRole}): ${user.email} (${user.id})`);
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO \`moderators\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`image\`, \`status\`, \`role\`, \`createdAt\`, \`updatedAt\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`role\` = VALUES(\`role\`), \`status\` = VALUES(\`status\`), \`updatedAt\` = VALUES(\`updatedAt\`)
          `,
            user.id,
            user.name,
            user.email,
            user.emailVerified,
            user.image,
            staff.active ? 'ACTIVE' : 'DEACTIVATED',
            mappedRole,
            user.createdAt,
            user.updatedAt,
          );

          for (const acc of accounts) {
            await prisma.$executeRawUnsafe(
              `
              INSERT INTO \`moderator_accounts\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`accessToken\`, \`refreshToken\`, \`idToken\`, \`accessTokenExpiresAt\`, \`refreshTokenExpiresAt\`, \`scope\`, \`password\`, \`createdAt\`, \`updatedAt\`)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE \`password\` = VALUES(\`password\`), \`updatedAt\` = VALUES(\`updatedAt\`)
            `,
              acc.id,
              acc.accountId,
              acc.providerId,
              acc.userId,
              acc.accessToken,
              acc.refreshToken,
              acc.idToken,
              acc.accessTokenExpiresAt,
              acc.refreshTokenExpiresAt,
              acc.scope,
              acc.password,
              acc.createdAt,
              acc.updatedAt,
            );
          }
        }
      }

      // 7. Update moderation_membership foreign key and column
      console.log('Updating moderation_membership...');
      const membershipCols = (await prisma.$queryRawUnsafe<any[]>('SHOW COLUMNS FROM `moderation_membership`')) || [];
      const membershipColNames = membershipCols.map((c) => c.Field);

      // Drop old foreign keys on moderation_membership
      try {
        await prisma.$executeRawUnsafe('ALTER TABLE `moderation_membership` DROP FOREIGN KEY `moderation_membership_userId_fkey`');
      } catch (e: any) {
        console.log('Foreign key moderation_membership_userId_fkey already dropped or not present');
      }

      if (membershipColNames.includes('userId') && !membershipColNames.includes('moderatorId')) {
        console.log('Renaming userId to moderatorId in moderation_membership...');
        await prisma.$executeRawUnsafe('ALTER TABLE `moderation_membership` CHANGE COLUMN `userId` `moderatorId` VARCHAR(191) NOT NULL');
      }

      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE \`moderation_membership\`
          ADD CONSTRAINT \`moderation_membership_moderatorId_fkey\`
          FOREIGN KEY (\`moderatorId\`) REFERENCES \`moderators\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        `);
      } catch (e: any) {
        console.log('Foreign key moderation_membership_moderatorId_fkey already present');
      }

      // 8. Update moderation_case foreign key
      console.log('Updating moderation_case owner foreign key...');
      await prisma.$executeRawUnsafe(`
        UPDATE \`moderation_case\` SET \`owner\` = NULL
        WHERE \`owner\` IS NOT NULL AND \`owner\` NOT IN (SELECT \`id\` FROM \`moderators\`)
      `);
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE \`moderation_case\`
          ADD CONSTRAINT \`moderation_case_owner_fkey\`
          FOREIGN KEY (\`owner\`) REFERENCES \`moderators\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
        `);
      } catch (e: any) {
        console.log('Foreign key moderation_case_owner_fkey already present');
      }

      // 9. Update moderation_submission foreign key
      console.log('Updating moderation_submission reviewer foreign key...');
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE \`moderation_submission\`
          ADD CONSTRAINT \`moderation_submission_reviewerId_fkey\`
          FOREIGN KEY (\`reviewerId\`) REFERENCES \`moderators\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
        `);
      } catch (e: any) {
        console.log('Foreign key moderation_submission_reviewerId_fkey already present');
      }

      // 10. Clean up staff accounts from user tables
      console.log('Cleaning up staff accounts from ordinary users table...');
      if (migratedUserIds.length > 0) {
        for (const uid of migratedUserIds) {
          await prisma.$executeRawUnsafe('DELETE FROM `session` WHERE `userId` = ?', uid);
          await prisma.$executeRawUnsafe('DELETE FROM `account` WHERE `userId` = ?', uid);
        }
        try {
          await prisma.$executeRawUnsafe('ALTER TABLE `moderation_staff` DROP FOREIGN KEY `moderation_staff_userId_fkey`');
        } catch (e: any) {}
        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS `moderation_staff`');
        for (const uid of migratedUserIds) {
          await prisma.$executeRawUnsafe(`DELETE FROM \`${userTableName}\` WHERE \`id\` = ?`, uid);
        }
      }
    }

    // 11. Rename user table to users if still named user
    if (userTableName === 'user') {
      console.log('Renaming user table to users...');
      await prisma.$executeRawUnsafe('RENAME TABLE `user` TO `users`');
    }

    console.log('--- MIGRATION COMPLETED SUCCESSFULLY ---');

    // 12. Validation checks
    const userCount = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM `users`');
    const superAdminCount = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM `super_admins`');
    const moderatorCount = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM `moderators`');

    console.log('Final Database Counts:');
    console.log(`- Ordinary Users: ${userCount[0].cnt}`);
    console.log(`- Super Admins: ${superAdminCount[0].cnt}`);
    console.log(`- Moderators: ${moderatorCount[0].cnt}`);
  } catch (error) {
    console.error('Migration failed with error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration().catch((err) => {
  console.error('Migration execution failed:', err);
  process.exit(1);
});
