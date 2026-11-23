import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../common/database/prisma';
import { ForbiddenError } from '../../../common/errors/app-error';
import type { AnalyticsActor } from '../analytics-scope';
import { employeeScope, lobScope } from '../workforce';
import { policyAudit, policyConflict, policyMissing, isPolicyAdmin, type Db } from './service';

export const uuid = z.string().uuid();
const statuses = z.enum(['OPEN','ANSWERED','NEEDS_INFORMATION','ESCALATED','RESOLVED','CLOSED']);
const supervisor = (actor: AnalyticsActor) =>
  ['SUPERVISOR','MOD_SUPERVISOR','QA_SUPERVISOR','MANAGER','MODERATION_MANAGER'].includes(actor.role);
const text = z.string().trim().min(3).max(2000);
const payload = z.object({
  messageId: uuid, revision: z.number().int().nonnegative(),
  kind: z.enum(['ANSWER','EXPLAIN_POLICY','REQUEST_INFORMATION','FOLLOW_UP','ESCALATE','RESOLVE','CLOSE']),
  text,
}).strict();

async function scope(tx: Db, actor: AnalyticsActor): Promise<Prisma.PolicyClarificationWhereInput> {
  if (actor.superAdmin) return {};
  const organizationId = actor.organizationId ?? '';
  if (isPolicyAdmin(actor)) return { organizationId };
  const own = { reservation: { moderatorId: actor.userId } };
  if (!supervisor(actor)) return { organizationId, ...own };
  const grants = await tx.queueLobAccess.findMany({
    where: { organizationId, revokedAt: null, lob: { AND: [{ active: true }, lobScope(actor)] },
      queue: { organizationId } }, select: { lobId: true, queueId: true },
  });
  return { organizationId, OR: [own, { AND: [
    { OR: grants.map(({ lobId, queueId }) => ({ lobId, queueId })) },
    actor.role === 'QA_SUPERVISOR' || !actor.requiresTeam ? {} : { reservation: { moderator: employeeScope(actor) } },
    { OR: [{ supervisorId: actor.userId }, { supervisorId: null }] },
  ] }] };
}
const summary = {
  id: true, status: true, supervisorId: true, revision: true, createdAt: true,
  queue: { select: { id: true, name: true } },
  version: { select: { id: true, number: true, policy: { select: { id: true, name: true } } } },
  reservation: { select: { id: true, moderatorId: true, status: true, leaseExpiresAt: true,
    case: { select: { id: true, code: true } }, moderator: { select: { id: true, name: true } } } },
} satisfies Prisma.PolicyClarificationSelect;
const messages = { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }], take: 25 };

async function create(tx: Db, actor: AnalyticsActor, input: { reservationId: string; messageId: string; text: string }) {
  if (!actor.organizationId || !actor.lobId || actor.superAdmin) throw new ForbiddenError();
  await tx.$queryRaw`SELECT id FROM moderation_case_reservation WHERE id = ${input.reservationId} FOR UPDATE`;
  const reservation = await tx.moderationCaseReservation.findFirst({ where: {
    id: input.reservationId, moderatorId: actor.userId, pinnedPolicyId: { not: null },
    queue: { organizationId: actor.organizationId, status: 'ACTIVE', access: {
      some: { organizationId: actor.organizationId, lobId: actor.lobId, revokedAt: null },
    }, subscriptions: { some: { moderatorId: actor.userId, unsubscribedAt: null } } },
  }, select: { id: true, queueId: true, pinnedPolicyId: true, status: true, leaseExpiresAt: true,
    session: { select: { status: true, attendanceSession: { select: { organizationId: true, lobId: true } } } } } });
  if (!reservation?.pinnedPolicyId) throw policyMissing();
  const existing = await tx.policyClarification.findUnique({ where: { reservationId: reservation.id }, include: { messages: true } });
  if (existing?.messages.some((entry) => entry.id === input.messageId && entry.actorId === actor.userId && entry.text === input.text))
    return { id: existing.id };
  if (existing) throw policyConflict('This reservation already has a clarification thread.');
  if (reservation.status !== 'ACTIVE' || reservation.session.status !== 'ACTIVE' || reservation.leaseExpiresAt <= new Date() ||
      reservation.session.attendanceSession?.organizationId !== actor.organizationId || reservation.session.attendanceSession?.lobId !== actor.lobId)
    throw policyConflict('An active reservation is required to ask about its policy.');
  const row = await tx.policyClarification.create({ data: {
    reservationId: reservation.id, versionId: reservation.pinnedPolicyId, organizationId: actor.organizationId,
    lobId: actor.lobId, queueId: reservation.queueId, status: 'OPEN',
    messages: { create: { id: input.messageId, actorId: actor.userId, actorType: actor.actorType, kind: 'QUESTION', text: input.text } },
  } });
  await policyAudit(tx, actor, row.organizationId, row.id, 'CLARIFICATION_OPENED',
    { reservationId: reservation.id, versionId: row.versionId, messageId: input.messageId, status: row.status });
  return { id: row.id };
}

async function respond(tx: Db, actor: AnalyticsActor, id: string, input: z.infer<typeof payload>) {
  await tx.$queryRaw`SELECT id FROM policy_clarification WHERE id = ${id} FOR UPDATE`;
  const row = await tx.policyClarification.findFirst({ where: { id, AND: [await scope(tx, actor)] },
    select: { ...summary, organizationId: true, _count: { select: { messages: true } } } });
  if (!row) throw policyMissing();
  const prior = await tx.clarificationMessage.findUnique({ where: { id: input.messageId } });
  if (prior?.clarificationId === id && prior.actorId === actor.userId && prior.kind === input.kind && prior.text === input.text)
    return { id, revision: row.revision, status: row.status };
  if (prior || row.revision !== input.revision) throw policyConflict('The clarification changed. Refresh before responding.');
  if (row._count.messages >= 25) throw policyConflict('This clarification has reached its message limit.');
  const author = row.reservation.moderatorId === actor.userId && !actor.superAdmin;
  const admin = isPolicyAdmin(actor);
  if (input.kind === 'FOLLOW_UP' ? !author : input.kind === 'RESOLVE' ? !author && !supervisor(actor) && !admin
    : author || (!supervisor(actor) && !admin) || (!admin && row.status === 'ESCALATED')) throw new ForbiddenError();
  const transitions: Record<typeof input.kind, { from: string[]; to: string }> = {
    ANSWER: { from: ['OPEN','NEEDS_INFORMATION','ESCALATED'], to: 'ANSWERED' },
    EXPLAIN_POLICY: { from: ['OPEN','NEEDS_INFORMATION','ESCALATED'], to: 'ANSWERED' },
    REQUEST_INFORMATION: { from: ['OPEN','ESCALATED'], to: 'NEEDS_INFORMATION' },
    FOLLOW_UP: { from: ['NEEDS_INFORMATION','ANSWERED'], to: 'OPEN' },
    ESCALATE: { from: ['OPEN','NEEDS_INFORMATION','ANSWERED'], to: 'ESCALATED' },
    RESOLVE: { from: author ? ['ANSWERED'] : ['ANSWERED','NEEDS_INFORMATION','ESCALATED'], to: 'RESOLVED' },
    CLOSE: { from: ['RESOLVED'], to: 'CLOSED' },
  };
  const next = transitions[input.kind];
  if (!next.from.includes(row.status)) throw policyConflict('That action is unavailable in the current clarification state.');
  await tx.clarificationMessage.create({ data: {
    id: input.messageId, clarificationId: id, actorId: actor.userId, actorType: actor.actorType,
    kind: input.kind, text: input.text,
  } });
  const result = await tx.policyClarification.update({ where: { id }, data: {
    status: next.to, revision: { increment: 1 },
    supervisorId: input.kind === 'ESCALATE' ? null : author ? row.supervisorId : actor.userId,
  } });
  await policyAudit(tx, actor, row.organizationId, id, 'CLARIFICATION_' + input.kind,
    { messageId: input.messageId, versionId: row.version.id, status: result.status }, { status: row.status });
  return { id, status: result.status, revision: result.revision };
}

export function registerClarifications(app: FastifyInstance, staff: (request: FastifyRequest) => Promise<AnalyticsActor>) {
  app.get('/clarifications', async (req) => {
    const actor = await staff(req);
    const query = z.object({ status: statuses.optional(), reservationId: uuid.optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1) }).strict().parse(req.query);
    const where = { AND: [await scope(prisma, actor), { status: query.status, reservationId: query.reservationId }] };
    const [rows, total] = await Promise.all([
      prisma.policyClarification.findMany({ where, select: summary, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20, skip: (query.page - 1) * 20 }),
      prisma.policyClarification.count({ where }),
    ]);
    return { rows, total, page: query.page };
  });
  app.get('/clarifications/:id', async (req) => {
    const actor = await staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const row = await prisma.policyClarification.findFirst({ where: { id, AND: [await scope(prisma, actor)] },
      select: { ...summary, messages } });
    if (!row) throw policyMissing();
    return { ...row, canRespond: actor.userId !== row.reservation.moderatorId && (isPolicyAdmin(actor) || supervisor(actor)) &&
      (row.status !== 'ESCALATED' || isPolicyAdmin(actor)) };
  });
  app.post('/clarifications', async (req) => {
    const actor = await staff(req);
    const input = z.object({ reservationId: uuid, messageId: uuid, text }).strict().parse(req.body);
    return prisma.$transaction((tx) => create(tx, actor, input), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  });
  app.post('/clarifications/:id/respond', async (req) => {
    const actor = await staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const input = payload.parse(req.body);
    return prisma.$transaction((tx) => respond(tx, actor, id, input), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  });
}
