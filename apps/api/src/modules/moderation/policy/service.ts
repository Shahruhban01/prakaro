import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AnalyticsActor } from '../analytics-scope';
import { director } from '../workforce';
import { AppError, ForbiddenError } from '../../../common/errors/app-error';
import { policyDocument, policySelect } from './contracts';

export type Db = Prisma.TransactionClient;
export const isPolicyAdmin = (actor: AnalyticsActor) => actor.superAdmin || director(actor);
export const canEditPolicy = isPolicyAdmin;
export const policyMissing = () => new AppError(404, 'POLICY_NOT_FOUND', 'Policy record is unavailable.');
export const policyConflict = (message: string) => new AppError(409, 'POLICY_CONFLICT', message);

export function requirePolicyEditor(actor: AnalyticsActor) {
  if (!canEditPolicy(actor)) throw new ForbiddenError();
}
export function requirePolicyAdmin(actor: AnalyticsActor) {
  if (!isPolicyAdmin(actor)) throw new ForbiddenError();
}
export function tenantWhere(actor: AnalyticsActor) {
  return actor.superAdmin ? {} : { organizationId: actor.organizationId ?? '' };
}
export async function lockPolicyTenant(tx: Db, organizationId: string) {
  if (!(await tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations WHERE id = ${organizationId} AND active = TRUE FOR UPDATE`).length)
    throw policyMissing();
}
export async function ownedPolicy(tx: Db, actor: AnalyticsActor, id: string, update = false) {
  requirePolicyEditor(actor);
  const row = await tx.moderationPolicy.findFirst({ where: { id, ...tenantWhere(actor) } });
  if (!row) throw policyMissing();
  if (update) await lockPolicyTenant(tx, row.organizationId);
  return row;
}

export function policyAudit(tx: Db, actor: AnalyticsActor, organizationId: string, target: string,
  action: string, after: Prisma.InputJsonObject, before?: Prisma.InputJsonObject) {
  return tx.moderationAudit.create({ data: {
    organizationId, actor: actor.userId, actorId: actor.userId, actorType: actor.actorType,
    actorSnapshot: { name: actor.name }, target, action: 'POLICY_' + action, after, before,
  } });
}
export const scopeKey = (organizationId: string, lobId?: string | null, queueId?: string | null) =>
  organizationId + (queueId ? ':queue:' + queueId : lobId ? ':lob:' + lobId : ':organization');

export async function resolvePolicy(tx: Db, organizationId: string, lobId: string, queueId: string, at = new Date()) {
  const scopes = [scopeKey(organizationId, null, queueId), scopeKey(organizationId, lobId), scopeKey(organizationId)];
  const matches = await tx.policyAssignment.findMany({ where: {
    organizationId, scopeKey: { in: scopes }, effectiveFrom: { lte: at },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    version: { policy: { organizationId }, publishedAt: { not: null } },
  }, select: { scopeKey: true, versionId: true } });
  return scopes.map((scope) => matches.find((row) => row.scopeKey === scope)?.versionId).find(Boolean) ?? null;
}
export async function setAssignment(tx: Db, actor: AnalyticsActor, id: string, input: {
  lobId?: string; queueId?: string; versionId: string | null; expectedAssignmentId: string | null;
}) {
  requirePolicyAdmin(actor);
  const owner = await ownedPolicy(tx, actor, id, true);
  const { organizationId } = owner;
  if (input.lobId && !await tx.lob.findFirst({ where: { id: input.lobId, organizationId, active: true }, select: { id: true } }))
    throw policyMissing();
  if (input.queueId && !await tx.moderationQueue.findFirst({ where: { id: input.queueId, organizationId, status: { not: 'ARCHIVED' } }, select: { id: true } }))
    throw policyMissing();
  const key = scopeKey(organizationId, input.lobId, input.queueId);
  const current = await tx.policyAssignment.findUnique({ where: { activeKey: key }, include: { version: { select: { policyId: true } } } });
  if (input.versionId && current?.versionId === input.versionId && current.version.policyId === id) return current;
  if (!input.versionId && !current) return null;
  if ((current?.id ?? null) !== input.expectedAssignmentId) throw policyConflict('The active assignment changed. Refresh before replacing it.');
  if (!input.versionId && current?.version.policyId !== id) throw policyConflict('This assignment belongs to a different policy.');
  const latest = input.versionId && await tx.policyVersion.findFirst({ where: { policyId: id, status: 'PUBLISHED' }, orderBy: { number: 'desc' } });
  if (input.versionId && (!latest || latest.id !== input.versionId)) throw policyConflict('Choose the latest published version. Rollback requires a new version.');
  const at = new Date();
  if (current) await tx.policyAssignment.update({ where: { id: current.id }, data: { activeKey: null, effectiveTo: at } });
  const next = input.versionId ? await tx.policyAssignment.create({ data: {
    organizationId, queueId: input.queueId, lobId: input.lobId, scopeKey: key, activeKey: key,
    versionId: input.versionId, effectiveFrom: at, createdBy: actor.userId,
  } }) : null;
  await policyAudit(tx, actor, organizationId, id, 'ASSIGNMENT_CHANGED',
    { scope: key, assignmentId: next?.id ?? null, versionId: next?.versionId ?? null },
    { assignmentId: current?.id ?? null, versionId: current?.versionId ?? null });
  return next;
}
export async function changeVersion(tx: Db, actor: AnalyticsActor, id: string, versionId: string,
  action: 'submit-review' | 'return-draft' | 'publish' | 'archive', expectedRevision: number) {
  if (action !== 'submit-review') requirePolicyAdmin(actor);
  const { organizationId } = await ownedPolicy(tx, actor, id, true);
  const row = await tx.policyVersion.findFirst({ where: { id: versionId, policyId: id } });
  if (!row) throw policyMissing();
  const desired = { 'submit-review': 'IN_REVIEW', 'return-draft': 'DRAFT', publish: 'PUBLISHED', archive: 'ARCHIVED' }[action];
  if (row.status === desired && row.revision === expectedRevision + 1) return row;
  if (row.revision !== expectedRevision) throw policyConflict('This version changed. Refresh to continue.');
  const previous = action === 'archive' ? 'PUBLISHED' : action === 'submit-review' ? 'DRAFT' : 'IN_REVIEW';
  if (row.status !== previous) throw policyConflict('This version cannot perform that transition.');
  const at = new Date();
  if (action === 'publish') {
    const document = policyDocument.parse(row.document);
    const newer = await tx.policyVersion.count({ where: { policyId: id, publishedAt: { not: null }, number: { gte: row.number } } });
    if (newer) throw policyConflict('A newer version was published. Clone this version into a new draft to restore it.');
    const active = await tx.policyAssignment.findMany({
      where: { activeKey: { not: null }, version: { policyId: id } },
      select: { id: true, organizationId: true, lobId: true, queueId: true, scopeKey: true, versionId: true,
        organization: { select: { active: true } }, queue: { select: { organizationId: true, status: true } },
        lob: { select: { organizationId: true, active: true } } },
    });
    if (active.some((item) => item.organizationId !== organizationId || !item.organization.active ||
      (item.queueId && (item.queue?.organizationId !== organizationId || item.queue?.status === 'ARCHIVED')) ||
      (item.lobId && (item.lob?.organizationId !== organizationId || !item.lob?.active))))
      throw policyConflict('Remove inactive or incompatible assignments before publishing.');
    const next = await tx.policyVersion.update({ where: { id: row.id }, data: {
      status: desired, revision: { increment: 1 }, document,
      publisherId: actor.userId, publishedAt: at, contentHash: createHash('sha256').update(JSON.stringify(document)).digest('hex'),
    } });
    for (const item of active) {
      await tx.policyAssignment.update({ where: { id: item.id }, data: { activeKey: null, effectiveTo: at } });
      const replacement = await tx.policyAssignment.create({ data: {
        organizationId, lobId: item.lobId, queueId: item.queueId, scopeKey: item.scopeKey,
        activeKey: item.scopeKey, effectiveFrom: at, createdBy: actor.userId, versionId: row.id,
      } });
      await policyAudit(tx, actor, organizationId, id, 'ASSIGNMENT_ADVANCED',
        { assignmentId: replacement.id, versionId: row.id, scope: item.scopeKey }, { assignmentId: item.id, versionId: item.versionId });
    }
    await policyAudit(tx, actor, organizationId, id, 'PUBLISHED',
      { versionId: row.id, status: desired, contentHash: next.contentHash }, { status: row.status });
    return next;
  }
  if (action === 'submit-review') policyDocument.parse(row.document);
  if (action === 'archive' && await tx.policyAssignment.count({ where: { versionId, activeKey: { not: null } } }))
    throw policyConflict('Remove active assignments before archiving this version.');
  const result = await tx.policyVersion.update({ where: { id: row.id }, data: {
    status: desired, revision: { increment: 1 }, ...(action === 'archive' ? { archivedAt: at } : {}),
  } });
  await policyAudit(tx, actor, organizationId, id, action.replaceAll('-', '_').toUpperCase(),
    { versionId, status: desired }, { status: row.status });
  return result;
}

export async function effectiveQueuePolicies(tx: Db, actor: AnalyticsActor, queueId?: string) {
  if (!actor.organizationId || !actor.lobId) return [];
  const grants = await tx.queueLobAccess.findMany({ where: {
    organizationId: actor.organizationId, lobId: actor.lobId, revokedAt: null, queueId,
    queue: { organizationId: actor.organizationId, status: { not: 'ARCHIVED' },
      subscriptions: { some: { moderatorId: actor.userId, unsubscribedAt: null } } },
  }, select: { queue: { select: { id: true, name: true } } }, take: 100 });
  const keys = [scopeKey(actor.organizationId), scopeKey(actor.organizationId, actor.lobId),
    ...grants.map(({ queue }) => scopeKey(actor.organizationId!, null, queue.id))];
  const assignments = await tx.policyAssignment.findMany({ where: { organizationId: actor.organizationId, activeKey: { in: keys },
    version: { status: 'PUBLISHED', policy: { organizationId: actor.organizationId } } },
    select: { scopeKey: true, version: { select: policySelect } } });
  const index = new Map(assignments.map(({ scopeKey: key, version }) => [key, version]));
  return grants.map(({ queue }) => ({ queue, version: index.get(scopeKey(actor.organizationId!, null, queue.id)) ??
    index.get(scopeKey(actor.organizationId!, actor.lobId)) ?? index.get(scopeKey(actor.organizationId!)) ?? null }));
}
