import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { hashPassword } from 'better-auth/crypto';
import { buildApp } from '../src/app';
import { prisma as db } from '../src/common/database/prisma';

const target = new URL(process.env.DATABASE_URL ?? '');
assert.equal(target.hostname, '127.0.0.1');
assert.match(target.pathname, /^\/prakaro_phase6_benchmark_[a-z0-9]+$/);
assert.equal(process.env.NODE_ENV, 'test');
const from = '2026-11-01';
const through = '2026-11-07';
const roles = ['MODERATOR', 'MANAGER', 'QA_SUPERVISOR', 'MODERATION_ADMIN', 'SUPER_ADMIN'] as const;

async function counters() {
  const rows = await db.$queryRaw<{ Variable_name: string; Value: string }[]>`
    SHOW GLOBAL STATUS WHERE Variable_name IN ('Questions','Threads_connected','Max_used_connections','Threads_running')`;
  return Object.fromEntries(rows.map(({ Variable_name, Value }) => [Variable_name, Number(Value)]));
}

function metrics(durations: number[]) {
  const sorted = [...durations].sort((a,b) => a-b);
  const percentile = (p: number) => Math.round(sorted[Math.ceil(sorted.length * p) - 1] ?? 0);
  return { p50: percentile(.50), p95: percentile(.95), p99: percentile(.99), max: percentile(1) };
}

async function main() {
  assert.equal(await db.caseHandlingRecord.count(), 100_000);
  const first = await db.organization.findUniqueOrThrow({ where: { code: 'BENCHMARK' } });
  const second = await db.organization.upsert({ where: { code: 'BENCHMARK-SECOND' },
    create: { code: 'BENCHMARK-SECOND', name: 'Synthetic empty comparison tenant', createdBy: 'phase10-load' }, update: {} });
  const populations = await Promise.all([first, second].map(async (org) => {
    const lob = await db.lob.findFirst({ where: { organizationId: org.id } }) ??
      await db.lob.create({ data: { organizationId: org.id, code: 'REVIEW', name: 'Review', createdBy: 'phase10-load' } });
    const team = await db.workforceTeam.findFirst({ where: { organizationId: org.id } }) ??
      await db.workforceTeam.create({ data: { organizationId: org.id, code: 'TEAM', name: 'Review team', kind: 'MODERATION' } });
    const quality = await db.workforceTeam.upsert({ where: { organizationId_code: { organizationId: org.id, code: 'QA-LOAD' } },
      update: {}, create: { organizationId: org.id, code: 'QA-LOAD', name: 'Synthetic QA team', kind: 'QUALITY' } });
    return { org, lob, team, quality };
  }));
  const password = randomUUID();
  const digest = await hashPassword(password);
  const run = randomUUID().slice(0, 8);
  const maxConcurrentReports = Number(process.env.PRAKARO_LOAD_REPORT_LIMIT ?? 0);
  assert.ok(Number.isInteger(maxConcurrentReports) && maxConcurrentReports >= 0 && maxConcurrentReports <= 20);
  const app = buildApp({ logger: false, maxConcurrentReports });
  const clients: { token: string; path: string; role: typeof roles[number] }[] = [];
  try {
    for (let index = 0; index < 100; index++) {
      const role = roles[index % roles.length]!;
      const { org, lob, team, quality } = populations[Math.floor(index / roles.length) % 2]!;
      const email = 'load-' + run + '-' + index + '@example.test';
      const id = randomUUID();
      if (role === 'SUPER_ADMIN') {
        await db.superAdmin.create({ data: { id, email, name: 'Synthetic platform reviewer' } });
        await db.superAdminAccount.create({ data: { userId: id, accountId: id, providerId: 'credential', password: digest } });
      } else {
        await db.moderator.create({ data: { id, email, name: 'Synthetic load reviewer', role, organizationId: org.id, lobId: lob.id } });
        await db.moderatorAccount.create({ data: { userId: id, accountId: id, providerId: 'credential', password: digest } });
        if (role === 'MANAGER') await db.workforceTeamLink.create({ data: {
          teamId: team.id, organizationId: org.id, moderatorId: id, kind: 'MANAGER',
        } });
        if (role === 'QA_SUPERVISOR') await db.workforceTeamLink.create({ data: {
          teamId: quality.id, organizationId: org.id, moderatorId: id, kind: 'SUPERVISOR',
        } });
      }
      const domain = role === 'SUPER_ADMIN' ? 'super-admin-auth' : 'moderator-auth';
      const login = await app.inject({ method: 'POST', url: '/api/' + domain + '/sign-in/email',
        remoteAddress: '192.0.2.' + (index + 1), payload: { email, password } });
      assert.equal(login.statusCode, 200, 'Synthetic identities must authenticate');
      const url = new URL('http://local.test');
      const path = role === 'MODERATOR' ? '/analytics/moderators/me' :
        role === 'MANAGER' ? '/executive/teams' : role === 'QA_SUPERVISOR' ? '/qa/dashboard' :
          role === 'SUPER_ADMIN' ? '/executive/organizations' : '/executive/overview';
      url.pathname = '/api/v1/moderation' + path;
      url.searchParams.set('from', from);
      url.searchParams.set(role === 'QA_SUPERVISOR' ? 'to' : 'through', through);
      if (role === 'MODERATOR') url.searchParams.set('preset', 'custom');
      if (role === 'MANAGER') url.searchParams.set('teamId', team.id);
      if (role === 'SUPER_ADMIN') url.searchParams.set('organizationId', org.id);
      clients.push({ role, token: login.json().token as string, path: url.pathname + url.search });
    }
    const longest = Number(process.env.PRAKARO_LOAD_SECONDS ?? 900);
    assert.ok(Number.isInteger(longest) && longest >= 1 && longest <= 900);
    for (const users of [10, 50, 100]) {
      const initial = await counters();
      const cpu = process.cpuUsage(), start = performance.now();
      const durations: number[] = [];
      const successful: number[] = [];
      const status: Record<number, number> = {};
      const outcome: Record<string, number> = {};
      const byRole = new Map<typeof roles[number], number[]>();
      let peakRss = process.memoryUsage().rss;
      let peakConnections = initial.Threads_connected ?? 0;
      const seconds = users === 100 ? longest : Math.min(longest, 60);
      await Promise.all(clients.slice(0, users).map(async ({ token, path, role }, index) => {
        await pause((index % 15) * 400);
        do {
          const requestStart = performance.now();
          const response = await app.inject({ url: path, remoteAddress: '192.0.2.' + (index + 1),
            headers: { authorization: 'Bearer ' + token } });
          const elapsed = performance.now() - requestStart;
          durations.push(elapsed);
          const observed = byRole.get(role) ?? [];
          observed.push(elapsed);
          byRole.set(role, observed);
          status[response.statusCode] = (status[response.statusCode] ?? 0) + 1;
          if (response.statusCode === 200) successful.push(elapsed);
          if (response.statusCode === 503) {
            const reason: unknown = response.json().error?.code;
            if (typeof reason === 'string') outcome[reason] = (outcome[reason] ?? 0) + 1;
          }
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
          const remaining = start + seconds * 1000 - performance.now();
          if (remaining <= 0) break;
          await pause(Math.min(Math.max(0, 20000 - elapsed), remaining));
        } while (performance.now() < start + seconds * 1000);
      }).concat((async () => {
        while (performance.now() < start + seconds * 1000) {
          await pause(5000);
          const used = await counters();
          peakConnections = Math.max(peakConnections, used.Threads_connected ?? 0);
        }
      })()));
      const final = await counters();
      const usage = process.cpuUsage(cpu);
      console.log(JSON.stringify({ users, maxConcurrentReports, elapsedMs: Math.round(performance.now() - start), requests: durations.length,
        ...metrics(durations), status, outcome, successful: successful.length ? metrics(successful) : null,
        byRole: Object.fromEntries([...byRole].map(([role, values]) => [role, metrics(values)])),
        cpuMs: Math.round((usage.user + usage.system) / 1000), peakRssMiB: Math.round(peakRss / 1048576),
        dbQuestions: (final.Questions ?? 0) - (initial.Questions ?? 0), peakConnections, dbPeakSinceBoot: final.Max_used_connections }));
    }
  } finally { await app.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Synthetic load test failed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
