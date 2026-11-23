import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AppError, ForbiddenError } from '../../../common/errors/app-error';
import { employeeScope, leader, lobScope } from '../workforce';
import type { AnalyticsActor } from '../analytics-scope';
import { qaEvent, mayConfigureQa } from './sampling';
import { currentEvidence } from '../../intelligence/intelligence.discovery';
import type { adjudicationInput, assessmentInput, QaFilters } from './contracts';
import { policySelect } from '../policy/contracts';
import { resolvePolicy } from '../policy/service';

export type Db = Prisma.TransactionClient;
const leaseMs = 30 * 60 * 1000;
const held = ['ASSIGNED', 'IN_REVIEW'];
export const isAuditor = (actor: AnalyticsActor) => actor.role === 'QA_REVIEWER';
export const canAdjudicate = (actor: AnalyticsActor) => mayConfigureQa(actor) || actor.role === 'QA_SUPERVISOR';
export const selfRole = (actor: AnalyticsActor) => !canAdjudicate(actor) && !isAuditor(actor) && !leader(actor);
export const conflict = (message: string) => new AppError(409, 'QA_STATE_CHANGED', message);
export const missing = () => new AppError(404, 'QA_NOT_FOUND', 'QA record is unavailable.');
export const fingerprint = (value: object) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function qaScope(db: Db, actor: AnalyticsActor): Promise<Prisma.QaSampleWhereInput> {
  if (actor.superAdmin) return {};
  const tenant = { organizationId: actor.organizationId ?? '' };
  if (mayConfigureQa(actor)) return tenant;
  if (isAuditor(actor) || leader(actor)) {
    const lobs = await db.lob.findMany({ where: { AND: [lobScope(actor), { active: true }] }, select: { id: true } });
    const grants = { OR: lobs.map(({ id }) => ({ lobId: id, queue: { access: { some: { revokedAt: null, lobId: id } } } })) };
    return { ...tenant, AND: [grants],
      ...(isAuditor(actor) ? { moderatorId: { not: actor.userId }, OR: [
        { assignedTo: actor.userId }, { status: 'PENDING' }, { status: { in: held }, leaseUntil: { lte: new Date() } },
      ] } : actor.role !== 'QA_SUPERVISOR' ? { moderator: employeeScope(actor) } : {}) };
  }
  return { ...tenant, moderatorId: actor.userId, assessment: { isNot: null } };
}

export async function reviewFilter(db: Db, actor: AnalyticsActor, filters: QaFilters) {
  if (filters.organizationId && !actor.superAdmin && filters.organizationId !== actor.organizationId)
    throw new ForbiddenError();
  const scope = await qaScope(db, actor);
  const time = {
    gte: filters.from ? new Date(filters.from) : undefined,
    lt: filters.to ? new Date(Date.parse(filters.to) + 86400000) : undefined,
  };
  const base: Prisma.QaSampleWhereInput = { AND: [scope, {
    organizationId: filters.organizationId, lobId: filters.lobId, queueId: filters.queueId,
    moderatorId: filters.moderatorId, assignedTo: filters.auditorId,
    decision: filters.policyVersionId ? { pinnedPolicyId: filters.policyVersionId } : undefined,
    moderator: filters.teamId ? { teamLinks: { some: { teamId: filters.teamId } } } : undefined,
    completedAt: time,
  }] };
  const selection: Prisma.QaSampleWhereInput = {
    sampledAt: { not: null }, status: filters.status,
    assessment: filters.outcome || filters.category || filters.severity ? {
      is: { finalOutcome: filters.outcome, category: filters.category, severity: filters.severity },
    } : undefined,
  };
  const now = new Date();
  const views: Record<QaFilters['view'], Prisma.QaSampleWhereInput> = {
    all: {},
    assigned: { assignedTo: actor.userId, status: { in: held }, leaseUntil: { gt: now } },
    available: selfRole(actor) ? { id: '' } : { moderatorId: { not: actor.userId },
      OR: [{ status: 'PENDING' }, { status: { in: held }, leaseUntil: { lte: now } }] },
    completed: { status: { in: ['COMPLETED','CLOSED'] } },
    disputed: { status: 'DISPUTED' },
    corrections: { correction: { is: { approvedAt: null } } },
  };
  return { base, reviews: { AND: [base, selection, views[filters.view]] } satisfies Prisma.QaSampleWhereInput };
}

export const worklistSelect = {
  id: true, decisionId: true, organizationId: true, status: true, selection: true,
  sampledAt: true, completedAt: true, assignedAt: true, assignedTo: true, leaseUntil: true, assignmentVersion: true,
  queue: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
  lob: { select: { id: true, name: true } },
  moderator: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  policy: { select: { id: true, version: true, rate: true } },
  decision: { select: { version: true, action: true, case: { select: { id: true, code: true } } } },
  assessment: { select: { originalOutcome: true, finalOutcome: true, finalScore: true, severity: true, category: true } },
} satisfies Prisma.QaSampleSelect;

const detailInclude = {
  policy: true, assessment: true, dispute: true, correction: true,
  decision: { include: { pinnedPolicy: { select: policySelect }, case: { select: { code: true, id: true, facilityId: true, status: true, revision: true } } } },
  organization: { select: { id: true, name: true } }, lob: { select: { id: true, name: true } },
  queue: { select: { id: true, name: true } },
  moderator: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } },
} satisfies Prisma.QaSampleInclude;
export type Review = Prisma.QaSampleGetPayload<{ include: typeof detailInclude }>;

export async function scopedReview(tx: Db, actor: AnalyticsActor, id: string) {
  const scope = await qaScope(tx, actor);
  const item = await tx.qaSample.findFirst({ where: { AND: [scope, { id, sampledAt: { not: null } }] }, include: detailInclude });
  if (!item) throw missing();
  return item;
}

export async function lockedReview(tx: Db, actor: AnalyticsActor, id: string) {
  await tx.$queryRaw`SELECT id FROM qa_sample WHERE id = ${id} FOR UPDATE`;
  return scopedReview(tx, actor, id);
}

export async function readReview(tx: Db, actor: AnalyticsActor, id: string) {
  const item = await scopedReview(tx, actor, id);
  const auditor = isAuditor(actor);
  if (auditor && item.assignedTo !== actor.userId) throw new ForbiddenError('Claim the review to inspect its evidence.');
  const history = await tx.moderationAudit.findMany({
    where: { target: item.id, organizationId: item.organizationId, action: { startsWith: 'QA_' } },
    select: { id: true, action: true, actorType: true, actorSnapshot: true, createdAt: true, after: true, before: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100,
  });
  const { fingerprint: _fingerprint, ...visibleAssessment } = item.assessment ?? {};
  const eligibleAuditors = canAdjudicate(actor) ? await tx.moderator.findMany({
    where: { id: { not: item.moderatorId }, role: 'QA_REVIEWER', status: 'ACTIVE', organizationId: item.organizationId,
      lobId: item.lobId, lob: { active: true, queueAccess: { some: { queueId: item.queueId, revokedAt: null } } } },
    select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100,
  }) : [];
  const current = canAdjudicate(actor) || auditor ? await tx.parkingEvidenceReference.findMany({
    where: { caseId: item.decision.case.facilityId, ...currentEvidence(new Date()).where },
    select: { id: true, source: true, finding: true, reference: true, expiresAt: true },
    orderBy: { id: 'asc' }, take: 12,
  }) : [];
  return {
    ...item, assessment: item.assessment ? visibleAssessment : null, eligibleAuditors, currentEvidence: current,
    currentPolicyId: await resolvePolicy(tx, item.organizationId, item.lobId, item.queueId),
    history: history.map(({ actorSnapshot, ...event }) => ({
      ...event, actorName: actorSnapshot && typeof actorSnapshot === 'object' && !Array.isArray(actorSnapshot)
        && typeof actorSnapshot.name === 'string' ? actorSnapshot.name : null,
    })),
    capabilities: {
      assess: auditor && item.assignedTo === actor.userId && item.moderatorId !== actor.userId && held.includes(item.status ?? '')
        && Boolean(item.leaseUntil && item.leaseUntil > new Date()),
      adjudicate: canAdjudicate(actor), dispute: item.moderatorId === actor.userId, assign: canAdjudicate(actor),
      recommend: canAdjudicate(actor) || (auditor && item.assessment?.auditorId === actor.userId),
    },
  };
}

async function assign(tx: Db, actor: AnalyticsActor, item: Review, auditorId: string, now: Date) {
  if (item.moderatorId === auditorId) throw new ForbiddenError('Auditors cannot review their own decisions.');
  const staff = await tx.moderator.findFirst({ where: {
    id: auditorId, role: 'QA_REVIEWER', status: 'ACTIVE', organizationId: item.organizationId, lobId: item.lobId,
    organization: { active: true }, lob: { active: true, queueAccess: { some: { queueId: item.queueId, revokedAt: null } } },
  }, select: { id: true } });
  if (!staff) throw new ForbiddenError('The auditor is outside this QA assignment scope.');
  if (item.assessment || !['PENDING', ...held].includes(item.status ?? '')) throw conflict('Only open reviews can be assigned.');
  if (item.assignedTo === auditorId && item.leaseUntil && item.leaseUntil > now) return item;
  if (item.assignedTo && item.leaseUntil && item.leaseUntil <= now) {
    await qaEvent(tx, actor, item.organizationId, item.id, 'ASSIGNMENT_EXPIRED', { assignee: item.assignedTo });
  }
  const result = await tx.qaSample.update({ where: { id: item.id }, data: {
    status: 'ASSIGNED', assignedTo: auditorId, activeReviewer: auditorId,
    assignedAt: now, leaseUntil: new Date(+now + leaseMs), startedAt: null, assignmentVersion: { increment: 1 },
  }, include: detailInclude });
  await qaEvent(tx, actor, item.organizationId, item.id, actor.userId === auditorId ? 'CLAIMED' : 'ASSIGNED', {
    status: result.status, assignee: auditorId, version: result.assignmentVersion,
  }, { status: item.status, assignee: item.assignedTo });
  return result;
}

export async function claimNext(tx: Db, actor: AnalyticsActor) {
  if (!isAuditor(actor)) throw new ForbiddenError();
  await tx.$queryRaw`SELECT id FROM moderators WHERE id = ${actor.userId} FOR UPDATE`;
  const scope = await qaScope(tx, actor);
  const existing = await tx.qaSample.findUnique({ where: { activeReviewer: actor.userId } });
  const now = new Date();
  if (existing && existing.leaseUntil && existing.leaseUntil > now) return scopedReview(tx, actor, existing.id);
  if (existing) {
    const expired = await tx.qaSample.updateMany({ where: {
      id: existing.id, activeReviewer: actor.userId, assignmentVersion: existing.assignmentVersion, leaseUntil: { lte: now },
    }, data: {
      status: 'PENDING', activeReviewer: null, assignedTo: null, leaseUntil: null, startedAt: null,
      assignmentVersion: { increment: 1 },
    } });
    if (expired.count) await qaEvent(tx, actor, existing.organizationId, existing.id, 'ASSIGNMENT_EXPIRED', { status: 'PENDING' });
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await tx.qaSample.findFirst({ where: { AND: [scope, {
      sampledAt: { not: null }, moderatorId: { not: actor.userId },
      OR: [{ status: 'PENDING' }, { status: { in: held }, leaseUntil: { lte: now } }],
    }] }, orderBy: [{ sampledAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    if (!next) return null;
    await tx.$queryRaw`SELECT id FROM qa_sample WHERE id = ${next.id} FOR UPDATE`;
    const item = await tx.qaSample.findFirst({ where: { AND: [scope, { id: next.id }] }, include: detailInclude });
    if (!item) continue;
    if (item.status !== 'PENDING' && (!held.includes(item.status ?? '') || !item.leaseUntil || item.leaseUntil > now)) continue;
    return assign(tx, actor, item, actor.userId, now);
  }
  throw conflict('Other auditors just claimed these reviews. Try again.');
}

export async function reassign(tx: Db, actor: AnalyticsActor, id: string, auditorId: string, version: number) {
  if (!canAdjudicate(actor)) throw new ForbiddenError();
  await tx.$queryRaw`SELECT id FROM moderators WHERE id = ${auditorId} FOR UPDATE`;
  const item = await lockedReview(tx, actor, id);
  if (item.assignedTo === auditorId && item.assignmentVersion === version + 1
      && item.leaseUntil && item.leaseUntil > new Date()) return item;
  if (item.assignmentVersion !== version) throw conflict('A newer assignment is already in place.');
  const busy = await tx.qaSample.findUnique({ where: { activeReviewer: auditorId } });
  if (busy && busy.id !== id) throw conflict('The auditor already has an assigned review.');
  return assign(tx, actor, item, auditorId, new Date());
}

function assertHolder(actor: AnalyticsActor, item: Review, version: number) {
  if (!isAuditor(actor) || item.assignedTo !== actor.userId || item.moderatorId === actor.userId)
    throw new ForbiddenError();
  if (!held.includes(item.status ?? '') || item.assignmentVersion !== version || !item.leaseUntil || item.leaseUntil <= new Date())
    throw conflict('This QA assignment expired or changed. Claim a review again.');
}

export async function startReview(tx: Db, actor: AnalyticsActor, id: string, version: number) {
  const item = await lockedReview(tx, actor, id);
  assertHolder(actor, item, version);
  if (item.status === 'IN_REVIEW') return { startedAt: item.startedAt, leaseUntil: item.leaseUntil };
  const now = new Date();
  const leaseUntil = new Date(+now + leaseMs);
  await tx.qaSample.update({ where: { id }, data: { status: 'IN_REVIEW', startedAt: now, leaseUntil } });
  await qaEvent(tx, actor, item.organizationId, id, 'REVIEW_STARTED', { status: 'IN_REVIEW' }, { status: item.status });
  return { startedAt: now, leaseUntil };
}

export async function releaseReview(tx: Db, actor: AnalyticsActor, id: string, version: number) {
  const item = await lockedReview(tx, actor, id);
  if (item.status === 'PENDING' && item.assignmentVersion === version + 1) return { released: true };
  assertHolder(actor, item, version);
  await tx.qaSample.update({ where: { id }, data: {
    status: 'PENDING', assignedTo: null, activeReviewer: null, leaseUntil: null, startedAt: null,
    assignmentVersion: { increment: 1 },
  } });
  await qaEvent(tx, actor, item.organizationId, id, 'RELEASED', { status: 'PENDING' }, { status: item.status, assignee: actor.userId });
  return { released: true };
}

function score(item: Review, outcome: string) { return outcome === 'PASS' ? item.policy?.passScore ?? 100 : item.policy?.failScore ?? 0; }
export async function submitReview(tx: Db, actor: AnalyticsActor, id: string, version: number, input: z.infer<typeof assessmentInput>) {
  const item = await lockedReview(tx, actor, id);
  const hash = fingerprint(input);
  if (item.assessment?.auditorId === actor.userId && item.assessment.fingerprint === hash)
    return { id: item.assessment.id, outcome: item.assessment.originalOutcome, score: item.assessment.originalScore };
  assertHolder(actor, item, version);
  if (item.assessment || item.status !== 'IN_REVIEW' || !item.startedAt)
    throw conflict('Start reviewing the active assignment before submitting.');
  const now = new Date();
  const points = score(item, input.outcome);
  const assessment = await tx.qaAssessment.create({ data: {
    sampleId: id, auditorId: actor.userId, fingerprint: hash, originalOutcome: input.outcome, originalScore: points,
    finalOutcome: input.outcome, finalScore: points, finalizedAt: now, submittedAt: now,
    handlingSeconds: Math.max(0, Math.round((+now - +item.startedAt) / 1000)), notes: input.notes,
    ...(input.outcome === 'FAIL' ? { category: input.category, severity: input.severity,
      policyReference: input.policyReference, proposedAction: input.proposedAction } : {}),
  } });
  await tx.qaSample.update({ where: { id }, data: { status: 'COMPLETED', activeReviewer: null, leaseUntil: null } });
  await qaEvent(tx, actor, item.organizationId, id, input.outcome, {
    status: 'COMPLETED', assessmentId: assessment.id, outcome: input.outcome, score: points,
  }, { status: item.status });
  return { id: assessment.id, outcome: input.outcome, score: points };
}

export async function openDispute(tx: Db, actor: AnalyticsActor, id: string, reason: string) {
  const item = await lockedReview(tx, actor, id);
  if (actor.userId !== item.moderatorId) throw new ForbiddenError();
  if (item.dispute?.openedBy === actor.userId && item.dispute.reason === reason) return item.dispute;
  if (item.assessment?.finalOutcome !== 'FAIL' || item.dispute || item.correction?.approvedAt)
    throw conflict('Only an uncorrected finalized failure can be disputed.');
  const dispute = await tx.qaDispute.create({ data: { sampleId: id, openedBy: actor.userId, reason, status: 'OPEN' } });
  await tx.qaAssessment.update({ where: { sampleId: id }, data: { finalOutcome: null, finalScore: null, finalizedAt: null } });
  await tx.qaSample.update({ where: { id }, data: { status: 'DISPUTED' } });
  await qaEvent(tx, actor, item.organizationId, id, 'DISPUTE_OPENED', { status: 'DISPUTED', disputeId: dispute.id },
    { status: item.status, finalOutcome: item.assessment.finalOutcome });
  return dispute;
}

export async function adjudicate(tx: Db, actor: AnalyticsActor, disputeId: string, input: z.infer<typeof adjudicationInput>) {
  if (!canAdjudicate(actor)) throw new ForbiddenError();
  const dispute = await tx.qaDispute.findUnique({ where: { id: disputeId }, select: { sampleId: true } });
  if (!dispute) throw missing();
  const item = await lockedReview(tx, actor, dispute.sampleId);
  const assessment = item.assessment;
  const prior = item.dispute;
  if (!assessment || !prior || [item.moderatorId, assessment.auditorId].includes(actor.userId)) throw new ForbiddenError();
  const status = input.action === 'REQUEST_REVIEW' ? 'UNDER_REVIEW' : input.action === 'UPHOLD' ? 'UPHELD' : 'OVERTURNED';
  if (prior.status === status && prior.resolvedBy === actor.userId && prior.resolution === input.reason) return prior;
  if (!['OPEN','UNDER_REVIEW'].includes(prior.status)) throw conflict('The dispute already has a final result.');
  if (status === 'UNDER_REVIEW' && prior.status === status) throw conflict('An additional review was already requested.');
  const now = new Date();
  const result = await tx.qaDispute.update({ where: { id: disputeId }, data: {
    status, resolution: input.reason, resolvedBy: actor.userId, resolvedAt: status === 'UNDER_REVIEW' ? null : now,
  } });
  const final = status === 'UNDER_REVIEW' ? null : input.action === 'UPHOLD' ? assessment.originalOutcome
    : assessment.originalOutcome === 'PASS' ? 'FAIL' : 'PASS';
  if (final) {
    await tx.qaAssessment.update({ where: { sampleId: item.id }, data: { finalOutcome: final, finalScore: score(item, final), finalizedAt: now } });
    await tx.qaSample.update({ where: { id: item.id }, data: { status: 'CLOSED' } });
  }
  await qaEvent(tx, actor, item.organizationId, item.id, 'ADJUDICATED', { status, outcome: final, reason: input.reason },
    { status: prior.status });
  return result;
}
