import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, ForbiddenError } from '../../../common/errors/app-error';
import { analyticsFilters, reportingTimezone, reportWindow } from '../analytics-calendar';
import { analyticsScope, type AnalyticsActor, type Database } from '../analytics-scope';
import { director, employeeScope, leader, teamScope } from '../workforce';

export const uuid = z.string().uuid();
export const day = 86400000;
const date = z.string().date();
export const reason = z.string().trim().min(3).max(500);
export const zone = reportingTimezone;
export const conflict = (message: string) => new AppError(409, 'WORKFORCE_CONFLICT', message);
export const missing = () => new AppError(404, 'WORKFORCE_NOT_FOUND', 'Workforce record is unavailable.');
export const canManage = (actor: AnalyticsActor) => actor.superAdmin || director(actor) || (leader(actor) && actor.hasTeam);
export const canAdmin = (actor: AnalyticsActor) => actor.superAdmin || director(actor);
export function requireAccess(allowed: boolean) { if (!allowed) throw new ForbiddenError(); }
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const localDate = (at: Date, timezone: string) => {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  return ['year','month','day'].map((key) => values.find((part) => part.type === key)?.value).join('-');
};
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export const shiftInput = z.object({
  organizationId: uuid, name: z.string().trim().min(2).max(100), timezone: zone,
  startLocal: time, endLocal: time, breakMinutes: z.number().int().min(0).max(720).default(0),
  lateGraceMinutes: z.number().int().min(0).max(120).default(5), earlyGraceMinutes: z.number().int().min(0).max(120).default(5),
  active: z.boolean().default(true), revision: z.number().int().nonnegative().optional(),
}).strict().refine((data) => data.startLocal !== data.endLocal &&
  data.breakMinutes < (1440 + minutes(data.endLocal) - minutes(data.startLocal)) % 1440,
  'Shift start and end must differ, and breaks must be shorter than the shift.');
export const assignmentInput = z.object({
  employeeId: uuid, teamId: uuid.optional(), shiftId: uuid.optional(), replaceId: uuid.optional(),
  from: date, through: date.optional(), weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  alternating: z.boolean().default(false), kind: z.enum(['SHIFT','OFF','EXCUSED']).default('SHIFT'), reason,
}).strict().superRefine((data, ctx) => {
  if ((data.kind === 'SHIFT') !== Boolean(data.shiftId) || (data.through &&
      (data.through < data.from || Date.parse(data.through) - Date.parse(data.from) > 92 * day)) ||
      (data.weekdays && (!data.weekdays.length || new Set(data.weekdays).size !== data.weekdays.length)) ||
      (data.replaceId && (data.through || data.weekdays || data.alternating)))
    ctx.addIssue({ code: 'custom', message: 'Choose a compatible shift and a recurrence of at most 93 days.' });
});

export const rangeInput = z.object({
  organizationId: uuid.optional(), lobId: uuid.optional(), teamId: uuid.optional(), managerId: uuid.optional(),
  employeeId: uuid.optional(), queueId: uuid.optional(), shiftId: uuid.optional(), timezone: zone.optional(),
  from: date.optional(), through: date.optional(), page: z.coerce.number().int().min(1).max(1000).default(1),
  attendance: z.enum(['NOT_STARTED','PRESENT','LATE','COMPLETED','ABSENT','EXCUSED','UNKNOWN','OFF']).optional(),
  aux: z.enum(['MODERATING','NON_MODERATING','BREAK','MEETING','OFFLINE','TRAINING']).optional(),
}).strict().refine((data) => !data.from || !data.through || (data.through >= data.from &&
  Date.parse(data.through) - Date.parse(data.from) <= 92 * day), 'Choose at most 93 local days.');
export type Range = z.infer<typeof rangeInput>;

export async function organizationFor(db: Database, actor: AnalyticsActor, organizationId?: string) {
  if (!actor.superAdmin && organizationId && actor.organizationId !== organizationId) throw new ForbiddenError();
  const id = organizationId ?? actor.organizationId;
  if (!id) return null;
  const row = await db.organization.findUnique({ where: { id }, select: { id: true, name: true, reportingTimezone: true, active: true } });
  if (!row) {
    if (actor.superAdmin) return null;
    throw new ForbiddenError('Organization not found.');
  }
  if (!row.active) throw new ForbiddenError('Organization is inactive.');
  return row;
}

export async function context(db: Database, actor: AnalyticsActor, query: Range, now = new Date()) {
  const org = await organizationFor(db, actor, query.organizationId);
  const timezone = query.timezone ?? org?.reportingTimezone ?? 'UTC';
  const today = localDate(now, timezone);
  const from = query.from ?? today;
  const through = query.through ?? from;
  const filters = analyticsFilters.parse({ timezone, preset: 'custom', from, through,
    organizationId: query.organizationId, lobId: query.lobId, teamId: query.teamId, moderatorId: query.employeeId,
    queueId: query.queueId, dimension: canManage(actor) ? 'queues' : 'moderators' });
  const scope = await analyticsScope(db, actor, filters);
  if (query.managerId && !scope.roster.some((person) => person.id === query.managerId) && actor.userId !== query.managerId)
    throw new ForbiddenError();
  if (query.managerId) {
    const people = await db.workforceTeamLink.findMany({ where: { team: {
      AND: [teamScope(actor), { links: { some: { moderatorId: query.managerId, kind: { in: ['MANAGER','SUPERVISOR'] } } } }],
    } }, select: { moderatorId: true } });
    const permitted = new Set(people.map(({ moderatorId }) => moderatorId));
    scope.roster = scope.roster.filter(({ id }) => permitted.has(id));
    scope.subjectIds = scope.roster.map(({ id }) => id);
    scope.backlogAvailable = false;
  }
  const window = reportWindow(filters, new Date(Date.parse(through) + 3 * day));
  const historical = reportWindow(filters, now);
  const organizationId = scope.organizationId;
  const where: Prisma.WorkforceShiftAssignmentWhereInput = {
    organizationId, lobId: query.lobId, teamId: query.teamId, employeeId: query.employeeId,
    shiftId: query.shiftId, startsAt: { lt: window.end }, endsAt: { gt: window.start }, cancelledAt: null,
    ...(scope.subjectIds ? { employeeId: { in: scope.subjectIds } } : {}),
    ...(query.managerId ? { team: { links: { some: { moderatorId: query.managerId, kind: { in: ['MANAGER','SUPERVISOR'] } } } } } : {}),
  };
  return { org, timezone, filters, scope, window, historical, where };
}
export type OperationsContext = Awaited<ReturnType<typeof context>>;

export function wallTime(local: string, clock: string, timezone: string) {
  const raw = Date.parse(local + 'T' + clock + ':00Z');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const formatted = (ms: number) => {
    const parts = new Map(fmt.formatToParts(ms).map(({ type, value }) => [type, value]));
    return parts.get('year') + '-' + parts.get('month') + '-' + parts.get('day') + 'T' + parts.get('hour') + ':' + parts.get('minute');
  };
  const offsets = [...new Set([-36,-12,0,12,36].map((hours) => {
    const instant = raw + hours * 3600000;
    return Date.parse(formatted(instant) + ':00Z') - instant;
  }))];
  const matches = offsets.map((offset) => raw - offset).filter((value) => formatted(value) === local + 'T' + clock).sort((a, b) => a - b);
  if (matches[0] === undefined) throw new AppError(422, 'INVALID_LOCAL_TIME', 'The selected shift time does not exist on ' + local + ' in ' + timezone + '.');
  return new Date(matches[0]);
}

export function occurrenceDates(from: string, through: string, weekdays?: number[], alternating = false) {
  const start = Date.parse(from);
  const rows: string[] = [];
  for (let cursor = start; cursor <= Date.parse(through); cursor += day) {
    if ((weekdays && !weekdays.includes(new Date(cursor).getUTCDay())) || (alternating && Math.floor((cursor - start) / (7 * day)) % 2)) continue;
    rows.push(dayKey(cursor));
  }
  return rows;
}

export function scheduleAudit(db: Database, actor: AnalyticsActor, organizationId: string, target: string,
  action: string, after: Prisma.InputJsonObject, before?: Prisma.InputJsonObject) {
  return db.moderationAudit.create({ data: {
    organizationId, target, actor: actor.userId, actorId: actor.userId, actorType: actor.actorType,
    action: 'WORKFORCE_' + action, before, after,
  } });
}

export async function saveShift(db: Database, actor: AnalyticsActor, input: z.infer<typeof shiftInput>, id?: string) {
  requireAccess(canManage(actor));
  const org = await organizationFor(db, actor, input.organizationId);
  if (!org) throw missing();
  const { revision, ...values } = input;
  if (id) {
    const prior = await db.workforceShift.findFirst({ where: { id, organizationId: org.id } });
    if (!prior) throw missing();
    if (!canAdmin(actor) && prior.createdBy !== actor.userId) throw new ForbiddenError('Only an organization administrator can edit another manager’s shift definition.');
    const result = await db.workforceShift.updateMany({ where: { id, revision: revision ?? -1 },
      data: { ...values, revision: { increment: 1 } } });
    if (!result.count) throw conflict('The shift was changed by another administrator.');
    const after = await db.workforceShift.findUniqueOrThrow({ where: { id } });
    await scheduleAudit(db, actor, org.id, id, 'SHIFT_CHANGED',
      { ...values, revision: after.revision }, { name: prior.name, revision: prior.revision });
    return after;
  }
  const row = await db.workforceShift.create({ data: { ...values, createdBy: actor.userId } });
  await scheduleAudit(db, actor, org.id, row.id, 'SHIFT_CREATED', { ...values, revision: 0 });
  return row;
}
async function lockEmployee(db: Database, id: string) {
  await db.$queryRaw`SELECT id FROM moderators WHERE id = ${id} FOR UPDATE`;
}

export async function assignShift(db: Database, actor: AnalyticsActor, input: z.infer<typeof assignmentInput>, now = new Date()) {
  requireAccess(canManage(actor));
  await lockEmployee(db, input.employeeId);
  const employee = await db.moderator.findFirst({ where: { AND: [employeeScope(actor), { id: input.employeeId, status: 'ACTIVE' }] },
    select: { id: true, organizationId: true, lobId: true, organization: { select: { reportingTimezone: true, active: true } } } });
  if (!employee?.organizationId || !employee.lobId || !employee.organization?.active) throw new ForbiddenError();
  const organizationId = employee.organizationId;
  const memberships = await db.workforceTeam.findMany({ where: { AND: [teamScope(actor), {
    organizationId, active: true, links: { some: { moderatorId: employee.id } },
  }] }, orderBy: { id: 'asc' }, select: { id: true } });
  const teamId = input.teamId ?? (memberships.length === 1 ? memberships[0]?.id : undefined);
  if (teamId && !memberships.some((item) => item.id === teamId)) throw new ForbiddenError();
  if (!canAdmin(actor) && !teamId) throw new ForbiddenError('Choose an authorized team for this employee.');
  const shift = input.shiftId ? await db.workforceShift.findFirst({ where: { id: input.shiftId, organizationId, active: true } }) : null;
  if (input.shiftId && !shift) throw missing();
  const timezone = shift?.timezone ?? employee.organization.reportingTimezone;
  const dates = occurrenceDates(input.from, input.through ?? input.from, input.weekdays, input.alternating);
  if (!dates.length) throw new AppError(422, 'EMPTY_SCHEDULE', 'No dates match this recurrence.');
  const seriesId = randomUUID();
  const rows = dates.map((local) => {
    const next = dayKey(Date.parse(local) + day);
    const startsAt = wallTime(local, shift?.startLocal ?? '00:00', timezone);
    const endsAt = wallTime(shift && shift.endLocal > shift.startLocal ? local : next, shift?.endLocal ?? '00:00', timezone);
    if (+endsAt - +startsAt <= (shift?.breakMinutes ?? 0) * 60000)
      throw new AppError(422, 'INVALID_SHIFT_DURATION', 'The actual shift is shorter than its configured break.');
    if (startsAt <= now) throw conflict('New assignments and replacements must start in the future.');
    return { id: randomUUID(), employeeId: employee.id, organizationId, lobId: employee.lobId!, teamId,
      shiftId: shift?.id, kind: input.kind, startsAt, endsAt, localDate: local, timezone,
      shiftName: shift?.name ?? (input.kind === 'OFF' ? 'Week off' : 'Excused absence'),
      breakMinutes: shift?.breakMinutes ?? 0, lateGraceMinutes: shift?.lateGraceMinutes ?? 0,
      earlyGraceMinutes: shift?.earlyGraceMinutes ?? 0, reason: input.reason, seriesId, createdBy: actor.userId };
  });
  if (input.replaceId) {
    const prior = await db.workforceShiftAssignment.findFirst({ where: { id: input.replaceId, employeeId: employee.id, organizationId,
      cancelledAt: null, startsAt: { gt: now }, ...(canAdmin(actor) ? {} : { teamId }) } });
    if (!prior || prior.localDate !== input.from) throw conflict('Only a future assignment on this employee and date can be replaced.');
    await db.workforceShiftAssignment.update({ where: { id: prior.id }, data: { cancelledAt: now } });
    await scheduleAudit(db, actor, organizationId, prior.id, 'ASSIGNMENT_REPLACED',
      { replacementId: rows[0]!.id, cancelledAt: now.toISOString(), reason: input.reason }, { shiftName: prior.shiftName, kind: prior.kind });
  }
  const existing = await db.workforceShiftAssignment.findMany({ where: {
    employeeId: employee.id, cancelledAt: null, startsAt: { lt: rows.at(-1)!.endsAt }, endsAt: { gt: rows[0]!.startsAt },
  }, select: { startsAt: true, endsAt: true } });
  if (rows.some((row) => existing.some((prior) => prior.startsAt < row.endsAt && prior.endsAt > row.startsAt)))
    throw conflict('This employee already has an overlapping schedule or exception.');
  await db.workforceShiftAssignment.createMany({ data: rows });
  await scheduleAudit(db, actor, organizationId, seriesId, 'ASSIGNMENT_CREATED', {
    employeeId: employee.id, teamId: teamId ?? null, from: input.from, through: input.through ?? input.from,
    kind: input.kind, count: rows.length, reason: input.reason, assignments: rows.map(({ id }) => id),
  });
  return { seriesId, rows };
}

export async function cancelShift(db: Database, actor: AnalyticsActor, id: string, explanation: string) {
  requireAccess(canManage(actor));
  const row = await db.workforceShiftAssignment.findFirst({
    where: { id, employee: employeeScope(actor), ...(actor.superAdmin ? {} : { organizationId: actor.organizationId ?? '' }),
      ...(canAdmin(actor) ? {} : { team: teamScope(actor) }) },
  });
  if (!row) throw missing();
  await lockEmployee(db, row.employeeId);
  const now = new Date();
  const result = await db.workforceShiftAssignment.updateMany({ where: { id, cancelledAt: null, startsAt: { gt: now } }, data: { cancelledAt: now } });
  if (!result.count) throw conflict('Only a future assignment can be cancelled.');
  await scheduleAudit(db, actor, row.organizationId, id, 'ASSIGNMENT_CANCELLED',
    { cancelledAt: now.toISOString(), reason: explanation }, { startsAt: row.startsAt.toISOString(), shiftName: row.shiftName });
  return { id, cancelledAt: now };
}

export const scheduleInclude = {
  employee: { select: { id: true, name: true, role: true, status: true } },
  lob: { select: { id: true, name: true } }, team: { select: { id: true, name: true } },
} as const;
export async function schedules(db: Database, ctx: OperationsContext, page: number, limit = 60) {
  const [rows, count] = await Promise.all([
    db.workforceShiftAssignment.findMany({ where: ctx.where, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit, skip: (page - 1) * limit, include: scheduleInclude }),
    db.workforceShiftAssignment.count({ where: ctx.where }),
  ]);
  return { rows, count, page, limit, timezone: ctx.timezone, from: ctx.window.from, through: ctx.window.through };
}
