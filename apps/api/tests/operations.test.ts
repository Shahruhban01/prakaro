import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { evaluateAttendance } from '../src/modules/moderation/operations/attendance';
import { drainWorkforceAlerts } from '../src/modules/moderation/operations/alerts';
import { distributeTime, forecastDates } from '../src/modules/moderation/operations/capacity';
import { csvCell } from '../src/modules/moderation/operations/executive';
import { executivePolling } from '../src/modules/moderation/operations/polling';
import { day, dayKey, occurrenceDates, rangeInput, wallTime } from '../src/modules/moderation/operations/schedule';
import type { AnalyticsActor } from '../src/modules/moderation/analytics-scope';
import { drainQaSamples } from '../src/modules/moderation/qa/sampling';
import { createOperationsFixture } from './support/operations-fixture';

test('overnight UTC conversion, DST gaps, repeated hours and alternating weeks', () => {
  assert.equal(+wallTime('2026-03-08','06:00','America/New_York') - +wallTime('2026-03-07','22:00','America/New_York'), 7 * 3600000);
  assert.equal(+wallTime('2026-11-01','06:00','America/New_York') - +wallTime('2026-10-31','22:00','America/New_York'), 9 * 3600000);
  assert.equal(wallTime('2026-11-01','01:30','America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
  assert.throws(() => wallTime('2026-03-08','02:30','America/New_York'), /does not exist/);
  assert.deepEqual(occurrenceDates('2026-11-23','2026-12-14',[1], true), ['2026-11-23','2026-12-07']);
});

test('attendance unions overlaps, honors grace, and leaves unobserved or excused shifts distinct', () => {
  const stamp = (time: string) => new Date('2026-11-23T' + time + 'Z');
  const shift = { kind: 'SHIFT', startsAt: stamp('08:00'), endsAt: stamp('16:00'), lateGraceMinutes: 5, earlyGraceMinutes: 5 };
  const actual = [
    { startedAt: stamp('08:12'), effectiveEnd: stamp('13:00'), endedAt: stamp('13:00') },
    { startedAt: stamp('12:58'), effectiveEnd: stamp('15:30'), endedAt: stamp('15:30') },
  ];
  const evaluated = evaluateAttendance(shift, actual, shift.startsAt, shift.endsAt, stamp('17:00'));
  assert.equal(evaluated.status, 'COMPLETED');
  assert.equal(evaluated.attendedSeconds, 7 * 3600 + 18 * 60);
  assert.equal(evaluated.late, true);
  assert.equal(evaluated.early, true);
  assert.equal(evaluateAttendance(shift, [], shift.startsAt, shift.endsAt, stamp('16:04')).status, 'UNKNOWN');
  assert.equal(evaluateAttendance(shift, [], shift.startsAt, shift.endsAt, stamp('16:06')).status, 'ABSENT');
  assert.equal(evaluateAttendance({ ...shift, kind: 'EXCUSED' }, [], shift.startsAt, shift.endsAt, stamp('17:00')).status, 'EXCUSED');
});

test('estimates do not multiply shared staffing and CSV escapes spreadsheet formulas', () => {
  const distribution = distributeTime(3600, ['one','two','three'], { one: 3, two: 1, three: 0 });
  assert.deepEqual([...distribution], [['one',2700],['two',900],['three',0]]);
  assert.equal([...distribution.values()].reduce((sum, value) => sum + value, 0), 3600);
  assert.equal(distributeTime(3600, ['one'], { one: 0 }).size, 0);
  const records = [0,1,2,3].map((index) => ({ date: dayKey(Date.parse('2026-11-23') - (index + 1) * 7 * day), count: index }));
  assert.equal(forecastDates(records, ['2026-11-23'])[0]?.expected, 1.5);
  assert.equal(forecastDates(records.slice(1), ['2026-11-23'])[0]?.expected, null);
  assert.equal(csvCell('  =1+2'), '"\'  =1+2"');
  assert.equal(csvCell('\tplain'), '"\'\tplain"');
  assert.equal(csvCell('a"b'), '"a""b"');
});

test('executive polling coalesces equivalent administrator reads without sharing tenant or employee scope', async () => {
  const poll = executivePolling<number>();
  const director = (organizationId: string) => ({ organizationId, superAdmin: false, role: 'MODERATION_ADMIN' }) as AnalyticsActor;
  const query = rangeInput.parse({});
  let runs = 0;
  const load = async () => ++runs;
  assert.deepEqual(await Promise.all([poll(director('one'), query, load), poll(director('one'), query, load)]), [1, 1]);
  assert.equal(await poll(director('two'), query, load), 2);
  const employee = rangeInput.parse({ employeeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert.equal(await poll(director('one'), employee, load), 3);
  assert.equal(await poll(director('one'), employee, load), 4);
});

test('scoped scheduling, live records, weighted operations, alerts and exports use persisted data', async (t) => {
  const f = await createOperationsFixture(prisma);
  const app = buildApp();
  t.after(async () => { await app.close(); await prisma.$disconnect(); });
  async function login(email: string) {
    const response = await app.inject({ method: 'POST', url: '/api/moderator-auth/sign-in/email', payload: { email, password: f.password } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().token as string;
  }
  const [manager, admin, moderator, qa, outsider] = await Promise.all([f.supervisor, f.director, f.moderator, f.auditor, f.outsider]
    .map(({ email }) => login(email)));
  async function request(token: string, path: string, status = 200, payload?: object, method: 'GET'|'POST'|'PUT'|'PATCH' = payload ? 'POST' : 'GET') {
    const result = await app.inject({ method, url: '/api/v1/' + path, headers: { authorization: 'Bearer ' + token }, payload });
    assert.equal(result.statusCode, status, result.body);
    return result.headers['content-type']?.includes('csv') ? result.body : result.json();
  }
  const today = dayKey(Date.now());
  const tomorrow = dayKey(Date.parse(today) + day);
  const filters = '?from=' + tomorrow + '&through=' + tomorrow + '&timezone=UTC';
  const shift = await request(manager, 'workforce/shifts', 200, {
    organizationId: f.org.id, name: 'Night inspection', timezone: 'UTC', startLocal: '22:00', endLocal: '06:00', breakMinutes: 60,
  });
  await request(manager, 'workforce/shifts', 400, { organizationId: f.org.id, name: 'Invalid', timezone: 'UTC', startLocal: '22:00', endLocal: '22:00' });
  await request(outsider, 'workforce/schedules?organizationId=' + f.org.id, 403);
  const planned = { employeeId: f.moderator.id, teamId: f.team.id, shiftId: shift.id, from: tomorrow, reason: 'Synthetic rotation' };
  const results = await Promise.all([app.inject, app.inject].map(() => app.inject({
    method: 'POST', url: '/api/v1/workforce/assignments', payload: planned, headers: { authorization: 'Bearer ' + manager },
  })));
  assert.deepEqual(results.map((item) => item.statusCode).sort(), [200,409]);
  const entry = results.find((item) => item.statusCode === 200)!.json().rows[0];
  assert.equal(entry.endsAt.slice(0, 10), dayKey(Date.parse(tomorrow) + day));
  await request(manager, 'workforce/assignments', 403, { ...planned, employeeId: f.auditor.id });
  await request(manager, 'workforce/assignments', 200, { employeeId: f.moderator.id, teamId: f.team.id,
    from: dayKey(Date.parse(tomorrow) + 2 * day), kind: 'EXCUSED', reason: 'Approved synthetic exception' });
  const roster = await request(manager, 'workforce/schedules' + filters);
  assert.equal(roster.count, 1);
  assert.equal((await request(manager, 'workforce/attendance-adherence' + filters)).rows[0].status, 'NOT_STARTED');
  await f.seedIntake(tomorrow);
  const firstForecast = await request(admin, 'workforce/forecast' + filters);
  assert.equal(firstForecast.queues[0].expected, 1);
  const unmeasured = await request(admin, 'workforce/capacity' + filters);
  assert.equal(unmeasured.rows[0].estimate, null);

  const queue2 = await prisma.moderationQueue.create({ data: {
    code: f.queue.code + 'B', name: 'Shared second queue', kind: 'GENERAL', config: {}, createdBy: f.director.id, organizationId: f.org.id,
    access: { create: { lobId: f.line.id, actorId: f.director.id, actorType: 'MODERATOR' } },
  } });
  await prisma.queueSubscription.create({ data: { queueId: queue2.id, moderatorId: f.moderator.id } });
  const forecast = await request(admin, 'workforce/forecast' + filters);
  assert.equal(forecast.queues.find((row: { id: string }) => row.id === queue2.id).expected, null);
  await request(admin, 'workforce/capacity', 200, { organizationId: f.org.id, utilizationPercent: 80, trainingMeetingMinutes: 0,
    fallbackAhtSeconds: 90, queueWeights: {}, revision: 0 }, 'PUT');
  // The reporting day contains two hours of the overnight shift; each subscribed queue receives half.
  const single = await request(admin, 'workforce/capacity' + filters + '&queueId=' + f.queue.id);
  assert.equal(single.rows[0].availableSeconds, 2520);
  assert.equal(single.rows[0].estimate, 28);
  assert.equal(single.rows[0].netBacklogChange, -27);

  await request(admin, 'moderation/qa/policies', 200, { organizationId: f.org.id, queueId: f.queue.id, rate: 10000, enabled: true, expectedVersion: 0 });
  await f.createCase('Current work');
  const aux = await request(moderator, 'workforce/aux/me');
  await request(moderator, 'workforce/aux/transition', 200, { state: 'MODERATING',
    attendanceSessionId: aux.attendanceSessionId, version: aux.version });
  const work = await request(moderator, 'moderation/queues/' + f.queue.id + '/moderate/start', 200, {});
  const live = await request(manager, 'workforce/live');
  assert.equal(live.rows.find((row: { id: string }) => row.id === f.moderator.id).aux, 'MODERATING');
  assert.ok(live.rows.find((row: { id: string }) => row.id === f.moderator.id).reservationId);
  await request(moderator, 'moderation/reservations/' + work.reservation.id + '/submit-and-leave', 200, {
    answers: { verification_basis: 'Independent inspection' }, reason: 'Synthetic persisted decision', action: 'REJECT',
  });
  await drainQaSamples();
  const claim = await request(qa, 'moderation/qa/reviews/claim-next', 200, {});
  const qaRow = await request(qa, 'moderation/qa/reviews/' + claim.id);
  await request(qa, 'moderation/qa/reviews/' + claim.id + '/start', 200, { version: qaRow.assignmentVersion });
  await request(qa, 'moderation/qa/reviews/' + claim.id + '/submit', 200, { version: qaRow.assignmentVersion, assessment: { outcome: 'PASS' } });
  const overview = await request(admin, 'moderation/executive/overview');
  assert.equal(overview.completed, 1);
  assert.ok(overview.ahtSeconds > 0);
  assert.equal(overview.quality.accuracy, 1);
  assert.equal(overview.coverage, 1);
  const known = await request(admin, 'workforce/capacity' + filters + '&queueId=' + f.queue.id);
  assert.equal(known.rows[0].ahtSource, 'HISTORICAL_WEIGHTED');
  assert.equal(known.rows[0].ahtSeconds, overview.ahtSeconds);
  const historic = { organizationId: f.org.id, employeeId: f.moderator.id, lobId: f.line.id, teamId: f.team.id, shiftId: shift.id,
    kind: 'SHIFT', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000), localDate: today,
    timezone: 'UTC', shiftName: 'Historical synthetic', breakMinutes: 0, lateGraceMinutes: 0, earlyGraceMinutes: 0, reason: 'Historical fixture',
    seriesId: 'historical-fixture', createdBy: f.director.id };
  const recorded = await prisma.workforceShiftAssignment.create({ data: historic });
  assert.equal((await request(manager, 'moderation/executive/teams?teamId=' + f.team.id)).completed, 1);
  await prisma.moderator.update({ where: { id: f.moderator.id }, data: { lobId: f.otherLine.id } });
  assert.equal((await request(admin, 'moderation/executive/teams?teamId=' + f.team.id)).completed, 1);
  assert.equal((await prisma.workforceShiftAssignment.findUniqueOrThrow({ where: { id: recorded.id } })).lobId, f.line.id);
  await request(admin, 'moderation/executive/organizations', 403);

  const newBacklog = await f.createCase('Backlog item');
  const rule = await request(admin, 'workforce/alerts/rules', 200, { organizationId: f.org.id, queueId: f.queue.id,
    metric: 'QUEUE_BACKLOG', threshold: 1, severity: 'WARNING', intervalSeconds: 30, cooldownSeconds: 0, enabled: true });
  await Promise.all([drainWorkforceAlerts(), drainWorkforceAlerts()]);
  const events = await request(admin, 'workforce/alerts');
  const alert = events.rows.find((row: { rule: { id: string } }) => row.rule.id === rule.id);
  assert.ok(alert);
  assert.equal(await prisma.workforceAlertEvent.count({ where: { ruleId: rule.id } }), 1);
  await request(outsider, 'workforce/alerts/' + alert.id + '/acknowledge', 403, {});
  assert.ok((await request(admin, 'workforce/alerts/' + alert.id + '/acknowledge', 200, {})).acknowledgedAt);
  await prisma.moderationCase.update({ where: { id: newBacklog.item.id }, data: { status: 'CLOSED', activeKey: null } });
  await drainWorkforceAlerts(new Date(Date.now() + 31000));
  assert.ok((await prisma.workforceAlertEvent.findUniqueOrThrow({ where: { id: alert.id } })).resolvedAt);
  await prisma.moderator.update({ where: { id: f.moderator.id }, data: { name: '=Fixture' } });
  const exported = await request(admin, 'moderation/reports/export?report=schedule&from=' + tomorrow + '&through=' + tomorrow);
  assert.ok(exported.includes('"\'=Fixture"'));
  await request(outsider, 'moderation/reports/export?report=schedule&organizationId=' + f.org.id, 403);
});
