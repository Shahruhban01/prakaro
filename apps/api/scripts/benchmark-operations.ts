import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { analyticsFilters, reportWindow } from '../src/modules/moderation/analytics-calendar';
import { analyticsScope, type AnalyticsActor } from '../src/modules/moderation/analytics-scope';
import { handlingWhere, reportSources } from '../src/modules/moderation/analytics-data';
import { qaDashboard, qaWorklist } from '../src/modules/moderation/qa/reporting';
import { qaFilters } from '../src/modules/moderation/qa/contracts';
import { executive } from '../src/modules/moderation/operations/executive';
import { context, rangeInput } from '../src/modules/moderation/operations/schedule';
import { liveWorkforce } from '../src/modules/moderation/operations/attendance';
import { capacity } from '../src/modules/moderation/operations/capacity';
import { resolvePolicy, scopeKey } from '../src/modules/moderation/policy/service';

async function status() {
  const data = await prisma.$queryRaw<{ Variable_name: string; Value: string }[]>`
    SHOW GLOBAL STATUS WHERE Variable_name IN ('Questions','Threads_connected','Max_used_connections','Memory_used','Threads_running')`;
  return Object.fromEntries(data.map(({ Variable_name, Value }) => [Variable_name, Number(Value)]));
}
async function median(fn: () => Promise<unknown>) {
  const samples = [];
  for (let i = 0; i < 3; i++) { const start = performance.now(); await fn(); samples.push(performance.now() - start); }
  return Math.round(samples.sort((a,b) => a-b)[1]!);
}
async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && /^\/prakaro_phase6_benchmark(?:_[a-z0-9]+)?$/.test(db.pathname));
  assert.equal(await prisma.organization.count(), 1);
  assert.equal(await prisma.qaSample.count(), 0);
  const org = await prisma.organization.findUniqueOrThrow({ where: { code: 'BENCHMARK' } });
  const count = await prisma.caseHandlingRecord.count();
  assert.ok([10000,100000].includes(count));
  const lob = await prisma.lob.findFirstOrThrow({ where: { organizationId: org.id } });
  const actor: AnalyticsActor = {
    userId: 'benchmark', email: 'benchmark@example.test', name: 'Synthetic administrator', role: 'MODERATION_ADMIN', admin: false,
    superAdmin: false, actorType: 'MODERATOR', queues: [], organizationId: org.id, lobId: lob.id, organization: org.name, lob: lob.name,
    queueDelegated: false, requiresTeam: false, hasTeam: false,
  };
  const policy = await prisma.qaPolicy.create({ data: { organizationId: org.id, scopeKey: org.id + ':org', activeKey: org.id + ':org',
    version: 1, rate: 10000, enabled: true, createdBy: 'benchmark', effectiveFrom: new Date('2026-11-01T00:00:00Z') } });
  const auditor = await prisma.moderator.findFirstOrThrow({ where: { organizationId: org.id } });
  await prisma.$executeRaw`
    INSERT INTO qa_sample (id,decisionId,organizationId,lobId,queueId,moderatorId,policyId,completedAt,sampledAt,draw,selection,status)
      SELECT UUID(),h.decisionVersionId,a.organizationId,a.lobId,h.queueId,h.moderatorId,${policy.id},h.submittedAt,h.submittedAt,1,'SELECTED','PENDING'
      FROM case_handling_record h JOIN moderation_work_session s ON s.id=h.sessionId JOIN attendance_session a ON a.id=s.attendanceSessionId`;
  await prisma.$executeRaw`
    INSERT INTO qa_assessment (id,sampleId,auditorId,originalOutcome,originalScore,finalOutcome,finalScore,finalizedAt,handlingSeconds,fingerprint)
      SELECT UUID(), id, ${auditor.id}, 'PASS',100,'PASS',100,completedAt,25, REPEAT('0',64) FROM qa_sample LIMIT ${Math.floor(count / 5)}`;
  await prisma.$executeRaw`UPDATE qa_sample s JOIN qa_assessment a ON a.sampleId=s.id SET s.status='COMPLETED'`;
  const filters = analyticsFilters.parse({ preset: 'custom', from: '2026-11-01', through: '2026-11-07' });
  const scope = await analyticsScope(prisma, actor, filters);
  const window = reportWindow(filters, new Date('2026-11-10T00:00:00Z'));
  const clause = handlingWhere(scope, filters, window);
  const diagnostic = (before: boolean) => prisma.$queryRaw<{ scanned: bigint; duplicates: bigint }[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN COUNT(*) AS scanned,
      ${before ? Prisma.sql`COUNT(h.decisionVersionId) - COUNT(DISTINCT h.decisionVersionId)` : Prisma.sql`0`} AS duplicates
    ${reportSources} WHERE ${clause}`);
  const normalize = (rows: Awaited<ReturnType<typeof diagnostic>>) => rows.map((row) => [Number(row.scanned), Number(row.duplicates)]);
  assert.deepEqual(normalize(await diagnostic(true)), normalize(await diagnostic(false)));
  const before = await median(() => diagnostic(true));
  const after = await median(() => diagnostic(false));
  const oldQa = await median(() => qaDashboard(prisma, actor, qaFilters.parse({ from: '2026-11-01', to: '2026-11-07' })));
  const worklist = await median(() => qaWorklist(prisma, actor, qaFilters.parse({ from: '2026-11-01', to: '2026-11-07' })));
  const params = rangeInput.parse({ from: '2026-11-01', through: '2026-11-07' });
  const newOverview = await median(async () => assert.equal((await executive(prisma, actor, params, new Date())).completed, count));
  const now = new Date('2026-11-07T00:00:00Z');
  const planning = rangeInput.parse({ from: '2026-11-08', through: '2026-11-08' });
  const queues = await prisma.moderationQueue.findMany({ where: { organizationId: org.id }, include: { access: true } });
  const staff = await prisma.moderator.findMany({ where: { organizationId: org.id }, include: { teamLinks: true } });
  const shift = await prisma.workforceShift.create({ data: {
    organizationId: org.id, name: 'Synthetic test shift', timezone: 'UTC',
    startLocal: '08:00', endLocal: '16:00', breakMinutes: 30, createdBy: 'benchmark',
  } });
  await prisma.workforceShiftAssignment.createMany({ data: staff.flatMap((person) => !person.lobId ? [] : [{
    organizationId: org.id, employeeId: person.id, lobId: person.lobId, teamId: person.teamLinks[0]?.teamId,
    shiftId: shift.id, startsAt: new Date('2026-11-08T08:00:00Z'), endsAt: new Date('2026-11-08T16:00:00Z'),
    kind: 'SHIFT', localDate: '2026-11-08', timezone: 'UTC', shiftName: shift.name, breakMinutes: 30,
    lateGraceMinutes: 5, earlyGraceMinutes: 5, reason: 'Synthetic load fixture', seriesId: shift.id, createdBy: 'benchmark',
  }]) });
  await prisma.queueSubscription.createMany({ data: staff.flatMap((person) =>
    queues.filter((queue) => queue.access.some((grant) => grant.lobId === person.lobId))
      .map((queue) => ({ moderatorId: person.id, queueId: queue.id }))), skipDuplicates: true });
  const rules = await prisma.moderationPolicy.create({ data: { organizationId: org.id,
    name: 'Synthetic benchmark policy', description: 'Synthetic policy resolution fixture', category: 'BENCHMARK', createdBy: 'benchmark' } });
  const version = await prisma.policyVersion.create({ data: { policyId: rules.id, number: 1, status: 'PUBLISHED',
    document: {}, createdBy: 'benchmark', publisherId: 'benchmark', changeSummary: 'Synthetic routing fixture',
    publishedAt: new Date('2026-11-01T00:00:00Z'), contentHash: '0'.repeat(64) } });
  await prisma.policyAssignment.create({ data: { organizationId: org.id, versionId: version.id, scopeKey: scopeKey(org.id),
    activeKey: scopeKey(org.id), effectiveFrom: new Date('2026-11-01T00:00:00Z'), createdBy: 'benchmark' } });
  const workforce = await context(prisma, actor, planning, now);
  const liveMs = await median(() => liveWorkforce(prisma, workforce, planning, now));
  const capacityMs = await median(() => capacity(prisma, workforce, now));
  const queue = queues[0]!;
  const policyResolutionMs = await median(async () => assert.equal(await resolvePolicy(prisma, org.id, lob.id, queue.id, now), version.id));
  console.log(JSON.stringify({ count, diagnosticBeforeMs: before, diagnosticAfterMs: after, qaDashboardMs: oldQa,
    qaWorklistMs: worklist, coldExecutiveMs: newOverview, liveMs, capacityMs, policyResolutionMs }));
  if (process.argv.includes('--seed-and-report')) return;

  const password = 'OperationsBenchmarkSynthetic!23';
  const hash = await hashPassword(password);
  const people = Array.from({ length: 100 }, (_, index) => ({
    id: randomUUID(), email: 'poll-' + index + '@benchmark.example.test', name: 'Benchmark administrator ' + index,
    role: 'MODERATION_ADMIN', status: 'ACTIVE', organizationId: org.id, lobId: lob.id,
  }));
  await prisma.moderator.createMany({ data: people });
  await prisma.moderatorAccount.createMany({ data: people.map((person) => ({
    userId: person.id, accountId: person.id, providerId: 'credential', password: hash,
  })) });
  const setup = buildApp();
  const tokens: string[] = [];
  for (let offset = 0; offset < people.length; offset += 5) {
    const batch = await Promise.all(people.slice(offset, offset + 5).map(({ email }, index) => setup.inject({
      method: 'POST', url: '/api/moderator-auth/sign-in/email', payload: { email, password },
      remoteAddress: '192.0.2.' + (offset + index + 1),
    })));
    for (const result of batch) { assert.equal(result.statusCode, 200); tokens.push(result.json().token as string); }
  }
  await setup.close();
  for (const users of [10,50,100]) {
    const app = buildApp();
    const counters = await status();
    const cpu = process.cpuUsage();
    const start = performance.now();
    const results = await Promise.all(tokens.slice(0, users).map(async (token) => {
      const time = performance.now();
      const response = await app.inject({ method: 'GET', url: '/api/v1/moderation/executive/overview?from=2026-11-01&through=2026-11-07',
        headers: { authorization: 'Bearer ' + token } });
      return { ms: Math.round(performance.now() - time), status: response.statusCode };
    }));
    const duration = Math.round(performance.now() - start);
    const elapsed = process.cpuUsage(cpu);
    const later = await status();
    const sorted = results.map(({ ms }) => ms).sort((a,b) => a-b);
    console.log(JSON.stringify({ users, durationMs: duration, p50Ms: sorted[Math.ceil(users * .50) - 1], p95Ms: sorted[Math.ceil(users * .95) - 1],
      errors: results.filter((result) => result.status !== 200).length, apiCpuMs: Math.round((elapsed.user + elapsed.system) / 1000),
      apiRssMiB: Math.round(process.memoryUsage().rss / 1048576), dbQuestions: (later.Questions ?? 0) - (counters.Questions ?? 0),
      dbConnections: later.Threads_connected, dbPeakConnections: later.Max_used_connections, dbMemoryBytes: later.Memory_used }));
    await app.close();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
