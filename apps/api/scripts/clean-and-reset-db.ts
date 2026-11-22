import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/common/database/prisma';

async function main() {
  console.log('--- PRAKARO CLEAN SLATE & FRESH SEED ---');

  // 1. Purge test moderation submissions, tasks, cases, admissions, evidence, runs
  console.log('1. Clearing all testing inserts and test cases...');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_submission');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_task');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_case');
  await prisma.$executeRawUnsafe('DELETE FROM parking_human_label');
  await prisma.$executeRawUnsafe('DELETE FROM parking_evidence_reference');
  await prisma.$executeRawUnsafe('DELETE FROM parking_verification_run');
  await prisma.$executeRawUnsafe('DELETE FROM search_admission');
  await prisma.$executeRawUnsafe('DELETE FROM parking_intelligence_case');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_audit');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_counter');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_membership');
  await prisma.$executeRawUnsafe('DELETE FROM moderation_queue');

  // 2. Clear old test accounts and sessions
  console.log('2. Resetting administrative and moderator accounts...');
  await prisma.$executeRawUnsafe('DELETE FROM moderator_sessions');
  await prisma.$executeRawUnsafe('DELETE FROM moderator_accounts');
  await prisma.$executeRawUnsafe('DELETE FROM moderator_verifications');
  await prisma.$executeRawUnsafe('DELETE FROM moderators');
  await prisma.$executeRawUnsafe('DELETE FROM super_admin_sessions');
  await prisma.$executeRawUnsafe('DELETE FROM super_admin_accounts');
  await prisma.$executeRawUnsafe('DELETE FROM super_admin_verifications');
  await prisma.$executeRawUnsafe('DELETE FROM super_admins');

  // 3. Seed Super Admin
  console.log('3. Seeding Super Admin (admin@prakaro.app)...');
  const saHashed = await hashPassword('Admin123!');
  const sa = await prisma.superAdmin.create({
    data: {
      name: 'System Super Admin',
      email: 'admin@prakaro.app',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  await prisma.superAdminAccount.create({
    data: {
      userId: sa.id,
      accountId: sa.id,
      providerId: 'credential',
      password: saHashed,
    },
  });

  // 4. Seed Standard Default Queues (Managed exclusively by Super Admin)
  console.log('4. Seeding default queues and routing rules...');

  // Queue 1: General Discovery Queue (source == SEARCH)
  const qGeneral = await prisma.moderationQueue.create({
    data: {
      code: 'QUEUE-GENERAL-001',
      name: 'New Facility Verification',
      description: 'Standard discovery triage for newly searched and discovered parking candidates.',
      kind: 'GENERAL',
      status: 'ACTIVE',
      priority: 50,
      capacity: 1000,
      version: 1,
      createdBy: sa.id,
      config: {
        rule: { field: 'source', value: 'SEARCH' },
        columns: ['code', 'category', 'status', 'priority', 'owner', 'createdAt'],
        slaHours: 48,
        qaPercent: 100,
        form: [
          {
            key: 'facility_type',
            label: 'Confirmed Parking Facility Status',
            type: 'SELECT',
            required: true,
            options: ['CONFIRMED_PARKING', 'CONFIRMED_NON_PARKING', 'UNCONFIRMED'],
          },
          {
            key: 'access_tier',
            label: 'Access Permission Tier',
            type: 'SELECT',
            required: true,
            options: ['PUBLIC', 'CUSTOMERS_ONLY', 'PRIVATE', 'RESTRICTED'],
          },
          {
            key: 'pricing_tier',
            label: 'Pricing Tier',
            type: 'SELECT',
            required: true,
            options: ['FREE', 'PAID', 'MIXED', 'UNKNOWN'],
          },
        ],
      },
    },
  });

  // Queue 2: User Problem Reports Queue (source == REPORT)
  const qReports = await prisma.moderationQueue.create({
    data: {
      code: 'QUEUE-REPORT-001',
      name: 'User Problem Reports',
      description: 'High-priority investigation queue for mobile driver problem reports (closures, wrong location, not parking).',
      kind: 'REPORT',
      status: 'ACTIVE',
      priority: 90,
      capacity: 500,
      version: 1,
      createdBy: sa.id,
      config: {
        rule: { field: 'source', value: 'REPORT' },
        columns: ['code', 'category', 'priority', 'status', 'trigger', 'createdAt'],
        slaHours: 24,
        qaPercent: 100,
        form: [
          {
            key: 'report_validity',
            label: 'User Report Assessment',
            type: 'SELECT',
            required: true,
            options: ['SUBSTANTIATED', 'UNSUBSTANTIATED', 'INCONCLUSIVE'],
          },
          {
            key: 'correction_action',
            label: 'Corrective Action Taken',
            type: 'SELECT',
            required: true,
            options: ['MARK_CLOSED', 'MARK_NON_PARKING', 'UPDATE_ACCESS', 'REJECT_REPORT'],
          },
        ],
      },
    },
  });

  // Queue 3: High-Demand Escalation Queue (demand >= 5)
  const qEscalation = await prisma.moderationQueue.create({
    data: {
      code: 'QUEUE-ESCALATION-001',
      name: 'High Demand Facilities',
      description: 'Fast-track priority queue for facilities searched by 5 or more distinct drivers.',
      kind: 'ESCALATION',
      status: 'ACTIVE',
      priority: 80,
      capacity: 200,
      version: 1,
      createdBy: sa.id,
      config: {
        rule: { field: 'demand', value: '5' },
        columns: ['code', 'category', 'priority', 'status', 'owner', 'createdAt'],
        slaHours: 12,
        qaPercent: 100,
        form: [
          {
            key: 'high_demand_verification',
            label: 'Rapid Verification Decision',
            type: 'SELECT',
            required: true,
            options: ['VERIFIED_SAFE', 'REQUIRES_FIELD_AUDIT', 'UNCONFIRMED'],
          },
        ],
      },
    },
  });

  // 5. Seed Staff Accounts
  console.log('5. Seeding staff accounts (Moderation Admin, Moderator, QA Reviewer)...');

  // Moderation Admin: modadmin@prakaro.app / ModAdmin123!
  const maHashed = await hashPassword('ModAdmin123!');
  const ma = await prisma.moderator.create({
    data: {
      name: 'Moderation Administrator',
      email: 'modadmin@prakaro.app',
      role: 'MODERATION_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      invitedBy: sa.id,
    },
  });
  await prisma.moderatorAccount.create({
    data: {
      userId: ma.id,
      accountId: ma.id,
      providerId: 'credential',
      password: maHashed,
    },
  });

  // Frontline Moderator: moderator@prakaro.app / Moderator123!
  const modHashed = await hashPassword('Moderator123!');
  const mod = await prisma.moderator.create({
    data: {
      name: 'Prakaro Moderator',
      email: 'moderator@prakaro.app',
      role: 'MODERATOR',
      status: 'ACTIVE',
      emailVerified: true,
      invitedBy: sa.id,
    },
  });
  await prisma.moderatorAccount.create({
    data: {
      userId: mod.id,
      accountId: mod.id,
      providerId: 'credential',
      password: modHashed,
    },
  });

  // QA Reviewer: qa@prakaro.app / QAReviewer123!
  const qaHashed = await hashPassword('QAReviewer123!');
  const qa = await prisma.moderator.create({
    data: {
      name: 'Quality Assurance Reviewer',
      email: 'qa@prakaro.app',
      role: 'QA_REVIEWER',
      status: 'ACTIVE',
      emailVerified: true,
      invitedBy: sa.id,
    },
  });
  await prisma.moderatorAccount.create({
    data: {
      userId: qa.id,
      accountId: qa.id,
      providerId: 'credential',
      password: qaHashed,
    },
  });

  // 6. Assign Queue Memberships
  console.log('6. Assigning queue memberships...');
  // Frontline moderator assigned to General and Reports queues
  await prisma.moderationMembership.createMany({
    data: [
      { moderatorId: mod.id, queueId: qGeneral.id },
      { moderatorId: mod.id, queueId: qReports.id },
    ],
  });

  // Moderation admin & QA reviewer assigned to all queues
  await prisma.moderationMembership.createMany({
    data: [
      { moderatorId: ma.id, queueId: qGeneral.id },
      { moderatorId: ma.id, queueId: qReports.id },
      { moderatorId: ma.id, queueId: qEscalation.id },
      { moderatorId: qa.id, queueId: qGeneral.id },
      { moderatorId: qa.id, queueId: qReports.id },
      { moderatorId: qa.id, queueId: qEscalation.id },
    ],
  });

  // 7. Verify clean case state
  const caseCount = await prisma.moderationCase.count();
  console.log(`\nVerification: Active moderation cases in database = ${caseCount} (Clean slate ready for real intake)`);

  console.log('\nFresh Demo Accounts Available:');
  console.log('=====================================================');
  console.log('Super Admin:       admin@prakaro.app     / Admin123!');
  console.log('Moderation Admin:  modadmin@prakaro.app  / ModAdmin123!');
  console.log('Frontline Mod:     moderator@prakaro.app / Moderator123!');
  console.log('QA Reviewer:       qa@prakaro.app        / QAReviewer123!');
  console.log('=====================================================');
  console.log('Ready for live discovery and user problem reporting.\n');
}

main()
  .catch((e) => {
    console.error('Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
