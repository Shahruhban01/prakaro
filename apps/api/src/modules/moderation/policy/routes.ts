import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../common/database/prisma';
import { ForbiddenError } from '../../../common/errors/app-error';
import type { AnalyticsActor } from '../analytics-scope';
import { registerClarifications, uuid } from './clarifications';
import { policyDocument } from './contracts';
import { changeVersion, effectiveQueuePolicies, lockPolicyTenant, ownedPolicy, policyAudit, policyConflict,
  policyMissing, requirePolicyAdmin, requirePolicyEditor, setAssignment, tenantWhere, type Db } from './service';

const idParam = z.object({ id: uuid });
const versionParam = idParam.extend({ versionId: uuid });
const revision = z.number().int().nonnegative();
const changeSummary = z.string().trim().min(3).max(500);
const versionStatus = z.enum(['DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED']);
const empty = { overview: '', sections: [], decisionGuidance: [], tags: [], fields: [], evidence: [] };
const scopeInput = z.object({
  lobId: uuid.optional(), queueId: uuid.optional(), versionId: uuid.nullable(), expectedAssignmentId: uuid.nullable(),
}).strict().refine(({ lobId, queueId }) => !lobId || !queueId, 'Choose one assignment scope.');

export function registerPolicies(app: FastifyInstance, staff: (request: FastifyRequest) => Promise<AnalyticsActor>) {
  registerClarifications(app, staff);
  async function mutate<T>(req: FastifyRequest, action: (db: Db, actor: AnalyticsActor) => Promise<T>) {
    const actor = await staff(req);
    try {
      return await prisma.$transaction((db) => action(db, actor), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code))
        throw policyConflict('A duplicate or concurrent policy update was detected. Refresh and retry.');
      throw error;
    }
  }
  app.get('/policies/effective', async (req) => {
    const { queueId } = z.object({ queueId: uuid.optional() }).strict().parse(req.query);
    return { rows: await effectiveQueuePolicies(prisma, await staff(req), queueId) };
  });
  app.get('/policies/options', async (req) => {
    const actor = await staff(req);
    requirePolicyEditor(actor);
    return { organizations: await prisma.organization.findMany({
      where: { active: true, id: actor.superAdmin ? undefined : actor.organizationId ?? '' },
      select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200,
    }) };
  });
  app.get('/policies', async (req) => {
    const actor = await staff(req);
    requirePolicyEditor(actor);
    const { page, search, status } = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1),
      search: z.string().trim().max(100).optional(), status: versionStatus.optional() }).strict().parse(req.query);
    const where = { ...tenantWhere(actor), ...(search ? { OR: [{ name: { contains: search } }, { category: { contains: search } }] } : {}),
      ...(status ? { versions: { some: { status } } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.moderationPolicy.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20,
        include: { organization: { select: { name: true } }, versions: { orderBy: { number: 'desc' }, take: 1,
          select: { id: true, number: true, status: true } } } }),
      prisma.moderationPolicy.count({ where }),
    ]);
    return { rows, total, page };
  });
  app.post('/policies', (req) => mutate(req, async (db, actor) => {
    requirePolicyEditor(actor);
    const input = z.object({ organizationId: uuid, name: z.string().trim().min(3).max(100),
      description: z.string().trim().max(500).default(''), category: z.string().trim().min(1).max(80) }).strict().parse(req.body);
    if (!actor.superAdmin && input.organizationId !== actor.organizationId) throw new ForbiddenError();
    await lockPolicyTenant(db, input.organizationId);
    const result = await db.moderationPolicy.create({ data: { ...input, createdBy: actor.userId } });
    await policyAudit(db, actor, input.organizationId, result.id, 'CREATED', { name: result.name, category: result.category });
    return result;
  }));
  app.get('/policies/:id', async (req) => {
    const actor = await staff(req);
    const { id } = idParam.parse(req.params);
    const policy = await ownedPolicy(prisma, actor, id);
    const history = await prisma.moderationAudit.findMany({
      where: { organizationId: policy.organizationId, target: id, action: { startsWith: 'POLICY_' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
      select: { id: true, action: true, actorSnapshot: true, createdAt: true, before: true, after: true },
    });
    return { ...policy, history };
  });
  app.get('/policies/:id/versions', async (req) => {
    const { id } = idParam.parse(req.params);
    await ownedPolicy(prisma, await staff(req), id);
    const query = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict().parse(req.query);
    const [rows, total] = await Promise.all([
      prisma.policyVersion.findMany({ where: { policyId: id }, orderBy: { number: 'desc' }, take: 25, skip: (query.page - 1) * 25,
        select: { id: true, number: true, status: true, revision: true, publishedAt: true, archivedAt: true,
          changeSummary: true, contentHash: true, publisherId: true } }),
      prisma.policyVersion.count({ where: { policyId: id } }),
    ]);
    return { rows, total, page: query.page };
  });
  app.get('/policies/:id/versions/:versionId', async (req) => {
    const { id, versionId } = versionParam.parse(req.params);
    await ownedPolicy(prisma, await staff(req), id);
    const row = await prisma.policyVersion.findFirst({ where: { id: versionId, policyId: id } });
    if (!row) throw policyMissing();
    return row;
  });
  app.post('/policies/:id/versions', (req) => mutate(req, async (db, actor) => {
    const { id } = idParam.parse(req.params);
    const input = z.object({ sourceVersionId: uuid.optional(), changeSummary, draftId: uuid }).strict().parse(req.body);
    const policy = await ownedPolicy(db, actor, id, true);
    const existing = await db.policyVersion.findFirst({ where: { id: input.draftId, policyId: id, createdBy: actor.userId } });
    if (existing) return existing;
    const source = input.sourceVersionId ? await db.policyVersion.findFirst({ where: { id: input.sourceVersionId, policyId: id } }) : null;
    if (input.sourceVersionId && !source) throw policyMissing();
    const latest = await db.policyVersion.findFirst({ where: { policyId: id }, orderBy: { number: 'desc' }, select: { number: true } });
    const row = await db.policyVersion.create({ data: {
      id: input.draftId, policyId: id, number: (latest?.number ?? 0) + 1, status: 'DRAFT', createdBy: actor.userId,
      changeSummary: input.changeSummary, document: source ? source.document as Prisma.InputJsonValue : empty,
    } });
    await policyAudit(db, actor, policy.organizationId, id, 'DRAFT_CREATED', { versionId: row.id, number: row.number, sourceVersionId: source?.id ?? null });
    return row;
  }));
  app.post('/policies/:id/versions/:versionId/validate', async (req) => {
    const { id, versionId } = versionParam.parse(req.params);
    await ownedPolicy(prisma, await staff(req), id);
    const row = await prisma.policyVersion.findFirst({ where: { id: versionId, policyId: id } });
    if (!row) throw policyMissing();
    const { document } = z.object({ document: z.unknown().optional() }).strict().parse(req.body ?? {});
    const parsed = policyDocument.safeParse(document ?? row.document);
    return parsed.success ? { valid: true, issues: [] } : { valid: false, issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) };
  });
  app.patch('/policies/:id/versions/:versionId', (req) => mutate(req, async (db, actor) => {
    const { id, versionId } = versionParam.parse(req.params);
    const input = z.object({ revision, document: policyDocument, changeSummary }).strict().parse(req.body);
    const policy = await ownedPolicy(db, actor, id, true);
    const row = await db.policyVersion.findFirst({ where: { id: versionId, policyId: id } });
    if (!row) throw policyMissing();
    if (row.status !== 'DRAFT') throw policyConflict('Only a draft version can be edited.');
    if (row.revision !== input.revision) throw policyConflict('The draft changed. Refresh before saving.');
    const result = await db.policyVersion.update({ where: { id: versionId },
      data: { revision: { increment: 1 }, document: input.document, changeSummary: input.changeSummary } });
    await policyAudit(db, actor, policy.organizationId, id, 'DRAFT_UPDATED', { versionId, revision: result.revision }, { revision: row.revision });
    return result;
  }));
  for (const action of ['submit-review','return-draft','publish','archive'] as const) {
    app.post('/policies/:id/versions/:versionId/' + action, (req) => mutate(req, (db, actor) => {
      const { id, versionId } = versionParam.parse(req.params);
      const input = z.object({ revision }).strict().parse(req.body);
      return changeVersion(db, actor, id, versionId, action, input.revision);
    }));
  }
  app.get('/policies/:id/versions/compare', async (req) => {
    const { id } = idParam.parse(req.params);
    await ownedPolicy(prisma, await staff(req), id);
    const { before, after } = z.object({ before: uuid, after: uuid }).strict().parse(req.query);
    const rows = await prisma.policyVersion.findMany({ where: { policyId: id, id: { in: [before, after] } },
      include: { assignments: { select: { scopeKey: true, effectiveFrom: true, effectiveTo: true }, orderBy: { effectiveFrom: 'asc' } } } });
    const [left, right] = [before, after].map((versionId) => rows.find((row) => row.id === versionId));
    if (!left || !right) throw policyMissing();
    const a = left.document as Record<string, unknown>;
    const b = right.document as Record<string, unknown>;
    return { before: left.number, after: right.number,
      changes: [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !isDeepStrictEqual(a[key], b[key]))
        .map((key) => ({ key, before: a[key], after: b[key] })),
      assignments: { before: left.assignments, after: right.assignments } };
  });
  app.get('/policies/:id/assignments', async (req) => {
    const { id } = idParam.parse(req.params);
    const actor = await staff(req);
    requirePolicyAdmin(actor);
    const { organizationId } = await ownedPolicy(prisma, actor, id);
    const [rows, occupied, lobs, queues] = await Promise.all([
      prisma.policyAssignment.findMany({ where: { organizationId, version: { policyId: id } }, orderBy: { effectiveFrom: 'desc' }, take: 100,
        include: { lob: { select: { name: true } }, queue: { select: { name: true } }, version: { select: { id: true, number: true } } } }),
      prisma.policyAssignment.findMany({ where: { organizationId, activeKey: { not: null } }, take: 500,
        select: { id: true, lobId: true, queueId: true, version: { select: { policyId: true, policy: { select: { name: true } } } } } }),
      prisma.lob.findMany({ where: { organizationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
      prisma.moderationQueue.findMany({ where: { organizationId, status: { not: 'ARCHIVED' } }, select: { id: true, name: true },
        orderBy: { name: 'asc' }, take: 200 }),
    ]);
    return { rows, occupied, lobs, queues };
  });
  app.put('/policies/:id/assignments', (req) => mutate(req, (db, actor) => {
    const { id } = idParam.parse(req.params);
    return setAssignment(db, actor, id, scopeInput.parse(req.body));
  }));
}
