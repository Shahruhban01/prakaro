import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Prisma, PrismaClient } from '@prisma/client';
import type { AnalyticsActor } from '../src/modules/moderation/analytics-scope';
import { policyDocument, validatePolicyDecision } from '../src/modules/moderation/policy/contracts';
import { changeVersion, resolvePolicy, scopeKey } from '../src/modules/moderation/policy/service';
import { readReview } from '../src/modules/moderation/qa/reviews';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && /^\/prakaro_phase8_benchmark(?:_[a-z0-9]+)?$/.test(url.pathname),
  'Use a dedicated, fresh localhost Phase 8 benchmark schema.');
const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
let queryCount = 0;
db.$on('query', ({ query }) => { if (!/^\s*(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION)/i.test(query)) queryCount++; });
const date = new Date('2026-11-01T00:00:00Z');
const document = policyDocument.parse({
  overview: 'Synthetic policy benchmark',
  sections: [{ title: 'Sources', content: 'Benchmark only.' }], decisionGuidance: [],
  fields: [{ id: 'notes', label: 'Notes', type: 'SHORT_TEXT', required: true }],
  tags: [{ id: 'rule_followed', label: 'Rule followed', actions: ['APPROVE'], required: true }],
  evidence: [{ id: 'proof', label: 'Current proof', type: 'INDEPENDENT_VERIFICATION', actions: ['APPROVE'] }],
});
const hash = createHash('sha256').update(JSON.stringify(document)).digest('hex');
const actor: AnalyticsActor = {
  userId: 'benchmark', email: 'benchmark@example.test', name: 'Synthetic policy operator', role: 'SUPER_ADMIN',
  admin: true, superAdmin: true, actorType: 'SUPER_ADMIN', queues: [], organizationId: null, lobId: null,
  organization: null, lob: null, queueDelegated: false, requiresTeam: false, hasTeam: false,
};
async function measure(action: () => unknown | Promise<unknown>, repeats = 5) {
  const times = [];
  for (let index = 0; index < repeats; index++) {
    const queries = queryCount;
    const clock = performance.now();
    await action();
    times.push({ ms: Math.round((performance.now() - clock) * 1000) / 1000, queries: queryCount - queries });
  }
  return times.sort((a, b) => a.ms - b.ms)[Math.floor(repeats / 2)];
}
async function chunks<T>(rows: T[], persist: (items: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 250) await persist(rows.slice(i, i + 250));
}
async function cohort(code: string, policyCount: number, versionsPerPolicy: number) {
  const org = await db.organization.create({ data: { code: 'BENCH-' + code, name: 'Synthetic ' + code, createdBy: actor.userId } });
  const lob = await db.lob.create({ data: { code: 'LOB-' + code, name: 'Benchmark line', organizationId: org.id, createdBy: actor.userId } });
  const queue = await db.moderationQueue.create({ data: {
    code: 'QUEUE-' + code, name: 'Synthetic policy queue', kind: 'GENERAL', createdBy: actor.userId,
    organizationId: org.id, config: {}, access: { create: { lobId: lob.id, actorId: actor.userId, actorType: 'SUPER_ADMIN' } },
  } });
  const worker = await db.moderator.create({ data: {
    email: code.toLowerCase() + '@example.test', name: 'Synthetic moderator', organizationId: org.id, lobId: lob.id,
  } });
  const work = await db.moderationWorkSession.create({
    data: { queueId: queue.id, moderatorId: worker.id, startedAt: date, endedAt: date, status: 'ENDED' },
  });
  const facility = await db.parkingIntelligenceCase.create({ data: {
    displayName: 'Synthetic benchmark case', admission: { create: { firstEvent: 'phase8-benchmark' } },
  } });
  const policies = Array.from({ length: policyCount }, (_, index) => ({
    id: randomUUID(), organizationId: org.id, name: 'Synthetic policy ' + index, category: 'Benchmark', description: '', createdBy: actor.userId,
  }));
  await chunks(policies, (data) => db.moderationPolicy.createMany({ data }));
  const versions = policies.flatMap(({ id }) => Array.from({ length: versionsPerPolicy }, (_, i) => ({
    id: randomUUID(), policyId: id, number: i + 1, status: 'PUBLISHED', contentHash: hash,
    document, changeSummary: 'Synthetic benchmark only.', createdBy: actor.userId, publishedAt: date, publisherId: actor.userId,
  })));
  await chunks<Prisma.PolicyVersionCreateManyInput>(versions, (data) => db.policyVersion.createMany({ data }));
  const target = versions[versionsPerPolicy - 1]!;
  const key = scopeKey(org.id, null, queue.id);
  await db.policyAssignment.create({ data: {
    organizationId: org.id, queueId: queue.id, versionId: target.id, scopeKey: key, activeKey: key, effectiveFrom: date, createdBy: actor.userId,
  } });

  const cases = Array.from({ length: policyCount }, (_, index) => ({
    id: randomUUID(), facilityId: facility.id, code: 'CASE-' + code + '-' + index, category: 'BENCHMARK',
    trigger: 'REPORT', status: 'REJECTED',
  }));
  await chunks(cases, (data) => db.moderationCase.createMany({ data }));
  const reservations = cases.map((item) => ({
    id: randomUUID(), caseId: item.id, moderatorId: worker.id, queueId: queue.id, sessionId: work.id,
    status: 'COMPLETED' as const, reservedAt: date, leaseExpiresAt: date, pinnedPolicyId: target.id,
  }));
  await chunks(reservations, (data) => db.moderationCaseReservation.createMany({ data }));
  await chunks(reservations.map((item) => ({
    reservationId: item.id, organizationId: org.id, lobId: lob.id, queueId: queue.id, versionId: target.id, status: 'OPEN',
  })), (data) => db.policyClarification.createMany({ data }));
  const decision = await db.moderationDecisionVersion.create({ data: {
    caseId: cases[0]!.id, moderatorId: worker.id, action: 'REJECT', reason: 'Synthetic benchmark.',
    pinnedPolicyId: target.id, evidenceIds: [], answers: {}, createdAt: date,
  } });
  const sample = await db.qaSample.create({ data: {
    decisionId: decision.id, organizationId: org.id, lobId: lob.id, queueId: queue.id, moderatorId: worker.id,
    selection: 'MANUAL', status: 'PENDING', sampledAt: date, completedAt: date,
  } });
  const resolution = await measure(async () => assert.equal(await resolvePolicy(db, org.id, lob.id, queue.id), target.id));
  const version = await measure(() => db.policyVersion.findUniqueOrThrow({ where: { id: target.id } }));
  const assignment = await measure(() => db.policyAssignment.findUniqueOrThrow({ where: { activeKey: key } }));
  const validation = await measure(() => { for (let i = 0; i < 500; i++)
    assert.equal(Object.keys(validatePolicyDecision(document, 'APPROVE', { notes: 'Inspection' }, ['rule_followed'], ['fixture'], false)).length, 0); });
  const tagValidation = await measure(() => { for (let i = 0; i < 500; i++)
    assert.ok(validatePolicyDecision(document, 'APPROVE', { notes: 'Inspection' }, ['unknown'], ['fixture'], false).tags); });
  const clarificationList = await measure(() => db.policyClarification.findMany({ where: { organizationId: org.id, status: 'OPEN' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, status: true, versionId: true } }));
  const historicalQa = await measure(async () => assert.equal((await readReview(db, actor, sample.id)).decision.pinnedPolicyId, target.id));
  const draft = await db.policyVersion.create({ data: { policyId: target.policyId, number: versionsPerPolicy + 1, status: 'IN_REVIEW',
    document, changeSummary: 'Benchmark amendment', createdBy: actor.userId } });
  const publication = await measure(() => db.$transaction((tx) => changeVersion(tx, actor, target.policyId, draft.id, 'publish', 0),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), 1);
  assert.equal(await resolvePolicy(db, org.id, lob.id, queue.id), draft.id);
  console.log(JSON.stringify({ policyCount, versions: versions.length, resolution, version, assignment,
    validation500: validation, invalidTags500: tagValidation, clarificationList, historicalQa, publication }));
}
async function main() {
  assert.equal(await db.organization.count(), 0, 'Use a fresh synthetic benchmark database.');
  await cohort('P100', 100, 1);
  await cohort('P1000', 1000, 1);
  await cohort('V10000', 1000, 10);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
