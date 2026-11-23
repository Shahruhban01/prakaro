import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/common/database/prisma';
import { buildApp } from '../src/app';
import { analyticsFilters, calculateAux, reportWindow } from '../src/modules/moderation/analytics-calendar';
import { handlingDistribution } from '../src/modules/moderation/handling-metrics';

test('exact duration frequency statistics are weighted and represent an empty denominator as null', () => {
  const stats = handlingDistribution([{ seconds: 80, count: 10 }, { seconds: 200, count: 2 }]);
  assert.deepEqual(stats, { count: 12, min: 80, max: 200, median: 80, p75: 80, p90: 188, p95: 200, mean: 100 });
  assert.equal(handlingDistribution([]).mean, null);
  assert.equal(handlingDistribution([{ seconds: 0, count: 1 }]).mean, 0);
});

test('local date range handles DST spring-forward, repeated hours and non-hour offset zones', () => {
  const now = new Date('2026-11-23T14:00:00Z');
  const window = (date: string, timezone: string) =>
    reportWindow(analyticsFilters.parse({ preset: 'custom', from: date, through: date, timezone }), now);
  assert.equal(window('2026-03-08', 'America/New_York').hourly.length, 23);
  const fall = window('2026-11-01', 'America/New_York');
  assert.equal(fall.hourly.length, 25);
  assert.equal(new Set(fall.hourly.map((point) => point.label)).size, 25);
  assert.equal(window('2026-11-01', 'Asia/Kolkata').start.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(window('2026-11-23', 'UTC').end.toISOString(), now.toISOString());
  assert.equal(analyticsFilters.safeParse({ timezone: 'World/Test' }).success, false);
  assert.equal(analyticsFilters.safeParse({ preset: 'custom', from: '2026-01-01', through: '2026-11-01' }).success, false);
});

test('overnight AUX clips both ends, splits local days and reports overlaps without duplicate seconds', () => {
  const window = reportWindow(analyticsFilters.parse({
    preset: 'custom', from: '2026-11-01', through: '2026-11-02', timezone: 'Asia/Kolkata',
  }), new Date('2026-11-23T00:00:00Z'));
  const source = (id: string, start: string, end: string, state: 'MODERATING' | 'BREAK') => ({
    id, moderatorId: 'one', startedAt: new Date(start), effectiveEnd: new Date(end), state,
  });
  const aux = calculateAux([
    source('a', '2026-11-01T11:00:00Z', '2026-11-01T20:00:00Z', 'MODERATING'),
    source('b', '2026-11-01T19:00:00Z', '2026-11-01T21:00:00Z', 'BREAK'),
    source('invalid', '2026-11-01T22:00:00Z', '2026-11-01T21:00:00Z', 'BREAK'),
  ], window.start, window.end, window.daily);
  assert.equal(aux.totals.MODERATING, 32400);
  assert.equal(aux.perDay[0]?.states.MODERATING, 27000);
  assert.equal(aux.perDay[1]?.states.MODERATING, 5400);
  assert.equal(aux.totals.BREAK, 3600);
  assert.equal(aux.overlappingIntervals, 1);
  assert.equal(aux.invalidIntervals, 1);
});

test('Fastify analytics use immutable attendance attribution, deduplicated backlog, and layered workforce access', async (t) => {
  const app = buildApp();
  const prefix = randomUUID();
  const makeOrg = (name: string) => prisma.organization.create({ data: {
    name, code: prefix + name, createdBy: 'analytics-test',
  } });
  const [org, otherOrg] = await Promise.all([makeOrg('Analytics fixture'), makeOrg('Unrelated fixture')]);
  const ids = [org.id, otherOrg.id];
  const facilityIds: string[] = [];
  const caseIds: string[] = [];
  const queueIds: string[] = [];
  const staffIds: string[] = [];
  t.after(async () => {
    await app.close();
    await prisma.caseHandlingRecord.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.moderationDecisionVersion.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.moderationCaseReservation.deleteMany({ where: { queueId: { in: queueIds } } });
    await prisma.moderationWorkSession.deleteMany({ where: { queueId: { in: queueIds } } });
    await prisma.moderationTask.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.moderationCase.deleteMany({ where: { id: { in: caseIds } } });
    await prisma.searchAdmission.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await prisma.parkingIntelligenceCase.deleteMany({ where: { id: { in: facilityIds } } });
    await prisma.queueLobAccess.deleteMany({ where: { queueId: { in: queueIds } } });
    await prisma.moderationQueue.deleteMany({ where: { id: { in: queueIds } } });
    await prisma.workforceTeamLink.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.workforceTeam.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.attendanceSession.deleteMany({ where: { moderatorId: { in: staffIds } } });
    await prisma.moderator.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.lob.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  const createLob = (organizationId: string, name: string) => prisma.lob.create({ data: {
    name, organizationId, code: prefix + name, createdBy: 'analytics-test',
  } });
  const [lobA, lobB, foreignLob] = await Promise.all([
    createLob(org.id, 'North'), createLob(org.id, 'South'), createLob(otherOrg.id, 'Foreign'),
  ]);
  const password = 'AnalyticsFixture!1234';
  const hashed = await hashPassword(password);
  async function employee(name: string, role: string, organizationId: string, lobId: string) {
    const id = randomUUID();
    const email = id + '@analytics.test';
    const user = await prisma.moderator.create({ data: {
      id, name, email, role, organizationId, lobId,
      accounts: { create: { accountId: id, providerId: 'credential', password: hashed } },
    } });
    staffIds.push(id);
    return user;
  }
  const [a, b, lead, admin, outsider] = await Promise.all([
    employee('Ada', 'MODERATOR', org.id, lobA.id), employee('Bo', 'MODERATOR', org.id, lobB.id),
    employee('Lead', 'MOD_SUPERVISOR', org.id, lobA.id), employee('Director', 'ADMIN', org.id, lobA.id),
    employee('Foreign employee', 'MODERATOR', otherOrg.id, foreignLob.id),
  ]);
  const [team, unrelatedTeam] = await Promise.all([
    prisma.workforceTeam.create({ data: { code: 'T1', name: 'Authorized reviewers', kind: 'MODERATION', organizationId: org.id } }),
    prisma.workforceTeam.create({ data: { code: 'T2', name: 'Separate reviewers', kind: 'MODERATION', organizationId: org.id } }),
  ]);
  await prisma.workforceTeamLink.createMany({ data: [
    { teamId: team.id, moderatorId: lead.id, organizationId: org.id, kind: 'SUPERVISOR' },
    { teamId: team.id, moderatorId: a.id, organizationId: org.id, kind: 'MEMBER' },
    { teamId: team.id, moderatorId: b.id, organizationId: org.id, kind: 'MEMBER' },
    { teamId: unrelatedTeam.id, moderatorId: b.id, organizationId: org.id, kind: 'MEMBER' },
  ] });
  async function queue(name: string, organizationId: string, lobIds: string[]) {
    const row = await prisma.moderationQueue.create({ data: {
      code: prefix + name, name, kind: 'GENERAL', organizationId, config: {}, createdBy: 'analytics-test',
    } });
    queueIds.push(row.id);
    await prisma.queueLobAccess.createMany({ data: lobIds.map((lobId) => ({
      queueId: row.id, lobId, organizationId, actorId: 'test', actorType: 'SUPER_ADMIN',
    })) });
    return row;
  }
  const [shared, secondary, foreignQueue] = await Promise.all([
    queue('Shared backlog', org.id, [lobA.id, lobB.id]), queue('Secondary', org.id, [lobA.id]),
    queue('Foreign queue', otherOrg.id, [foreignLob.id]),
  ]);
  const start = new Date('2026-11-01T10:00:00Z');
  const end = new Date('2026-11-01T11:00:00Z');
  async function work(moderatorId: string, lobId: string) {
    const attendance = await prisma.attendanceSession.create({ data: {
      moderatorId, lobId, organizationId: org.id, authSessionId: randomUUID(),
      loginAt: start, startedAt: start, endedAt: end, lastHeartbeatAt: end, endReason: 'USER_LOGOUT',
      intervals: { create: { state: 'MODERATING', startedAt: start, endedAt: end } },
    } });
    return prisma.moderationWorkSession.create({ data: {
      moderatorId, queueId: shared.id, attendanceSessionId: attendance.id, startedAt: start, endedAt: end, status: 'ENDED',
    } });
  }
  const [workA, workB] = await Promise.all([work(a.id, lobA.id), work(b.id, lobB.id)]);
  async function parkingCase(status: string, queues: string[]) {
    const facility = await prisma.parkingIntelligenceCase.create({ data: {
      admission: { create: { firstEvent: 'analytics-fixture' } },
    } });
    facilityIds.push(facility.id);
    const item = await prisma.moderationCase.create({ data: {
      code: 'CASE-' + randomUUID(), category: 'TEST', trigger: 'REPORT', status,
      facilityId: facility.id, createdAt: start, tasks: { create: queues.map((queueId) => ({
        queueId, deadline: end, queueVersion: 1, form: {},
      })) },
    } });
    caseIds.push(item.id);
    return item;
  }
  async function handling(workSession: typeof workA, seconds: number, mode: 'valid' | 'invalid' | 'expired') {
    const row = await parkingCase('REJECTED', [shared.id]);
    const submittedAt = new Date(+start + seconds * 1000);
    const reservation = await prisma.moderationCaseReservation.create({ data: {
      caseId: row.id, sessionId: workSession.id, moderatorId: workSession.moderatorId, queueId: shared.id,
      status: mode === 'expired' ? 'EXPIRED' : 'COMPLETED',
      reservedAt: start, leaseExpiresAt: new Date(+start + 300000),
    } });
    const decision = await prisma.moderationDecisionVersion.create({ data: {
      caseId: row.id, moderatorId: workSession.moderatorId, action: 'REJECT', reason: 'Synthetic analytics fixture',
      evidenceIds: [], answers: {}, createdAt: submittedAt,
    } });
    const data = {
      caseId: row.id, queueId: shared.id, sessionId: workSession.id, moderatorId: workSession.moderatorId,
      reservationId: reservation.id, decisionVersionId: decision.id, durationSeconds: seconds, action: 'REJECT',
      startedAt: mode === 'invalid' ? new Date(+start - 1000) : start, submittedAt,
    };
    await prisma.caseHandlingRecord.create({ data });
    return data;
  }
  const accepted = await Promise.all([
    ...Array.from({ length: 10 }, () => handling(workA, 80, 'valid')),
    ...Array.from({ length: 2 }, () => handling(workB, 200, 'valid')),
    handling(workA, 80, 'invalid'), handling(workA, 80, 'expired'),
  ]);
  await assert.rejects(prisma.caseHandlingRecord.create({ data: accepted[0]! }), { code: 'P2002' });
  await parkingCase('QUEUED', [shared.id, secondary.id]);
  await prisma.moderator.update({ where: { id: b.id }, data: { lobId: lobA.id } });

  async function token(email: string) {
    const result = await app.inject({ method: 'POST', url: '/api/moderator-auth/sign-in/email', payload: { email, password } });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().token as string;
  }
  const [aToken, supervisorToken, adminToken] = await Promise.all([token(a.email), token(lead.email), token(admin.email)]);
  const headers = { authorization: 'Bearer ' + aToken };
  const attendance = (await app.inject({ method: 'GET', url: '/api/v1/workforce/aux/me', headers })).json();
  const punch = await app.inject({
    method: 'POST', url: '/api/v1/workforce/aux/transition', headers,
    payload: { state: 'MODERATING', attendanceSessionId: attendance.attendanceSessionId, version: attendance.version },
  });
  assert.equal(punch.statusCode, 200, punch.body);
  async function report(path: string, as: string, extra: Record<string, string> = {}, status = 200) {
    const query = new URLSearchParams({ preset: 'custom', from: '2026-11-01', through: '2026-11-01', ...extra });
    const result = await app.inject({
      method: 'GET', url: '/api/v1/moderation/analytics' + path + '?' + query, headers: { authorization: 'Bearer ' + as },
    });
    assert.equal(result.statusCode, status, result.body);
    return result.json();
  }
  const individual = await report('/moderators/me', aToken);
  assert.equal(individual.totals.completed, 10);
  assert.equal(individual.totals.ahtSeconds, 80);
  assert.equal(individual.totals.handlingSeconds, 800);
  assert.equal(individual.totals.casesPerHour, 10);
  assert.equal(individual.totals.pending, null);
  assert.equal(individual.rows.length, 1);
  assert.equal(individual.rows[0].presence, 'ONLINE');
  assert.equal(individual.rows[0].aux, 'MODERATING');
  assert.equal(individual.totals.activeModerators, 1);
  const legacy = await app.inject({ method: 'GET', url: '/api/v1/moderation/analytics', headers });
  assert.equal(legacy.statusCode, 403);
  await report('/moderators/' + b.id, aToken, {}, 403);
  await report('/queues/' + foreignQueue.id, adminToken, {}, 403);
  await report('/overview', adminToken, { organizationId: otherOrg.id }, 403);
  await report('/teams', supervisorToken, { teamId: unrelatedTeam.id }, 403);
  await report('/moderators/' + outsider.id, supervisorToken, {}, 403);
  await report('/overview', adminToken, { timezone: 'Invalid/Unknown' }, 400);

  const orgReport = await report('/organizations', adminToken);
  assert.equal(orgReport.totals.completed, 12);
  assert.equal(orgReport.totals.handlingSeconds, 1200);
  assert.equal(orgReport.totals.ahtSeconds, 100);
  assert.equal(orgReport.totals.pending, 1);
  assert.equal(orgReport.totals.intake, 15);
  assert.equal(orgReport.totals.netFlow, 3);
  assert.equal(orgReport.quality.excludedHandling, 2);
  assert.equal(orgReport.handlingDistribution.p90, 188);
  assert.equal(orgReport.daily[0].completed, 12);
  assert.equal(orgReport.hourly[10].completed, 12);
  assert.equal(orgReport.aux.eligibleSeconds, 7200);
  assert.equal(orgReport.backlogTrend, null);
  assert.equal(orgReport.rows[0].name, org.name);
  const historical = await report('/lobs', adminToken, { lobId: lobB.id });
  assert.equal(historical.totals.completed, 2);
  assert.equal(historical.totals.ahtSeconds, 200);
  assert.equal(historical.totals.pending, 1);
  assert.equal(historical.rows[0].pending, 1);
  const supervised = await report('/teams', supervisorToken, { teamId: team.id });
  assert.equal(supervised.rows[0].completed, 12);
  assert.equal(supervised.rows[0].ahtSeconds, 100);
  assert.equal(supervised.options.moderators.some((item: { id: string }) => item.id === admin.id), false);
  const queueReport = await report('/queues/' + shared.id, adminToken);
  assert.equal(queueReport.totals.ahtSeconds, 100);
  assert.equal(queueReport.totals.expired, 1);
  assert.equal(queueReport.aux, null);
  const sorted = await report('/overview', adminToken, { dimension: 'moderators', order: 'aht', search: 'a' });
  assert.equal(sorted.rows[0].name, 'Ada');
  const paged = await report('/overview', adminToken, { dimension: 'moderators', page: '2' });
  assert.equal(paged.totalRows, 4);
  assert.equal(paged.rows.length, 0);
  const empty = await report('/overview', adminToken, { from: '2026-11-10', through: '2026-11-10' });
  assert.equal(empty.totals.completed, 0);
  assert.equal(empty.totals.ahtSeconds, null);
});
