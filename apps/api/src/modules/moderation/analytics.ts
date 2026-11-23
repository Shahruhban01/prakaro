import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { ForbiddenError } from '../../common/errors/app-error';
import { analyticsFilters, emptyAux, reportWindow, type AnalyticsFilters } from './analytics-calendar';
import { analyticsScope, type AnalyticsActor, type Database } from './analytics-scope';
import { groupedHandling, handlingWhere, queueFlow, reportSources, reservationFlow, timedHandling, workforceData } from './analytics-data';
import { averageHandlingSeconds, handlingDistribution, handlingTotals } from './handling-metrics';
import { director, leader } from './workforce';

const pageSize = 20;
const rate = (count: number, seconds?: number) =>
  seconds ? Math.round(count * 36000 / seconds) / 10 : null;
const nullable = z.number().nullable();
const rowSchema = z.object({
  id: z.string(), name: z.string(), organization: z.string().nullable(), detail: z.string().nullable(),
  completed: z.number(), handlingSeconds: z.number(), ahtSeconds: nullable,
  lastCompletedAt: z.string().nullable(), pending: nullable, intake: nullable,
  released: nullable, expired: nullable, activeModerators: nullable, activeReservations: nullable,
  casesPerHour: nullable, moderatingSeconds: nullable, sessions: nullable,
  presence: z.string().nullable(), aux: z.string().nullable(), attendance: z.string().nullable(),
  currentQueue: z.string().nullable(), lastSeen: z.string().nullable(),
});
type AnalyticsRow = z.infer<typeof rowSchema>;
const optionSchema = z.object({ id: z.string(), name: z.string() });
const auxSchema = z.object({
  MODERATING: z.number(), NON_MODERATING: z.number(), BREAK: z.number(),
  MEETING: z.number(), OFFLINE: z.number(), TRAINING: z.number(),
});
const point = z.object({ label: z.string(), start: z.string(), end: z.string(),
  completed: z.number(), handlingSeconds: z.number(), ahtSeconds: nullable });
const distribution = z.object({ count: z.number(), min: nullable, max: nullable, median: nullable,
  p75: nullable, p90: nullable, p95: nullable, mean: nullable });

export const analyticsResponse = z.object({
  generatedAt: z.string(), timezone: z.string(), from: z.string(), through: z.string(),
  selfOnly: z.boolean(),
  totals: z.object({
    completed: z.number(), handlingSeconds: z.number(), ahtSeconds: nullable,
    lastCompletedAt: z.string().nullable(), pending: nullable, intake: nullable, netFlow: nullable,
    activeModerators: z.number(), activeReservations: z.number(), employees: z.number(), activeEmployees: z.number(),
    sessions: z.number(), released: z.number(), expired: z.number(), casesPerHour: nullable,
  }),
  handlingDistribution: distribution,
  quality: z.object({
    excludedHandling: z.number(), missingAttribution: z.number(), overlappingIntervals: nullable,
    invalidIntervals: nullable, orphanedReservations: z.number(), duplicateDecisions: z.number(), staleAttendance: z.number(),
  }),
  aux: z.object({ states: auxSchema, eligibleSeconds: z.number(), utilization: nullable,
    daily: z.array(z.object({ label: z.string(), states: auxSchema })) }).nullable(),
  hourly: z.array(point), daily: z.array(point), backlogTrend: z.null(),
  rows: z.array(rowSchema), teams: z.array(rowSchema), queues: z.array(rowSchema), lobs: z.array(rowSchema),
  page: z.number(), pageSize: z.number(), totalRows: z.number(),
  options: z.object({
    organizations: z.array(optionSchema), lobs: z.array(optionSchema), teams: z.array(optionSchema),
    queues: z.array(optionSchema), moderators: z.array(optionSchema),
  }),
});

function aggregate(items: ReturnType<typeof handlingTotals>[]) {
  const completed = items.reduce((sum, item) => sum + item.completed, 0);
  const handlingSeconds = items.reduce((sum, item) => sum + item.handlingSeconds, 0);
  const lastCompletedAt = items.reduce<string | null>((latest, item) =>
    item.lastCompletedAt && (!latest || item.lastCompletedAt > latest) ? item.lastCompletedAt : latest, null);
  return { completed, handlingSeconds, ahtSeconds: averageHandlingSeconds(handlingSeconds, completed), lastCompletedAt };
}

export async function buildAnalytics(db: Database, actor: AnalyticsActor, filters: AnalyticsFilters, now = new Date()) {
  const scope = await analyticsScope(db, actor, filters);
  const window = reportWindow(filters, now);
  const where = handlingWhere(scope, filters, window);
  const [qualityRows, groups, series, flow, workforce, lifecycle] = await Promise.all([
    db.$queryRaw<{ scanned: bigint; missingAttribution: Prisma.Decimal; orphaned: Prisma.Decimal; duplicates: bigint }[]>(Prisma.sql`
      SELECT STRAIGHT_JOIN COUNT(*) AS scanned, SUM(a.id IS NULL OR a.organizationId = '' OR a.lobId = '') AS missingAttribution,
        SUM(r.id IS NULL) AS orphaned, 0 AS duplicates
        ${reportSources} WHERE ${where}`),
    groupedHandling(db, where),
    timedHandling(db, where, window),
    queueFlow(db, scope, filters, window, now),
    workforceData(db, scope, filters, window, now),
    reservationFlow(db, scope, filters, window),
  ]);
  const { byPerson, byQueue, byLob, byOrganization } = groups;
  const summary = aggregate([...byPerson.values()]);
  const aux = workforce.aux;
  const roster = new Map(scope.roster.map((person) => [person.id, person]));
  const queueNames = new Map(scope.queues.map((queue) => [queue.id, queue.name]));
  const organizationNames = new Map(scope.organizations.map((item) => [item.id, item.name]));
  const active = (id: string) => {
    const person = roster.get(id);
    const state = workforce.snapshot.get(id);
    return person?.status === 'ACTIVE' && person.organization?.active && person.lob?.active &&
      state?.presence === 'ONLINE' && state.aux === 'MODERATING';
  };
  const activePeople = scope.roster.filter((person) => active(person.id));
  const base = (item: { id: string; name: string; organizationId?: string | null }, measures = handlingTotals()): AnalyticsRow => ({
    id: item.id, name: item.name, organization: organizationNames.get(item.organizationId ?? '') ?? null,
    ...measures, detail: null, pending: null, intake: null, released: null, expired: null,
    activeModerators: null, activeReservations: null, casesPerHour: null, moderatingSeconds: null,
    sessions: null, presence: null, aux: null, attendance: null, currentQueue: null, lastSeen: null,
  });
  const staffRows = scope.roster.map((person) => {
    const row = base(person, byPerson.get(person.id));
    const current = workforce.snapshot.get(person.id);
    const state = aux ? aux.byModerator.get(person.id) ?? emptyAux() : null;
    return { ...row, detail: [person.role, person.lob?.name,
      ...scope.teams.filter((team) => team.links.some((link) => link.moderatorId === person.id)).map((team) => team.name),
    ].filter(Boolean).join(' · '),
    presence: current?.presence ?? 'OFFLINE', aux: current?.aux ?? null, attendance: current?.attendance ?? 'NONE',
    lastSeen: current?.lastSeen ?? null, currentQueue: queueNames.get(workforce.holders.get(person.id) ?? '') ?? null,
    sessions: workforce.sessions.get(person.id) ?? 0,
    moderatingSeconds: state?.MODERATING ?? null, casesPerHour: rate(row.completed, state?.MODERATING) };
  });

  const queueRows = scope.selfOnly ? [] : scope.selectedQueues.map((queue) => {
    const row = base(queue, byQueue.get(queue.id));
    const holders = [...workforce.holders].filter(([, id]) => id === queue.id);
    return { ...row, detail: queue.status, ...(lifecycle.get(queue.id) ?? { released: 0, expired: 0 }),
      pending: scope.backlogAvailable ? flow.rows.get(queue.id)?.pending ?? 0 : null,
      intake: scope.backlogAvailable ? flow.rows.get(queue.id)?.intake ?? 0 : null,
      activeReservations: holders.length, activeModerators: holders.filter(([id]) => active(id)).length };
  });
  const teamRows = scope.teams.filter((team) => (!scope.organizationId || team.organizationId === scope.organizationId)
      && (!filters.teamId || team.id === filters.teamId)).map((team) => {
    const members = team.links.map(({ moderatorId }) => moderatorId).filter((id) => roster.has(id));
    const totals = aggregate(members.map((id) => byPerson.get(id) ?? handlingTotals()));
    const seconds = aux ? members.reduce((sum, id) => sum + (aux.byModerator.get(id)?.MODERATING ?? 0), 0) : null;
    const lobs = [...new Set(members.map((id) => roster.get(id)?.lob?.name).filter(Boolean))];
    return { ...base(team, totals), detail: lobs.join(', ') || null, activeModerators: members.filter(active).length,
      moderatingSeconds: seconds, casesPerHour: rate(totals.completed, seconds ?? undefined) };
  });
  const lobRows = scope.lobs.filter((lob) => (!scope.organizationId || lob.organizationId === scope.organizationId)
      && (!filters.lobId || lob.id === filters.lobId)).map((lob) => ({
    ...base(lob, byLob.get(lob.id)), activeModerators: activePeople.filter((person) => person.lobId === lob.id).length,
    detail: `${scope.selectedQueues.filter((queue) => queue.access.some((grant) => grant.lobId === lob.id)).length} shared queues`,
    pending: scope.backlogAvailable && filters.dimension === 'lobs' ? flow.groups.get(lob.id)?.pending ?? 0 : null,
  }));
  const organizationRows = scope.organizations.filter((item) => !scope.organizationId || item.id === scope.organizationId)
    .map((item) => ({ ...base({ ...item, organizationId: item.id }, byOrganization.get(item.id)),
      pending: scope.backlogAvailable ? flow.groups.get(item.id)?.pending ?? 0 : null,
      activeModerators: activePeople.filter((person) => person.organizationId === item.id).length }));

  const resultSets = { moderators: staffRows, teams: teamRows, queues: queueRows, lobs: lobRows, organizations: organizationRows };
  const search = filters.search.toLocaleLowerCase();
  const order = (a: AnalyticsRow, b: AnalyticsRow) => {
    const comparison = filters.order === 'aht' ? (a.ahtSeconds ?? Infinity) - (b.ahtSeconds ?? Infinity)
      : filters.order === 'completed' ? b.completed - a.completed : 0;
    return comparison || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  };
  const matches = resultSets[filters.dimension].filter((row) =>
    [row.name, row.organization, row.detail].some((value) => value?.toLocaleLowerCase().includes(search))).sort(order);
  const options = <T extends { id: string; name: string }>(rows: T[], selected?: string) => {
    const first = rows.slice(0, 100);
    const chosen = selected && rows.find((row) => row.id === selected);
    if (chosen && !first.some((row) => row.id === selected)) first.push(chosen);
    return first.map(({ id, name }) => ({ id, name }));
  };
  const eligibleSeconds = aux ? Object.entries(aux.totals).reduce((sum, [name, seconds]) =>
    name === 'OFFLINE' ? sum : sum + seconds, 0) : 0;
  const quality = qualityRows[0];
  const distribution = handlingDistribution(series.frequency);
  const annotateSeries = (points: typeof series.daily) => points.map((point) =>
    ({ ...point, ahtSeconds: averageHandlingSeconds(point.handlingSeconds, point.completed) }));

  return analyticsResponse.parse({
    generatedAt: now.toISOString(), timezone: filters.timezone, from: window.from, through: window.through,
    selfOnly: scope.selfOnly,
    totals: { ...summary, pending: flow.pending, intake: flow.intake,
      netFlow: flow.intake === null || filters.status ? null : flow.intake - summary.completed,
      activeModerators: filters.queueId ? activePeople.filter((person) => workforce.holders.has(person.id)).length : activePeople.length,
      activeReservations: workforce.holders.size,
      employees: scope.roster.length, activeEmployees: scope.roster.filter((person) => person.status === 'ACTIVE' && person.organization?.active && person.lob?.active).length,
      casesPerHour: rate(summary.completed, aux?.totals.MODERATING),
      sessions: [...workforce.sessions.values()].reduce((sum, count) => sum + count, 0),
      released: [...lifecycle.values()].reduce((sum, item) => sum + item.released, 0),
      expired: [...lifecycle.values()].reduce((sum, item) => sum + item.expired, 0) },
    handlingDistribution: distribution,
    quality: { excludedHandling: Number(quality?.scanned ?? 0) - distribution.count,
      missingAttribution: Number(quality?.missingAttribution ?? 0), orphanedReservations: Number(quality?.orphaned ?? 0),
      duplicateDecisions: Number(quality?.duplicates ?? 0),
      overlappingIntervals: aux?.overlappingIntervals ?? null, invalidIntervals: aux?.invalidIntervals ?? null,
      staleAttendance: [...workforce.snapshot.values()].filter((item) => item.presence === 'STALE').length },
    aux: aux ? { states: aux.totals, eligibleSeconds, utilization: eligibleSeconds ? aux.totals.MODERATING / eligibleSeconds : null,
      daily: aux.perDay } : null,
    hourly: annotateSeries(series.hourly), daily: annotateSeries(series.daily), backlogTrend: null,
    rows: matches.slice((filters.page - 1) * pageSize, filters.page * pageSize), page: filters.page,
    pageSize, totalRows: matches.length,
    teams: [...teamRows].sort((a, b) => b.completed - a.completed).slice(0, 10),
    queues: [...queueRows].sort((a, b) => b.completed - a.completed).slice(0, 10),
    lobs: scope.selfOnly ? [] : [...lobRows].sort((a, b) => b.completed - a.completed).slice(0, 10),
    options: { organizations: actor.superAdmin ? options(scope.organizations, filters.organizationId) : [],
      lobs: scope.selfOnly ? [] : options(scope.lobs, filters.lobId), teams: options(scope.teams, filters.teamId),
      queues: options(scope.queues, filters.queueId), moderators: scope.selfOnly ? [] : options(scope.roster, filters.moderatorId) },
  });
}

type StaffResolver = (request: FastifyRequest) => Promise<AnalyticsActor>;
export function registerAnalytics(app: FastifyInstance, staff: StaffResolver) {
  async function report(request: FastifyRequest, mode?: 'self' | 'moderators' | 'teams' | 'lobs' | 'organizations' | 'queues') {
    const actor = await staff(request);
    const query = request.query as Record<string, unknown>;
    const id = z.object({ id: z.string().uuid().optional() }).parse(request.params ?? {}).id;
    const selfOnly = !actor.superAdmin && !director(actor) && !leader(actor);
    const dimension = mode === 'self' ? 'moderators' : mode ?? query.dimension ?? (selfOnly ? 'moderators' : 'queues');
    if (mode === 'self' && actor.superAdmin) throw new ForbiddenError();
    const forced = mode === 'self' ? { moderatorId: actor.userId } :
      id ? (mode === 'queues' ? { queueId: id } : { moderatorId: id }) : {};
    const filters = analyticsFilters.parse({ ...query, ...forced, dimension });
    return buildAnalytics(prisma, actor, filters);
  }
  app.get('/analytics/overview', (req) => report(req));
  app.get('/analytics/moderators/me', (req) => report(req, 'self'));
  app.get('/analytics/moderators/:id', (req) => report(req, 'moderators'));
  app.get('/analytics/teams', (req) => report(req, 'teams'));
  app.get('/analytics/lobs', (req) => report(req, 'lobs'));
  app.get('/analytics/organizations', (req) => report(req, 'organizations'));
  app.get('/analytics/queues/:id', (req) => report(req, 'queues'));
}
