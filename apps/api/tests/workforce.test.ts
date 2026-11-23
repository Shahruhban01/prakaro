import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { defaultConfig } from '../src/modules/moderation/config';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
it('enforces the workforce hierarchy, membership, tenant boundaries and separate identity domains', async (t) => {
  const app = buildApp();
  const actorIds: string[] = [],
    orgs: string[] = [],
    lobs: string[] = [],
    teams: string[] = [];
  const password = 'SyntheticWorkforce123!';
  const short = () => randomUUID().slice(0, 8).toUpperCase();
  const superAdmin = await prisma.superAdmin.create({
    data: {
      name: 'Synthetic Platform Admin',
      email: short().toLowerCase() + '@test.invalid',
      emailVerified: true,
    },
  });
  await prisma.superAdminAccount.create({
    data: {
      userId: superAdmin.id,
      accountId: superAdmin.id,
      providerId: 'credential',
      password: await hashPassword(password),
    },
  });
  t.after(async () => {
    await app.close();
    await prisma.workforceTeamLink.deleteMany({ where: { teamId: { in: teams } } });
    await prisma.workforceTeam.deleteMany({ where: { id: { in: teams } } });
    await prisma.moderator.deleteMany({ where: { id: { in: actorIds } } });
    await prisma.queueLobAccess.deleteMany({ where: { queue: { organizationId: { in: orgs } } } });
    await prisma.queueConfigurationVersion.deleteMany({
      where: { queue: { organizationId: { in: orgs } } },
    });
    await prisma.moderationQueue.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.lob.deleteMany({ where: { id: { in: lobs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.moderationAudit.deleteMany({
      where: { OR: [{ organizationId: { in: orgs } }, { actorId: superAdmin.id }] },
    });
    await prisma.superAdmin.delete({ where: { id: superAdmin.id } });
    await prisma.$disconnect();
  });
  async function login(domain: string, email: string) {
    const result = await app.inject({
      method: 'POST',
      url: '/api/' + domain + '/sign-in/email',
      payload: { email, password },
    });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().token as string;
  }
  const token = await login('super-admin-auth', superAdmin.email);
  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    path: string,
    body?: Record<string, unknown>,
    as = token,
    code = 200,
  ) {
    const res = await app.inject({
      method,
      url: '/api/v1' + path,
      headers: { authorization: 'Bearer ' + as },
      payload: body,
    });
    assert.equal(res.statusCode, code, res.body);
    return res.json();
  }
  async function organization() {
    const row = await call('POST', '/organizations', {
      code: short(),
      name: 'Synthetic organization',
    });
    orgs.push(row.id);
    return row.id as string;
  }
  async function lob(organizationId: string) {
    const row = await call('POST', '/lobs', { code: short(), name: 'Synthetic service' });
    lobs.push(row.id);
    await call('POST', '/lobs/' + row.id + '/assign-organization', { organizationId });
    return row.id as string;
  }
  async function employee(role: string, organizationId: string, lobId: string, as = token) {
    const row = await call(
      'POST',
      '/workforce/staff',
      {
        name: 'Synthetic employee',
        email: short().toLowerCase() + '@test.invalid',
        employeeCode: short(),
        organizationId,
        lobId,
        role,
        status: 'ACTIVE',
        password,
      },
      as,
    );
    actorIds.push(row.id);
    return row;
  }
  const orgA = await organization(),
    orgB = await organization(),
    lobA = await lob(orgA),
    secondA = await lob(orgA),
    lobB = await lob(orgB);
  const director = await employee('MODERATION_ADMIN', orgA, lobA),
    directorToken = await login('moderator-auth', director.email);
  const manager = await employee('MANAGER', orgA, lobA, directorToken),
    managerToken = await login('moderator-auth', manager.email);
  const supervisor = await employee('MOD_SUPERVISOR', orgA, lobA, directorToken),
    supervisorToken = await login('moderator-auth', supervisor.email);
  const employeeA = await employee('MODERATOR', orgA, secondA, directorToken),
    employeeB = await employee('MODERATOR', orgB, lobB);
  const operationalToken = await login('moderator-auth', employeeA.email);
  const qa = await employee('QA_REVIEWER', orgA, secondA, directorToken),
    qaToken = await login('moderator-auth', qa.email);
  assert.deepEqual(
    (await call('GET', '/organizations', undefined, directorToken)).map(
      (r: { id: string }) => r.id,
    ),
    [orgA],
  );
  await call('GET', '/organizations/' + orgB, undefined, directorToken, 404);
  await call('POST', '/lobs', { code: short(), name: 'Forbidden' }, directorToken, 403);
  await call(
    'POST',
    '/lobs/' + lobA + '/assign-organization',
    { organizationId: orgB },
    token,
    409,
  );
  const queueInput = {
    name: 'Synthetic delegated queue',
    kind: 'GENERAL',
    priority: 0,
    capacity: 10,
    config: defaultConfig,
  };
  await call('POST', '/moderation/queues', queueInput, directorToken, 403);
  await call('PATCH', '/organizations/' + orgA, { queueDelegated: true });
  const delegated = await call('POST', '/moderation/queues', queueInput, directorToken);
  assert.equal(delegated.organizationId, orgA);
  await call(
    'PATCH',
    '/moderation/queues/' + delegated.id,
    { name: 'Scoped edit', version: 1 },
    directorToken,
  );
  const unrestricted = await call('POST', '/moderation/queues', {
    ...queueInput,
    name: 'Synthetic foreign queue',
    organizationId: orgB,
  });
  await call(
    'PATCH',
    '/moderation/queues/' + unrestricted.id,
    { name: 'Forbidden', version: 1 },
    directorToken,
    403,
  );
  await call(
    'PUT',
    '/moderation/queues/' + delegated.id + '/lobs',
    { version: 2, lobIds: [lobB] },
    directorToken,
    409,
  );
  const parallel = await Promise.all(
    [1, 2, 3].map((i) =>
      call('POST', '/moderation/queues', {
        ...queueInput,
        name: 'Concurrent queue ' + i,
        organizationId: orgA,
      }),
    ),
  );
  assert.equal(new Set(parallel.map((queue) => queue.code)).size, 3);
  const paused = await call('POST', '/moderation/queues', {
    ...queueInput,
    name: 'Paused queue',
    organizationId: orgA,
    status: 'PAUSED',
    lobIds: [secondA],
  });
  await call('POST', '/moderation/queues/' + paused.id + '/subscribe', {}, operationalToken, 403);
  await call('GET', '/moderation/queues/' + paused.id + '/metrics', undefined, managerToken, 403);
  const change = {
    employeeCode: employeeA.employeeCode,
    name: employeeA.name,
    role: 'MODERATOR',
    status: 'ACTIVE',
    organizationId: orgA,
    lobId: lobB,
  };
  await call('PATCH', '/workforce/staff/' + employeeA.id, change, directorToken, 409);
  await call(
    'PATCH',
    '/workforce/staff/' + employeeA.id,
    { ...change, lobId: secondA, role: 'MODERATION_ADMIN' },
    directorToken,
    403,
  );
  await call('POST', '/workforce/staff', {}, qaToken, 403);
  await call('PATCH', '/organizations/' + orgA, { name: 'Forbidden' }, operationalToken, 403);
  await assert.rejects(
    prisma.moderator.update({ where: { id: employeeA.id }, data: { lobId: lobB } }),
  );
  await assert.rejects(
    prisma.moderator.update({ where: { id: employeeA.id }, data: { lobId: null } }),
  );
  for (const name of ['Managed team', 'Other team']) {
    const row = await call(
      'POST',
      '/workforce/teams',
      { organizationId: orgA, code: short(), name, kind: 'MODERATION' },
      directorToken,
    );
    teams.push(row.id);
  }
  await call(
    'POST',
    '/workforce/teams/' + teams[0] + '/members',
    { staffId: employeeB.id, kind: 'MEMBER' },
    directorToken,
    409,
  );
  for (const [row, kind] of [
    [manager, 'MANAGER'],
    [supervisor, 'SUPERVISOR'],
    [employeeA, 'MEMBER'],
  ])
    await call(
      'POST',
      '/workforce/teams/' + teams[0] + '/members',
      { staffId: row.id, kind },
      directorToken,
    );
  for (const as of [managerToken, supervisorToken]) {
    assert.deepEqual(
      (await call('GET', '/workforce/teams', undefined, as)).map((r: { id: string }) => r.id),
      [teams[0]],
    );
    await call('GET', '/workforce/teams/' + teams[1], undefined, as, 404);
    await call('GET', '/workforce/staff/' + employeeB.id, undefined, as, 404);
  }
  await call('GET', '/workforce/dashboard', undefined, 'invalid-token', 401);
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: short().toLowerCase() + '@test.invalid', name: 'Synthetic Driver', password },
  });
  assert.equal(signup.statusCode, 200);
  t.after(async () => {
    await prisma.user.delete({ where: { id: signup.json().user.id } });
    await prisma.$disconnect();
  });
  await call('GET', '/workforce/staff', undefined, signup.json().token, 403);
  await call(
    'PATCH',
    '/workforce/staff/' + employeeA.id,
    { ...change, lobId: secondA, status: 'DEACTIVATED' },
    directorToken,
  );
  await call('GET', '/workforce/staff', undefined, operationalToken, 401);
  assert.ok(
    (await prisma.moderationAudit.count({
      where: { actorId: superAdmin.id, actorType: 'SUPER_ADMIN', action: 'LOB_ASSIGNED' },
    })) >= 3,
  );
});
