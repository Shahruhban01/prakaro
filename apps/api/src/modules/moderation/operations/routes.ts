import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../common/database/prisma';
import { AppError } from '../../../common/errors/app-error';
import type { AnalyticsActor, Database } from '../analytics-scope';
import { workforceData } from '../analytics-data';
import { acknowledge, ruleInput, saveRule } from './alerts';
import { adherence, liveWorkforce } from './attendance';
import { capacity, forecast, planInput, updatePlan } from './capacity';
import { csv, executive } from './executive';
import { executivePolling } from './polling';
import { assignShift, assignmentInput, canAdmin, canManage, cancelShift, context, missing, organizationFor,
  rangeInput, reason, requireAccess, saveShift, schedules, shiftInput, uuid } from './schedule';

type Staff = (request: FastifyRequest) => Promise<AnalyticsActor>;
const id = (req: FastifyRequest) => z.object({ id: uuid }).parse(req.params).id;
const transaction = <T>(action: (db: Database) => Promise<T>) =>
  prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
const slim = z.object({ organizationId: uuid.optional() }).strict();

export function registerWorkforceOperations(app: FastifyInstance, staff: Staff) {
  app.get('/workforce/operations/options', async (req) => {
    const actor = await staff(req);
    const query = rangeInput.parse(req.query);
    const ctx = await context(prisma, actor, query);
    const shifts = await prisma.workforceShift.findMany({ where: {
      organizationId: ctx.scope.organizationId, active: true,
    }, select: { id: true, name: true, organizationId: true }, take: 250, orderBy: { name: 'asc' } });
    return { organizations: ctx.scope.organizations, lobs: ctx.scope.lobs, teams: ctx.scope.teams.map(({ id, name }) => ({ id, name })),
      employees: ctx.scope.roster.map(({ id, name, status }) => ({ id, name, status })),
      queues: ctx.scope.selectedQueues, shifts, timezone: ctx.timezone, canManage: canManage(actor), canAdmin: canAdmin(actor) };
  });
  app.get('/workforce/shifts', async (req) => {
    const actor = await staff(req);
    const query = slim.parse(req.query);
    const org = await organizationFor(prisma, actor, query.organizationId);
    return prisma.workforceShift.findMany({ where: { organizationId: org?.id }, orderBy: [{ active: 'desc' }, { name: 'asc' }], take: 250 });
  });
  app.post('/workforce/shifts', async (req) => {
    const actor = await staff(req);
    return transaction((db) => saveShift(db, actor, shiftInput.parse(req.body)));
  });
  app.patch('/workforce/shifts/:id', async (req) => {
    const actor = await staff(req);
    return transaction((db) => saveShift(db, actor, shiftInput.parse(req.body), id(req)));
  });
  app.get('/workforce/schedules', async (req) => {
    const query = rangeInput.parse(req.query);
    const now = new Date();
    const ctx = await context(prisma, await staff(req), query, now);
    const page = await adherence(prisma, ctx, query, now, 60, query.page);
    return { rows: page.items, count: page.count, page: query.page, limit: 60, timezone: page.timezone, from: page.from, through: page.through };
  });
  app.post('/workforce/assignments', async (req) => {
    const actor = await staff(req);
    return transaction((db) => assignShift(db, actor, assignmentInput.parse(req.body)));
  });
  app.patch('/workforce/assignments/:id', async (req) => {
    const actor = await staff(req);
    const input = z.object({ reason }).strict().parse(req.body);
    return transaction((db) => cancelShift(db, actor, id(req), input.reason));
  });
  app.get('/workforce/attendance-adherence', async (req) => {
    const actor = await staff(req);
    const query = rangeInput.parse(req.query);
    const now = new Date();
    const ctx = await context(prisma, actor, query, now);
    const { items, ...report } = await adherence(prisma, ctx, query, now);
    return { ...report, count: items.length, rows: items.slice((query.page - 1) * 60, query.page * 60) };
  });
  app.get('/workforce/live', async (req) => {
    const actor = await staff(req);
    const query = rangeInput.parse(req.query);
    const now = new Date();
    return liveWorkforce(prisma, await context(prisma, actor, query, now), query, now);
  });
  app.get('/workforce/capacity', async (req) => {
    const actor = await staff(req); requireAccess(canManage(actor));
    const { utilizationPercent, fallbackAhtSeconds, ...filters } = req.query as Record<string, unknown>;
    const override = z.object({ utilizationPercent: z.coerce.number().int().min(0).max(100).optional(),
      fallbackAhtSeconds: z.coerce.number().int().min(1).max(3600).optional() }).parse({ utilizationPercent, fallbackAhtSeconds });
    const query = rangeInput.parse(filters);
    const now = new Date();
    return capacity(prisma, await context(prisma, actor, query, now), now, override);
  });
  app.put('/workforce/capacity', async (req) => {
    const actor = await staff(req);
    return transaction((db) => updatePlan(db, actor, planInput.parse(req.body)));
  });
  app.get('/workforce/forecast', async (req) => {
    const now = new Date(); const actor = await staff(req); requireAccess(canManage(actor));
    return forecast(prisma, await context(prisma, actor, rangeInput.parse(req.query), now), now);
  });
  app.get('/workforce/alerts', async (req) => {
    const actor = await staff(req); requireAccess(canAdmin(actor));
    const { organizationId, page } = slim.extend({ page: z.coerce.number().int().min(1).max(1000).default(1) }).parse(req.query);
    const org = await organizationFor(prisma, actor, organizationId);
    const rules = { organizationId: org?.id };
    const eventWhere = { rule: rules };
    const [configured, rows, count] = await Promise.all([
      prisma.workforceAlertRule.findMany({ where: rules, orderBy: { id: 'asc' }, take: 250 }),
      prisma.workforceAlertEvent.findMany({ where: eventWhere, orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 40,
        take: 40, include: { rule: { include: { queue: { select: { name: true } }, organization: { select: { name: true } } } } } }),
      prisma.workforceAlertEvent.count({ where: eventWhere }),
    ]);
    return { rules: configured, rows, count, page };
  });
  app.post('/workforce/alerts/rules', async (req) => {
    const actor = await staff(req); return transaction((db) => saveRule(db, actor, ruleInput.parse(req.body)));
  });
  app.patch('/workforce/alerts/rules/:id', async (req) => {
    const actor = await staff(req); return transaction((db) => saveRule(db, actor, ruleInput.parse(req.body), id(req)));
  });
  app.post('/workforce/alerts/:id/acknowledge', async (req) => {
    const actor = await staff(req); return transaction((db) => acknowledge(db, actor, id(req)));
  });
}

export function registerExecutiveOperations(app: FastifyInstance, staff: Staff) {
  const poll = executivePolling<Awaited<ReturnType<typeof executive>>>();
  for (const view of ['overview','organizations','teams','queues'] as const) {
    app.get('/executive/' + view, async (req) => {
      const actor = await staff(req);
      requireAccess(view === 'organizations' ? actor.superAdmin : canManage(actor));
      const query = rangeInput.parse(req.query);
      if (view === 'teams' && !query.teamId) throw missing();
      return poll(actor, query, () => executive(prisma, actor, query, new Date()));
    });
  }
  app.get('/reports/export', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const actor = await staff(req);
    const { report: input, ...filters } = req.query as Record<string, unknown>;
    const report = z.enum(['schedule','attendance','aux','team','queue','qa','executive']).parse(input);
    const query = rangeInput.parse(filters);
    const now = new Date();
    const ctx = await context(prisma, actor, query, now);
    if (report === 'team' && !query.teamId) throw new AppError(400, 'TEAM_REQUIRED', 'Choose an authorized team for this export.');
    const rows: unknown[][] = [
      ['Report', report], ['Timezone', ctx.timezone], ['From (local)', ctx.window.from], ['Through (local)', ctx.window.through],
      ['Generated (UTC)', now], ['Definitions', 'AHT = eligible handling seconds / completed cases. QA accuracy = finalized passes / evaluations.'],
      ['Scope', ctx.scope.organizationId ?? 'Platform'], [],
    ];
    if (report === 'schedule') {
      const result = await schedules(prisma, ctx, 1, 2501);
      if (result.count > 2500) throw new AppError(422, 'EXPORT_TOO_LARGE', 'Narrow the schedule to at most 2500 records.');
      rows.push(['Employee','LOB','Team','Shift','Type','Starts UTC','Ends UTC'],
        ...result.rows.map((item) => [item.employee.name, item.lob.name, item.team?.name, item.shiftName, item.kind, item.startsAt, item.endsAt]));
    } else if (report === 'attendance') {
      const result = await adherence(prisma, ctx, query, now, 2500);
      if (!result.available) throw new AppError(422, 'EXPORT_TOO_LARGE', 'Narrow the attendance range.');
      rows.push(['Employee','Shift','Status','Late','Early','Attended seconds','Scheduled seconds'],
        ...result.items.map((item) => [item.employee.name, item.shiftName, item.status, item.late, item.early, item.attendedSeconds, item.scheduledSeconds]));
    } else if (report === 'aux') {
      const data = await workforceData(prisma, ctx.scope, ctx.filters, ctx.historical, now);
      rows.push(['AUX state','Seconds'], ...Object.entries(data.aux?.totals ?? {}).filter(([key]) => !query.aux || query.aux === key));
    } else {
      const data = await executive(prisma, actor, query, now);
      if (report === 'queue') rows.push(['Queue','Completed','AHT seconds','Pending'],
        ...data.queues.map((item) => [item.name, item.completed, item.ahtSeconds, item.pending]));
      else if (report === 'qa') rows.push(['Passes','Evaluated','Accuracy','Sampled','Eligible','Coverage'],
        [data.quality.passes, data.quality.evaluated, data.quality.accuracy, data.sampled, data.eligible, data.coverage]);
      else rows.push(['Employees','Scheduled','Attending','Moderating','Completed','AHT seconds','Pending','QA accuracy','Schedule adherence','Attribution'],
        [data.employees, data.scheduledEmployees, data.attending, data.moderating, data.completed, data.ahtSeconds, data.pending, data.quality.accuracy, data.adherence, data.attribution]);
    }
    await prisma.moderationAudit.create({ data: {
      actor: actor.userId, actorId: actor.userId, actorType: actor.actorType, target: report,
      organizationId: ctx.scope.organizationId, action: 'WORKFORCE_REPORT_EXPORTED',
      after: { from: ctx.window.from, through: ctx.window.through, timezone: ctx.timezone, rows: rows.length,
        teamId: query.teamId ?? null, lobId: query.lobId ?? null, queueId: query.queueId ?? null,
        employeeId: query.employeeId ?? null },
    } });
    return reply.header('Cache-Control','no-store').header('Content-Disposition', 'attachment; filename="prakaro-' + report + '.csv"')
      .type('text/csv; charset=utf-8').send(csv(rows));
  });
}
