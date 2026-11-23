import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../../common/errors/app-error';
import { analyticsFilters, reportWindow } from '../analytics-calendar';
import { groupedHandling, handlingWhere, queueFlow } from '../analytics-data';
import { inList, type AnalyticsActor, type Database } from '../analytics-scope';
import { canManage, conflict, day, dayKey, localDate, organizationFor, requireAccess, scheduleAudit, uuid, zone, type OperationsContext } from './schedule';
import { overlap } from './attendance';

const weightSchema = z.record(uuid, z.number().int().min(0).max(100)).refine((items) => Object.keys(items).length <= 100);
export const planInput = z.object({
  organizationId: uuid, utilizationPercent: z.number().int().min(0).max(100), trainingMeetingMinutes: z.number().int().min(0).max(480),
  fallbackAhtSeconds: z.number().int().min(1).max(3600).nullable(), queueWeights: weightSchema,
  revision: z.number().int().nonnegative(), timezone: zone.optional(),
}).strict();
type Plan = z.infer<typeof planInput>;
export const defaultPlan = { utilizationPercent: 75, trainingMeetingMinutes: 0, fallbackAhtSeconds: null, queueWeights: {}, revision: 0 };
export async function updatePlan(db: Database, actor: AnalyticsActor, input: Plan) {
  requireAccess(canManage(actor));
  const org = await organizationFor(db, actor, input.organizationId);
  if (!org) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization is unavailable.');
  if (input.timezone && !actor.superAdmin && !actor.admin && !['ADMIN','MODERATION_ADMIN'].includes(actor.role))
    throw new AppError(403, 'FORBIDDEN', 'Only organization administrators can set the reporting timezone.');
  // Managers can compare scoped estimates. Organization-wide scenario changes require an administrator.
  if (!actor.superAdmin && !['ADMIN','MODERATION_ADMIN'].includes(actor.role))
    throw new AppError(403, 'FORBIDDEN', 'Only organization administrators can save the shared capacity assumptions.');
  await db.$queryRaw`SELECT id FROM organizations WHERE id = ${org.id} FOR UPDATE`;
  const queues = Object.keys(input.queueWeights);
  if (await db.moderationQueue.count({ where: { id: { in: queues }, organizationId: org.id } }) !== queues.length)
    throw new AppError(403, 'FORBIDDEN', 'Queue weights must belong to the selected organization.');
  const previous = await db.workforceCapacityPlan.findUnique({ where: { organizationId: org.id } });
  if ((previous?.revision ?? 0) !== input.revision) throw conflict('The capacity assumptions changed. Refresh before saving.');
  const { timezone, revision, ...values } = input;
  const row = await db.workforceCapacityPlan.upsert({ where: { organizationId: org.id },
    create: { ...values, revision: 1 }, update: { ...values, revision: revision + 1 } });
  if (timezone) await db.organization.update({ where: { id: org.id }, data: { reportingTimezone: timezone } });
  await scheduleAudit(db, actor, org.id, org.id, 'CAPACITY_PLAN_CHANGED',
    { ...values, revision: row.revision, timezone: timezone ?? org.reportingTimezone }, { revision });
  return row;
}

export type HistoryPoint = { date: string; count: number };
const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
export function forecastDates(history: HistoryPoint[], requested: string[]) {
  return requested.map((date) => {
    const counts = history.filter((row) => weekday(row.date) === weekday(date)).map(({ count }) => count);
    return { date, samples: counts.length,
      expected: counts.length < 4 ? null : counts.reduce((sum, item) => sum + item, 0) / counts.length,
      low: counts.length < 4 ? null : Math.min(...counts), high: counts.length < 4 ? null : Math.max(...counts) };
  });
}
export function distributeTime(total: number, candidates: string[], weights: Record<string, number>) {
  const changed = candidates.map((id) => ({ id, weight: Object.hasOwn(weights, id) ? weights[id]! : 1 }));
  const sum = changed.reduce((total, item) => total + item.weight, 0);
  return new Map(sum ? changed.map(({ id, weight }) => [id, total * weight / sum]) : []);
}

export async function forecast(db: Database, ctx: OperationsContext, now: Date) {
  const today = localDate(now, ctx.timezone);
  const startMs = Date.parse(today);
  const historyFilter = analyticsFilters.parse({ ...ctx.filters, from: dayKey(startMs - 56 * day), through: dayKey(startMs - day) });
  const historical = reportWindow(historyFilter, now);
  const requested = ctx.window.daily.filter(({ label }) => label > today).map(({ label }) => label);
  const queueIds = ctx.scope.selectedQueues.map(({ id }) => id);
  if (!ctx.scope.backlogAvailable || !queueIds.length || !requested.length) return {
    generatedAt: now, throughHistory: historical.through, method: 'Mean of same weekday over eight complete weeks', queues: [],
  };
  const dates = historical.daily;
  const dateExpression = Prisma.sql`CASE ${Prisma.join(dates.map((bucket) =>
    Prisma.sql`WHEN c.createdAt < ${bucket.end} THEN ${bucket.label}`), ' ')} END`;
  const [rows, first] = await Promise.all([
    db.$queryRaw<{ queueId: string; bucket: string; volume: bigint }[]>(Prisma.sql`
      SELECT t.queueId, ${dateExpression} AS bucket, COUNT(*) AS volume
      FROM moderation_case c JOIN moderation_task t ON t.caseId = c.id
      WHERE ${inList(Prisma.sql`t.queueId`, queueIds)} AND c.createdAt >= ${historical.start} AND c.createdAt < ${historical.end}
      GROUP BY t.queueId, bucket`),
    db.$queryRaw<{ queueId: string; firstAt: Date }[]>(Prisma.sql`
      SELECT t.queueId, MIN(c.createdAt) AS firstAt FROM moderation_task t JOIN moderation_case c ON c.id=t.caseId
      WHERE ${inList(Prisma.sql`t.queueId`, queueIds)} GROUP BY t.queueId`),
  ]);
  const starts = new Map(first.map(({ queueId, firstAt }) => [queueId, localDate(firstAt, ctx.timezone)]));
  const numbers = new Map(rows.map(({ queueId, bucket, volume }) => [queueId + ':' + bucket, Number(volume)]));
  return { generatedAt: now, throughHistory: historical.through,
    method: 'Mean of same weekday over eight complete weeks. Range is observed min–max.',
    queues: ctx.scope.selectedQueues.map((item) => {
      const eligibleDates = dates.filter(({ label }) => starts.has(item.id) && label >= starts.get(item.id)!);
      const observed = eligibleDates.map(({ label }) => ({ date: label, count: numbers.get(item.id + ':' + label) ?? 0 }));
      const values = forecastDates(observed, requested);
      return { id: item.id, name: item.name, observations: observed.length, horizonDays: requested.length, values,
        expected: values.every((point) => point.expected !== null)
          ? values.reduce((total, point) => total + (point.expected ?? 0), 0) : null };
    }) };
}

export async function capacity(db: Database, ctx: OperationsContext, now: Date,
  override?: { utilizationPercent?: number; fallbackAhtSeconds?: number }, existingFlow?: Awaited<ReturnType<typeof queueFlow>>) {
  const ids = ctx.scope.roster.filter((person) => person.status === 'ACTIVE' && person.organization?.active && person.lob?.active)
    .map((person) => person.id);
  const orgIds = [...new Set(ctx.scope.selectedQueues.flatMap((item) => item.organizationId ? [item.organizationId] : []))];
  const historicalFilters = analyticsFilters.parse({ ...ctx.filters, preset: '30days', from: undefined, through: undefined });
  const history = reportWindow(historicalFilters, now);
  const start = new Date(Math.max(+now, +ctx.window.start));
  const [shifts, plans, subscriptions, historical, demand, flow] = await Promise.all([
    db.workforceShiftAssignment.findMany({ where: { ...ctx.where, employeeId: { in: ids }, kind: 'SHIFT', endsAt: { gt: start } },
      select: { employeeId: true, organizationId: true, lobId: true, startsAt: true, endsAt: true, breakMinutes: true },
      take: 20001 }),
    db.workforceCapacityPlan.findMany({ where: { organizationId: { in: orgIds } } }),
    db.queueSubscription.findMany({ where: { moderatorId: { in: ids }, unsubscribedAt: null, queue: {
      status: 'ACTIVE', organizationId: { in: orgIds }, access: { some: { revokedAt: null, lob: { active: true } } },
    } }, select: { moderatorId: true, queueId: true, queue: {
      select: { organizationId: true, access: { where: { revokedAt: null, lob: { active: true } }, select: { lobId: true } } },
    } } }),
    groupedHandling(db, handlingWhere(ctx.scope, historicalFilters, history)),
    forecast(db, ctx, now),
    existingFlow ?? queueFlow(db, ctx.scope, ctx.filters, ctx.historical, now),
  ]);
  if (shifts.length > 20000) throw new AppError(422, 'CAPACITY_RANGE_TOO_LARGE', 'Narrow the staffing range or choose an organization.');
  const employees = new Map(ctx.scope.roster.map((employee) => [employee.id, employee]));
  const settings = new Map(plans.map((plan) => [plan.organizationId, plan]));
  const byEmployee = new Map<string, typeof subscriptions>();
  for (const item of subscriptions) {
    const list = byEmployee.get(item.moderatorId) ?? [];
    list.push(item); byEmployee.set(item.moderatorId, list);
  }
  const seconds = new Map<string, number>();
  const planned = new Set<string>();
  for (const shift of shifts) {
    const person = employees.get(shift.employeeId);
    if (person?.organizationId !== shift.organizationId || person.lobId !== shift.lobId) continue;
    const plan = settings.get(shift.organizationId) ?? defaultPlan;
    const qualifying = (byEmployee.get(shift.employeeId) ?? []).filter((item) =>
      item.queue.organizationId === shift.organizationId && item.queue.access.some(({ lobId }) => lobId === shift.lobId)
    ).map(({ queueId }) => queueId);
    const actualSeconds = overlap(shift.startsAt, shift.endsAt, start, ctx.window.end);
    const fullSeconds = (+shift.endsAt - +shift.startsAt) / 1000;
    const ratio = fullSeconds ? actualSeconds / fullSeconds : 0;
    const work = Math.max(0, actualSeconds - (shift.breakMinutes + plan.trainingMeetingMinutes) * 60 * ratio) *
      (override?.utilizationPercent ?? plan.utilizationPercent) / 100;
    if (actualSeconds) planned.add(shift.employeeId);
    for (const [queueId, allocation] of distributeTime(work, qualifying, weightSchema.parse(plan.queueWeights)))
      seconds.set(queueId, (seconds.get(queueId) ?? 0) + allocation);
  }
  const rows = ctx.scope.selectedQueues.map((queue) => {
    const settingsForQueue = settings.get(queue.organizationId ?? '') ?? defaultPlan;
    const weighted = historical.byQueue.get(queue.id);
    const fallback = override?.fallbackAhtSeconds ?? settingsForQueue.fallbackAhtSeconds;
    const ahtSeconds = weighted?.ahtSeconds && weighted.ahtSeconds > 0 ? weighted.ahtSeconds : fallback;
    const availableSeconds = seconds.get(queue.id) ?? 0;
    const estimate = ahtSeconds ? Math.floor(availableSeconds / ahtSeconds) : null;
    const expected = ctx.window.from > localDate(now, ctx.timezone)
      ? demand.queues.find(({ id }) => id === queue.id)?.expected ?? null : null;
    const pending = ctx.scope.backlogAvailable ? flow.rows.get(queue.id)?.pending ?? 0 : null;
    return { id: queue.id, name: queue.name, organizationId: queue.organizationId, availableSeconds,
      ahtSeconds, ahtSource: weighted?.ahtSeconds ? 'HISTORICAL_WEIGHTED' : fallback ? 'ASSUMPTION' : 'UNAVAILABLE',
      historicalCompleted: weighted?.completed ?? 0, estimate, expected, pending,
      netBacklogChange: estimate === null || expected === null ? null : expected - estimate,
      additionalModeratingHours: expected === null || !ahtSeconds ? null : Math.max(0, expected * ahtSeconds - availableSeconds) / 3600,
      risk: estimate === null || expected === null ? 'UNKNOWN' : estimate < expected ? 'COVERAGE_GAP' : 'COVERED',
    };
  });
  return { generatedAt: now, from: ctx.window.from, through: ctx.window.through, timezone: ctx.timezone,
    assumptions: ctx.scope.organizationId ? settings.get(ctx.scope.organizationId) ?? defaultPlan : null,
    override: override ?? null, scheduledEmployees: planned.size, rows, demand };
}
