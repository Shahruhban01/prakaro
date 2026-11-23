import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuxStatus, type Prisma } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { moderatorAuth } from '../../config/auth';
import { AppError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error';
import { staff } from './routes';
import { director, employeeScope, leader, teamScope } from './workforce';
import { applyAux, disconnectedMs, heartbeatSeconds, inactivityMs } from './attendance';

async function resolveIdentity(req: FastifyRequest) {
  const result = await moderatorAuth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableCookieCache: true },
  });
  if (!result) {
    await staff(req); // Distinguish an authenticated non-operational identity from an expired session.
    throw new ForbiddenError('Attendance is available to workforce identities.');
  }
  if (!result.user.id) throw new UnauthorizedError();
  return { moderatorId: result.user.id, authSessionId: result.session.id };
}
const identities = new WeakMap<FastifyRequest, ReturnType<typeof resolveIdentity>>();
function identity(req: FastifyRequest) {
  const existing = identities.get(req);
  if (existing) return existing;
  const resolved = resolveIdentity(req);
  identities.set(req, resolved);
  return resolved;
}
async function rateKey(req: FastifyRequest) {
  return (await identity(req).catch(() => null))?.moderatorId ?? req.ip;
}
const state = z.nativeEnum(AuxStatus);
const uuid = z.string().uuid();
const page = z.coerce.number().int().min(1).max(10000).default(1);
const dateInput = z
  .object({ from: z.string().date().optional(), through: z.string().date().optional(), page })
  .strict();
const dayMs = 86_400_000;
export function windowSeconds(startedAt: Date, endedAt: Date, from: Date, until: Date) {
  return Math.max(0, Math.min(+endedAt, +until) - Math.max(+startedAt, +from)) / 1000;
}
function emptyTotals() {
  return Object.fromEntries(Object.values(AuxStatus).map((value) => [value, 0])) as Record<
    AuxStatus,
    number
  >;
}
async function history(moderatorId: string, input: z.infer<typeof dateInput>) {
  const now = new Date(),
    today = new Date(now.toISOString().slice(0, 10));
  const until = input.through
    ? new Date(+new Date(input.through) + dayMs)
    : new Date(+today + dayMs);
  const from = input.from ? new Date(input.from) : new Date(+until - 7 * dayMs);
  if (until <= from || +until - +from > 31 * dayMs)
    throw new AppError(400, 'INVALID_WINDOW', 'Select a reporting window of up to 31 days.');
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      moderatorId,
      startedAt: { lt: until },
      OR: [{ endedAt: null }, { endedAt: { gt: from } }],
    },
    select: {
      id: true,
      authSessionId: true,
      loginAt: true,
      startedAt: true,
      endedAt: true,
      endReason: true,
      lastHeartbeatAt: true,
      intervals: {
        where: { startedAt: { lt: until }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
        select: { id: true, state: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: 'asc' },
      },
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    take: 1001,
  });
  if (sessions.length > 1000)
    throw new AppError(400, 'WINDOW_TOO_LARGE', 'Use a smaller reporting window.');
  const totals = emptyTotals(),
    logins = new Set<string>();
  const rows = sessions.map(({ authSessionId, intervals, lastHeartbeatAt, ...session }) => {
    if (session.loginAt >= from && session.loginAt < until) logins.add(authSessionId);
    const durations = emptyTotals();
    const samples = intervals.map((interval) => {
      const boundary =
        interval.endedAt ?? new Date(Math.min(+now, +lastHeartbeatAt + inactivityMs));
      const seconds = windowSeconds(interval.startedAt, boundary, from, until);
      durations[interval.state] += seconds;
      totals[interval.state] += seconds;
      return { ...interval, seconds };
    });
    const elapsedSeconds = Object.values(durations).reduce((sum, value) => sum + value, 0);
    return {
      ...session,
      intervals: samples,
      durations,
      elapsedSeconds,
      workingSeconds: elapsedSeconds - durations.OFFLINE - durations.BREAK,
      logoutAt: session.endReason === 'USER_LOGOUT' ? session.endedAt : null,
    };
  });
  return {
    reportingTimezone: 'UTC',
    from,
    until,
    loginCount: logins.size,
    totalSessions: rows.length,
    totalAttendanceSeconds: Object.values(totals).reduce((sum, value) => sum + value, 0),
    totals,
    page: input.page,
    rows: rows.slice((input.page - 1) * 25, input.page * 25),
  };
}
const overview = z
  .object({
    organizationId: uuid.optional(),
    lobId: uuid.optional(),
    teamId: uuid.optional(),
    role: z.string().trim().max(40).optional(),
    state: state.optional(),
    presence: z.enum(['ONLINE', 'DISCONNECTED', 'SIGNED_OUT']).optional(),
    page,
  })
  .strict();
async function overviewFor(req: FastifyRequest, teamOnly: boolean) {
  const actor = await staff(req),
    input = overview.parse(req.query);
  if (!actor.superAdmin && !director(actor) && !leader(actor)) throw new ForbiddenError();
  if (teamOnly && !input.teamId) throw new AppError(400, 'TEAM_REQUIRED', 'Select a team.');
  if (
    input.teamId &&
    !(await prisma.workforceTeam.findFirst({
      where: { ...teamScope(actor), id: input.teamId },
      select: { id: true },
    }))
  )
    throw new ForbiddenError();
  const now = new Date(),
    cutoff = new Date(+now - disconnectedMs);
  const base: Prisma.ModeratorWhereInput = {
    AND: [
      employeeScope(actor),
      {
        organizationId: input.organizationId,
        lobId: input.lobId,
        role: input.role,
        ...(input.teamId ? { teamLinks: { some: { teamId: input.teamId } } } : {}),
      },
    ],
  };
  const live = { endedAt: null };
  const presenceFilter: Prisma.ModeratorWhereInput =
    input.presence === 'SIGNED_OUT'
      ? { attendance: { none: live } }
      : input.presence === 'DISCONNECTED'
        ? { attendance: { some: { ...live, lastHeartbeatAt: { lte: cutoff } } } }
        : input.presence === 'ONLINE'
          ? { attendance: { some: { ...live, lastHeartbeatAt: { gt: cutoff } } } }
          : {};
  const where: Prisma.ModeratorWhereInput = {
    AND: [
      base,
      presenceFilter,
      input.state
        ? {
            attendance: {
              some: { ...live, intervals: { some: { endedAt: null, state: input.state } } },
            },
          }
        : {},
    ],
  };
  const [total, online, rawRows, ...counts] = await Promise.all([
    prisma.moderator.count({ where }),
    prisma.moderator.count({
      where: {
        AND: [where, { attendance: { some: { ...live, lastHeartbeatAt: { gt: cutoff } } } }],
      },
    }),
    prisma.moderator.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (input.page - 1) * 25,
      take: 25,
      select: {
        id: true,
        name: true,
        role: true,
        organization: { select: { name: true } },
        lob: { select: { name: true } },
        assignedCases: {
          where: { status: 'IN_REVIEW', leaseUntil: { gt: now } },
          select: { id: true },
          take: 1,
        },
        teamLinks: {
          where: { team: teamScope(actor) },
          select: { team: { select: { name: true } } },
          take: 10,
        },
        attendance: {
          where: live,
          select: {
            lastHeartbeatAt: true,
            intervals: {
              where: { endedAt: null },
              select: { state: true, startedAt: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    }),
    ...Object.values(AuxStatus).map((status) =>
      prisma.moderator.count({
        where: {
          AND: [
            where,
            {
              attendance: {
                some: { ...live, intervals: { some: { state: status, endedAt: null } } },
              },
            },
          ],
        },
      }),
    ),
  ]);
  const rows = rawRows.map(({ attendance, assignedCases, ...employee }) => {
    const active = attendance[0],
      interval = active?.intervals[0];
    return {
      ...employee,
      activeCase: assignedCases.length > 0,
      state: interval?.state ?? null,
      startedAt: interval?.startedAt ?? null,
      lastSeenAt: active?.lastHeartbeatAt ?? null,
      presence: !active
        ? 'SIGNED_OUT'
        : active.lastHeartbeatAt <= cutoff
          ? 'DISCONNECTED'
          : 'ONLINE',
      attendanceStatus: active ? 'ACTIVE' : 'ENDED',
    };
  });
  return {
    serverTime: now,
    total,
    online,
    counts: Object.fromEntries(Object.values(AuxStatus).map((status, i) => [status, counts[i]])),
    rows,
    page: input.page,
  };
}
export function registerAttendance(app: FastifyInstance) {
  app.get('/workforce/aux/me', async (req) => applyAux(await identity(req), { type: 'READ' }));
  app.post(
    '/workforce/aux/transition',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: rateKey } } },
    async (req) => {
      const actor = await identity(req);
      const input = z
        .object({ state, version: z.number().int().nonnegative(), attendanceSessionId: uuid })
        .strict()
        .parse(req.body);
      return applyAux(actor, { type: 'TRANSITION', ...input });
    },
  );
  app.post(
    '/workforce/attendance/heartbeat',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute', keyGenerator: rateKey } } },
    async (req) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      return { ...(await applyAux(await identity(req), { type: 'HEARTBEAT' })), heartbeatSeconds };
    },
  );
  app.get('/workforce/attendance/me', async (req) =>
    applyAux(await identity(req), { type: 'READ' }),
  );
  app.get('/workforce/attendance/me/history', async (req) =>
    history((await identity(req)).moderatorId, dateInput.parse(req.query)),
  );
  app.get('/workforce/aux/organization', async (req) => overviewFor(req, false));
  app.get('/workforce/aux/team', async (req) => overviewFor(req, true));
  app.get('/workforce/aux/staff/:id/history', async (req) => {
    const actor = await staff(req),
      { id } = z.object({ id: uuid }).parse(req.params);
    if (
      !(await prisma.moderator.findFirst({
        where: { AND: [employeeScope(actor), { id }] },
        select: { id: true },
      }))
    )
      throw new ForbiddenError();
    return history(id, dateInput.parse(req.query));
  });
}
