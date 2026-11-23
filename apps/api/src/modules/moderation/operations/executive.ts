import { Prisma } from '@prisma/client';
import { averageHandlingSeconds, eligibleHandling, eligibleTotals, handlingTotals, type TotalsRow } from '../handling-metrics';
import { clauses, handlingWhere, queueFlow, reportSources, workforceData } from '../analytics-data';
import { inList, type AnalyticsActor, type Database } from '../analytics-scope';
import { eligiblePopulation } from '../qa/sampling';
import { qaFilters } from '../qa/contracts';
import { calculateAux, type AuxSource, type AuxTotals } from '../analytics-calendar';
import { adherence, liveWorkforce } from './attendance';
import { capacity } from './capacity';
import { canAdmin, canManage, context, day, dayKey, localDate, requireAccess, type Range } from './schedule';

function historicTeam(teamId: string, employee: Prisma.Sql, organization: Prisma.Sql, lob: Prisma.Sql, at: Prisma.Sql) {
  return Prisma.sql`EXISTS (SELECT 1 FROM workforce_shift_assignment w WHERE w.teamId = ${teamId}
    AND w.employeeId = ${employee} AND w.organizationId = ${organization} AND w.lobId = ${lob}
    AND w.kind = 'SHIFT' AND w.cancelledAt IS NULL AND w.startsAt <= ${at} AND w.endsAt > ${at})`;
}
function utilization(aux: AuxTotals | undefined) {
  if (!aux) return null;
  const total = Object.entries(aux).reduce((sum, [state, value]) => sum + (state === 'OFFLINE' ? 0 : value), 0);
  return total ? aux.MODERATING / total : null;
}
export async function executive(db: Database, actor: AnalyticsActor, input: Range, now: Date) {
  requireAccess(canManage(actor));
  const org = actor.organizationId || input.organizationId ? await db.organization.findUnique({
    where: { id: input.organizationId ?? actor.organizationId! }, select: { reportingTimezone: true },
  }) : null;
  const timezone = input.timezone ?? org?.reportingTimezone ?? 'UTC';
  const today = localDate(now, timezone);
  const query = { ...input, timezone, from: input.from ?? dayKey(Date.parse(today) - 6 * day), through: input.through ?? today };
  const ctx = await context(db, actor, query, now);
  if (query.teamId && (actor.superAdmin || actor.role === 'MODERATION_ADMIN' || actor.role === 'ADMIN') && !query.employeeId && !query.managerId) {
    // Historical attribution uses the roster frozen on scheduled occurrences. Managers still use the authorized subject list.
    ctx.scope.subjectIds = null;
  }
  const cohort = query.teamId ? historicTeam(query.teamId, Prisma.sql`h.moderatorId`, Prisma.sql`a.organizationId`,
    Prisma.sql`a.lobId`, Prisma.sql`h.submittedAt`) : Prisma.empty;
  const where = clauses([handlingWhere(ctx.scope, ctx.filters, ctx.historical), ...(query.teamId ? [cohort] : [])]);
  const qaWhere = clauses([
    Prisma.sql`s.sampledAt IS NOT NULL AND s.completedAt >= ${ctx.historical.start} AND s.completedAt < ${ctx.historical.end}
      AND a.finalOutcome IN ('PASS','FAIL')`,
    ...(ctx.scope.organizationId ? [Prisma.sql`s.organizationId = ${ctx.scope.organizationId}`] : []),
    ...(ctx.scope.subjectIds ? [inList(Prisma.sql`s.moderatorId`, ctx.scope.subjectIds)] : []),
    ...(ctx.scope.queueIds ? [inList(Prisma.sql`s.queueId`, ctx.scope.queueIds)] : []),
    ...(query.lobId ? [Prisma.sql`s.lobId = ${query.lobId}`] : []),
    ...(query.teamId ? [historicTeam(query.teamId, Prisma.sql`s.moderatorId`, Prisma.sql`s.organizationId`,
      Prisma.sql`s.lobId`, Prisma.sql`s.completedAt`)] : []),
  ]);
  const population = qaFilters.parse({ organizationId: ctx.scope.organizationId, lobId: query.lobId,
    queueId: query.queueId, moderatorId: query.employeeId });
  const workforce = workforceData(db, ctx.scope, ctx.filters, ctx.historical, now);
  const [handling, qa, sampled, eligible, flow, work, present, scheduled, openAlerts] = await Promise.all([
    db.$queryRaw<(TotalsRow & { queueId: string; organizationId: string | null })[]>(Prisma.sql`
      SELECT STRAIGHT_JOIN h.queueId, q.organizationId, ${eligibleTotals}
      ${reportSources} WHERE ${where} AND ${eligibleHandling} GROUP BY h.queueId, q.organizationId`),
    db.$queryRaw<{ organizationId: string; day: string; pass: Prisma.Decimal; evaluated: bigint }[]>(Prisma.sql`
      SELECT s.organizationId, DATE_FORMAT(s.completedAt, '%Y-%m-%d') AS day, SUM(a.finalOutcome = 'PASS') AS pass, COUNT(*) AS evaluated
      FROM qa_sample s JOIN qa_assessment a ON a.sampleId = s.id WHERE ${qaWhere}
      GROUP BY s.organizationId, day`),
    query.teamId || query.managerId || !canManage(actor) || (!actor.superAdmin && !actor.admin && !['ADMIN','MODERATION_ADMIN'].includes(actor.role))
      ? null : db.qaSample.count({ where: {
        organizationId: ctx.scope.organizationId, lobId: query.lobId, queueId: query.queueId, moderatorId: query.employeeId,
        selection: 'SELECTED', draw: { not: null }, completedAt: { gte: ctx.historical.start, lt: ctx.historical.end },
      } }),
    query.teamId || query.managerId || (!actor.superAdmin && !['ADMIN','MODERATION_ADMIN'].includes(actor.role))
      ? null : eligiblePopulation(db, actor, { ...population, from: undefined, to: undefined }, ctx.historical),
    queueFlow(db, ctx.scope, { ...ctx.filters, dimension: 'organizations' }, ctx.historical, now),
    workforce,
    liveWorkforce(db, ctx, query, now, workforce),
    adherence(db, ctx, query, now),
    canAdmin(actor) && !query.teamId && !query.lobId && !query.employeeId && !query.managerId ? db.workforceAlertEvent.count({
      where: { resolvedAt: null, rule: { organizationId: ctx.scope.organizationId, queueId: query.queueId } },
    }) : null,
  ]);
  const totals = handling.reduce((state, row) => ({ completed: state.completed + Number(row.completed),
    seconds: state.seconds + Number(row.handlingSeconds) }), { completed: 0, seconds: 0 });
  const quality = (rows: typeof qa) => {
    const passes = rows.reduce((sum, row) => sum + Number(row.pass), 0);
    const evaluated = rows.reduce((sum, row) => sum + Number(row.evaluated), 0);
    return { passes, evaluated, accuracy: evaluated ? passes / evaluated : null };
  };
  const rosterKey = (employee: string, orgId: string, lobId: string) => employee + ':' + orgId + ':' + lobId;
  function teamAux() {
    if (!scheduled.available || !work.aux) return undefined;
    const groups = new Map<string, typeof scheduled.items>();
    for (const row of scheduled.items.filter((item) => item.kind === 'SHIFT')) {
      const key = rosterKey(row.employeeId, row.organizationId, row.lobId);
      const values = groups.get(key) ?? [];
      values.push(row);
      groups.set(key, values);
    }
    const clipped: AuxSource[] = [];
    for (const raw of work.auxSources.values()) for (const entry of raw) {
      for (const row of groups.get(rosterKey(entry.moderatorId, entry.organizationId, entry.lobId)) ?? []) {
        const left = Math.max(+row.startsAt, +entry.startedAt);
        const right = Math.min(+row.endsAt, +entry.effectiveEnd);
        if (left < right) clipped.push({ ...entry, id: entry.id + ':' + row.id, startedAt: new Date(left), effectiveEnd: new Date(right) });
      }
    }
    return calculateAux(clipped, ctx.historical.start, ctx.historical.end, []).totals;
  }
  const aux = query.teamId ? teamAux() : work.aux?.totals;
  const forecastDate = dayKey(Date.parse(today) + day);
  const planningContext = await context(db, actor, { ...query, from: forecastDate, through: forecastDate }, now);
  const plan = await capacity(db, planningContext, now, undefined, flow);
  const trend = [...new Set(qa.map(({ day: date }) => date))].sort().map((date) =>
    ({ date, ...quality(qa.filter((row) => row.day === date)) }));
  const queueMetrics = new Map(handling.map((row) => [row.queueId, row]));
  return { generatedAt: now, timezone, from: ctx.window.from, through: ctx.window.through,
    attribution: query.teamId ? 'WORK_WITHIN_HISTORICAL_TEAM_SCHEDULE' : 'AUTHORITATIVE_WORK_ORGANIZATION_AND_LOB',
    employees: present.count, scheduledEmployees: new Set(scheduled.items.filter((item) => item.kind === 'SHIFT').map((item) => item.employeeId)).size,
    scheduledNow: present.scheduledNow, attending: present.attending, moderating: present.moderating,
    completed: totals.completed, handlingSeconds: totals.seconds, ahtSeconds: averageHandlingSeconds(totals.seconds, totals.completed),
    pending: flow.pending, quality: quality(qa), sampled, eligible, openAlerts,
    coverage: sampled !== null && eligible ? sampled / eligible : null,
    aux: aux ?? null, auxUtilization: utilization(aux),
    casesPerModeratingHour: aux?.MODERATING ? totals.completed * 3600 / aux.MODERATING : null,
    adherence: scheduled.available ? scheduled.adherence : null, scheduleTruncated: scheduled.resultsTruncated,
    capacity: plan.rows, forecastDate, trend, queues: ctx.scope.selectedQueues.map((row) => ({
      id: row.id, name: row.name, ...handlingTotals(queueMetrics.get(row.id)),
      pending: ctx.scope.backlogAvailable ? flow.rows.get(row.id)?.pending ?? 0 : null,
    })),
    teamRoster: query.teamId ? present.rows.map(({ name, role, lob, attendance, aux: state }) => ({ name, role, lob, attendance, aux: state })) : [],
    organizations: actor.superAdmin ? ctx.scope.organizations.filter((item) => !ctx.scope.organizationId || item.id === ctx.scope.organizationId)
      .map((item) => {
        const own = handling.filter((row) => row.organizationId === item.id);
        const completed = own.reduce((sum, row) => sum + Number(row.completed), 0);
        const seconds = own.reduce((sum, row) => sum + Number(row.handlingSeconds), 0);
        const ownAux = work.aux && calculateAux(work.auxSources.get(item.id) ?? [], ctx.historical.start, ctx.historical.end, []).totals;
        return { ...item, completed, ahtSeconds: averageHandlingSeconds(seconds, completed), auxUtilization: utilization(ownAux ?? undefined),
          pending: flow.groups.get(item.id)?.pending ?? null, quality: quality(qa.filter((row) => row.organizationId === item.id)),
          risks: plan.rows.filter((row) => row.organizationId === item.id && row.risk === 'COVERAGE_GAP').length };
      }) : [],
    teams: ctx.scope.teams.filter((item) => !ctx.scope.organizationId || item.organizationId === ctx.scope.organizationId)
      .map((item) => ({ id: item.id, name: item.name, roster: item.links.length })),
  };
}

export function csvCell(value: unknown) {
  const data = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  const protectedValue = typeof value === 'string' && /^(?:[\t\r\n]|[\s\uFEFF]*[=+@-])/.test(data) ? "'" + data : data;
  return '"' + protectedValue.replaceAll('"', '""') + '"';
}
export const csv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
