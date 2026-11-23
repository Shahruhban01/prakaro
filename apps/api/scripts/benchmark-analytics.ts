import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Prisma, PrismaClient } from '@prisma/client';
import { analyticsFilters, reportWindow } from '../src/modules/moderation/analytics-calendar';
import { buildAnalytics } from '../src/modules/moderation/analytics';
import { analyticsScope, type AnalyticsActor } from '../src/modules/moderation/analytics-scope';
import { reportSources, workforceData } from '../src/modules/moderation/analytics-data';
import { eligibleHandling, scopedHandling } from '../src/modules/moderation/handling-metrics';

const database = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(database.hostname) || !/^\/prakaro_phase6_benchmark(?:_[a-z0-9]+)?$/.test(database.pathname)) {
  throw new Error('The benchmark requires the dedicated local prakaro_phase6_benchmark database.');
}
const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
let queries = 0;
db.$on('query', ({ query }) => { if (/^\s*(SELECT|WITH|EXPLAIN)/i.test(query)) queries++; });
const day = 86400000;
const base = new Date('2026-11-01T08:00:00Z');
const now = new Date('2026-11-10T00:00:00Z');
const sizes = [100, 10000, 100000];
const digits = Prisma.join(Array.from({ length: 10 }, (_, i) => Prisma.sql`SELECT ${i} AS d`), ' UNION ALL ');
const filters = analyticsFilters.parse({ preset: 'custom', from: '2026-11-01', through: '2026-11-07' });
const actor: AnalyticsActor = {
  userId: 'benchmark', email: 'benchmark@example.test', name: 'Benchmark platform operator', role: 'SUPER_ADMIN',
  admin: true, superAdmin: true, actorType: 'SUPER_ADMIN', queues: [], organizationId: null, lobId: null,
  organization: null, lob: null, queueDelegated: false, requiresTeam: false, hasTeam: false,
};

async function samples<T>(operation: () => Promise<T>) {
  const measurements = [];
  let result: T | undefined;
  for (let run = 0; run < 3; run++) {
    const before = queries;
    const start = performance.now();
    result = await operation();
    measurements.push({ ms: Math.round(performance.now() - start), queries: queries - before });
  }
  return { sample: measurements.sort((a, b) => a.ms - b.ms)[1], result };
}

async function measure(count: number, organizationId: string, queueId: string, teamId: string) {
  const report = { ...filters, organizationId };
  const run = (selection: typeof report) => db.$transaction((tx) => buildAnalytics(tx, actor, selection, now), { timeout: 90000 });
  const overview = await samples(() => run(report));
  assert.equal(overview.result?.totals.completed, count);
  const queueReport = await samples(() => run({ ...report, queueId }));
  assert.equal(queueReport.result?.totals.completed, count / 4);
  const team = await samples(() => run({ ...report, teamId, dimension: 'teams' }));
  assert.equal(team.result?.totals.completed, count / 2);
  const aht = await samples(() => scopedHandling(db, Prisma.sql`h.queueId = ${queueId}`));
  const scope = await analyticsScope(db, actor, report);
  const aux = await samples(() => workforceData(db, scope, report, reportWindow(report, now), now));
  console.log(JSON.stringify({ count, overview: overview.sample, queue: queueReport.sample,
    team: team.sample, aht: aht.sample, aux: aux.sample, meanSeconds: overview.result?.totals.ahtSeconds }));
}

async function explain(queueId: string) {
  const plan = await db.$queryRaw<{ table: string; type: string; key: string | null; rows: bigint }[]>(Prisma.sql`
    EXPLAIN SELECT STRAIGHT_JOIN SUM(h.durationSeconds) ${reportSources}
    WHERE h.queueId = ${queueId} AND h.submittedAt >= ${base} AND h.submittedAt < ${now}
      AND ${eligibleHandling}`);
  console.log(JSON.stringify(plan.map(({ table, type, key, rows }) => ({ table, type, key, rows: Number(rows) }))));
}

async function main() {
  if (process.argv.includes('--measure-existing')) {
    const organization = await db.organization.findUniqueOrThrow({ where: { code: 'BENCHMARK' } });
    const queue = await db.moderationQueue.findFirstOrThrow({
      where: { organizationId: organization.id }, orderBy: { code: 'asc' },
    });
    const team = await db.workforceTeam.findFirstOrThrow({
      where: { organizationId: organization.id }, orderBy: { code: 'asc' },
    });
    const count = await db.caseHandlingRecord.count({ where: { queue: { organizationId: organization.id } } });
    assert.ok(sizes.includes(count), 'The synthetic cohort has an unexpected size.');
    await measure(count, organization.id, queue.id, team.id);
    await explain(queue.id);
    return;
  }
  const cap = Number(process.argv.find((value) => value.startsWith('--through='))?.split('=')[1] ?? 100000);
  assert.ok(sizes.includes(cap), 'Choose a documented case count with --through.');
  assert.equal(await db.moderationCase.count(), 0, 'Use a fresh benchmark database.');
  const org = await db.organization.create({ data: { name: 'Benchmark organization', code: 'BENCHMARK', createdBy: 'benchmark' } });
  const lobs = await Promise.all(Array.from({ length: 4 }, (_, i) => db.lob.create({ data: {
    name: 'Benchmark LOB ' + i, code: 'BENCH-LOB-' + i, organizationId: org.id, createdBy: 'benchmark',
  } })));
  const queues = await Promise.all(lobs.map((lob, i) => db.moderationQueue.create({ data: {
    name: 'Benchmark queue ' + i, code: 'BENCH-QUEUE-' + i, organizationId: org.id,
    kind: 'GENERAL', config: {}, createdBy: 'benchmark',
    access: { create: { lobId: lob.id, actorType: 'SUPER_ADMIN', actorId: 'benchmark' } },
  } })));
  const people = await Promise.all(Array.from({ length: 8 }, (_, i) => db.moderator.create({ data: {
    name: 'Benchmark reviewer ' + i, email: 'benchmark-' + i + '@example.test',
    organizationId: org.id, lobId: lobs[i % 4]!.id,
  } })));
  const teams = await Promise.all([0, 1].map((i) => db.workforceTeam.create({ data: {
    name: 'Benchmark team ' + i, code: 'BENCH-TEAM-' + i, organizationId: org.id, kind: 'MODERATION',
  } })));
  await db.workforceTeamLink.createMany({ data: people.map((person, i) => ({
    moderatorId: person.id, teamId: teams[i % 2]!.id, organizationId: org.id, kind: 'MEMBER',
  })) });
  const workIds: string[] = [];
  for (let n = 0; n < 56; n++) {
    const index = n % people.length;
    const person = people[index]!;
    const start = new Date(+base + Math.floor(n / people.length) * day);
    const end = new Date(+start + 8 * 3600000);
    const attendance = await db.attendanceSession.create({ data: {
      moderatorId: person.id, organizationId: org.id, lobId: person.lobId!, authSessionId: 'benchmark-' + n,
      loginAt: start, startedAt: start, endedAt: end, endReason: 'USER_LOGOUT', lastHeartbeatAt: end,
      intervals: { create: { state: 'MODERATING', startedAt: start, endedAt: end } },
    } });
    const work = await db.moderationWorkSession.create({ data: {
      moderatorId: person.id, queueId: queues[index % 4]!.id, attendanceSessionId: attendance.id,
      startedAt: start, endedAt: end, status: 'ENDED',
    } });
    workIds.push(work.id);
  }
  const facility = await db.parkingIntelligenceCase.create({ data: { admission: { create: { firstEvent: 'benchmark' } } } });
  const owner = Prisma.sql`ELT(MOD(n,8)+1,${Prisma.join(people.map(({ id }) => id))})`;
  const queue = Prisma.sql`ELT(MOD(n,4)+1,${Prisma.join(queues.map(({ id }) => id))})`;
  const session = Prisma.sql`ELT(MOD(n,56)+1,${Prisma.join(workIds)})`;
  const started = Prisma.sql`TIMESTAMPADD(SECOND, MOD(n*67,27000)+FLOOR(MOD(n,56)/8)*86400, ${base})`;
  const duration = Prisma.sql`32+MOD(n,168)`;
  const submitted = Prisma.sql`TIMESTAMPADD(SECOND,${duration},${started})`;
  const caseId = Prisma.sql`CONCAT('benchmark-case-',n)`;
  const resId = Prisma.sql`CONCAT('benchmark-res-',n)`;
  const decisionId = Prisma.sql`CONCAT('benchmark-decision-',n)`;

  const milestones = sizes.filter((size) => size <= cap);
  let previous = 0;
  while (previous < cap) {
    const milestone = milestones.find((size) => size > previous) ?? cap;
    const count = Math.min(milestone, previous + 10000);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMPORARY TABLE IF NOT EXISTS bench_numbers (n INT PRIMARY KEY)`;
      await tx.$executeRaw(Prisma.sql`
        INSERT IGNORE INTO bench_numbers
        SELECT a.d + b.d*10 + c.d*100 + d.d*1000 + e.d*10000
        FROM (${digits}) a CROSS JOIN (${digits}) b CROSS JOIN (${digits}) c
        CROSS JOIN (${digits}) d CROSS JOIN (${digits}) e`);
      const range = Prisma.sql`FROM bench_numbers WHERE n >= ${previous} AND n < ${count}`;
      await tx.$executeRaw(Prisma.sql`INSERT INTO moderation_case
        (id, code, facilityId, category, \`trigger\`, status, createdAt, updatedAt)
        SELECT ${caseId}, ${caseId}, ${facility.id}, 'BENCHMARK', 'REPORT', 'REJECTED', ${started}, ${submitted} ${range}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO moderation_task
        (id, caseId, queueId, queueVersion, form, deadline)
        SELECT CONCAT('benchmark-task-',n), ${caseId}, ${queue}, 1, '[]', ${submitted} ${range}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO moderation_case_reservation
        (id, caseId, moderatorId, sessionId, queueId, status, reservedAt, leaseExpiresAt)
        SELECT ${resId}, ${caseId}, ${owner}, ${session}, ${queue}, 'COMPLETED',
          ${started}, TIMESTAMPADD(SECOND,300,${started}) ${range}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO moderation_decision_version
        (id, caseId, moderatorId, action, reason, evidenceIds, answers, createdAt)
        SELECT ${decisionId}, ${caseId}, ${owner}, 'REJECT', 'Synthetic benchmark only.', '[]', '{}', ${submitted} ${range}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO case_handling_record
        (id, caseId, moderatorId, queueId, sessionId, reservationId, decisionVersionId, startedAt, submittedAt, durationSeconds, action)
        SELECT CONCAT('benchmark-handling-',n), ${caseId}, ${owner}, ${queue}, ${session}, ${resId},
          ${decisionId}, ${started}, ${submitted}, ${duration}, 'REJECT' ${range}`);
      await tx.$executeRaw`DROP TEMPORARY TABLE bench_numbers`;
    }, { timeout: 120000 });
    if (count === milestone && !process.argv.includes('--seed-only')) await measure(count, org.id, queues[0]!.id, teams[0]!.id);
    previous = count;
  }
  if (process.argv.includes('--seed-only')) console.log(JSON.stringify({ seededDecisions: cap }));
  else await explain(queues[0]!.id);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
