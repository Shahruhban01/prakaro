import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/common/database/prisma';

async function main() {
  console.log('=====================================================');
  console.log('       PRAKARO FRESH SLATE & PRODUCTION SEED         ');
  console.log('=====================================================');

  // 1. Purge all test cases, reservations, submissions, tasks, admissions, runs
  console.log('\n[1/7] Wiping test cases, QA records, attendance, and queues...');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');

  const tablesToTruncate = [
    'qa_dispute',
    'qa_correction',
    'qa_assessment',
    'qa_sample',
    'qa_policy',
    'moderation_decision_version',
    'case_handling_record',
    'moderation_case_reservation',
    'moderation_submission',
    'moderation_task',
    'moderation_case',
    'parking_human_label',
    'parking_evidence_reference',
    'parking_verification_version',
    'parking_verification_run',
    'parking_evaluation_metrics',
    'parking_ai_daily_budget',
    'search_admission',
    'parking_intelligence_case',
    'moderation_audit',
    'moderation_counter',
    'aux_transition_audit',
    'aux_interval',
    'attendance_session',
    'moderation_work_session',
    'workforce_alert_event',
    'workforce_alert_rule',
    'workforce_shift_assignment',
    'workforce_shift',
    'workforce_capacity_plan',
    'workforce_team_links',
    'workforce_teams',
    'clarification_message',
    'policy_clarification',
    'policy_assignment',
    'policy_version',
    'moderation_policy',
    'queue_subscription',
    'queue_configuration_version',
    'queue_lob_access',
    'moderation_membership',
    'moderation_queue',
    'moderator_sessions',
    'moderator_accounts',
    'moderator_verifications',
    'moderators',
    'super_admin_sessions',
    'super_admin_accounts',
    'super_admin_verifications',
    'super_admins',
    'lobs',
    'organizations',
  ];

  for (const table of tablesToTruncate) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
    } catch {
      await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    }
  }

  // Clean out synthetic test drivers while preserving real users
  try {
    await prisma.$executeRawUnsafe(`
      DELETE FROM account WHERE userId IN (
        SELECT id FROM users WHERE email LIKE '%@example.test' OR email LIKE 'driver_test_%' OR email LIKE 'driver-%@prakaro.app'
      )
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM session WHERE userId IN (
        SELECT id FROM users WHERE email LIKE '%@example.test' OR email LIKE 'driver_test_%' OR email LIKE 'driver-%@prakaro.app'
      )
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM users WHERE email LIKE '%@example.test' OR email LIKE 'driver_test_%' OR email LIKE 'driver-%@prakaro.app'
    `);
  } catch (err) {
    console.warn('Note on user cleanup:', err);
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✓ All test records and historical cases cleared.');

  // 2. Seed Super Admin
  console.log('\n[2/7] Seeding Super Admin (admin@prakaro.app)...');
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
  console.log('✓ Super Admin created.');

  // 3. Seed Default Organization & Line of Business (LOB)
  console.log('\n[3/7] Seeding Core Organization and Line of Business...');
  const org = await prisma.organization.create({
    data: {
      code: 'PRAKARO_CORE_OPS',
      name: 'Prakaro Core Operations',
      description: 'Default organization for Prakaro trust & safety operations',
      active: true,
      createdBy: sa.id,
    },
  });

  const lob = await prisma.lob.create({
    data: {
      code: 'PARKING_VERIFICATION',
      name: 'Parking Verification Line',
      description: 'Parking discovery and user problem report verification line of business',
      active: true,
      organizationId: org.id,
      createdBy: sa.id,
    },
  });
  console.log(`✓ Organization (${org.code}) and LOB (${lob.code}) created.`);

  // 4. Seed Standard Default Queues (Managed exclusively by Super Admin)
  console.log('\n[4/7] Seeding default queues with routing rules and forms...');

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
      intakeEnabled: true,
      organizationId: org.id,
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
      intakeEnabled: true,
      organizationId: org.id,
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
      intakeEnabled: true,
      organizationId: org.id,
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

  // Grant LOB access to all three queues
  await prisma.queueLobAccess.createMany({
    data: [
      { queueId: qGeneral.id, lobId: lob.id, organizationId: org.id, actorId: sa.id, actorType: 'SUPER_ADMIN' },
      { queueId: qReports.id, lobId: lob.id, organizationId: org.id, actorId: sa.id, actorType: 'SUPER_ADMIN' },
      { queueId: qEscalation.id, lobId: lob.id, organizationId: org.id, actorId: sa.id, actorType: 'SUPER_ADMIN' },
    ],
  });
  console.log('✓ Queues seeded and linked to PARKING_VERIFICATION line of business.');

  // 5. Seed Staff Accounts
  console.log('\n[5/7] Seeding staff accounts (Admin, Moderator, QA Reviewer)...');

  // Moderation Admin: modadmin@prakaro.app / ModAdmin123!
  const maHashed = await hashPassword('ModAdmin123!');
  const ma = await prisma.moderator.create({
    data: {
      name: 'Moderation Administrator',
      email: 'modadmin@prakaro.app',
      role: 'MODERATION_ADMIN',
      status: 'ACTIVE',
      organizationId: org.id,
      lobId: lob.id,
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
      organizationId: org.id,
      lobId: lob.id,
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
      organizationId: org.id,
      lobId: lob.id,
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
  console.log('✓ Staff accounts created.');

  // 6. Assign Queue Memberships and Subscriptions
  console.log('\n[6/7] Subscribing moderators to queues...');
  // Frontline moderator assigned and subscribed to all active queues
  await prisma.moderationMembership.createMany({
    data: [
      { moderatorId: mod.id, queueId: qGeneral.id },
      { moderatorId: mod.id, queueId: qReports.id },
      { moderatorId: mod.id, queueId: qEscalation.id },
    ],
  });
  await prisma.queueSubscription.createMany({
    data: [
      { moderatorId: mod.id, queueId: qGeneral.id },
      { moderatorId: mod.id, queueId: qReports.id },
      { moderatorId: mod.id, queueId: qEscalation.id },
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
  console.log('✓ Queue memberships and subscriptions configured.');

  // 7. Verification & Status Check
  console.log('\n[7/7] Validating database integrity...');
  const [caseCount, taskCount, queueCount, modCount, saCount] = await Promise.all([
    prisma.moderationCase.count(),
    prisma.moderationTask.count(),
    prisma.moderationQueue.count(),
    prisma.moderator.count(),
    prisma.superAdmin.count(),
  ]);

  console.log('\n=====================================================');
  console.log('             DATABASE RESET SUMMARY                  ');
  console.log('=====================================================');
  console.log(`Active Moderation Cases:      ${caseCount} (Fresh clean slate)`);
  console.log(`Active Moderation Tasks:      ${taskCount}`);
  console.log(`Configured Production Queues: ${queueCount}`);
  console.log(`Active Staff Moderators:      ${modCount}`);
  console.log(`Active Super Administrators:  ${saCount}`);
  console.log('-----------------------------------------------------');
  console.log('Fresh Canonical Accounts Available for Testing:');
  console.log('-----------------------------------------------------');
  console.log('Super Admin:       admin@prakaro.app     / Admin123!');
  console.log('Moderation Admin:  modadmin@prakaro.app  / ModAdmin123!');
  console.log('Frontline Mod:     moderator@prakaro.app / Moderator123!');
  console.log('QA Reviewer:       qa@prakaro.app        / QAReviewer123!');
  console.log('=====================================================\n');
}

main()
  .catch((e) => {
    console.error('Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
