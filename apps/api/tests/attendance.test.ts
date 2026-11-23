import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { reconcileStaleAttendance } from '../src/modules/moderation/attendance';
import { windowSeconds } from '../src/modules/moderation/attendance-routes';

it('splits overnight attendance at UTC report boundaries without rounding intervals', () => {
  const start = new Date('2026-11-21T23:59:59.250Z'),
    end = new Date('2026-11-22T00:00:01.750Z');
  const midnight = new Date('2026-11-22T00:00:00.000Z');
  assert.equal(windowSeconds(start, end, new Date('2026-11-21'), midnight), 0.75);
  assert.equal(windowSeconds(start, end, midnight, new Date('2026-11-23')), 1.75);
});
it('persists authoritative AUX, prevents concurrent corruption, scopes reports, and reconciles sessions', async (t) => {
  const app = buildApp();
  const password = 'SyntheticAttendance123!';
  const orgs: string[] = [],
    lobs: string[] = [],
    staffIds: string[] = [],
    teamIds: string[] = [];
  const fixture = { facilityId: undefined as string | undefined, caseId: undefined as string | undefined, mobileUser: undefined as string | undefined };
  t.after(async () => {
    await app.close();
    if (fixture.caseId) await prisma.moderationCase.delete({ where: { id: fixture.caseId } });
    if (fixture.facilityId) {
      await prisma.searchAdmission.delete({ where: { facilityId: fixture.facilityId } });
      await prisma.parkingIntelligenceCase.delete({ where: { id: fixture.facilityId } });
    }
    if (fixture.mobileUser) await prisma.user.delete({ where: { id: fixture.mobileUser } });
    await prisma.workforceTeamLink.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.workforceTeam.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.moderator.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.lob.deleteMany({ where: { id: { in: lobs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.$disconnect();
  });
  async function group() {
    const org = await prisma.organization.create({
      data: { name: 'Attendance test', code: randomUUID(), createdBy: 'test' },
    });
    orgs.push(org.id);
    const lob = await prisma.lob.create({
      data: {
        name: 'Attendance line',
        code: randomUUID(),
        organizationId: org.id,
        createdBy: 'test',
      },
    });
    lobs.push(lob.id);
    return { organizationId: org.id, lobId: lob.id };
  }
  const home = await group(),
    foreign = await group();
  async function person(role: string, group = home) {
    const id = randomUUID(),
      email = id + '@example.test';
    await prisma.moderator.create({
      data: {
        id,
        email,
        name: role,
        status: 'ACTIVE',
        role,
        ...group,
        accounts: {
          create: {
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
    });
    staffIds.push(id);
    return { id, email };
  }
  async function login(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email, password },
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().token as string;
  }
  const employee = await person('MODERATOR'),
    token = await login(employee.email);
  const supervisor = await person('MOD_SUPERVISOR'),
    supervisorToken = await login(supervisor.email);
  const director = await person('MODERATION_ADMIN'),
    directorToken = await login(director.email);
  const manager = await person('MANAGER'),
    managerToken = await login(manager.email);
  const outsider = await person('MODERATOR', foreign),
    sameOrgUnassigned = await person('MODERATOR');
  const team = await prisma.workforceTeam.create({
    data: {
      name: 'Review Team',
      code: randomUUID(),
      kind: 'MODERATION',
      organizationId: home.organizationId,
    },
  });
  teamIds.push(team.id);
  await prisma.workforceTeamLink.createMany({
    data: [
      { moderatorId: supervisor.id, kind: 'SUPERVISOR' },
      { moderatorId: manager.id, kind: 'MANAGER' },
      { moderatorId: employee.id, kind: 'MEMBER' },
    ].map((link) => ({ ...link, teamId: team.id, organizationId: home.organizationId })),
  });
  const base = '/api/v1/workforce';
  async function get(path: string, as = token, expected = 200) {
    const res = await app.inject({ url: base + path, headers: { authorization: 'Bearer ' + as } });
    assert.equal(res.statusCode, expected, res.body);
    return res.json();
  }
  async function post(path: string, payload: Record<string, unknown>, as = token, expected = 200) {
    const res = await app.inject({
      method: 'POST',
      url: base + path,
      headers: { authorization: 'Bearer ' + as },
      payload,
    });
    assert.equal(res.statusCode, expected, res.body);
    return res.json();
  }
  const first = await get('/aux/me');
  assert.equal(first.state, 'NON_MODERATING');
  const id = first.attendanceSessionId as string;
  const tabs = await Promise.all(
    Array.from({ length: 4 }, () => post('/attendance/heartbeat', {})),
  );
  assert.ok(tabs.every((snapshot) => snapshot.attendanceSessionId === id));
  assert.equal(await prisma.attendanceSession.count({ where: { moderatorId: employee.id } }), 1);
  const device = await login(employee.email);
  assert.equal(
    (await post('/attendance/heartbeat', {}, device, 409)).error.code,
    'ATTENDANCE_DEVICE_CONFLICT',
  );
  let snapshot = first;
  function payload(state: string) {
    return { state, attendanceSessionId: id, version: snapshot.version };
  }
  for (const state of ['MODERATING', 'BREAK', 'MEETING', 'TRAINING', 'OFFLINE', 'NON_MODERATING']) {
    snapshot = await post('/aux/transition', payload(state));
    assert.equal(snapshot.state, state);
  }
  const repeated = await post('/aux/transition', payload('NON_MODERATING'));
  assert.equal(repeated.startedAt, snapshot.startedAt);
  assert.equal(repeated.version, snapshot.version);
  await post('/aux/transition', { ...payload('BREAK'), startedAt: '2026-01-01' }, token, 400);
  const race = await Promise.all(
    ['BREAK', 'TRAINING'].map((state) =>
      app.inject({
        method: 'POST',
        url: base + '/aux/transition',
        headers: { authorization: 'Bearer ' + token },
        payload: payload(state),
      }),
    ),
  );
  assert.deepEqual(race.map((response) => response.statusCode).sort(), [200, 409]);
  snapshot = await get('/aux/me');
  const timeline = await prisma.auxInterval.findMany({
    where: { sessionId: id },
    orderBy: [{ startedAt: 'asc' }, { endedAt: 'desc' }],
  });
  assert.equal(timeline.filter((interval) => !interval.endedAt).length, 1);
  const closed = timeline
    .filter((interval) => interval.endedAt)
    .sort((a, b) => +a.startedAt - +b.startedAt || +a.endedAt! - +b.endedAt!);
  for (let i = 1; i < closed.length; i++)
    assert.ok(closed[i]!.startedAt >= closed[i - 1]!.endedAt!);
  const histories = await get('/attendance/me/history');
  assert.ok(
    histories.rows[0].intervals.some((item: { state: string }) => item.state === 'OFFLINE'),
  );
  await get('/aux/staff/' + outsider.id + '/history', directorToken, 403);
  for (const lead of [supervisorToken, managerToken]) {
    const scoped = await get('/aux/team?teamId=' + team.id, lead);
    assert.ok(scoped.rows.some((row: { id: string }) => row.id === employee.id));
    assert.ok(!scoped.rows.some((row: { id: string }) => row.id === sameOrgUnassigned.id));
    await get('/aux/staff/' + sameOrgUnassigned.id + '/history', lead, 403);
  }
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: randomUUID() + '@example.test', password, name: 'Driver' },
  });
  assert.equal(signup.statusCode, 200);
  fixture.mobileUser = signup.json().user.id;
  await post('/attendance/heartbeat', {}, signup.json().token, 403);
  // Historical lease fixture, without activating the legacy claim flow.
  snapshot = await post('/aux/transition', payload('MODERATING'));
  const facility = await prisma.parkingIntelligenceCase.create({
    data: {
      googlePlaceId: 'attendance-' + randomUUID(),
      admission: { create: { firstEvent: 'synthetic' } },
    },
  });
  fixture.facilityId = facility.id;
  const active = await prisma.moderationCase.create({
    data: {
      facilityId: fixture.facilityId,
      code: 'AUX-' + randomUUID(),
      category: 'TEST',
      trigger: 'TEST',
      status: 'IN_REVIEW',
      owner: employee.id,
      leaseUntil: new Date(Date.now() + 60000),
    },
  });
  fixture.caseId = active.id;
  assert.equal((await get('/aux/me')).canTransition, false);
  assert.equal(
    (await post('/aux/transition', payload('OFFLINE'), token, 409)).error.code,
    'ACTIVE_CASE',
  );
  async function signOut() {
    return app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-out',
      headers: { authorization: 'Bearer ' + token },
      payload: {},
    });
  }
  assert.equal((await signOut()).statusCode, 409);
  await prisma.moderationCase.update({
    where: { id: active.id },
    data: { owner: null, leaseUntil: null, status: 'QUEUED' },
  });
  await prisma.attendanceSession.update({
    where: { id },
    data: { lastHeartbeatAt: new Date(Date.now() - 310_000) },
  });
  assert.equal((await get('/aux/me')).presence, 'DISCONNECTED');
  assert.equal((await get('/aux/me')).state, 'MODERATING');
  await post('/attendance/heartbeat', {});
  assert.equal((await signOut()).statusCode, 200);
  assert.equal(
    (await prisma.attendanceSession.findUniqueOrThrow({ where: { id } })).endReason,
    'USER_LOGOUT',
  );
  await get('/aux/me', token, 401);
  const recovered = await post('/attendance/heartbeat', {}, device);
  assert.equal(recovered.state, 'NON_MODERATING');
  const session = await prisma.attendanceSession.findUniqueOrThrow({
    where: { id: recovered.attendanceSessionId },
  });
  await prisma.moderatorSession.update({
    where: { id: session.authSessionId },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await reconcileStaleAttendance();
  assert.equal(
    (await prisma.attendanceSession.findUniqueOrThrow({ where: { id: session.id } })).endReason,
    'SESSION_EXPIRED',
  );
  const managerAux = await get('/aux/me', managerToken);
  await prisma.attendanceSession.update({
    where: { id: managerAux.attendanceSessionId },
    data: { lastHeartbeatAt: new Date(Date.now() - 3700_000) },
  });
  await reconcileStaleAttendance();
  const managerRecovered = await post('/attendance/heartbeat', {}, managerToken);
  assert.notEqual(managerRecovered.attendanceSessionId, managerAux.attendanceSessionId);
  assert.equal(
    await prisma.auxTransitionAudit.count({
      where: { sessionId: managerRecovered.attendanceSessionId, source: 'RECOVERED' },
    }),
    1,
  );
  const responses = [];
  for (let i = 0; i < 13; i++)
    responses.push(
      await app.inject({
        method: 'POST',
        url: base + '/attendance/heartbeat',
        headers: { authorization: 'Bearer ' + managerToken },
        payload: {},
      }),
    );
  assert.ok(responses.some((response) => response.statusCode === 429));
  await prisma.moderator.update({ where: { id: employee.id }, data: { status: 'DEACTIVATED' } });
  const inactive = await login(employee.email);
  await post('/attendance/heartbeat', {}, inactive, 403);
});
