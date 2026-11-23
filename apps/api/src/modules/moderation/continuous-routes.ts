import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { moderatorAuth } from '../../config/auth';
import { AppError, ForbiddenError } from '../../common/errors/app-error';
import { accessibleQueue } from './queue-operations';
import { lockAttendanceEmployee, requireModeratingAux } from './attendance';
import {
  startWorkSession,
  allocateRandomPendingCase,
  heartbeatReservation,
  submitReservation,
  releaseReservation,
  leaveWorkSession,
  calculateQueueAht,
  calculateModeratorMetrics,
  reservationInclude,
  requireContinuousQueue,
} from './continuous-engine';
import { staff } from './routes';
import { safeReport } from './policy/contracts';

async function resolveIdentity(req: FastifyRequest) {
  const result = await moderatorAuth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableCookieCache: true },
  });
  if (!result?.user?.id) {
    await staff(req); // Checks if super admin or other staff before throwing forbidden
    throw new ForbiddenError('Continuous moderation requires a moderator workforce session.');
  }
  return { moderatorId: result.user.id, authSessionId: result.session.id };
}

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });
// Contending allocations must see candidates committed by other workers on each retry.
const allocationTransaction = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
type WorkspaceReservation = Prisma.ModerationCaseReservationGetPayload<{ include: typeof reservationInclude }>;

function reservationView(reservation: WorkspaceReservation | null) {
  if (!reservation) return null;
  const { case: item } = reservation;
  const report = item.trigger === 'REPORT' ? safeReport(item.metadata) : null;
  return {
    ...reservation,
    case: {
      ...item,
      metadata: report ? { report } : null,
      tasks: item.tasks.filter(({ queueId }) => queueId === reservation.queueId),
    },
  };
}

const submitSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT', 'ESCALATE']),
    reason: z.string().trim().min(3).max(500),
    evidenceIds: z.array(uuid).max(12).default([]),
    answers: z.record(z.string().max(60), z.unknown())
      .refine((answers) => Object.keys(answers).length <= 40)
      .default({}),
    policyVersionId: uuid.optional(),
    tagIds: z.array(z.string().max(40)).max(32).optional(),
  })
  .strict();

const releaseSchema = z
  .object({
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export function registerContinuousModeration(app: FastifyInstance) {
  // Start or resume a continuous moderation session in a queue
  const startHandler = async (req: FastifyRequest) => {
    const params = req.params as Record<string, string>;
    const targetQueueId = params.queueId || params.id;
    if (!targetQueueId) throw new AppError(400, 'INVALID_PARAMS', 'Queue ID is required.');
    uuid.parse(targetQueueId);

    const identity = await resolveIdentity(req);

    return prisma.$transaction(async (tx) => {
      const { session, isExisting } = await startWorkSession(tx, identity, targetQueueId);

      // Check if there is an active reservation
      let reservation = await tx.moderationCaseReservation.findFirst({
        where: {
          sessionId: session.id,
          moderatorId: identity.moderatorId,
          status: 'ACTIVE',
          leaseExpiresAt: { gt: new Date() },
        },
        include: reservationInclude,
      });

      // If no active reservation, allocate next random pending case
      if (!reservation) {
        reservation = await allocateRandomPendingCase(
          tx,
          targetQueueId,
          identity.moderatorId,
          session.id,
        );
      }

      return {
        session,
        reservation: reservationView(reservation),
        emptyQueue: !reservation,
        isExisting,
        serverTime: new Date(),
      };
    }, allocationTransaction);
  };

  app.post('/queues/:id/moderate/start', startHandler);
  app.post('/queues/:id/moderate', startHandler);
  app.post('/queues/:id/sessions', startHandler);

  // Reads never allocate a case, including on refresh or reconnect.
  app.get('/queues/:id/moderate/current', async (req) => {
    const { id: queueId } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    await requireContinuousQueue(prisma, identity.moderatorId, queueId);
    const session = await prisma.moderationWorkSession.findFirst({
      where: { queueId, moderatorId: identity.moderatorId, status: 'ACTIVE' },
    });
    const now = new Date();
    const reservation = session ? await prisma.moderationCaseReservation.findFirst({
      where: { sessionId: session.id, status: 'ACTIVE', leaseExpiresAt: { gt: now } },
      include: reservationInclude,
    }) : null;
    if (session && reservation && session.attendanceSessionId !== await requireModeratingAux(prisma, identity, now))
      throw new AppError(409, 'INVALID_SESSION', 'The moderation session is no longer active.');
    const lastReservation = session && !reservation && await prisma.moderationCaseReservation.findFirst({
      where: { sessionId: session.id },
      select: { status: true, leaseExpiresAt: true },
      orderBy: { reservedAt: 'desc' },
    });
    const leaseExpired = lastReservation && (lastReservation.status === 'EXPIRED' ||
      (lastReservation.status === 'ACTIVE' && lastReservation.leaseExpiresAt <= now));
    return {
      session,
      reservation: reservationView(reservation),
      leaseExpired: Boolean(leaseExpired),
      serverTime: new Date(),
    };
  });

  // Get current session details
  app.get('/sessions/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);

    const session = await prisma.moderationWorkSession.findUnique({
      where: { id },
      include: {
        queue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!session || session.moderatorId !== identity.moderatorId) {
      throw new AppError(404, 'NOT_FOUND', 'Moderation session not found.');
    }
    await requireContinuousQueue(prisma, identity.moderatorId, session.queueId);

    const activeReservation = await prisma.moderationCaseReservation.findFirst({
      where: {
        sessionId: id,
        moderatorId: identity.moderatorId,
        status: 'ACTIVE',
        leaseExpiresAt: { gt: new Date() },
      },
      include: reservationInclude,
    });

    return {
      session,
      activeReservation: reservationView(activeReservation),
      serverTime: new Date(),
    };
  });

  // Request next case in active session
  app.post('/sessions/:id/next', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);

    return prisma.$transaction(async (tx) => {
      await lockAttendanceEmployee(tx, identity.moderatorId);
      const session = await tx.moderationWorkSession.findUnique({
        where: { id },
      });

      if (!session || session.moderatorId !== identity.moderatorId || session.status !== 'ACTIVE') {
        throw new AppError(409, 'INVALID_SESSION', 'Session is not active or not found.');
      }
      await requireContinuousQueue(tx, identity.moderatorId, session.queueId);
      const attendanceId = await requireModeratingAux(tx, identity, new Date());
      if (session.attendanceSessionId !== attendanceId)
        throw new AppError(409, 'INVALID_SESSION', 'The moderation session is no longer active.');

      const reservation = await allocateRandomPendingCase(
        tx,
        session.queueId,
        identity.moderatorId,
        session.id,
      );

      return {
        reservation: reservationView(reservation),
        emptyQueue: !reservation,
        serverTime: new Date(),
      };
    }, allocationTransaction);
  });

  // Heartbeat active reservation
  app.post('/reservations/:id/heartbeat', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);

    return prisma.$transaction(async (tx) => {
      return heartbeatReservation(tx, id, identity);
    });
  });

  // Submit decision on reservation
  app.post('/reservations/:id/submit', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const payload = submitSchema.parse(req.body);

    return prisma.$transaction(async (tx) => {
      const result = await submitReservation(tx, id, identity, payload, false);
      return { ...result, nextReservation: reservationView(result.nextReservation) };
    }, allocationTransaction);
  });

  // Submit decision and leave
  app.post('/reservations/:id/submit-and-leave', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const payload = submitSchema.parse(req.body);

    return prisma.$transaction(async (tx) => {
      const result = await submitReservation(tx, id, identity, payload, true);
      return { ...result, nextReservation: reservationView(result.nextReservation) };
    });
  });

  // Submit aliases on work-sessions/:id
  app.post('/work-sessions/:id/submit', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const payload = submitSchema.parse(req.body);

    return prisma.$transaction(async (tx) => {
      const activeRes = await tx.moderationCaseReservation.findFirst({
        where: {
          sessionId: id,
          moderatorId: identity.moderatorId,
          status: 'ACTIVE',
        },
      });
      if (!activeRes) throw new AppError(404, 'NOT_FOUND', 'Active reservation not found for this session.');
      const result = await submitReservation(tx, activeRes.id, identity, payload, false);
      return { ...result, nextReservation: reservationView(result.nextReservation) };
    }, allocationTransaction);
  });

  app.post('/work-sessions/:id/submit-and-leave', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const payload = submitSchema.parse(req.body);

    return prisma.$transaction(async (tx) => {
      const activeRes = await tx.moderationCaseReservation.findFirst({
        where: {
          sessionId: id,
          moderatorId: identity.moderatorId,
          status: 'ACTIVE',
        },
      });
      if (!activeRes) throw new AppError(404, 'NOT_FOUND', 'Active reservation not found for this session.');
      const result = await submitReservation(tx, activeRes.id, identity, payload, true);
      return { ...result, nextReservation: reservationView(result.nextReservation) };
    });
  });

  // Safe release of current reservation
  app.post('/reservations/:id/release', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const { reason } = releaseSchema.parse(req.body ?? {});

    return prisma.$transaction(async (tx) => {
      await lockAttendanceEmployee(tx, identity.moderatorId);
      return releaseReservation(tx, id, identity.moderatorId, reason);
    });
  });

  // Leave active work session
  app.post('/sessions/:id/leave', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);
    const { reason } = releaseSchema.parse(req.body ?? {});

    return prisma.$transaction(async (tx) => {
      await lockAttendanceEmployee(tx, identity.moderatorId);
      return leaveWorkSession(tx, id, identity.moderatorId, reason);
    });
  });

  // Queue AHT in seconds
  app.get('/queues/:id/aht', async (req) => {
    const { id } = idParam.parse(req.params);
    await accessibleQueue(prisma, await staff(req), id);

    const ahtSeconds = await calculateQueueAht(prisma, id);
    return {
      queueId: id,
      ahtSeconds,
    };
  });

  // Session metrics
  app.get('/sessions/:id/metrics', async (req) => {
    const { id } = idParam.parse(req.params);
    const identity = await resolveIdentity(req);

    const session = await prisma.moderationWorkSession.findUnique({
      where: { id },
    });
    if (!session || session.moderatorId !== identity.moderatorId) {
      throw new AppError(404, 'NOT_FOUND', 'Session not found.');
    }
    await requireContinuousQueue(prisma, identity.moderatorId, session.queueId);

    const metrics = await calculateModeratorMetrics(prisma, identity.moderatorId, session.queueId);
    return {
      sessionId: id,
      queueId: session.queueId,
      ...metrics,
    };
  });
}
