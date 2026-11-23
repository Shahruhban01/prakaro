import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError } from '../../common/errors/app-error';
import { audit, type Tx } from './intake';
import type { staff } from './routes';
import { scopedHandling } from './handling-metrics';

type Actor = Awaited<ReturnType<typeof staff>>;
const UUID = z.string().uuid();
const statuses = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export const queueStatus = z.enum(statuses);
export const serializable = { isolationLevel: 'Serializable' } as const;
export const queueId = (req: FastifyRequest) => z.object({ id: UUID }).parse(req.params).id;
export function canConfigure(actor: Actor, organizationId: string | null) {
  return (
    actor.superAdmin ||
    Boolean(organizationId && actor.queueDelegated && actor.organizationId === organizationId)
  );
}
export function grantScope(
  actor: Pick<QueueScope, 'organizationId' | 'lobId'>,
): Prisma.ModerationQueueWhereInput {
  return {
    organizationId: actor.organizationId ?? '',
    organization: { active: true },
    access: { some: { lobId: actor.lobId ?? '', revokedAt: null, lob: { active: true } } },
    status: 'ACTIVE',
  };
}
type QueueScope = {
  superAdmin: boolean;
  organizationId: string | null;
  lobId: string | null;
  queueDelegated: boolean;
  requiresTeam: boolean;
  hasTeam: boolean;
};
export function queueVisibility(actor: QueueScope): Prisma.ModerationQueueWhereInput {
  if (actor.superAdmin) return {};
  const grant = actor.requiresTeam && !actor.hasTeam ? { id: '' } : grantScope(actor);
  return actor.queueDelegated
    ? {
        OR: [grant, { organizationId: actor.organizationId ?? '', organization: { active: true } }],
      }
    : grant;
}
export async function accessibleQueue(db: Tx, actor: Actor, id: string) {
  const result = await db.moderationQueue.findFirst({
    where: { id, ...queueVisibility(actor) },
    include: { organization: { select: { name: true } } },
  });
  if (!result) throw new ForbiddenError('This queue is outside your current access.');
  return result;
}
export async function queueSnapshot(tx: Tx, actor: Actor, queue: { id: string; version: number }) {
  const [state, grants] = await Promise.all([
    tx.moderationQueue.findUniqueOrThrow({ where: { id: queue.id } }),
    tx.queueLobAccess.findMany({
      where: { queueId: queue.id, revokedAt: null },
      select: { lobId: true },
      orderBy: { lobId: 'asc' },
    }),
  ]);
  const {
    name,
    description,
    organizationId,
    kind,
    status,
    config,
    priority,
    capacity,
    intakeEnabled,
  } = state;
  await tx.queueConfigurationVersion.create({
    data: {
      queueId: state.id,
      version: state.version,
      actorId: actor.userId,
      actorType: actor.actorType,
      snapshot: {
        name,
        description,
        organizationId,
        kind,
        status,
        config,
        priority,
        capacity,
        intakeEnabled,
        lobIds: grants.map((g) => g.lobId),
      },
    },
  });
}
export async function releaseLegacyLeases(
  tx: Tx,
  actor: Actor,
  queueId: string,
  lobIds?: string[],
) {
  const affected = await tx.moderationCase.updateMany({
    where: {
      status: 'IN_REVIEW',
      owner: { not: null },
      tasks: { some: { queueId } },
      ...(lobIds ? { moderator: { lobId: { in: lobIds } } } : {}),
    },
    data: { status: 'QUEUED', owner: null, leaseUntil: null, revision: { increment: 1 } },
  });
  if (affected.count)
    await audit(
      tx,
      actor.userId,
      'QUEUE_LEGACY_LEASES_RELEASED',
      queueId,
      { count: affected.count },
      undefined,
      actor.actorType,
      actor.userId,
    );
}
export async function replaceGrants(
  tx: Tx,
  actor: Actor,
  queue: { id: string; organizationId: string | null },
  ids: string[],
) {
  const organizationId = queue.organizationId;
  if (!organizationId || !canConfigure(actor, organizationId)) throw new ForbiddenError();
  const unique = [...new Set(ids)];
  const lobs = await tx.lob.findMany({
    where: { id: { in: unique }, organizationId, active: true },
    select: { id: true },
  });
  if (lobs.length !== unique.length)
    throw new AppError(
      409,
      'INVALID_LOB_GRANT',
      'Each selected LOB must be active and belong to the queue organization.',
    );
  const previous = await tx.queueLobAccess.findMany({
    where: { queueId: queue.id, revokedAt: null },
    select: { lobId: true },
  });
  const before = previous.map((g) => g.lobId);
  const now = new Date();
  const revoked = before.filter((lob) => !unique.includes(lob));
  if (revoked.length) await releaseLegacyLeases(tx, actor, queue.id, revoked);
  await tx.queueLobAccess.updateMany({
    where: { queueId: queue.id, revokedAt: null, lobId: { notIn: unique } },
    data: { revokedAt: now },
  });
  for (const lobId of unique.filter((lob) => !before.includes(lob))) {
    await tx.queueLobAccess.upsert({
      where: { queueId_lobId: { queueId: queue.id, lobId } },
      create: {
        queueId: queue.id,
        lobId,
        organizationId,
        actorId: actor.userId,
        actorType: actor.actorType,
      },
      update: {
        revokedAt: null,
        grantedAt: now,
        actorId: actor.userId,
        actorType: actor.actorType,
      },
    });
  }
  await audit(
    tx,
    actor.userId,
    'QUEUE_LOB_ACCESS_CHANGED',
    queue.id,
    { lobIds: unique },
    { lobIds: before },
    actor.actorType,
    actor.userId,
  );
}
const finalStates = ['APPROVED', 'REJECTED', 'CLOSED'];
const pendingStates = ['NEW', 'QUEUED', 'ASSIGNED', 'IN_REVIEW', 'AWAITING_EVIDENCE', 'REOPENED'];
async function metrics(tx: Tx, id: string, organizationId: string | null) {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  const base = { tasks: { some: { queueId: id } } };
  const live = {
    status: 'IN_REVIEW',
    leaseUntil: { gt: now },
    moderator: {
      status: 'ACTIVE',
      organizationId,
      organization: { active: true },
      lob: { active: true, queueAccess: { some: { queueId: id, revokedAt: null } } },
    },
  };
  const [pending, inProgress, completed, published, workers, ahtResult, activeReservations, subscriptions] = await Promise.all([
    tx.moderationCase.count({ where: { ...base, status: { in: pendingStates }, NOT: live } }),
    tx.moderationCase.count({ where: { ...base, ...live } }),
    tx.moderationCase.count({ where: { ...base, status: { in: finalStates } } }),
    tx.$queryRaw<
      { count: bigint }[]
    >(Prisma.sql`SELECT COUNT(DISTINCT c.id) AS count FROM moderation_task t
      JOIN moderation_case c ON c.id=t.caseId
      JOIN moderation_audit a ON a.target=c.id AND a.action='PUBLISH' AND a.createdAt >= ${midnight}
      WHERE t.queueId=${id} AND c.status IN ('APPROVED','REJECTED','CLOSED')`),
    tx.moderationCase.groupBy({ by: ['owner'], where: { ...base, ...live } }),
    scopedHandling(tx, Prisma.sql`h.queueId = ${id}`),
    tx.moderationCaseReservation.findMany({ where: { queueId: id, status: 'ACTIVE', leaseExpiresAt: { gt: now } }, select: { moderatorId: true } }),
    tx.queueSubscription.count({
      where: { queueId: id, unsubscribedAt: null, moderator: live.moderator },
    }),
  ]);
  return {
    pending,
    inProgress,
    completed,
    completedToday: Number(published[0]?.count ?? 0),
    activeModerators: new Set([...workers.map((w) => w.owner).filter(Boolean), ...activeReservations.map((r) => r.moderatorId)]).size,
    subscribedModerators: subscriptions,
    ahtSeconds: ahtResult.ahtSeconds,
    reportingTimezone: 'UTC',
  };
}
const casesQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z.string().max(40).optional(),
    category: z.string().max(60).optional(),
    search: z.string().trim().max(100).optional(),
    from: z.string().date().optional(),
    through: z.string().date().optional(),
    sort: z.enum(['newest', 'oldest', 'priority']).default('newest'),
  })
  .strict();
const caseFields = {
  id: true,
  code: true,
  category: true,
  status: true,
  trigger: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ModerationCaseSelect;
export function registerQueueOperations(app: FastifyInstance, resolve: typeof staff) {
  app.get('/queues/:id/lobs', async (req) => {
    const actor = await resolve(req),
      queue = await accessibleQueue(prisma, actor, queueId(req));
    return prisma.queueLobAccess.findMany({
      where: { queueId: queue.id, revokedAt: null },
      select: { lob: { select: { id: true, name: true, code: true, active: true } } },
    });
  });
  app.put('/queues/:id/lobs', async (req) => {
    const actor = await resolve(req),
      id = queueId(req);
    const input = z
      .object({ lobIds: z.array(UUID).max(100), version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    return prisma.$transaction(async (tx) => {
      const queue = await tx.moderationQueue.findUniqueOrThrow({ where: { id } });
      if (!canConfigure(actor, queue.organizationId)) throw new ForbiddenError();
      if (queue.version !== input.version)
        throw new AppError(409, 'STALE_QUEUE', 'Reload before editing LOB access.');
      await replaceGrants(tx, actor, queue, input.lobIds);
      const updated = await tx.moderationQueue.update({
        where: { id, version: input.version },
        data: { version: { increment: 1 } },
      });
      await queueSnapshot(tx, actor, updated);
      return updated;
    }, serializable);
  });
  app.get('/queues/:id/versions', async (req) => {
    const actor = await resolve(req),
      queue = await accessibleQueue(prisma, actor, queueId(req));
    if (!canConfigure(actor, queue.organizationId)) throw new ForbiddenError();
    return prisma.queueConfigurationVersion.findMany({
      where: { queueId: queue.id },
      orderBy: { version: 'desc' },
      take: 25,
    });
  });
  for (const [path, onlySubscribed] of [
    ['/available-queues', false],
    ['/my-queues', true],
  ] as const) {
    app.get(path, async (req) => {
      const actor = await resolve(req);
      if (actor.role !== 'MODERATOR') throw new ForbiddenError();
      const { page } = z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict()
        .parse(req.query);
      return prisma.$transaction(async (tx) => {
        const rows = await tx.moderationQueue.findMany({
          where: {
            ...grantScope(actor),
            ...(onlySubscribed
              ? { subscriptions: { some: { moderatorId: actor.userId, unsubscribedAt: null } } }
              : {}),
          },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            organizationId: true,
            subscriptions: {
              where: { moderatorId: actor.userId, unsubscribedAt: null },
              select: { subscribedAt: true },
            },
          },
          orderBy: [{ priority: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * 25,
          take: 25,
        });
        return Promise.all(
          rows.map(async ({ subscriptions, organizationId, ...queue }) => ({
            ...queue,
            subscribed: subscriptions.length > 0,
            lob: actor.lob,
            metrics: await metrics(tx, queue.id, organizationId),
          })),
        );
      });
    });
  }
  app.post('/queues/:id/subscribe', async (req) => {
    const actor = await resolve(req),
      id = queueId(req);
    if (actor.role !== 'MODERATOR') throw new ForbiddenError();
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return prisma.$transaction(async (tx) => {
      const permitted = await tx.moderationQueue.findFirst({
        where: {
          id,
          ...grantScope(actor),
          access: {
            some: {
              lobId: actor.lobId ?? '',
              revokedAt: null,
              lob: { active: true, staff: { some: { id: actor.userId, status: 'ACTIVE' } } },
            },
          },
        },
        select: { id: true },
      });
      if (!permitted) throw new ForbiddenError('This queue is unavailable for subscription.');
      const key = { moderatorId: actor.userId, queueId: id };
      const prior = await tx.queueSubscription.findUnique({ where: { moderatorId_queueId: key } });
      if (!prior || prior.unsubscribedAt) {
        await tx.queueSubscription.upsert({
          where: { moderatorId_queueId: key },
          create: key,
          update: { subscribedAt: new Date(), unsubscribedAt: null },
        });
        await audit(
          tx,
          actor.userId,
          'QUEUE_SUBSCRIBED',
          id,
          undefined,
          undefined,
          actor.actorType,
          actor.userId,
        );
      }
      return { subscribed: true };
    }, serializable);
  });
  app.delete('/queues/:id/subscribe', async (req) => {
    const actor = await resolve(req),
      id = queueId(req);
    if (actor.role !== 'MODERATOR') throw new ForbiddenError();
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const changed = await tx.queueSubscription.updateMany({
        where: { moderatorId: actor.userId, queueId: id, unsubscribedAt: null },
        data: { unsubscribedAt: now },
      });
      if (changed.count)
        await audit(
          tx,
          actor.userId,
          'QUEUE_UNSUBSCRIBED',
          id,
          undefined,
          undefined,
          actor.actorType,
          actor.userId,
        );
      return { subscribed: false };
    });
  });
  app.get(
    '/queues/:id/metrics',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const actor = await resolve(req);
      return prisma.$transaction(async (tx) => {
        const queue = await accessibleQueue(tx, actor, queueId(req));
        return metrics(tx, queue.id, queue.organizationId);
      });
    },
  );
  app.get('/queues/:id/activity', async (req) => {
    const actor = await resolve(req);
    const days = Array.from({ length: 7 }, (_, index) =>
      new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10),
    );
    return prisma.$transaction(async (tx) => {
      const queue = await accessibleQueue(tx, actor, queueId(req));
      const [arrivals, completions, daily] = await Promise.all([
        tx.moderationCase.findMany({
          where: { tasks: { some: { queueId: queue.id } } },
          select: caseFields,
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        tx.moderationCase.findMany({
          where: { tasks: { some: { queueId: queue.id } }, status: { in: finalStates } },
          select: caseFields,
          orderBy: { updatedAt: 'desc' },
          take: 8,
        }),
        tx.$queryRaw<
          { day: string; total: bigint }[]
        >(Prisma.sql`SELECT DATE_FORMAT(c.createdAt, '%Y-%m-%d') AS day, COUNT(*) AS total
        FROM moderation_task t JOIN moderation_case c ON c.id=t.caseId
        WHERE t.queueId=${queue.id} AND c.createdAt >= ${new Date(days[0]!)}
        GROUP BY DATE_FORMAT(c.createdAt, '%Y-%m-%d')`),
      ]);
      return {
        arrivals,
        completions,
        intake: days.map((day) => ({
          day,
          count: Number(daily.find((row) => row.day === day)?.total ?? 0),
        })),
      };
    });
  });
  app.get('/queues/:id/cases', async (req) => {
    const actor = await resolve(req),
      filter = casesQuery.parse(req.query);
    return prisma.$transaction(async (tx) => {
      const queue = await accessibleQueue(tx, actor, queueId(req));
      const through = filter.through ? new Date(+new Date(filter.through) + 86400000) : undefined;
      const where = {
        tasks: { some: { queueId: queue.id } },
        status: filter.status,
        category: filter.category,
        code: filter.search ? { contains: filter.search } : undefined,
        createdAt: { gte: filter.from ? new Date(filter.from) : undefined, lt: through },
      };
      const [total, items] = await Promise.all([
        tx.moderationCase.count({ where }),
        tx.moderationCase.findMany({
          where,
          select: caseFields,
          orderBy:
            filter.sort === 'priority'
              ? [{ priority: 'desc' }, { id: 'asc' }]
              : [{ createdAt: filter.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
          skip: (filter.page - 1) * 25,
          take: 25,
        }),
      ]);
      return { total, items, page: filter.page, totalPages: Math.max(1, Math.ceil(total / 25)) };
    });
  });
  app.get('/queues/:id/cases/:caseId', async (req) => {
    const actor = await resolve(req),
      params = z.object({ id: UUID, caseId: z.string().min(1) }).parse(req.params);
    return prisma.$transaction(async (tx) => {
      const queue = await accessibleQueue(tx, actor, params.id);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.caseId);
      const item = await tx.moderationCase.findFirst({
        where: {
          ...(isUuid ? { id: params.caseId } : { code: params.caseId }),
          tasks: { some: { queueId: queue.id } },
        },
        select: {
          ...caseFields,
          facilityId: true,
          metadata: true,
          tasks: {
            where: { queueId: queue.id },
            select: {
              queueId: true,
              queueVersion: true,
              form: true,
              queue: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  config: true,
                },
              },
            },
          },
          admission: {
            select: {
              facility: {
                select: {
                  id: true,
                  reviewRevision: true,
                  displayName: true,
                  formattedAddress: true,
                  googlePlaceId: true,
                  latitude: true,
                  longitude: true,
                  placeMetadata: true,
                  evidence: true,
                  labels: {
                    orderBy: { reviewedAt: 'desc' },
                    take: 5,
                    select: { reviewedAt: true, decision: true, expiresAt: true },
                  },
                },
              },
            },
          },
          reviews: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              action: true,
              reason: true,
              createdAt: true,
              reviewer: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });
      if (!item) throw new AppError(404, 'CASE_NOT_FOUND', 'Case not found in this queue.');
      const { metadata, ...safe } = item;
      const report = z
        .object({ category: z.string().max(40), notes: z.string().max(500).nullable().optional() })
        .safeParse(metadata);

      let qaSample: { id: string; status: string } | null = null;
      try {
        const sample = await tx.qaSample.findFirst({
          where: { decision: { caseId: item.id } },
          select: { id: true, status: true },
        });
        if (sample) qaSample = { id: sample.id, status: sample.status ?? 'PENDING' };
      } catch {
        // qa sample table may be unpopulated
      }

      return {
        ...safe,
        metadata,
        report: item.trigger === 'REPORT' && report.success ? report.data : null,
        queue: {
          id: queue.id,
          name: queue.name,
          code: queue.code,
        },
        qaSample,
      };
    });
  });

}
