import { registerAttendance } from './attendance-routes';
import { registerWorkforceOperations } from './operations/routes';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError } from '../../common/errors/app-error';
import { replyToPoolTimeout } from '../../common/errors/database-unavailable';
import { env } from '../../config/env';
import { staff } from './routes';

const uid = z.string().uuid();
const params = (req: FastifyRequest) => z.object({ id: uid }).parse(req.params).id;
const missing = () => new AppError(404, 'NOT_FOUND', 'Record not found.');
const conflict = (message: string) => new AppError(409, 'WORKFORCE_CONFLICT', message);
const roles = z.enum([
  'MODERATION_ADMIN',
  'MANAGER',
  'MOD_SUPERVISOR',
  'QA_SUPERVISOR',
  'MODERATOR',
  'QA_REVIEWER',
  'VIEWER',
]);
const common = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{2,40}$/),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).default(''),
    active: z.boolean().default(true),
  })
  .strict();
const employee = z
  .object({
    employeeCode: common.shape.code,
    name: common.shape.name,
    organizationId: uid,
    lobId: uid,
    role: roles,
    status: z.enum(['ACTIVE', 'DEACTIVATED', 'PENDING_ASSIGNMENT']),
  })
  .strict();
const team = common
  .omit({ description: true })
  .extend({ organizationId: uid, kind: z.enum(['MODERATION', 'QUALITY']) });
type Actor = Awaited<ReturnType<typeof staff>>;
export const director = (a: Actor) => a.role === 'MODERATION_ADMIN' || a.role === 'ADMIN';
export const leader = (a: Actor) =>
  ['MANAGER', 'MODERATION_MANAGER', 'SUPERVISOR', 'MOD_SUPERVISOR', 'QA_SUPERVISOR'].includes(
    a.role,
  );
const platform = (a: Actor) => {
  if (!a.superAdmin) throw new ForbiddenError();
};
function manage(a: Actor, org: string) {
  if (!a.superAdmin && (!director(a) || a.organizationId !== org)) throw new ForbiddenError();
}
export const teamScope = (a: Actor): Prisma.WorkforceTeamWhereInput =>
  a.superAdmin
    ? {}
    : {
        organizationId: a.organizationId ?? '',
        ...(director(a)
          ? {}
          : {
              active: true,
              links: {
                some: {
                  moderatorId: a.userId,
                  ...(leader(a) ? { kind: { in: ['MANAGER', 'SUPERVISOR'] } } : {}),
                },
              },
            }),
      };
export const employeeScope = (a: Actor): Prisma.ModeratorWhereInput =>
  a.superAdmin
    ? {}
    : {
        organizationId: a.organizationId ?? '',
        ...(director(a)
          ? {}
          : {
              OR: [
                { id: a.userId },
                ...(leader(a)
                  ? [{ teamLinks: { some: { team: { ...teamScope(a), active: true } } } }]
                  : []),
              ],
            }),
      };
const orgScope = (a: Actor) => (a.superAdmin ? {} : { id: a.organizationId ?? '' });
export const lobScope = (a: Actor): Prisma.LobWhereInput =>
  a.superAdmin
    ? {}
    : {
        organizationId: a.organizationId ?? '',
        ...(director(a)
          ? {}
          : {
              OR: [
                { id: a.lobId ?? '' },
                ...(leader(a) ? [{ staff: { some: employeeScope(a) } }] : []),
              ],
            }),
      };
const staffSelect = {
  id: true,
  name: true,
  email: true,
  employeeCode: true,
  role: true,
  status: true,
  organizationId: true,
  lobId: true,
  lastLoginAt: true,
} satisfies Prisma.ModeratorSelect;
const orgInclude = {
  _count: { select: { lobs: true, staff: true, teams: true } },
} satisfies Prisma.OrganizationInclude;
const lobInclude = {
  organization: { select: { name: true } },
  _count: { select: { staff: true } },
} satisfies Prisma.LobInclude;
const teamInclude = {
  links: { include: { moderator: { select: staffSelect } } },
} satisfies Prisma.WorkforceTeamInclude;
const pageInput = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(100).default(''),
    status: z.enum(['all', 'active', 'inactive', 'pending']).default('all'),
    sort: z.enum(['asc', 'desc']).default('asc'),
    organizationId: uid.optional(),
  })
  .strict();
const active = (status: string) => (status === 'all' ? undefined : status === 'active');
const nameLike = (search: string) => (search ? { contains: search } : undefined);
const serial = { isolationLevel: 'Serializable' } as const;
function audit(
  tx: Prisma.TransactionClient,
  a: Actor,
  organizationId: string | null,
  action: string,
  target: string,
  after: Prisma.InputJsonValue,
  before?: Prisma.InputJsonValue,
) {
  return tx.moderationAudit.create({
    data: {
      actor: a.userId,
      actorId: a.userId,
      actorType: a.actorType,
      organizationId,
      action,
      target,
      after,
      before,
    },
  });
}
async function verifyMembership(tx: Prisma.TransactionClient, input: z.infer<typeof employee>) {
  const lob = await tx.lob.findFirst({
    where: { id: input.lobId, organizationId: input.organizationId },
    include: { organization: true },
  });
  if (!lob) throw conflict('Select an LOB assigned to this organization.');
  if (input.status === 'ACTIVE' && (!lob.active || !lob.organization?.active))
    throw conflict('The organization and LOB must be active.');
}
function roleChange(a: Actor, id: string | undefined, ...roles: string[]) {
  if (
    a.userId === id ||
    (!a.superAdmin && roles.some((r) => ['ADMIN', 'SUPER_ADMIN', 'MODERATION_ADMIN'].includes(r)))
  )
    throw new ForbiddenError();
}
export async function workforceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = new URL(env.MODERATION_ORIGIN || env.BETTER_AUTH_URL).origin;
    if (
      req.headers.origin
        ? req.headers.origin !== origin || req.headers['x-prakaro-console'] !== '1'
        : !req.headers.authorization?.startsWith('Bearer ')
    )
      throw new ForbiddenError();
  });
  app.setErrorHandler((error, req, reply) => {
    if (replyToPoolTimeout(error, req, reply)) return reply;
    const status =
      error instanceof AppError
        ? error.statusCode
        : error instanceof z.ZodError
          ? 400
          : error instanceof Prisma.PrismaClientKnownRequestError &&
              ['P2002', 'P2003', 'P2034'].includes(error.code)
            ? 409
            : 500;
    return reply.code(status).send({
      error: {
        code:error instanceof AppError?error.code:status===400?'INVALID_INPUT':status===409?'CONFLICT':'WORKFORCE_ERROR',
        message:
          error instanceof AppError
            ? error.message
            : status === 400
              ? 'Invalid workforce input.'
              : status === 409
                ? 'Record conflicts with an existing assignment.'
                : 'Workforce request failed.',
      },
    });
  });
  registerAttendance(app);
  registerWorkforceOperations(app, staff);
  app.get('/organizations', async (req) => {
    const a = await staff(req),
      p = pageInput.parse(req.query);
    return prisma.organization.findMany({
      where: { ...orgScope(a), active: active(p.status), name: nameLike(p.search) },
      include: a.superAdmin || director(a) ? orgInclude : undefined,
      orderBy: { name: p.sort },
      skip: (p.page - 1) * 25,
      take: 25,
    });
  });
  app.get('/organizations/:id', async (req) => {
    const a = await staff(req);
    const row = await prisma.organization.findFirst({
      where: { AND: [orgScope(a), { id: params(req) }] },
      include:
        a.superAdmin || director(a)
          ? {
              ...orgInclude,
              lobs: { select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 10 },
              teams: { select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 10 },
              staff: {
                where: { role: { in: ['ADMIN', 'MODERATION_ADMIN'] } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
                take: 10,
              },
            }
          : undefined,
    });
    if (!row) throw missing();
    const recent =
      a.superAdmin || director(a)
        ? await prisma.moderationAudit.findMany({
            where: { organizationId: row.id },
            select: { id: true, action: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        : [];
    return { ...row, recent };
  });
  app.post('/organizations', async (req) => {
    const a = await staff(req);
    platform(a);
    const b = common.parse(req.body);
    return prisma.$transaction(async (tx) => {
      const row = await tx.organization.create({ data: { ...b, createdBy: a.userId } });
      await audit(tx, a, row.id, 'ORG_CREATED', row.id, b);
      return row;
    });
  });
  app.patch('/organizations/:id', async (req) => {
    const a = await staff(req),
      id = params(req);
    manage(a, id);
    const b = (
      a.superAdmin
        ? common.extend({ queueDelegated: z.boolean() }).partial()
        : common.pick({ name: true, description: true }).partial()
    ).parse(req.body);
    return prisma.$transaction(async (tx) => {
      const prev = await tx.organization.findUnique({ where: { id } });
      if (!prev) throw missing();
      const row = await tx.organization.update({ where: { id }, data: b });
      await audit(tx, a, id, 'ORG_UPDATED', id, b, {
        name: prev.name,
        code: prev.code,
        active: prev.active,
        description: prev.description,
      });
      return row;
    });
  });
  app.get('/lobs', async (req) => {
    const a = await staff(req),
      p = pageInput.parse(req.query);
    return prisma.lob.findMany({
      where: {
        AND: [
          lobScope(a),
          { organizationId: p.organizationId, active: active(p.status), name: nameLike(p.search) },
        ],
      },
      include: a.superAdmin || director(a) ? lobInclude : undefined,
      orderBy: { name: p.sort },
      skip: (p.page - 1) * 25,
      take: 25,
    });
  });
  app.get('/lobs/:id', async (req) => {
    const a = await staff(req);
    const row = await prisma.lob.findFirst({
      where: { id: params(req), ...lobScope(a) },
      include:
        a.superAdmin || director(a)
          ? {
              ...lobInclude,
              staff: { select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 10 },
            }
          : undefined,
    });
    if (!row) throw missing();
    return row;
  });
  app.post('/lobs', async (req) => {
    const a = await staff(req);
    platform(a);
    const b = common.parse(req.body);
    return prisma.$transaction(async (tx) => {
      const row = await tx.lob.create({ data: { ...b, createdBy: a.userId } });
      await audit(tx, a, null, 'LOB_CREATED', row.id, b);
      return row;
    });
  });
  app.patch('/lobs/:id', async (req) => {
    const a = await staff(req);
    platform(a);
    const id = params(req),
      b = common.partial().parse(req.body);
    return prisma.$transaction(async (tx) => {
      const old = await tx.lob.findUnique({ where: { id } });
      if (!old) throw missing();
      const row = await tx.lob.update({ where: { id }, data: b });
      await audit(tx, a, row.organizationId, 'LOB_UPDATED', id, b, {
        name: old.name,
        code: old.code,
        description: old.description,
        active: old.active,
      });
      return row;
    });
  });
  app.post('/lobs/:id/assign-organization', async (req) => {
    const a = await staff(req);
    platform(a);
    const id = params(req),
      { organizationId } = z.object({ organizationId: uid.nullable() }).strict().parse(req.body);
    return prisma.$transaction(async (tx) => {
      const old = await tx.lob.findUnique({
        where: { id },
        include: { _count: { select: { staff: true } } },
      });
      if (!old) throw missing();
      if (old.organizationId === organizationId) return old;
      if (old._count.staff)
        throw conflict('Move all employees out of this LOB before reassigning it.');
      if (
        organizationId &&
        !(await tx.organization.findFirst({ where: { id: organizationId, active: true } }))
      )
        throw conflict('Select an active organization.');
      const row = await tx.lob.update({ where: { id }, data: { organizationId } });
      await audit(
        tx,
        a,
        organizationId,
        'LOB_ASSIGNED',
        id,
        { organizationId },
        { organizationId: old.organizationId },
      );
      return row;
    }, serial);
  });
  app.get('/workforce/staff', async (req) => {
    const a = await staff(req),
      p = pageInput.parse(req.query);
    return prisma.moderator.findMany({
      where: {
        AND: [
          employeeScope(a),
          {
            organizationId: p.organizationId,
            name: nameLike(p.search),
            status: {
              all: undefined,
              active: 'ACTIVE',
              inactive: 'DEACTIVATED',
              pending: 'PENDING_ASSIGNMENT',
            }[p.status],
          },
        ],
      },
      select: staffSelect,
      orderBy: { name: p.sort },
      skip: (p.page - 1) * 25,
      take: 25,
    });
  });
  app.get('/workforce/staff/:id', async (req) => {
    const a = await staff(req);
    const row = await prisma.moderator.findFirst({
      where: { AND: [employeeScope(a), { id: params(req) }] },
      select: staffSelect,
    });
    if (!row) throw missing();
    return row;
  });
  app.post('/workforce/staff', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin && !director(a)) throw new ForbiddenError();
    const b = employee
      .extend({ email: z.string().email().max(160), password: z.string().min(12).max(100) })
      .parse(req.body);
    const { password, email, ...data } = b;
    manage(a, data.organizationId);
    roleChange(a, undefined, data.role);
    const hashed = await hashPassword(password);
    const employeeId = randomUUID();
    return prisma.$transaction(async (tx) => {
      await verifyMembership(tx, data);
      const row = await tx.moderator.create({
        data: {
          ...data,
          id: employeeId,
          email: email.toLowerCase(),
          invitedBy: a.userId,
          accounts: {
            create: { accountId: employeeId, providerId: 'credential', password: hashed },
          },
        },
        select: staffSelect,
      });
      await audit(tx, a, data.organizationId, 'EMPLOYEE_CREATED', row.id, data);
      return row;
    }, serial);
  });
  app.patch('/workforce/staff/:id', async (req) => {
    const a = await staff(req),
      id = params(req),
      b = employee.parse(req.body);
    manage(a, b.organizationId);
    return prisma.$transaction(async (tx) => {
      const prior = await tx.moderator.findFirst({
        where: { AND: [employeeScope(a), { id }] },
        select: staffSelect,
      });
      if (!prior) throw missing();
      roleChange(a, id, prior.role, b.role);
      if (prior.organizationId && prior.organizationId !== b.organizationId)
        throw conflict('Organization transfers require an explicit migration.');
      const links = await tx.workforceTeamLink.findMany({
        where: { moderatorId: id, kind: { not: 'MEMBER' } },
        select: { kind: true, team: { select: { kind: true } } },
      });
      if (
        links.some((l) =>
          l.kind === 'MANAGER'
            ? b.role !== 'MANAGER'
            : b.role !== (l.team.kind === 'QUALITY' ? 'QA_SUPERVISOR' : 'MOD_SUPERVISOR'),
        )
      )
        throw conflict('Remove leadership assignments before changing role.');
      await verifyMembership(tx, b);
      const row = await tx.moderator.update({ where: { id }, data: b, select: staffSelect });
      if (
        prior.status !== b.status ||
        prior.organizationId !== b.organizationId ||
        prior.lobId !== b.lobId ||
        prior.role !== b.role
      ) {
        await tx.moderatorSession.deleteMany({ where: { userId: id } });
        if (prior.organizationId !== null && prior.lobId !== b.lobId)
          await tx.moderationMembership.deleteMany({ where: { moderatorId: id } });
      }
      await audit(tx, a, b.organizationId, 'EMPLOYEE_UPDATED', id, b, {
        role: prior.role,
        status: prior.status,
        organizationId: prior.organizationId,
        lobId: prior.lobId,
      });
      return row;
    }, serial);
  });
  app.get('/workforce/teams', async (req) => {
    const a = await staff(req),
      p = pageInput.parse(req.query);
    return prisma.workforceTeam.findMany({
      where: { AND: [teamScope(a), { name: nameLike(p.search), active: active(p.status) }] },
      include: { _count: { select: { links: true } } },
      orderBy: { name: p.sort },
      skip: (p.page - 1) * 25,
      take: 25,
    });
  });
  app.get('/workforce/teams/:id', async (req) => {
    const a = await staff(req);
    const row = await prisma.workforceTeam.findFirst({
      where: { ...teamScope(a), id: params(req) },
      include: a.superAdmin || director(a) || leader(a) ? teamInclude : undefined,
    });
    if (!row) throw missing();
    return row;
  });
  app.post('/workforce/teams', async (req) => {
    const a = await staff(req),
      b = team.parse(req.body);
    manage(a, b.organizationId);
    return prisma.$transaction(async (tx) => {
      const row = await tx.workforceTeam.create({ data: b });
      await audit(tx, a, b.organizationId, 'TEAM_CREATED', row.id, b);
      return row;
    });
  });
  app.patch('/workforce/teams/:id', async (req) => {
    const a = await staff(req),
      id = params(req),
      b = team.omit({ organizationId: true, kind: true }).partial().parse(req.body);
    return prisma.$transaction(async (tx) => {
      const row = await tx.workforceTeam.findFirst({ where: { id, ...teamScope(a) } });
      if (!row) throw missing();
      manage(a, row.organizationId);
      const saved = await tx.workforceTeam.update({ where: { id }, data: b });
      await audit(tx, a, row.organizationId, 'TEAM_UPDATED', id, b, {
        name: row.name,
        code: row.code,
        active: row.active,
      });
      return saved;
    });
  });
  app.post('/workforce/teams/:id/members', async (req) => {
    const a = await staff(req),
      id = params(req),
      b = z
        .object({ staffId: uid, kind: z.enum(['MEMBER', 'MANAGER', 'SUPERVISOR']) })
        .strict()
        .parse(req.body);
    return prisma.$transaction(async (tx) => {
      const t = await tx.workforceTeam.findFirst({ where: { id, ...teamScope(a) } });
      if (!t) throw missing();
      manage(a, t.organizationId);
      const m = await tx.moderator.findFirst({
        where: {
          id: b.staffId,
          organizationId: t.organizationId,
          status: 'ACTIVE',
          lob: { active: true },
          organization: { active: true },
        },
      });
      if (!m) throw conflict('Choose an eligible employee from this organization.');
      if (
        (b.kind === 'MANAGER' && m.role !== 'MANAGER') ||
        (b.kind === 'SUPERVISOR' &&
          m.role !== (t.kind === 'QUALITY' ? 'QA_SUPERVISOR' : 'MOD_SUPERVISOR'))
      )
        throw conflict('Employee role must match the team assignment.');
      const key = { teamId: id, moderatorId: m.id };
      const prior = await tx.workforceTeamLink.findUnique({ where: { teamId_moderatorId: key } });
      const saved = await tx.workforceTeamLink.upsert({
        where: { teamId_moderatorId: key },
        create: { ...key, organizationId: t.organizationId, kind: b.kind },
        update: { kind: b.kind },
      });
      await audit(
        tx,
        a,
        t.organizationId,
        'TEAM_MEMBER_ASSIGNED',
        id,
        b,
        prior ? { staffId: m.id, kind: prior.kind } : undefined,
      );
      return saved;
    }, serial);
  });
  app.delete('/workforce/teams/:id/members/:staffId', async (req) => {
    const a = await staff(req),
      { id, staffId } = z.object({ id: uid, staffId: uid }).parse(req.params);
    return prisma.$transaction(async (tx) => {
      const t = await tx.workforceTeam.findFirst({ where: { id, ...teamScope(a) } });
      if (!t) throw missing();
      manage(a, t.organizationId);
      const prior = await tx.workforceTeamLink.findUnique({
        where: { teamId_moderatorId: { teamId: id, moderatorId: staffId } },
      });
      if (!prior) throw missing();
      await tx.workforceTeamLink.delete({
        where: { teamId_moderatorId: { teamId: id, moderatorId: staffId } },
      });
      await audit(
        tx,
        a,
        t.organizationId,
        'TEAM_MEMBER_REMOVED',
        id,
        {},
        { staffId, kind: prior.kind },
      );
      return { ok: true };
    });
  });
  app.get('/workforce/dashboard', async (req) => {
    const a = await staff(req);
    const [
      organizations,
      activeOrganizations,
      lobs,
      staffCount,
      activeStaff,
      teams,
      distribution,
      recent,
    ] = await Promise.all([
      prisma.organization.count({ where: orgScope(a) }),
      prisma.organization.count({ where: { ...orgScope(a), active: true } }),
      prisma.lob.count({ where: lobScope(a) }),
      prisma.moderator.count({ where: employeeScope(a) }),
      prisma.moderator.count({
        where: {
          AND: [
            employeeScope(a),
            { status: 'ACTIVE', organization: { active: true }, lob: { active: true } },
          ],
        },
      }),
      prisma.workforceTeam.count({ where: teamScope(a) }),
      prisma.moderator.groupBy({ by: ['role'], where: employeeScope(a), _count: true }),
      a.superAdmin || director(a)
        ? prisma.moderationAudit.findMany({
            where: { organizationId: a.superAdmin ? undefined : (a.organizationId ?? '') },
            take: 8,
            orderBy: { createdAt: 'desc' },
            select: { id: true, action: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      organizations,
      activeOrganizations,
      lobs,
      staffCount,
      activeStaff,
      teams,
      distribution,
      recent,
    };
  });
}
