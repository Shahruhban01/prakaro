import { Prisma } from '@prisma/client';
import { disconnectedMs, inactivityMs } from './attendance';
import { calculateAux, type AnalyticsFilters, type AuxSource, type Bucket, reportWindow } from './analytics-calendar';
import { analyticsScope, inList, type Database } from './analytics-scope';
import { averageHandlingSeconds, eligibleHandling, eligibleTotals, handlingSources, handlingTotals, type TotalsRow } from './handling-metrics';

export type ReportScope = Awaited<ReturnType<typeof analyticsScope>>;
export type Window = ReturnType<typeof reportWindow>;
export const pendingStatuses = ['NEW', 'QUEUED', 'ASSIGNED', 'IN_REVIEW', 'AWAITING_EVIDENCE', 'REOPENED'];
export const clauses = (items: Prisma.Sql[]) => items.length ? Prisma.join(items, ' AND ') : Prisma.sql`1 = 1`;
const organization = Prisma.sql`COALESCE(a.organizationId, q.organizationId)`;

export function handlingWhere(scope: ReportScope, filters: AnalyticsFilters, window: Window) {
  return clauses([
    Prisma.sql`h.submittedAt >= ${window.start} AND h.submittedAt < ${window.end}`,
    ...(scope.organizationId ? [Prisma.sql`${organization} = ${scope.organizationId} AND q.organizationId = ${scope.organizationId}`] : []),
    ...(scope.subjectIds ? [inList(Prisma.sql`h.moderatorId`, scope.subjectIds)] : []),
    ...(scope.queueIds ? [inList(Prisma.sql`h.queueId`, scope.queueIds)] : []),
    ...(filters.lobId ? [Prisma.sql`a.lobId = ${filters.lobId}`] : []),
    ...(filters.status ? [Prisma.sql`h.action = ${filters.status}`] : []),
  ]);
}

export const reportSources = Prisma.sql`${handlingSources} LEFT JOIN moderation_queue q ON q.id = h.queueId`;

export async function groupedHandling(db: Database, where: Prisma.Sql) {
  const rows = await db.$queryRaw<(TotalsRow & {
    moderatorId: string; queueId: string; lobId: string | null; organizationId: string | null;
  })[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN h.moderatorId, h.queueId, a.lobId, ${organization} AS organizationId, ${eligibleTotals}
    ${reportSources} WHERE ${where} AND ${eligibleHandling}
    GROUP BY h.moderatorId, h.queueId, a.lobId, ${organization}`);
  type Key = 'moderatorId' | 'queueId' | 'lobId' | 'organizationId';
  const totals = (key: Key) => {
    const result = new Map<string, ReturnType<typeof handlingTotals>>();
    for (const row of rows) {
      const id = row[key];
      if (!id) continue;
      const current = result.get(id) ?? handlingTotals();
      const item = handlingTotals(row);
      current.completed += item.completed;
      current.handlingSeconds += item.handlingSeconds;
      current.ahtSeconds = averageHandlingSeconds(current.handlingSeconds, current.completed);
      if (item.lastCompletedAt && (!current.lastCompletedAt || item.lastCompletedAt > current.lastCompletedAt)) {
        current.lastCompletedAt = item.lastCompletedAt;
      }
      result.set(id, current);
    }
    return result;
  };
  return { byPerson: totals('moderatorId'), byQueue: totals('queueId'),
    byLob: totals('lobId'), byOrganization: totals('organizationId') };
}

export async function timedHandling(db: Database, where: Prisma.Sql, window: Window) {
  const start = window.hourly[0]?.start;
  const dailyCases = window.daily.length ? Prisma.sql`CASE ${Prisma.join(window.daily.map((bucket, index) =>
    Prisma.sql`WHEN h.submittedAt < ${bucket.end} THEN ${index}`), ' ')} ELSE -1 END` : Prisma.sql`-1`;
  const rows = await db.$queryRaw<{ bucket: number; hour: number; count: bigint; duration: number }[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN ${dailyCases} AS bucket,
      ${start ? Prisma.sql`CASE WHEN h.submittedAt >= ${start}
        THEN FLOOR(TIMESTAMPDIFF(SECOND, ${start}, h.submittedAt) / 3600) ELSE -1 END` : Prisma.sql`-1`} AS hour,
      COUNT(*) AS count, h.durationSeconds AS duration
    ${reportSources} WHERE ${where} AND ${eligibleHandling} GROUP BY bucket, hour, h.durationSeconds`);
  const series = (buckets: Bucket[], key: 'bucket' | 'hour') => {
    const byBucket = new Map<number, { completed: number; seconds: number }>();
    for (const row of rows) {
      const id = Number(row[key]);
      const prior = byBucket.get(id) ?? { completed: 0, seconds: 0 };
      prior.completed += Number(row.count);
      prior.seconds += row.duration * Number(row.count);
      byBucket.set(id, prior);
    }
    return buckets.map((bucket, index) => {
      const point = byBucket.get(index);
      return { label: bucket.label, start: bucket.start.toISOString(), end: bucket.end.toISOString(),
        completed: point?.completed ?? 0, handlingSeconds: point?.seconds ?? 0 };
    });
  };
  const histogram = new Map<number, number>();
  for (const row of rows) histogram.set(row.duration, (histogram.get(row.duration) ?? 0) + Number(row.count));
  const frequency = [...histogram].sort(([a], [b]) => a - b).map(([seconds, count]) => ({ seconds, count }));
  return { daily: series(window.daily, 'bucket'), hourly: series(window.hourly, 'hour'), frequency };
}

export async function queueFlow(db: Database, scope: ReportScope, filters: AnalyticsFilters, window: Window, now: Date) {
  const empty = () => new Map<string, { pending: number; intake: number }>();
  if (!scope.backlogAvailable) return { pending: null, intake: null, rows: empty(), groups: empty() };
  const ids = scope.selectedQueues.map(({ id }) => id);
  if (!ids.length) return { pending: 0, intake: 0, rows: empty(), groups: empty() };
  const pending = Prisma.sql`c.status IN (${Prisma.join(pendingStatuses)})
    AND NOT (c.status = 'IN_REVIEW' AND COALESCE(c.leaseUntil > ${now}, FALSE) AND c.owner IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM moderation_case_reservation ar WHERE ar.activeCaseKey = c.id
      AND ar.status = 'ACTIVE' AND ar.leaseExpiresAt > ${now})`;
  const intake = Prisma.sql`c.createdAt >= ${window.start} AND c.createdAt < ${window.end}`;
  const from = Prisma.sql`FROM moderation_task t JOIN moderation_case c ON c.id = t.caseId
    JOIN moderation_queue tq ON tq.id = t.queueId`;
  const where = Prisma.sql`WHERE ${inList(Prisma.sql`t.queueId`, ids)}
      AND ((${pending} AND tq.status = 'ACTIVE') OR (${intake}))`;
  const select = Prisma.sql`COUNT(DISTINCT CASE WHEN tq.status = 'ACTIVE' AND ${pending} THEN c.id END) AS pending,
    COUNT(DISTINCT CASE WHEN ${intake} THEN c.id END) AS intake`;
  type FlowRow = { id: string | null; pending: bigint; intake: bigint };
  const rollup = await db.$queryRaw<FlowRow[]>(Prisma.sql`
    SELECT t.queueId AS id, ${select} ${from} ${where} GROUP BY t.queueId WITH ROLLUP`);
  const group = filters.dimension === 'organizations'
    ? await db.$queryRaw<FlowRow[]>(Prisma.sql`SELECT tq.organizationId AS id, ${select} ${from} ${where}
        GROUP BY tq.organizationId`)
    : filters.dimension === 'lobs' ? await db.$queryRaw<FlowRow[]>(Prisma.sql`
        SELECT grantRow.lobId AS id, ${select} ${from}
        JOIN queue_lob_access grantRow ON grantRow.queueId = t.queueId AND grantRow.revokedAt IS NULL
        JOIN lobs l ON l.id = grantRow.lobId AND l.active = TRUE
        ${where} AND ${inList(Prisma.sql`grantRow.lobId`, scope.lobs.map(({ id }) => id))} GROUP BY grantRow.lobId`) : [];
  const keyed = (rows: FlowRow[]) => new Map(rows.flatMap((row) =>
    row.id ? [[row.id, { pending: Number(row.pending), intake: Number(row.intake) }]] : []));
  return {
    pending: Number(rollup.find((row) => row.id === null)?.pending ?? 0),
    intake: Number(rollup.find((row) => row.id === null)?.intake ?? 0),
    rows: keyed(rollup), groups: keyed(group),
  };
}

function attendanceWhere(scope: ReportScope, filters: AnalyticsFilters) {
  return clauses([
    ...(scope.organizationId ? [Prisma.sql`a.organizationId = ${scope.organizationId}`] : []),
    ...(scope.subjectIds ? [inList(Prisma.sql`a.moderatorId`, scope.subjectIds)] : []),
    ...(filters.lobId ? [Prisma.sql`a.lobId = ${filters.lobId}`] : []),
  ]);
}

export async function workforceData(db: Database, scope: ReportScope, filters: AnalyticsFilters, window: Window, now: Date) {
  const rosterIds = scope.roster.map(({ id }) => id);
  const allowedQueues = scope.selectedQueues.map(({ id }) => id);
  const effectiveEnd = Prisma.sql`LEAST(
    COALESCE(i.endedAt, ${now}), COALESCE(a.endedAt, ${now}),
    CASE WHEN i.endedAt IS NULL AND a.endedAt IS NULL THEN
      LEAST(COALESCE(auth.expiresAt, ${now}), TIMESTAMPADD(SECOND, ${inactivityMs / 1000}, a.lastHeartbeatAt))
    ELSE ${now} END)`;
  const [intervals, current, sessions, reservations] = await Promise.all([
    filters.queueId ? null : db.$queryRaw<(AuxSource & { organizationId: string; lobId: string })[]>(Prisma.sql`
      SELECT i.id, a.moderatorId, a.organizationId, a.lobId, i.state, i.startedAt, ${effectiveEnd} AS effectiveEnd
      FROM attendance_session a JOIN aux_interval i ON i.sessionId = a.id
      LEFT JOIN moderator_sessions auth ON auth.id = a.authSessionId AND auth.userId = a.moderatorId
      WHERE ${attendanceWhere(scope, filters)} AND a.startedAt < ${window.end}
        AND (a.endedAt IS NULL OR a.endedAt > ${window.start})
        AND i.startedAt < ${window.end} AND (i.endedAt IS NULL OR i.endedAt > ${window.start})`),
    db.$queryRaw<{
      moderatorId: string; lastHeartbeatAt: Date; endedAt: Date | null; endReason: string | null;
      expiresAt: Date | null; state: string | null;
    }[]>(Prisma.sql`
      SELECT a.moderatorId, a.lastHeartbeatAt, a.endedAt, a.endReason, auth.expiresAt, i.state
      FROM attendance_session a
      LEFT JOIN moderator_sessions auth ON auth.id = a.authSessionId AND auth.userId = a.moderatorId
      LEFT JOIN aux_interval i ON i.sessionId = a.id AND i.endedAt IS NULL
      WHERE ${inList(Prisma.sql`a.moderatorId`, rosterIds)} AND ${attendanceWhere(scope, filters)}
        AND NOT EXISTS (SELECT 1 FROM attendance_session newer
          WHERE newer.moderatorId = a.moderatorId AND
            (newer.startedAt > a.startedAt OR (newer.startedAt = a.startedAt AND newer.id > a.id)))`),
    db.$queryRaw<{ id: string; count: bigint }[]>(Prisma.sql`
      SELECT s.moderatorId AS id, COUNT(*) AS count FROM moderation_work_session s
      LEFT JOIN attendance_session a ON a.id = s.attendanceSessionId
      WHERE s.startedAt >= ${window.start} AND s.startedAt < ${window.end}
        AND ${attendanceWhere(scope, filters)}
        ${scope.queueIds ? Prisma.sql`AND ${inList(Prisma.sql`s.queueId`, scope.queueIds)}` : Prisma.empty}
      GROUP BY s.moderatorId`),
    db.$queryRaw<{ moderatorId: string; queueId: string }[]>(Prisma.sql`
      SELECT ar.moderatorId, ar.queueId FROM moderation_case_reservation ar
      JOIN moderation_work_session s ON s.id = ar.sessionId AND s.status = 'ACTIVE'
      JOIN attendance_session a ON a.id = s.attendanceSessionId
      WHERE ar.status = 'ACTIVE' AND ar.leaseExpiresAt > ${now}
        AND ${inList(Prisma.sql`ar.queueId`, allowedQueues)}
        AND ${inList(Prisma.sql`ar.moderatorId`, rosterIds)} AND ${attendanceWhere(scope, filters)}`),
  ]);
  const holders = new Map(reservations.map((item) => [item.moderatorId, item.queueId]));
  const snapshot = new Map(current.map((item) => {
    const age = +now - +item.lastHeartbeatAt;
    const presence = item.endedAt ? (item.endReason === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'OFFLINE')
      : !item.expiresAt || item.expiresAt <= now ? 'SESSION_EXPIRED'
      : age >= inactivityMs ? 'STALE' : age >= disconnectedMs ? 'DISCONNECTED' : 'ONLINE';
    return [item.moderatorId, {
      presence, aux: item.endedAt ? null : item.state,
      attendance: item.endedAt ? 'ENDED' : presence === 'SESSION_EXPIRED' ? 'EXPIRED' : 'ACTIVE',
      lastSeen: item.lastHeartbeatAt.toISOString(),
    }] as const;
  }));
  const auxSources = new Map<string, (AuxSource & { organizationId: string; lobId: string })[]>();
  for (const row of intervals ?? []) {
    const group = auxSources.get(row.organizationId) ?? [];
    group.push(row);
    auxSources.set(row.organizationId, group);
  }
  return { snapshot, holders, auxSources, sessions: new Map(sessions.map((row) => [row.id, Number(row.count)])),
    aux: intervals ? calculateAux(intervals, window.start, window.end, window.daily) : null };
}

export async function reservationFlow(db: Database, scope: ReportScope, filters: AnalyticsFilters, window: Window) {
  const rows = await db.$queryRaw<{ queueId: string; released: Prisma.Decimal; expired: Prisma.Decimal }[]>(Prisma.sql`
    SELECT r.queueId,
      SUM(r.status = 'RELEASED' AND r.releasedAt >= ${window.start} AND r.releasedAt < ${window.end}) AS released,
      SUM(r.status IN ('ACTIVE','EXPIRED') AND r.leaseExpiresAt >= ${window.start} AND r.leaseExpiresAt < ${window.end}) AS expired
    FROM moderation_case_reservation r
    JOIN moderation_work_session s ON s.id = r.sessionId
    LEFT JOIN attendance_session a ON a.id = s.attendanceSessionId
    WHERE ${attendanceWhere(scope, filters)}
      AND ${inList(Prisma.sql`r.queueId`, scope.selectedQueues.map(({ id }) => id))}
      AND ((r.status = 'RELEASED' AND r.releasedAt >= ${window.start} AND r.releasedAt < ${window.end}) OR
        (r.status IN ('ACTIVE','EXPIRED') AND r.leaseExpiresAt >= ${window.start} AND r.leaseExpiresAt < ${window.end}))
    GROUP BY r.queueId`);
  return new Map(rows.map((row) => [row.queueId, { released: Number(row.released), expired: Number(row.expired) }]));
}
