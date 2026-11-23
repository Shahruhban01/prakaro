import { Prisma } from '@prisma/client';
import { inactivityMs } from '../attendance';
import { inList, type Database } from '../analytics-scope';
import { workforceData } from '../analytics-data';
import { schedules, type OperationsContext, type Range } from './schedule';

export type Span = { startedAt: Date; effectiveEnd: Date; endedAt: Date | null };
export function overlap(start: Date, end: Date, from: Date, through: Date) {
  return Math.max(0, Math.min(+end, +through) - Math.max(+start, +from)) / 1000;
}
export function evaluateAttendance(shift: {
  kind: string; startsAt: Date; endsAt: Date; lateGraceMinutes: number; earlyGraceMinutes: number;
}, attendance: Span[], from: Date, through: Date, now: Date) {
  const scheduledSeconds = shift.kind === 'SHIFT' ? overlap(shift.startsAt, shift.endsAt, from, through) : 0;
  if (shift.kind !== 'SHIFT') return {
    status: shift.kind, late: false, early: false, attended: false, scheduledSeconds, attendedSeconds: 0, firstArrival: null, lastDeparture: null,
  };
  const candidates = attendance.filter((item) => item.startedAt < shift.endsAt && item.effectiveEnd > shift.startsAt)
    .sort((a, b) => +a.startedAt - +b.startedAt);
  const first = candidates[0];
  const last = candidates.reduce<Span | undefined>((latest, row) => !latest || row.effectiveEnd > latest.effectiveEnd ? row : latest, undefined);
  const late = Boolean(first && +first.startedAt > +shift.startsAt + shift.lateGraceMinutes * 60000);
  const finished = now >= shift.endsAt;
  const early = Boolean(finished && last?.endedAt && +last.effectiveEnd < +shift.endsAt - shift.earlyGraceMinutes * 60000);
  const departed = last?.endedAt ?? null;
  let cursor = Math.max(+from, +shift.startsAt);
  let attendedSeconds = 0;
  for (const item of candidates) {
    const left = Math.max(cursor, +item.startedAt);
    const right = Math.min(+through, +shift.endsAt, +item.effectiveEnd);
    if (left < right) { attendedSeconds += (right - left) / 1000; cursor = right; }
  }
  const status = now < shift.startsAt ? 'NOT_STARTED' : !first ? (
    +now >= +shift.endsAt + shift.lateGraceMinutes * 60000 ? 'ABSENT' : 'UNKNOWN'
  ) : finished ? (!last?.endedAt && last && last.effectiveEnd < shift.endsAt ? 'UNKNOWN' : 'COMPLETED')
    : late ? 'LATE' : 'PRESENT';
  return { status, late, early, attended: !!first, scheduledSeconds, attendedSeconds,
    firstArrival: first?.startedAt ?? null, lastDeparture: departed };
}

const key = (organization: string, lob: string, employee: string) => [organization, lob, employee].join(':');
export async function adherence(db: Database, ctx: OperationsContext, query: Range, now: Date, limit = 6000, page = 1) {
  const data = await schedules(db, ctx, page, limit);
  const ids = [...new Set(data.rows.map((row) => row.employeeId))];
  const from = new Date(Math.min(+ctx.window.start, ...data.rows.map((row) => +row.startsAt)));
  const through = new Date(Math.max(+ctx.window.end, ...data.rows.map((row) => +row.endsAt)));
  const activity = ids.length ? await db.$queryRaw<(Span & { moderatorId: string; organizationId: string; lobId: string })[]>(Prisma.sql`
    SELECT a.moderatorId, a.organizationId, a.lobId, a.startedAt, a.endedAt,
      COALESCE(a.endedAt, LEAST(${now}, TIMESTAMPADD(SECOND, ${inactivityMs / 1000}, a.lastHeartbeatAt), COALESCE(s.expiresAt, a.lastHeartbeatAt))) AS effectiveEnd
    FROM attendance_session a LEFT JOIN moderator_sessions s ON s.id = a.authSessionId AND a.moderatorId = s.userId
    WHERE ${inList(Prisma.sql`a.moderatorId`, ids)} AND a.startedAt < ${through}
      AND (a.endedAt IS NULL OR a.endedAt > ${from})
      ${ctx.scope.organizationId ? Prisma.sql`AND a.organizationId = ${ctx.scope.organizationId}` : Prisma.empty}`) : [];
  const groups = new Map<string, Span[]>();
  for (const item of activity) {
    const id = key(item.organizationId, item.lobId, item.moderatorId);
    const list = groups.get(id) ?? [];
    list.push(item); groups.set(id, list);
  }
  const items = data.rows.map((row) => ({ ...row, ...evaluateAttendance(row,
    groups.get(key(row.organizationId, row.lobId, row.employeeId)) ?? [], ctx.window.start, ctx.window.end, now) }))
    .filter((row) => !query.attendance || row.status === query.attendance);
  const measured = items.filter((item) => item.kind === 'SHIFT' && item.status !== 'NOT_STARTED' && item.status !== 'UNKNOWN');
  const totals = measured.reduce((summary, row) => ({
    attended: summary.attended + Number(row.attended), missed: summary.missed + Number(row.status === 'ABSENT'),
    late: summary.late + Number(row.late), early: summary.early + Number(row.early),
    scheduledSeconds: summary.scheduledSeconds + row.scheduledSeconds, attendedSeconds: summary.attendedSeconds + row.attendedSeconds,
  }), { attended: 0, missed: 0, late: 0, early: 0, scheduledSeconds: 0, attendedSeconds: 0 });
  return { ...totals, scheduled: items.filter((item) => item.kind === 'SHIFT').length,
    excused: items.filter((item) => item.kind === 'EXCUSED').length,
    adherence: totals.scheduledSeconds ? totals.attendedSeconds / totals.scheduledSeconds : null,
    timezone: ctx.timezone, from: ctx.window.from, through: ctx.window.through,
    count: data.count, resultsTruncated: data.count > data.rows.length, available: data.count <= data.rows.length, items };
}

export async function liveWorkforce(db: Database, ctx: OperationsContext, query: Range, now: Date,
  snapshot?: Promise<Awaited<ReturnType<typeof workforceData>>>) {
  const ids = ctx.scope.roster.map((person) => person.id);
  const queueIds = ctx.scope.selectedQueues.map((row) => row.id);
  const [data, shifts, current, subscriptions] = await Promise.all([
    snapshot ?? workforceData(db, ctx.scope, { ...ctx.filters, queueId: query.queueId ?? 'presence-only' }, ctx.historical, now),
    db.workforceShiftAssignment.findMany({ where: { ...ctx.where, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { employeeId: true, shiftName: true, kind: true, startsAt: true, endsAt: true, team: { select: { name: true } } } }),
    ids.length ? db.$queryRaw<{ employeeId: string; auxStartedAt: Date | null; reservationId: string | null; queueId: string | null }[]>(Prisma.sql`
      SELECT a.moderatorId AS employeeId, i.startedAt AS auxStartedAt, r.id AS reservationId, s.queueId
      FROM attendance_session a
      LEFT JOIN aux_interval i ON i.sessionId = a.id AND i.endedAt IS NULL
      LEFT JOIN moderation_work_session s ON s.attendanceSessionId = a.id AND s.status = 'ACTIVE'
        AND ${inList(Prisma.sql`s.queueId`, queueIds)}
      LEFT JOIN moderation_case_reservation r ON r.sessionId = s.id AND r.status = 'ACTIVE' AND r.leaseExpiresAt > ${now}
      WHERE a.endedAt IS NULL AND ${inList(Prisma.sql`a.moderatorId`, ids)}
        ${ctx.scope.organizationId ? Prisma.sql`AND a.organizationId = ${ctx.scope.organizationId}` : Prisma.empty}`) : [],
    db.queueSubscription.findMany({ where: { moderatorId: { in: ids }, unsubscribedAt: null, queueId: { in: queueIds } },
      select: { moderatorId: true, queueId: true } }),
  ]);
  const active = new Map(current.map((row) => [row.employeeId, row]));
  const roster = ctx.scope.roster.map((person) => {
    const info = data.snapshot.get(person.id);
    const activeRow = active.get(person.id);
    const shift = shifts.find((row) => row.employeeId === person.id);
    return { id: person.id, name: person.name, role: person.role, status: person.status,
      lob: person.lob?.name ?? null, teams: ctx.scope.teams.filter((team) => team.links.some((x) => x.moderatorId === person.id)).map(({ name }) => name),
      shift: shift ?? null, presence: info?.presence ?? 'UNKNOWN', attendance: info?.attendance ?? 'NONE', aux: info?.aux ?? null,
      heartbeat: info?.lastSeen ?? null, queue: ctx.scope.selectedQueues.find((row) => row.id === activeRow?.queueId)?.name ?? null,
      reservationId: activeRow?.reservationId ?? null, auxSeconds: activeRow?.auxStartedAt ? Math.max(0, Math.floor((+now - +activeRow.auxStartedAt) / 1000)) : null,
      subscriptions: subscriptions.filter((row) => row.moderatorId === person.id).flatMap((row) =>
        ctx.scope.selectedQueues.filter(({ id }) => id === row.queueId).map(({ name }) => name)) };
  }).filter((row) => (!query.aux || row.aux === query.aux) && (!query.managerId || row.shift));
  return { generatedAt: now, timezone: ctx.timezone, count: roster.length,
    rows: roster.slice((query.page - 1) * 50, query.page * 50),
    attending: roster.filter((row) => row.attendance === 'ACTIVE').length,
    moderating: roster.filter((row) => row.presence === 'ONLINE' && row.aux === 'MODERATING').length,
    scheduledNow: roster.filter((row) => row.shift?.kind === 'SHIFT').length };
}
