import { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { hashPassword } from 'better-auth/crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth, moderatorAuth, superAdminAuth } from '../../config/auth';
import { env } from '../../config/env';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error';
import { audit, increment, route } from './intake';
import { configSchema, queueInput, roles, validateAnswers } from './config';
import { currentEvidence, fingerprintReview } from '../intelligence/intelligence.discovery';
import { publishReview } from '../intelligence/intelligence.review';
import { evidenceSchema } from '../intelligence/intelligence.schemas';
import { evaluateRules } from '../intelligence/intelligence.rules';
import { smokeTestGeminiModel } from '../intelligence/intelligence.gemini';

const fail = (message: string) => new AppError(409, 'MODERATION_CONFLICT', message);
const id = (req: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(req.params).id;

/**
 * Mobile user session resolver (for mobile driver actions like submitting a problem report)
 */
async function userSession(req: FastifyRequest) {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableCookieCache: true },
  });
  if (!result?.user?.id) throw new UnauthorizedError();
  return result.user.id;
}

/**
 * Staff session resolver (strictly for Super Admins and Moderators)
 * Rejects ordinary user sessions with 403 Forbidden.
 */
async function staff(req: FastifyRequest) {
  const headers = fromNodeHeaders(req.headers);

  // 1. Try Super Admin auth session
  const superAdminResult = await superAdminAuth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (superAdminResult?.user?.id) {
    const admin = await prisma.superAdmin.findUnique({
      where: { id: superAdminResult.user.id },
    });
    if (!admin || admin.status !== 'ACTIVE') {
      throw new ForbiddenError('Super administrator account is inactive or not found.');
    }
    return {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: 'SUPER_ADMIN',
      admin: true,
      superAdmin: true,
      queues: [] as string[],
      actorType: 'SUPER_ADMIN' as const,
    };
  }

  // 2. Try Moderator auth session
  const modResult = await moderatorAuth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (modResult?.user?.id) {
    const mod = await prisma.moderator.findUnique({
      where: { id: modResult.user.id },
      include: { memberships: { select: { queueId: true } } },
    });
    if (!mod || mod.status !== 'ACTIVE') {
      throw new ForbiddenError('Moderator account is inactive or deactivated.');
    }
    const admin = ['SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN'].includes(mod.role);
    return {
      userId: mod.id,
      email: mod.email,
      name: mod.name,
      role: mod.role,
      admin,
      superAdmin: false,
      queues: mod.memberships.map((m) => m.queueId),
      actorType: 'MODERATOR' as const,
    };
  }

  // 3. Check if an ordinary user token was passed - reject with 403 Forbidden
  const userResult = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (userResult?.user?.id) {
    throw new ForbiddenError('Ordinary mobile users are not permitted to access moderation services.');
  }

  // 4. No valid session at all -> 401 Unauthorized
  throw new UnauthorizedError();
}

type Actor = Awaited<ReturnType<typeof staff>>;
const queueScope = (a: Actor) => (a.admin ? {} : { queueId: { in: a.queues } });
const scope = (a: Actor) => (a.admin ? {} : { tasks: { some: queueScope(a) } });

function permit(a: Actor, ...allowed: string[]) {
  if (allowed.length === 0) {
    // If no specific roles are required, any active moderation staff / admin is allowed
    return;
  }
  if (!a.admin && !allowed.includes(a.role)) {
    throw new ForbiddenError('Insufficient role permissions for this operation.');
  }
}

const readPage = (req: FastifyRequest) =>
  z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      status: z.string().max(40).optional(),
      queue: z.string().uuid().optional(),
      mine: z.enum(['true', 'false']).optional(),
      category: z.string().max(40).optional(),
      search: z.string().max(100).optional(),
    })
    .strict()
    .parse(req.query);

export async function moderationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    if (req.url.endsWith('/reports')) {
      // User problem reports are mobile app endpoints; allow mobile clients without console Origin checks
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && (!req.headers.authorization || req.headers.origin)) {
      const allowed = new URL(process.env.MODERATION_ORIGIN ?? env.BETTER_AUTH_URL).origin;
      if (req.headers.origin && req.headers.origin !== allowed && req.headers['x-prakaro-console'] !== '1') {
        throw new ForbiddenError();
      }
    }
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error occurred.' },
    });
  });

  // Current Staff Profile / Session
  const getStaffSession = async (req: FastifyRequest) => {
    const a = await staff(req);
    return {
      userId: a.userId,
      role: a.role,
      admin: a.admin,
      superAdmin: a.superAdmin,
      queues: a.queues,
      email: a.email,
      name: a.name,
    };
  };

  app.get('/profile', getStaffSession);
  app.get('/session', getStaffSession);

  // Moderation Queues Management
  app.get('/queues', async (req) => {
    const a = await staff(req);
    return prisma.moderationQueue.findMany({
      where: a.admin ? {} : { id: { in: a.queues }, status: 'ACTIVE' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  });

  app.post('/queues', async (req) => {
    const a = await staff(req);
    // Only Super Admin can create queues
    if (!a.superAdmin && a.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can create moderation queues.');
    }
    const b = queueInput.parse(req.body);
    const seq = await increment(prisma, 'queue-sequence');
    const code = 'QUEUE-' + b.kind + '-' + String(seq).padStart(3, '0');
    return prisma.$transaction(async (tx) => {
      const q = await tx.moderationQueue.create({
        data: { ...b, code, createdBy: a.userId },
      });
      await audit(tx, a.userId, 'QUEUE_CREATED', q.id, b, undefined, a.actorType, a.userId);
      return q;
    });
  });

  app.get('/queues/:id', async (req) => {
    const a = await staff(req);
    const q = await prisma.moderationQueue.findUniqueOrThrow({ where: { id: id(req) } });
    if (!a.admin && !a.queues.includes(q.id)) throw new ForbiddenError();
    return q;
  });

  const updateQueueHandler = async (req: FastifyRequest) => {
    const a = await staff(req);
    // Only Super Admin can modify queue settings and routing rules
    if (!a.superAdmin && a.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can modify queue configurations and routing rules.');
    }
    const b = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        kind: z.string().optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
        priority: z.number().int().min(0).max(100).optional(),
        capacity: z.number().int().min(1).max(10000).optional(),
        version: z.number().int().optional(),
        config: configSchema.optional(),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(async (tx) => {
      const before = await tx.moderationQueue.findUniqueOrThrow({ where: { id: id(req) } });
      const q = await tx.moderationQueue.update({
        where: { id: id(req) },
        data: {
          ...b,
          ...(b.config ? { version: { increment: 1 } } : {}),
        },
      });
      await audit(tx, a.userId, 'QUEUE_UPDATED', q.id, b, before, a.actorType, a.userId);
      return q;
    });
  };

  app.put('/queues/:id', updateQueueHandler);
  app.patch('/queues/:id', updateQueueHandler);

  // Moderators Management
  app.get('/moderators', async (req) => {
    const a = await staff(req);
    permit(a, 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN', 'MODERATION_MANAGER', 'SUPERVISOR');
    const list = await prisma.moderator.findMany({
      include: {
        memberships: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return list.map((m) => ({
      ...m,
      userId: m.id,
      user: { id: m.id, name: m.name, email: m.email, createdAt: m.createdAt },
    }));
  });

  app.post('/moderators', async (req) => {
    const a = await staff(req);
    permit(a, 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    const b = z
      .object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email(),
        password: z.string().min(8).max(100).optional(),
        role: roles,
        active: z.boolean().default(true),
        queues: z.array(z.string().uuid()).max(50).default([]),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(async (tx) => {
      const prior = await tx.moderator.findUnique({ where: { email: b.email } });

      // Super Admin check: ONLY a SUPER_ADMIN can assign SUPER_ADMIN or MODERATION_ADMIN
      if (
        (prior && prior.id === a.userId) ||
        (!a.superAdmin &&
          [b.role, prior?.role].some(
            (r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'MODERATION_ADMIN',
          ))
      ) {
        throw new ForbiddenError('Insufficient permissions to assign administrative roles or modify own role.');
      }

      const status = b.active ? 'ACTIVE' : 'DEACTIVATED';
      const mappedRole = b.role === 'ADMIN' ? 'MODERATION_ADMIN' : b.role;

      let modId = prior?.id;
      if (prior) {
        await tx.moderator.update({
          where: { id: prior.id },
          data: {
            name: b.name ?? prior.name,
            role: mappedRole,
            status,
            deactivatedAt: b.active ? null : new Date(),
          },
        });
      } else {
        const created = await tx.moderator.create({
          data: {
            name: b.name ?? (b.email.split('@')[0] || 'Moderator'),
            email: b.email,
            role: mappedRole,
            status,
            invitedBy: a.userId,
            emailVerified: true,
          },
        });
        modId = created.id;
      }

      if (b.password && modId) {
        const hashedPassword = await hashPassword(b.password);
        const existingAcc = await tx.moderatorAccount.findFirst({
          where: { userId: modId, providerId: 'credential' },
        });
        if (existingAcc) {
          await tx.moderatorAccount.update({
            where: { id: existingAcc.id },
            data: { password: hashedPassword },
          });
        } else {
          await tx.moderatorAccount.create({
            data: {
              userId: modId,
              accountId: modId,
              providerId: 'credential',
              password: hashedPassword,
            },
          });
        }
      }

      if (modId) {
        await tx.moderationMembership.deleteMany({ where: { moderatorId: modId } });
        if (b.queues.length > 0) {
          await tx.moderationMembership.createMany({
            data: [...new Set(b.queues)].map((queueId) => ({ moderatorId: modId!, queueId })),
          });
        }
      }

      await audit(
        tx,
        a.userId,
        prior ? 'STAFF_UPDATED' : 'STAFF_CREATED',
        modId!,
        { role: mappedRole, active: b.active, queues: b.queues },
        prior ? { role: prior.role, status: prior.status } : undefined,
        a.actorType,
        a.userId,
      );

      return { ok: true, id: modId };
    });
  });

  // Super Admins Management (Strictly restricted to SUPER_ADMIN)
  app.get('/super-admins', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError('Only platform Super Admins can list Super Admins.');
    return prisma.superAdmin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  app.post('/super-admins', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError('Only platform Super Admins can provision Super Admins.');
    const b = z
      .object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(100),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.superAdmin.findUnique({ where: { email: b.email } });
      if (existing) throw new AppError(409, 'CONFLICT', 'Super admin with this email already exists.');

      const hashedPassword = await hashPassword(b.password);
      const created = await tx.superAdmin.create({
        data: {
          name: b.name,
          email: b.email,
          status: 'ACTIVE',
          emailVerified: true,
          createdBySuperAdminId: a.userId,
        },
      });

      await tx.superAdminAccount.create({
        data: {
          userId: created.id,
          accountId: created.id,
          providerId: 'credential',
          password: hashedPassword,
        },
      });

      await audit(tx, a.userId, 'SUPER_ADMIN_PROVISIONED', created.id, { email: b.email }, undefined, 'SUPER_ADMIN', a.userId);
      return { ok: true, id: created.id };
    });
  });

  // Analytics & Metrics
  const getAnalyticsHandler = async (req: FastifyRequest) => {
    const a = await staff(req);
    permit(a);
    const [totalCases, queued, inReview, pendingQa, approved, rejected] = await Promise.all([
      prisma.moderationCase.count({ where: scope(a) }),
      prisma.moderationCase.count({ where: { status: 'QUEUED', ...scope(a) } }),
      prisma.moderationCase.count({ where: { status: 'IN_REVIEW', ...scope(a) } }),
      prisma.moderationCase.count({ where: { status: 'PENDING_QA', ...scope(a) } }),
      prisma.moderationCase.count({ where: { status: 'APPROVED', ...scope(a) } }),
      prisma.moderationCase.count({ where: { status: 'REJECTED', ...scope(a) } }),
    ]);

    return {
      totalCases,
      statusBreakdown: { queued, inReview, pendingQa, approved, rejected },
      activeLeases: inReview,
    };
  };

  app.get('/analytics', getAnalyticsHandler);
  app.get('/analytics/overview', getAnalyticsHandler);

  // System Audit Trail
  app.get('/audit-log', async (req) => {
    const a = await staff(req);
    permit(a);
    return prisma.moderationAudit.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  });

  // Cases List
  app.get('/cases', async (req) => {
    const a = await staff(req);
    const p = readPage(req);
    if (p.queue && !a.admin && !a.queues.includes(p.queue)) throw new ForbiddenError();

    const where: Prisma.ModerationCaseWhereInput = {
      ...scope(a),
      ...(p.queue ? { tasks: { some: { queueId: p.queue } } } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.category ? { category: p.category } : {}),
      ...(p.mine === 'true' ? { owner: a.userId } : {}),
      ...(p.search
        ? {
            OR: [
              { code: { contains: p.search } },
              { facilityId: { contains: p.search } },
            ],
          }
        : {}),
    };

    const total = await prisma.moderationCase.count({ where });
    const items = await prisma.moderationCase.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      skip: (p.page - 1) * 20,
      take: 20,
      include: {
        tasks: {
          include: { queue: { select: { id: true, name: true, kind: true, code: true } } },
        },
        admission: true,
      },
    });

    return {
      page: p.page,
      total,
      totalPages: Math.ceil(total / 20) || 1,
      items,
    };
  });

  // Case Details
  app.get('/cases/:id', async (req) => {
    const a = await staff(req);
    const c = await prisma.moderationCase.findFirstOrThrow({
      where: { id: id(req), ...scope(a) },
      include: {
        tasks: { include: { queue: true } },
        admission: {
          include: {
            facility: true,
          },
        },
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    });

    const [evidence, runs, labels] = await Promise.all([
      prisma.parkingEvidenceReference.findMany({
        where: { caseId: c.facilityId, ...currentEvidence(new Date()).where },
        orderBy: { id: 'asc' },
      }),
      prisma.parkingVerificationRun.findMany({
        where: { caseId: c.facilityId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { version: true },
      }),
      prisma.parkingHumanLabel.findMany({
        where: { caseId: c.facilityId },
        orderBy: { reviewedAt: 'desc' },
        take: 5,
      }),
    ]);

    const googlePlaceId = c.admission?.facility?.googlePlaceId ?? c.facilityId;
    const displayName = c.admission?.facility?.displayName ?? 'Parking Facility';
    const formattedAddress = c.admission?.facility?.formattedAddress ?? 'Address unavailable';
    const latitude = c.admission?.facility?.latitude ?? null;
    const longitude = c.admission?.facility?.longitude ?? null;
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&query_place_id=${googlePlaceId}`;

    let userReport: { category: string; notes?: string | null; reportedAt?: Date; reporterId?: string } | null = null;
    if (c.trigger === 'REPORT' || c.category === 'USER_REPORT_REVIEW') {
      const meta = (c.metadata as any) || {};
      const reportAudit = await prisma.moderationAudit.findFirst({
        where: { target: c.id, action: 'REPORT_RECEIVED' },
        orderBy: { createdAt: 'desc' },
      });
      userReport = {
        category: meta.category ?? (reportAudit?.after as any)?.category ?? 'GENERAL_INACCURACY',
        notes: meta.notes ?? (reportAudit?.after as any)?.notes ?? null,
        reportedAt: reportAudit?.createdAt ?? c.createdAt,
        reporterId: reportAudit?.actorId ?? 'Mobile App User',
      };
    }

    const facilityDetails = {
      displayName,
      formattedAddress,
      latitude,
      longitude,
      googlePlaceId,
      googleMapsUrl,
      placeMetadata: c.admission?.facility?.placeMetadata ?? null,
      userReport,
    };

    return {
      ...c,
      evidence,
      runs,
      historicalLabels: labels,
      facilityDetails,
      userReport,
    };
  });

  // Claim Case (Atomic Lease)
  app.post('/cases/:id/claim', async (req) => {
    const a = await staff(req);
    permit(a, 'MODERATOR', 'SUPERVISOR', 'MODERATION_MANAGER', 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const result = await tx.moderationCase.updateMany({
        where: {
          id: id(req),
          tasks: { some: { ...queueScope(a), queue: { status: 'ACTIVE' } } },
          status: { in: ['QUEUED', 'IN_REVIEW', 'AWAITING_EVIDENCE', 'REOPENED'] },
          OR: [{ owner: null }, { leaseUntil: { lt: now } }, { owner: a.userId }],
        },
        data: {
          owner: a.userId,
          status: 'IN_REVIEW',
          leaseUntil: new Date(+now + 1800000), // 30 min lease
          revision: { increment: 1 },
        },
      });
      if (!result.count) throw fail('Case is unavailable for claiming.');
      await audit(tx, a.userId, 'CASE_CLAIMED', id(req), undefined, undefined, a.actorType, a.userId);
      return { ok: true };
    });
  });

  // Release Case
  app.post('/cases/:id/release', async (req) => {
    const a = await staff(req);
    permit(a, 'MODERATOR', 'SUPERVISOR', 'MODERATION_MANAGER', 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    return prisma.$transaction(async (tx) => {
      const result = await tx.moderationCase.updateMany({
        where: { id: id(req), owner: a.userId, status: 'IN_REVIEW' },
        data: { owner: null, leaseUntil: null, status: 'QUEUED', revision: { increment: 1 } },
      });
      if (!result.count) throw fail('Case is not currently claimed by you.');
      await audit(tx, a.userId, 'CASE_RELEASED', id(req), undefined, undefined, a.actorType, a.userId);
      return { ok: true };
    });
  });

  // Record Independent Evidence
  app.post('/cases/:id/evidence', async (req) => {
    const a = await staff(req);
    permit(a, 'MODERATOR', 'SUPERVISOR', 'MODERATION_MANAGER', 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    const b = evidenceSchema
      .omit({ id: true })
      .extend({
        reference: z.string().min(3).max(500),
        expiresAt: z.string().datetime(),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(
      async (tx) => {
        const c = await tx.moderationCase.findFirstOrThrow({
          where: { id: id(req), ...scope(a), owner: a.userId, status: 'IN_REVIEW', leaseUntil: { gt: new Date() } },
        });
        if (
          new Date(b.expiresAt) <= new Date() ||
          (await tx.parkingEvidenceReference.count({
            where: { caseId: c.facilityId, ...currentEvidence(new Date()).where },
          })) >= 12
        ) {
          throw fail('Evidence expired or the active evidence limit was reached.');
        }
        const row = await tx.parkingEvidenceReference.create({
          data: { ...b, caseId: c.facilityId, approvedAt: new Date() },
        });
        await audit(tx, a.userId, 'EVIDENCE_RECORDED', c.id, { evidenceId: row.id }, undefined, a.actorType, a.userId);
        return row;
      },
      { isolationLevel: 'Serializable' },
    );
  });

  // Submit Human Review Decision
  app.post('/cases/:id/reviews', async (req) => {
    const a = await staff(req);
    permit(a, 'MODERATOR', 'SUPERVISOR', 'MODERATION_MANAGER', 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    const b = z
      .object({
        taskId: z.string().uuid(),
        revision: z.number().int(),
        action: z.enum(['APPROVE', 'REJECT', 'REQUEST_MORE_EVIDENCE', 'ESCALATE', 'SAVE_DRAFT']),
        answers: z.record(z.union([z.string().max(1000), z.number(), z.array(z.string()).max(24)])),
        evidenceIds: z.array(z.string().uuid()).max(12),
        reason: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(
      async (tx) => {
        const c = await tx.moderationCase.findFirstOrThrow({
          where: { id: id(req), ...scope(a), revision: b.revision, owner: a.userId, status: 'IN_REVIEW', leaseUntil: { gt: new Date() } },
        });
        const task = await tx.moderationTask.findFirstOrThrow({
          where: { id: b.taskId, caseId: c.id, ...queueScope(a), queue: { status: 'ACTIVE' } },
        });
        const records = await tx.parkingEvidenceReference.findMany({
          where: { caseId: c.facilityId, ...currentEvidence(new Date()).where },
          orderBy: { id: 'asc' },
        });
        const cited = records.filter((r) => b.evidenceIds.includes(r.id));
        if (cited.length !== b.evidenceIds.length) throw fail('Select active evidence from this case.');

        if (b.action !== 'SAVE_DRAFT' && !validateAnswers(configSchema.parse(task.form).form, b.answers, b.evidenceIds)) {
          throw fail('Review answers are incomplete or invalid.');
        }

        const rule = evaluateRules(
          cited.map((r, i) =>
            evidenceSchema.parse({
              ...{ source: r.source, finding: r.finding },
              id: 'E' + (i + 1),
            }),
          ),
        );

        if (
          (b.action === 'APPROVE' && rule.classification !== 'LIKELY_PARKING') ||
          (b.action === 'REJECT' && rule.classification !== 'LIKELY_NOT_PARKING')
        ) {
          throw fail('Independent evidence does not support the decision.');
        }

        await tx.moderationSubmission.create({
          data: {
            taskId: task.id,
            action: b.action,
            reason: b.reason,
            evidenceIds: b.evidenceIds,
            answers: b.answers,
            caseId: c.id,
            reviewerId: a.userId,
            queueVersion: task.queueVersion,
            fingerprint: fingerprintReview(records),
          },
        });

        const status =
          b.action === 'ESCALATE'
            ? 'ESCALATED'
            : b.action === 'REQUEST_MORE_EVIDENCE'
              ? 'AWAITING_EVIDENCE'
              : b.action === 'SAVE_DRAFT'
                ? 'IN_REVIEW'
                : 'PENDING_QA';

        await tx.moderationCase.update({
          where: { id: c.id, revision: b.revision },
          data: {
            status,
            revision: { increment: 1 },
            ...(b.action === 'SAVE_DRAFT' ? {} : { owner: null, leaseUntil: null }),
          },
        });
        await audit(tx, a.userId, b.action, c.id, { status, reason: b.reason }, { status: c.status }, a.actorType, a.userId);
        return { status };
      },
      { isolationLevel: 'Serializable' },
    );
  });

  // QA Gate: Publish or Reopen
  app.post('/cases/:id/qa', async (req) => {
    const a = await staff(req);
    permit(a, 'QA_REVIEWER', 'SUPERVISOR', 'SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN');
    const b = z
      .object({
        action: z.enum(['PUBLISH', 'REOPEN']),
        revision: z.number().int(),
        reason: z.string().min(1).max(500),
      })
      .strict()
      .parse(req.body);

    return prisma.$transaction(
      async (tx) => {
        const c = await tx.moderationCase.findFirstOrThrow({
          where: { id: id(req), ...scope(a), revision: b.revision },
          include: {
            reviews: { take: 1, orderBy: { createdAt: 'desc' } },
            admission: { include: { facility: true } },
          },
        });
        const review = c.reviews[0];
        if (!review || review.reviewerId === a.userId) {
          throw fail('Independent second reviewer required.');
        }
        let status = 'REOPENED';
        const activeKey = c.facilityId + ':' + c.category;

        if (b.action === 'PUBLISH') {
          if (c.status !== 'PENDING_QA' || !['APPROVE', 'REJECT'].includes(review.action)) {
            throw fail('Case is not awaiting publication.');
          }
          const evidence = await tx.parkingEvidenceReference.findMany({
            where: { caseId: c.facilityId, ...currentEvidence(new Date()).where },
            orderBy: { id: 'asc' },
          });
          if (fingerprintReview(evidence) !== review.fingerprint) {
            throw fail('Evidence changed. Reopen for review.');
          }
          status = review.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
          await publishReview(tx, a.userId, c.facilityId, {
            expectedRevision: c.admission.facility.reviewRevision,
            decision: status === 'APPROVED' ? 'CONFIRM_PARKING' : 'CONFIRM_NON_PARKING',
            evidenceIds: review.evidenceIds as string[],
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            reason: b.reason,
          });
        } else {
          if (!['PENDING_QA', 'ESCALATED', 'APPROVED', 'REJECTED'].includes(c.status)) {
            throw fail('Case cannot be reopened.');
          }
          if (['APPROVED', 'REJECTED'].includes(c.status)) {
            await publishReview(tx, a.userId, c.facilityId, {
              expectedRevision: c.admission.facility.reviewRevision,
              decision: 'NEEDS_EVIDENCE',
              evidenceIds: [],
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
              reason: b.reason,
            });
          }
        }

        await tx.moderationCase.update({
          where: { id: c.id, revision: b.revision },
          data: {
            status,
            activeKey: status === 'REOPENED' ? activeKey : null,
            owner: null,
            leaseUntil: null,
            revision: { increment: 1 },
          },
        });
        await audit(tx, a.userId, b.action, c.id, { status, reason: b.reason }, { status: c.status }, a.actorType, a.userId);
        return { status };
      },
      { isolationLevel: 'Serializable' },
    );
  });

  // AI Status & Discovery
  app.get('/ai/providers', async (req) => {
    const a = await staff(req);
    permit(a);
    const day = new Date().toISOString().slice(0, 10);
    const budget = await prisma.parkingAiDailyBudget.findUnique({ where: { utcDay: day } });
    const priority = env.AI_PROVIDER_PRIORITY.includes('gemini')
      ? env.AI_PROVIDER_PRIORITY
      : env.AI_PROVIDER_PRIORITY.replace('google', 'gemini');
    return {
      priority,
      geminiModel: env.GOOGLE_GEMINI_MODEL || env.GEMINI_MODEL,
      openRouterModel: env.OPENROUTER_MODEL,
      fallbackEnabled: env.AI_ENABLE_PROVIDER_FALLBACK,
      allowPaidModels: env.AI_ALLOW_PAID_MODELS,
      callsToday: budget?.calls ?? 0,
      dailyLimit: env.AI_MAX_CALLS_PER_DAY,
    };
  });

  app.post('/ai/test', async (req) => {
    const a = await staff(req);
    permit(a);
    const key = env.GOOGLE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    const model = env.GOOGLE_GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (!key) return { ok: false, message: 'Google Gemini API key is not configured.' };
    return smokeTestGeminiModel(key, model);
  });

  // Intake Policies & Budget
  app.get('/intake-policies', async (req) => {
    const a = await staff(req);
    permit(a);
    const day = new Date().toISOString().slice(0, 10);
    const counter = await prisma.moderationCounter.findUnique({ where: { key: 'cases:' + day } });
    return {
      intakeEnabled: env.MODERATION_INTAKE_ENABLED,
      dailyLimit: env.MODERATION_DAILY_CASE_LIMIT,
      casesAdmittedToday: counter?.count ?? 0,
      origin: env.MODERATION_ORIGIN,
    };
  });

  // User Reports Endpoint (Report Incorrect Information)
  app.post('/reports', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const userId = await userSession(req);
    const b = z
      .object({
        placeId: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/),
        category: z.enum(['NOT_PARKING', 'PRIVATE', 'WRONG_LOCATION', 'PRICE', 'HOURS', 'CLOSED', 'OTHER']),
        notes: z.string().max(500).optional(),
      })
      .strict()
      .parse(req.body);

    await prisma.$transaction(
      async (tx) => {
        let f = await tx.parkingIntelligenceCase.findUnique({
          where: { googlePlaceId: b.placeId },
          include: { admission: true },
        });

        if (!f) {
          f = await tx.parkingIntelligenceCase.create({
            data: {
              googlePlaceId: b.placeId,
              displayName: `Reported Facility (${b.placeId.slice(0, 10)})`,
              admission: {
                create: {
                  firstEvent: 'user-report-intake',
                  demand: 1,
                },
              },
            },
            include: { admission: true },
          });
        } else if (!f.admission) {
          await tx.searchAdmission.create({
            data: {
              facilityId: f.id,
              firstEvent: 'user-report-intake',
              demand: 1,
            },
          });
        }

        const reportMeta = {
          category: b.category,
          notes: b.notes ?? null,
          reportedBy: userId,
          reportedAt: new Date().toISOString(),
          googlePlaceId: b.placeId,
        };

        const c = await route(
          tx,
          f.id,
          'USER_REPORT_REVIEW',
          'REPORT',
          { category: b.category, source: 'REPORT' },
          'user-report',
          reportMeta,
        );
        if (!c) throw fail('Report queue is unavailable.');
        await audit(
          tx,
          userId,
          'REPORT_RECEIVED',
          c.id,
          { category: b.category, notes: b.notes ?? null, placeId: b.placeId },
          undefined,
          'USER',
          userId,
        );
      },
      { isolationLevel: 'Serializable' },
    );
    return { ok: true };
  });
}
