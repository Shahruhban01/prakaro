import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/common/database/prisma';

async function main() {
  console.log('Seeding / resetting demo accounts for local manual testing...\n');

  // 1. Super Admin: admin@prakaro.app / Admin123!
  const saEmail = 'admin@prakaro.app';
  const saPass = process.env.PRAKARO_TEST_ADMIN_PASSWORD || 'PrakaroAdmin123!';
  const saHashed = await hashPassword(saPass);

  const sa = await prisma.superAdmin.upsert({
    where: { email: saEmail },
    create: {
      name: 'Prakaro Super Admin',
      email: saEmail,
      status: 'ACTIVE',
      emailVerified: true,
    },
    update: {
      name: 'Prakaro Super Admin',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const existingSaAcc = await prisma.superAdminAccount.findFirst({
    where: { userId: sa.id, providerId: 'credential' },
  });
  if (existingSaAcc) {
    await prisma.superAdminAccount.update({
      where: { id: existingSaAcc.id },
      data: { password: saHashed },
    });
  } else {
    await prisma.superAdminAccount.create({
      data: {
        userId: sa.id,
        accountId: sa.id,
        providerId: 'credential',
        password: saHashed,
      },
    });
  }

  // 1.5 Organization & LOB for active moderators
  const defaultOrg = await prisma.organization.upsert({
    where: { code: 'PRAKARO_CORE_OPS' },
    create: {
      code: 'PRAKARO_CORE_OPS',
      name: 'Prakaro Core Operations',
      description: 'Default organization for Prakaro trust & safety operations',
      active: true,
      createdBy: sa.id,
    },
    update: {
      name: 'Prakaro Core Operations',
      active: true,
    },
  });

  const defaultLob = await prisma.lob.upsert({
    where: { code: 'PARKING_VERIFICATION' },
    create: {
      code: 'PARKING_VERIFICATION',
      name: 'Parking Verification Line',
      description: 'Parking discovery verification line of business',
      active: true,
      organizationId: defaultOrg.id,
      createdBy: sa.id,
    },
    update: {
      organizationId: defaultOrg.id,
      active: true,
    },
  });

  // 2. Moderation Admin: modadmin@prakaro.app / ModAdmin123!
  const maEmail = 'modadmin@prakaro.app';
  const maPass = 'ModAdmin123!';
  const maHashed = await hashPassword(maPass);

  const ma = await prisma.moderator.upsert({
    where: { email: maEmail },
    create: {
      name: 'Prakaro Moderation Admin',
      email: maEmail,
      role: 'MODERATION_ADMIN',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
    update: {
      name: 'Prakaro Moderation Admin',
      role: 'MODERATION_ADMIN',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
  });

  const existingMaAcc = await prisma.moderatorAccount.findFirst({
    where: { userId: ma.id, providerId: 'credential' },
  });
  if (existingMaAcc) {
    await prisma.moderatorAccount.update({
      where: { id: existingMaAcc.id },
      data: { password: maHashed },
    });
  } else {
    await prisma.moderatorAccount.create({
      data: {
        userId: ma.id,
        accountId: ma.id,
        providerId: 'credential',
        password: maHashed,
      },
    });
  }

  // 3. Frontline Moderator: moderator@prakaro.app / Moderator123!
  const modEmail = 'moderator@prakaro.app';
  const modPass = 'Moderator123!';
  const modHashed = await hashPassword(modPass);

  const mod = await prisma.moderator.upsert({
    where: { email: modEmail },
    create: {
      name: 'Frontline Moderator',
      email: modEmail,
      role: 'MODERATOR',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
    update: {
      name: 'Frontline Moderator',
      role: 'MODERATOR',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
  });

  const existingModAcc = await prisma.moderatorAccount.findFirst({
    where: { userId: mod.id, providerId: 'credential' },
  });
  if (existingModAcc) {
    await prisma.moderatorAccount.update({
      where: { id: existingModAcc.id },
      data: { password: modHashed },
    });
  } else {
    await prisma.moderatorAccount.create({
      data: {
        userId: mod.id,
        accountId: mod.id,
        providerId: 'credential',
        password: modHashed,
      },
    });
  }

  // 4. QA Reviewer: qa@prakaro.app / QAReviewer123!
  const qaEmail = 'qa@prakaro.app';
  const qaPass = 'QAReviewer123!';
  const qaHashed = await hashPassword(qaPass);

  const qa = await prisma.moderator.upsert({
    where: { email: qaEmail },
    create: {
      name: 'Quality Assurance Auditor',
      email: qaEmail,
      role: 'QA_REVIEWER',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
    update: {
      name: 'Quality Assurance Auditor',
      role: 'QA_REVIEWER',
      status: 'ACTIVE',
      organizationId: defaultOrg.id,
      lobId: defaultLob.id,
      emailVerified: true,
    },
  });

  const existingQaAcc = await prisma.moderatorAccount.findFirst({
    where: { userId: qa.id, providerId: 'credential' },
  });
  if (existingQaAcc) {
    await prisma.moderatorAccount.update({
      where: { id: existingQaAcc.id },
      data: { password: qaHashed },
    });
  } else {
    await prisma.moderatorAccount.create({
      data: {
        userId: qa.id,
        accountId: qa.id,
        providerId: 'credential',
        password: qaHashed,
      },
    });
  }

  // 5. Ensure All Active Queues have moderator and qa assigned
  const allQueues = await prisma.moderationQueue.findMany({
    where: { status: 'ACTIVE' },
  });

  for (const q of allQueues) {
    await prisma.moderationMembership.upsert({
      where: { moderatorId_queueId: { moderatorId: mod.id, queueId: q.id } },
      create: { moderatorId: mod.id, queueId: q.id },
      update: {},
    });
    await prisma.moderationMembership.upsert({
      where: { moderatorId_queueId: { moderatorId: qa.id, queueId: q.id } },
      create: { moderatorId: qa.id, queueId: q.id },
      update: {},
    });
  }

  console.log('Demo accounts successfully seeded:\n');
  console.log('--------------------------------------------------------------------------------');
  console.log('| Domain          | Role             | Email                 | Password         |');
  console.log('--------------------------------------------------------------------------------');
  console.log('| Super Admin     | SUPER_ADMIN      | admin@prakaro.app     | Admin123!        |');
  console.log('| Staff/Moderator | MODERATION_ADMIN | modadmin@prakaro.app  | ModAdmin123!     |');
  console.log('| Staff/Moderator | MODERATOR        | moderator@prakaro.app | Moderator123!    |');
  console.log('| Staff/Moderator | QA_REVIEWER      | qa@prakaro.app        | QAReviewer123!   |');
  console.log('--------------------------------------------------------------------------------');
  console.log(`\nAssigned frontline moderator and QA auditor to ${allQueues.length} active queue(s).`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
