import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { PrismaClient } from '@prisma/client';

export async function createQaFixture(db: PrismaClient) {
  const databaseName = new URL(process.env.DATABASE_URL ?? '').pathname;
  if (!/test|phase7/i.test(databaseName)) throw new Error('Use an isolated test database for QA fixtures.');
  const key = randomUUID().slice(0, 8).toUpperCase();
  const password = 'QaIsolatedWorkflow!1234';
  const hashed = await hashPassword(password);
  const org = await db.organization.create({ data: { code: 'QA-' + key, name: 'Quality Operations ' + key, createdBy: 'qa-test' } });
  const otherOrg = await db.organization.create({ data: { code: 'QT-' + key, name: 'Separate Tenant ' + key, createdBy: 'qa-test' } });
  async function lob(organizationId: string, prefix: string) {
    return db.lob.create({ data: { code: prefix + key, name: prefix + ' Parking', organizationId, createdBy: 'qa-test' } });
  }
  const [line, otherLine, foreignLine] = await Promise.all([lob(org.id, 'MAIN-'), lob(org.id, 'OTHER-'), lob(otherOrg.id, 'FOREIGN-')]);
  async function employee(name: string, role: string, organizationId = org.id, lobId = line.id) {
    const id = randomUUID();
    return db.moderator.create({ data: {
      id, name: name + ' ' + key, email: name.toLowerCase().replaceAll(' ', '-') + '.' + key.toLowerCase() + '@example.test',
      role, status: 'ACTIVE', organizationId, lobId, accounts: { create: { accountId: id, providerId: 'credential', password: hashed } },
    } });
  }
  const [moderator, auditor, secondAuditor, supervisor, director, outsider, wrongLob] = await Promise.all([
    employee('Reviewer', 'MODERATOR'), employee('Auditor', 'QA_REVIEWER'), employee('Second Auditor', 'QA_REVIEWER'),
    employee('Supervisor', 'QA_SUPERVISOR'), employee('Director', 'MODERATION_ADMIN'),
    employee('Foreign Auditor', 'QA_REVIEWER', otherOrg.id, foreignLine.id), employee('Other Auditor', 'QA_REVIEWER', org.id, otherLine.id),
  ]);
  const form = [{
    key: 'verification_basis', label: 'Verification basis', type: 'REASON', required: true, options: ['Independent inspection', 'Documented exclusion'],
  }];
  const config = { rule: { field: 'source', value: 'REPORT' }, columns: ['code'], form,
    reviewPolicy: 'Policy QA-1 requires current independent evidence for approval.', slaHours: 24, qaPercent: 0 };
  const queue = await db.moderationQueue.create({ data: {
    name: 'Quality Parking Queue ' + key, code: 'QA-Q-' + key, kind: 'GENERAL', config,
    organizationId: org.id, createdBy: 'qa-test',
    access: { create: { lobId: line.id, actorId: director.id, actorType: 'MODERATOR' } },
  } });
  await db.queueSubscription.create({ data: { queueId: queue.id, moderatorId: moderator.id } });
  async function createCase(suffix: string) {
    const facility = await db.parkingIntelligenceCase.create({ data: {
      googlePlaceId: 'synthetic-qa-' + key + '-' + suffix,
      displayName: 'Synthetic QA fixture ' + suffix, admission: { create: { firstEvent: 'qa-test' } },
      evidence: { create: { source: 'PRAKARO_AUDIT', finding: 'CONFIRMED_PARKING',
        reference: 'Synthetic independent inspection ' + suffix, approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000) } },
    }, include: { evidence: true } });
    const item = await db.moderationCase.create({ data: {
      code: 'CASE-QA-' + key + '-' + suffix, facilityId: facility.id, category: 'USER_REPORT_REVIEW',
      status: 'QUEUED', trigger: 'REPORT', activeKey: facility.id + ':QA_FIXTURE',
      tasks: { create: { queueId: queue.id, queueVersion: 1, form: config, deadline: new Date(Date.now() + 86400000) } },
    } });
    return { item, facility, evidenceId: facility.evidence[0]!.id };
  }
  return { org, otherOrg, line, otherLine, queue, moderator, auditor, secondAuditor, supervisor, director, outsider,
    wrongLob, password, createCase };
}
