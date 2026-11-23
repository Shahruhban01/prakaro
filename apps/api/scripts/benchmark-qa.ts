import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/common/database/prisma';
import type { AnalyticsActor } from '../src/modules/moderation/analytics-scope';
import { handlingSources } from '../src/modules/moderation/handling-metrics';
import { qaEligibility, qaFilters } from '../src/modules/moderation/qa/contracts';
import { approveCorrection, requestCorrection, startCorrection } from '../src/modules/moderation/qa/corrections';
import { qaDashboard, qaWorklist, qualityGroups } from '../src/modules/moderation/qa/reporting';
import { claimNext, startReview, submitReview } from '../src/modules/moderation/qa/reviews';
import { drainQaSamples } from '../src/modules/moderation/qa/sampling';

async function timed<T>(action: () => Promise<T>) {
  const start = performance.now();
  const result = await action();
  return { ms: Math.round(performance.now() - start), result };
}
async function median(action: () => Promise<unknown>) {
  const timings = [];
  for (let run = 0; run < 3; run++) timings.push((await timed(action)).ms);
  return timings.sort((a, b) => a - b)[1];
}
const tx = <T>(action: (db: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(action, { timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

async function run() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/prakaro_phase6_benchmark(?:_[a-z0-9]+)?$/.test(url.pathname),
    'Use a fresh local synthetic benchmark database.');
  const org = await prisma.organization.findUniqueOrThrow({ where: { code: 'BENCHMARK' } });
  assert.equal(await prisma.organization.count(), 1, 'Expected only the synthetic benchmark organization.');
  assert.equal(await prisma.qaSample.count(), 0, 'Use a fresh QA benchmark database.');
  const count = await prisma.caseHandlingRecord.count();
  assert.ok([100, 10000, 100000].includes(count));
  const lob = await prisma.lob.findFirstOrThrow({ where: { organizationId: org.id }, orderBy: { code: 'asc' } });
  const auditor = await prisma.moderator.create({ data: {
    name: 'Synthetic QA auditor', email: 'bench-qa@example.test', organizationId: org.id, lobId: lob.id,
    role: 'QA_REVIEWER', status: 'ACTIVE',
  } });
  const platform: AnalyticsActor = {
    userId: 'benchmark', email: 'benchmark@example.test', name: 'Synthetic QA operator', role: 'SUPER_ADMIN',
    admin: true, superAdmin: true, actorType: 'SUPER_ADMIN', queues: [], organizationId: null, lobId: null,
    organization: null, lob: null, queueDelegated: false, requiresTeam: false, hasTeam: false,
  };
  const reviewing: AnalyticsActor = {
    ...platform, userId: auditor.id, email: auditor.email, name: auditor.name, admin: false,
    superAdmin: false, actorType: 'MODERATOR', role: 'QA_REVIEWER', organizationId: org.id, lobId: lob.id,
  };
  const policy = await prisma.qaPolicy.create({ data: {
    organizationId: org.id, scopeKey: org.id + ':org', activeKey: org.id + ':org', version: 1,
    rate: 10000, enabled: true, createdBy: 'benchmark', effectiveFrom: new Date('2026-11-01T00:00:00Z'),
  } });
  const firstBatch = await timed(() => drainQaSamples(40));
  assert.equal(firstBatch.result, 40);
  // Bulk fixture only. The separately timed worker uses the production transactional sampler.
  await tx(async (db) => {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO qa_sample (id, decisionId, organizationId, lobId, queueId, moderatorId, policyId,
        completedAt, sampledAt, draw, selection, status)
      SELECT UUID(), h.decisionVersionId, a.organizationId, a.lobId, h.queueId, h.moderatorId, ${policy.id},
        h.submittedAt, UTC_TIMESTAMP(3), 1, 'SELECTED', 'PENDING'
      ${handlingSources} JOIN moderation_queue q ON q.id = h.queueId
      WHERE ${qaEligibility}
        AND NOT EXISTS (SELECT 1 FROM qa_sample s WHERE s.decisionId = h.decisionVersionId)
      ORDER BY h.submittedAt, h.id LIMIT ${count - 80}`);
    await db.$executeRaw(Prisma.sql`
      INSERT INTO qa_assessment (id, sampleId, auditorId, originalOutcome, originalScore, finalOutcome,
        finalScore, finalizedAt, handlingSeconds, fingerprint)
      SELECT UUID(), id, ${auditor.id}, 'PASS', 100, 'PASS', 100, UTC_TIMESTAMP(3), 30, REPEAT('0',64)
      FROM qa_sample ORDER BY completedAt, id LIMIT ${Math.floor(count / 5)}`);
    await db.$executeRaw`UPDATE qa_sample s JOIN qa_assessment a ON s.id = a.sampleId SET s.status = 'COMPLETED'`;
  });
  const warmBatch = await timed(() => drainQaSamples(40));
  assert.equal(warmBatch.result, 40);
  const query = qaFilters.parse({ organizationId: org.id, from: '2026-11-01', to: '2026-11-07' });
  const listMs = await median(() => tx((db) => qaWorklist(db, platform, query)));
  const aggregateMs = await median(() => tx((db) => qualityGroups(db, platform, query, 'queueId')));
  const dashboardMs = await median(() => tx((db) => qaDashboard(db, platform, query)));
  const totals = await tx((db) => qaDashboard(db, platform, query));
  assert.equal(totals.eligible, count);
  assert.equal(totals.sampled, count);

  const assignment = await timed(() => tx((db) => claimNext(db, reviewing)));
  assert.ok(assignment.result);
  const { id, assignmentVersion } = assignment.result;
  await tx((db) => startReview(db, reviewing, id, assignmentVersion));
  await tx((db) => submitReview(db, reviewing, id, assignmentVersion, {
    outcome: 'FAIL', notes: 'Synthetic benchmark outcome', category: 'INCORRECT_DECISION',
    severity: 'MAJOR', policyReference: 'Synthetic benchmark policy', proposedAction: 'ESCALATE',
  }));
  const correction = await tx((db) => requestCorrection(db, platform, id, { action: 'ESCALATE', reason: 'Synthetic correction', evidenceIds: [] }));
  await tx((db) => startCorrection(db, platform, correction.id));
  const commit = await timed(() => tx((db) => approveCorrection(db, platform, correction.id)));
  assert.ok(commit.result.approvedAt);
  const plan = await prisma.$queryRaw<{ table: string; type: string; key: string | null; rows: bigint }[]>(Prisma.sql`
    EXPLAIN SELECT STRAIGHT_JOIN h.decisionVersionId ${handlingSources} JOIN moderation_queue q ON q.id = h.queueId
    WHERE h.submittedAt >= ${policy.effectiveFrom} AND ${qaEligibility}
      AND NOT EXISTS (SELECT 1 FROM qa_sample s WHERE s.decisionId = h.decisionVersionId)
    ORDER BY h.submittedAt, h.id LIMIT 40`);
  const worklistPlan = await prisma.$queryRaw<typeof plan>`
    EXPLAIN SELECT id FROM qa_sample WHERE organizationId = ${org.id} AND lobId = ${lob.id}
      AND status = 'PENDING' ORDER BY sampledAt, id LIMIT 20`;
  console.log(JSON.stringify({
    count, firstBatchMs: firstBatch.ms, warmBatchMs: warmBatch.ms, warmSamplesPerSecond: Math.round(40000 / Math.max(1, warmBatch.ms)),
    listMs, aggregateMs, dashboardMs, claimMs: assignment.ms, correctionCommitMs: commit.ms, finalizedFixtureRows: totals.evaluated,
    samplingPlan: plan.map(({ table, type, key, rows }) => ({ table, type, key, rows: Number(rows) })),
    worklistPlan: worklistPlan.map(({ table, type, key, rows }) => ({ table, type, key, rows: Number(rows) })),
  }));
}
run().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
