import {
  accessibleQueue,
  canConfigure,
  queueSnapshot,
  queueStatus,
  queueVisibility,
  registerQueueOperations,
  releaseLegacyLeases,
  replaceGrants,
  serializable,
} from './queue-operations';
import { registerContinuousModeration } from './continuous-routes';
import { registerAnalytics } from './analytics';
import { registerQa } from './qa/routes';
import { registerPolicies } from './policy/routes';
import { registerExecutiveOperations } from './operations/routes';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { hashPassword } from 'better-auth/crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth, isAllowedConsoleOrigin, moderatorAuth, superAdminAuth } from '../../config/auth';
import { env } from '../../config/env';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error';
import { replyToPoolTimeout } from '../../common/errors/database-unavailable';
import { audit, increment, route } from './intake';
import { queueInput, roles } from './config';
import { smokeTestGeminiModel } from '../intelligence/intelligence.gemini';
import { currentEvidence } from '../intelligence/intelligence.discovery';

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
export async function staff(req: FastifyRequest) {
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
      organizationId: null,
      lobId: null,
      organization: null,
      lob: null,
      queueDelegated: false,
      requiresTeam: false,
      hasTeam: false,
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
      include: { organization: true, lob: true },
    });
    if (
      !mod ||
      mod.status !== 'ACTIVE' ||
      !mod.organization?.active ||
      !mod.lob?.active ||
      mod.lob.organizationId !== mod.organizationId
    ) {
      throw new ForbiddenError('Moderator account is inactive or deactivated.');
    }
    const queueDelegated =
      ['ADMIN', 'MODERATION_ADMIN'].includes(mod.role) && mod.organization.queueDelegated;
    const requiresTeam = [
      'MANAGER',
      'MODERATION_MANAGER',
      'SUPERVISOR',
      'MOD_SUPERVISOR',
      'QA_SUPERVISOR',
    ].includes(mod.role);
    const hasTeam =
      requiresTeam &&
      Boolean(
        await prisma.workforceTeamLink.findFirst({
          where: {
            moderatorId: mod.id,
            kind: { in: ['MANAGER', 'SUPERVISOR'] },
            team: { active: true, organizationId: mod.organizationId! },
          },
          select: { teamId: true },
        }),
      );
    const base = {
      superAdmin: false,
      organizationId: mod.organizationId,
      lobId: mod.lobId,
      queueDelegated,
      requiresTeam,
      hasTeam,
    };
    const allowedQueues = await prisma.moderationQueue.findMany({
      where: queueVisibility(base),
      select: { id: true },
    });
    return {
      userId: mod.id,
      email: mod.email,
      name: mod.name,
      role: mod.role,
      admin: ['ADMIN', 'MODERATION_ADMIN'].includes(mod.role),
      superAdmin: false,
      queues: allowedQueues.map((queue) => queue.id),
      requiresTeam,
      hasTeam,
      organizationId: mod.organizationId,
      lobId: mod.lobId,
      organization: mod.organization.name,
      lob: mod.lob.name,
      queueDelegated,
      actorType: 'MODERATOR' as const,
    };
  }

  // 3. Check if an ordinary user token was passed - reject with 403 Forbidden
  const userResult = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (userResult?.user?.id) {
    throw new ForbiddenError(
      'Ordinary mobile users are not permitted to access moderation services.',
    );
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
    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD' &&
      (!req.headers.authorization || req.headers.origin)
    ) {

      if (
        req.headers.origin
          ? !isAllowedConsoleOrigin(req.headers.origin) || req.headers['x-prakaro-console'] !== '1'
          : !req.headers.authorization?.startsWith('Bearer ')
      ) {
        throw new ForbiddenError();
      }
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (replyToPoolTimeout(error, req, reply)) return reply;
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
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2003', 'P2034'].includes(error.code))
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message:
              'The record changed or conflicts with an existing assignment. Reload and retry.',
          },
        });
      if (error.code === 'P2025')
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' &&
      error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: 'code' in error && typeof error.code === 'string' ? error.code : 'INVALID_REQUEST',
          message: 'The request could not be processed.',
        }
      });
    }
    req.log.error({ event: 'http.failure', route: req.routeOptions.url, errorName: error instanceof Error ? error.name : 'Unknown' },
      'Moderation request failed');
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
      organization: a.organization,
      lob: a.lob,
      organizationId: a.organizationId,
      queueDelegated: a.queueDelegated,
    };
  };

  app.get('/profile', getStaffSession);
  app.get('/session', getStaffSession);

  registerQueueOperations(app, staff);
  registerContinuousModeration(app);
  registerQa(app, staff);
  registerPolicies(app, staff);
  registerExecutiveOperations(app, staff);
  app.get('/queues', async (req) => {
    const actor = await staff(req);
    return prisma.moderationQueue.findMany({
      where: queueVisibility(actor),
      include: { organization: { select: { name: true } } },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      take: 100,
    });
  });
  app.post('/queues', async (req) => {
    const actor = await staff(req);
    if (!actor.superAdmin && !actor.queueDelegated) throw new ForbiddenError();
    const input = queueInput
      .extend({
        organizationId: z.string().uuid().optional(),
        code: z
          .string()
          .regex(/^[A-Z0-9_-]{2,40}$/)
          .optional(),
        status: queueStatus.default('ACTIVE'),
        intakeEnabled: z.boolean().default(false),
        lobIds: z.array(z.string().uuid()).max(100).default([]),
      })
      .parse(req.body);
    const { organizationId: requested, code: customCode, lobIds, ...data } = input;
    const organizationId = requested ?? actor.organizationId;
    if (!organizationId || !canConfigure(actor, organizationId))
      throw new ForbiddenError('Choose an organization you administer.');
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (!(await tx.organization.findFirst({ where: { id: organizationId, active: true } })))
            throw fail('Choose an active organization.');
          const code =
            customCode ??
            'QUEUE-' +
            data.kind +
            '-' +
            String(await increment(tx, 'queue-sequence')).padStart(3, '0');
          const queue = await tx.moderationQueue.create({
            data: { ...data, organizationId, code, createdBy: actor.userId },
          });
          if (lobIds.length) await replaceGrants(tx, actor, queue, lobIds);
          await queueSnapshot(tx, actor, queue);
          await audit(
            tx,
            actor.userId,
            'QUEUE_CREATED',
            queue.id,
            { organizationId, code },
            undefined,
            actor.actorType,
            actor.userId,
          );
          return queue;
        }, serializable);
      } catch (error) {
        if (
          attempt >= 2 ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        )
          throw error;
      }
    }
  });
  app.get('/queues/:id', async (req) => accessibleQueue(prisma, await staff(req), id(req)));
  const updateQueueHandler = async (req: FastifyRequest) => {
    const actor = await staff(req);
    const { version, organizationId, lobIds, ...changes } = queueInput
      .partial()
      .extend({
        version: z.number().int().positive(),
        organizationId: z.string().uuid().optional(),
        status: queueStatus.optional(),
        intakeEnabled: z.boolean().optional(),
        lobIds: z.array(z.string().uuid()).max(100).optional(),
      })
      .parse(req.body);
    return prisma.$transaction(async (tx) => {
      const before = await tx.moderationQueue.findUniqueOrThrow({ where: { id: id(req) } });
      if (!canConfigure(actor, before.organizationId)) throw new ForbiddenError();
      if (before.version !== version) throw fail('Reload the latest queue version before saving.');
      if (organizationId && organizationId !== before.organizationId) {
        if (before.organizationId || !actor.superAdmin)
          throw new ForbiddenError('Only unowned legacy queues can be assigned.');
        if (!(await tx.organization.findFirst({ where: { id: organizationId, active: true } })))
          throw fail('Choose an active organization.');
        if (
          await tx.moderationTask.findFirst({
            where: {
              queueId: before.id,
              case: {
                tasks: {
                  some: {
                    queue: {
                      organizationId: { not: organizationId },
                      AND: { organizationId: { not: null } },
                    },
                  },
                },
              },
            },
          })
        ) {
          throw fail('A historical case is already assigned to another organization.');
        }
      }
      const updated = await tx.moderationQueue.update({
        where: { id: before.id, version },
        data: { ...changes, organizationId, version: { increment: 1 } },
      });
      if (changes.status && changes.status !== 'ACTIVE')
        await releaseLegacyLeases(tx, actor, updated.id);
      if (lobIds) await replaceGrants(tx, actor, updated, lobIds);
      await queueSnapshot(tx, actor, updated);
      await audit(
        tx,
        actor.userId,
        'QUEUE_UPDATED',
        updated.id,
        { ...changes, version: updated.version },
        { version: before.version },
        actor.actorType,
        actor.userId,
      );
      return updated;
    }, serializable);
  };
  app.put('/queues/:id', updateQueueHandler);
  app.patch('/queues/:id', updateQueueHandler);

  // Moderators Management
  app.get('/moderators', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError();
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
    if (!a.superAdmin) throw new ForbiddenError();
    const b = z
      .object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email(),
        password: z.string().min(8).max(100).optional(),
        role: roles,
        active: z.boolean().default(true),
        queues: z.array(z.never()).length(0).default([]),
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
        throw new ForbiddenError(
          'Insufficient permissions to assign administrative roles or modify own role.',
        );
      }

      if (b.role === 'SUPER_ADMIN') throw new ForbiddenError();
      const status = b.active
        ? prior?.organizationId && prior.lobId
          ? prior.status
          : 'PENDING_ASSIGNMENT'
        : 'DEACTIVATED';
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
    if (!a.superAdmin)
      throw new ForbiddenError('Only platform Super Admins can list Super Admins.');
    return prisma.superAdmin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  app.post('/super-admins', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin)
      throw new ForbiddenError('Only platform Super Admins can provision Super Admins.');
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
      if (existing)
        throw new AppError(409, 'CONFLICT', 'Super admin with this email already exists.');

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

      await audit(
        tx,
        a.userId,
        'SUPER_ADMIN_PROVISIONED',
        created.id,
        { email: b.email },
        undefined,
        'SUPER_ADMIN',
        a.userId,
      );
      return { ok: true, id: created.id };
    });
  });

  // Analytics & Metrics
  const getAnalyticsHandler = async (req: FastifyRequest) => {
    const a = await staff(req);
    permit(a, 'ADMIN', 'MODERATION_ADMIN');
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
  registerAnalytics(app, staff);

  // System Audit Trail
  app.get('/audit-log', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError();
    return prisma.moderationAudit.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  });

  // Cases List
  app.get('/cases', async (req) => {
    const a = await staff(req);
    const p = readPage(req);
    if (!p.queue) {
      const operational = ['PENDING_QA', 'ESCALATED'].includes(p.status ?? '');
      if (!operational) throw new ForbiddenError('Open cases from a queue.');
      permit(
        a,
        'QA_REVIEWER',
        'QA_SUPERVISOR',
        'SUPERVISOR',
        'MOD_SUPERVISOR',
        'MANAGER',
        'MODERATION_MANAGER',
      );
    }

    if (p.queue && !a.admin && !a.queues.includes(p.queue)) throw new ForbiddenError();

    const where: Prisma.ModerationCaseWhereInput = {
      ...scope(a),
      ...(p.queue ? { tasks: { some: { queueId: p.queue } } } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.category ? { category: p.category } : {}),
      ...(p.mine === 'true' ? { owner: a.userId } : {}),
      ...(p.search
        ? {
          OR: [{ code: { contains: p.search } }, { facilityId: { contains: p.search } }],
        }
        : {}),
    };

    const total = await prisma.moderationCase.count({ where });
    const items = await prisma.moderationCase.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      skip: (p.page - 1) * 20,
      take: 20,
      select: {
        id: true,
        code: true,
        facilityId: true,
        category: true,
        status: true,
        trigger: true,
        priority: true,
        owner: true,
        leaseUntil: true,
        createdAt: true,
        revision: true,
        tasks: {
          where: queueScope(a),
          select: {
            id: true,
            queueId: true,
            deadline: true,
            queue: { select: { id: true, name: true, kind: true, code: true } },
          },
        },
      },
    });

    return {
      page: p.page,
      total,
      totalPages: Math.ceil(total / 20) || 1,
      items,
    };
  });

  // Case Details (supports UUID or human-readable case code like CASE-2026-000001)
  app.get('/cases/:id', async (req) => {
    const a = await staff(req);
    const paramId = (req.params as { id: string }).id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramId);
    const c = await prisma.moderationCase.findFirstOrThrow({
      where: {
        ...(isUuid ? { id: paramId } : { code: paramId }),
        ...scope(a),
      },
      include: {
        tasks: {
          include: {
            queue: true,
          },
        },
        admission: {
          include: {
            facility: {
              include: {
                evidence: true,
                runs: {
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                  include: { version: true },
                },
                labels: {
                  orderBy: { reviewedAt: 'desc' },
                  take: 5,
                },
              },
            },
          },
        },
        reviews: { orderBy: { createdAt: 'desc' } },
        reservations: {
          where: { status: 'ACTIVE', leaseExpiresAt: { gt: new Date() } },
          take: 1,
        },
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

    const facilityDetails = (c as any).admission?.facility ?? (c.metadata as any)?.facilityDetails ?? null;
    const userReport = (c.metadata as any)?.report ?? (c.metadata as any)?.userReport ?? null;

    return {
      ...c,
      evidence,
      runs,
      labels,
      facilityDetails,
      userReport,
    };
  });

  // Reject the historical mutation entry points explicitly while Phase 2 is read-only.
  for (const operation of ['claim', 'release', 'evidence', 'reviews', 'qa']) {
    app.post('/cases/:id/' + operation, async (req) => {
      await staff(req);
      throw new ForbiddenError('Operational moderation requires persisted AUX and reservations.');
    });
  }

  // AI Status & Discovery
  app.get('/ai/providers', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError();
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
    if (!a.superAdmin) throw new ForbiddenError();
    const key = env.GOOGLE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    const model = env.GOOGLE_GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (!key) return { ok: false, message: 'Google Gemini API key is not configured.' };
    return smokeTestGeminiModel(key, model);
  });

  // Intake Policies & Budget
  app.get('/intake-policies', async (req) => {
    const a = await staff(req);
    if (!a.superAdmin) throw new ForbiddenError();
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
    let userId = 'anonymous_driver';
    try {
      userId = await userSession(req);
    } catch {
      userId = 'anonymous_driver';
    }
    const b = z
      .object({
        placeId: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/),
        category: z.enum([
          'NOT_PARKING',
          'PRIVATE',
          'WRONG_LOCATION',
          'PRICE',
          'HOURS',
          'CLOSED',
          'OTHER',
        ]),
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

        if (f && f.googlePlaceId !== b.placeId)
          throw fail('Facility reference conflicts with an existing identifier.');
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
          { reportCategory: b.category, source: 'REPORT' },
          'user-report',
          reportMeta,
        );

        await audit(
          tx,
          userId,
          'REPORT_RECEIVED',
          c?.id ?? f.id,
          { routed: Boolean(c), category: b.category, notes: b.notes ?? null, placeId: b.placeId },
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
