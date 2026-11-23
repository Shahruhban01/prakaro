import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../common/database/prisma';
import { AppError, ForbiddenError } from '../../../common/errors/app-error';
import { handlingSources } from '../handling-metrics';
import { director, employeeScope, leader, lobScope } from '../workforce';
import { matchesDraw, qaEligibility, type policyInput, type QaFilters } from './contracts';
import { inList, type AnalyticsActor } from '../analytics-scope';
import type { z } from 'zod';

type Db = Prisma.TransactionClient;
type Candidate = {
  decisionId: string; organizationId: string; lobId: string; queueId: string; moderatorId: string; completedAt: Date;
};
const sources = Prisma.sql`${handlingSources} JOIN moderation_queue q ON q.id = h.queueId`;
const projection = Prisma.sql`h.decisionVersionId AS decisionId, a.organizationId, a.lobId, h.queueId,
  h.moderatorId, h.submittedAt AS completedAt`;

export function qaEvent(tx: Db, actor: AnalyticsActor | null, organizationId: string, id: string, action: string,
  after: Prisma.InputJsonObject, before?: Prisma.InputJsonObject) {
  return tx.moderationAudit.create({ data: {
    organizationId, target: id, action: 'QA_' + action, actor: actor?.userId ?? 'system',
    actorType: actor?.actorType ?? 'SYSTEM', actorId: actor?.userId,
    actorSnapshot: actor ? { name: actor.name } : undefined,
    before, after: { correlationId: id, ...after },
  } });
}

export function mayConfigureQa(actor: AnalyticsActor) {
  return actor.superAdmin || director(actor);
}

export async function savePolicy(tx: Db, actor: AnalyticsActor, input: z.infer<typeof policyInput>) {
  if (!mayConfigureQa(actor) || (!actor.superAdmin && actor.organizationId !== input.organizationId))
    throw new ForbiddenError();
  const tenant = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations
    WHERE id = ${input.organizationId} AND active = TRUE FOR UPDATE`;
  if (!tenant.length) throw new ForbiddenError();
  if (input.lobId && !await tx.lob.findFirst({ where: { id: input.lobId, organizationId: input.organizationId, active: true } }))
    throw new ForbiddenError();
  if (input.queueId && !await tx.moderationQueue.findFirst({ where: { id: input.queueId, organizationId: input.organizationId } }))
    throw new ForbiddenError();
  const key = input.organizationId + (input.queueId ? ':queue:' + input.queueId : input.lobId ? ':lob:' + input.lobId : ':org');
  const existing = await tx.qaPolicy.findUnique({ where: { activeKey: key } });
  const same = existing && existing.rate === input.rate && existing.enabled === input.enabled &&
    existing.passScore === input.passScore && existing.failScore === input.failScore;
  if (same && existing.version === input.expectedVersion + 1) return existing;
  if ((existing?.version ?? 0) !== input.expectedVersion)
    throw new AppError(409, 'QA_POLICY_CHANGED', 'The policy changed. Refresh its current version.');
  const now = new Date();
  if (existing) await tx.qaPolicy.update({
    where: { id: existing.id }, data: { effectiveTo: now, activeKey: null },
  });
  const policy = await tx.qaPolicy.create({ data: {
    organizationId: input.organizationId, queueId: input.queueId, lobId: input.lobId,
    scopeKey: key, activeKey: key, version: input.expectedVersion + 1, createdBy: actor.userId,
    effectiveFrom: now, rate: input.rate, enabled: input.enabled, passScore: input.passScore, failScore: input.failScore,
  } });
  await qaEvent(tx, actor, input.organizationId, policy.id, 'POLICY_VERSION', {
    scope: key, version: policy.version, rate: policy.rate, enabled: policy.enabled, passScore: policy.passScore, failScore: policy.failScore,
  }, existing ? { id: existing.id, version: existing.version } : undefined);
  return policy;
}

export async function eligibleDecision(tx: Db, decisionId: string) {
  const [row] = await tx.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT ${projection} ${sources} WHERE h.decisionVersionId = ${decisionId}
      AND ${qaEligibility} AND h.submittedAt <= UTC_TIMESTAMP(3)`);
  return row;
}

export async function eligiblePopulation(tx: Db, actor: AnalyticsActor, filters: QaFilters, window?: { start: Date; end: Date }) {
  const conditions = [qaEligibility, Prisma.sql`h.submittedAt <= UTC_TIMESTAMP(3)`];
  const tenant = actor.superAdmin ? filters.organizationId : actor.organizationId;
  if (tenant) conditions.push(Prisma.sql`a.organizationId = ${tenant}`);
  if (filters.lobId) conditions.push(Prisma.sql`a.lobId = ${filters.lobId}`);
  if (filters.queueId) conditions.push(Prisma.sql`h.queueId = ${filters.queueId}`);
  if (filters.moderatorId) conditions.push(Prisma.sql`h.moderatorId = ${filters.moderatorId}`);
  if (filters.policyVersionId) conditions.push(Prisma.sql`d.pinnedPolicyId = ${filters.policyVersionId}`);
  if (filters.from) conditions.push(Prisma.sql`h.submittedAt >= ${new Date(filters.from)}`);
  if (filters.to) conditions.push(Prisma.sql`h.submittedAt < ${new Date(Date.parse(filters.to) + 86400000)}`);
  if (window) conditions.push(Prisma.sql`h.submittedAt >= ${window.start} AND h.submittedAt < ${window.end}`);
  if (leader(actor) && !actor.superAdmin) {
    const lobs = await tx.lob.findMany({ where: { AND: [lobScope(actor), { active: true }] }, select: { id: true } });
    conditions.push(inList(Prisma.sql`a.lobId`, lobs.map(({ id }) => id)), Prisma.sql`EXISTS (
      SELECT 1 FROM queue_lob_access g WHERE g.lobId = a.lobId AND g.queueId = h.queueId AND g.revokedAt IS NULL)`);
    if (actor.role !== 'QA_SUPERVISOR') {
      const roster = await tx.moderator.findMany({ where: employeeScope(actor), select: { id: true } });
      conditions.push(inList(Prisma.sql`h.moderatorId`, roster.map(({ id }) => id)));
    }
  }
  if (filters.teamId) conditions.push(Prisma.sql`EXISTS (
    SELECT 1 FROM workforce_team_links w WHERE w.teamId = ${filters.teamId}
    AND w.moderatorId = h.moderatorId AND w.organizationId = a.organizationId)`);
  const [row] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN COUNT(*) AS total ${sources}
    WHERE ${Prisma.join(conditions, ' AND ')}
    AND (SELECT p.enabled FROM qa_policy p WHERE p.organizationId = a.organizationId
      AND p.effectiveFrom <= h.submittedAt AND (p.effectiveTo IS NULL OR p.effectiveTo > h.submittedAt)
      AND (p.queueId = h.queueId OR p.lobId = a.lobId OR (p.queueId IS NULL AND p.lobId IS NULL))
      ORDER BY (p.queueId IS NOT NULL) DESC, (p.lobId IS NOT NULL) DESC, p.version DESC LIMIT 1) = TRUE`);
  return Number(row?.total ?? 0);
}

export async function sampleDecision(tx: Db, decisionId: string, manualActor?: AnalyticsActor) {
  await tx.$queryRaw`SELECT id FROM moderation_decision_version WHERE id = ${decisionId} FOR UPDATE`;
  const existing = await tx.qaSample.findUnique({ where: { decisionId } });
  const item = existing ?? await eligibleDecision(tx, decisionId);
  if (!item) return null;
  if (manualActor && (!mayConfigureQa(manualActor) ||
      (!manualActor.superAdmin && manualActor.organizationId !== item.organizationId))) throw new ForbiddenError();
  if (existing && (!manualActor || existing.sampledAt)) return existing;

  const candidates = await tx.qaPolicy.findMany({ where: {
    organizationId: item.organizationId, effectiveFrom: { lte: item.completedAt },
    AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: item.completedAt } }] },
      { OR: [{ queueId: item.queueId }, { lobId: item.lobId }, { queueId: null, lobId: null }] }],
  }, orderBy: { version: 'desc' } });
  const policy = candidates.find(({ queueId }) => queueId === item.queueId)
    ?? candidates.find(({ lobId }) => lobId === item.lobId)
    ?? candidates.find(({ queueId, lobId }) => !queueId && !lobId);
  const draw = !manualActor && policy?.enabled ? randomInt(10000) : null;
  const chosen = manualActor || (draw !== null && matchesDraw(draw, policy?.rate ?? 0));
  const selectedAt = chosen ? new Date() : null;
  const selection = manualActor ? 'MANUAL' : draw === null ? 'NO_POLICY' : chosen ? 'SELECTED' : 'NOT_SELECTED';
  const sample = existing
    ? await tx.qaSample.update({ where: { id: existing.id }, data: { selection, sampledAt: selectedAt, status: 'PENDING' } })
    : await tx.qaSample.create({ data: {
      decisionId, organizationId: item.organizationId, lobId: item.lobId, queueId: item.queueId,
      moderatorId: item.moderatorId, completedAt: item.completedAt, policyId: policy?.id,
      draw, selection, sampledAt: selectedAt, status: chosen ? 'PENDING' : null,
    } });
  if (chosen) await qaEvent(tx, manualActor ?? null, item.organizationId, sample.id, 'SAMPLED', {
    decisionId, selection, policyId: sample.policyId, draw: sample.draw, status: 'PENDING',
  }, existing ? { selection: existing.selection } : undefined);
  return sample;
}

export async function drainQaSamples(limit = 40) {
  const earliest = await prisma.qaPolicy.findFirst({
    orderBy: { effectiveFrom: 'asc' }, select: { effectiveFrom: true },
  });
  if (!earliest) return 0;
  const candidates = await prisma.$queryRaw<{ decisionId: string }[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN h.decisionVersionId AS decisionId ${sources}
    WHERE h.submittedAt >= ${earliest.effectiveFrom} AND h.submittedAt <= UTC_TIMESTAMP(3)
      AND ${qaEligibility}
      AND NOT EXISTS (SELECT 1 FROM qa_sample sample WHERE sample.decisionId = h.decisionVersionId)
      AND EXISTS (SELECT 1 FROM qa_policy p WHERE p.organizationId = a.organizationId AND p.effectiveFrom <= h.submittedAt)
    ORDER BY h.submittedAt, h.id LIMIT ${Math.max(1, Math.min(limit, 200))}`);
  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(candidates.slice(offset, offset + 4).map(({ decisionId }) =>
      prisma.$transaction((tx) => sampleDecision(tx, decisionId), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      })));
  }
  return candidates.length;
}
