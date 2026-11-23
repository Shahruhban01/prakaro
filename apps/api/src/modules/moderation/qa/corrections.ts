import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AppError, ForbiddenError } from '../../../common/errors/app-error';
import { publishReview } from '../../intelligence/intelligence.review';
import type { AnalyticsActor } from '../analytics-scope';
import { actions, type correctionInput } from './contracts';
import { canAdjudicate, conflict, fingerprint, isAuditor, lockedReview, missing, type Db, type Review } from './reviews';
import { qaEvent } from './sampling';

type CorrectionInput = z.infer<typeof correctionInput>;
const reviewLeaseMs = 30 * 60 * 1000;
const expiryMs = 30 * 86400000;

function independent(actor: AnalyticsActor, item: Review) {
  if (!canAdjudicate(actor) || actor.userId === item.moderatorId || actor.userId === item.assessment?.auditorId)
    throw new ForbiddenError('Correction approval requires an independent supervisor.');
}

export async function requestCorrection(tx: Db, actor: AnalyticsActor, id: string, input: CorrectionInput) {
  const item = await lockedReview(tx, actor, id);
  if (actor.userId === item.moderatorId || (!canAdjudicate(actor) &&
      (!isAuditor(actor) || item.assessment?.auditorId !== actor.userId))) throw new ForbiddenError();
  const prior = item.correction;
  if (prior && prior.action === input.action && prior.reason === input.reason &&
      fingerprint({ ids: prior.evidenceIds }) === fingerprint({ ids: input.evidenceIds })) return prior;
  if (prior) throw conflict('A correction already exists for this QA review.');
  if (item.assessment?.finalOutcome !== 'FAIL' || !item.decision.effective)
    throw conflict('A finalized QA failure and its effective decision are required.');
  const correction = await tx.qaCorrection.create({ data: {
    sampleId: id, expectedRevision: item.decision.case.revision, requestedBy: actor.userId,
    action: input.action, reason: input.reason, evidenceIds: input.evidenceIds,
  } });
  await qaEvent(tx, actor, item.organizationId, id, 'CORRECTION_RECOMMENDED', {
    correctionId: correction.id, action: correction.action, reason: correction.reason,
  });
  return correction;
}

export async function startCorrection(tx: Db, actor: AnalyticsActor, correctionId: string) {
  const found = await tx.qaCorrection.findUnique({ where: { id: correctionId }, select: { sampleId: true } });
  if (!found) throw missing();
  const item = await lockedReview(tx, actor, found.sampleId);
  independent(actor, item);
  const correction = item.correction;
  if (!correction || correction.approvedAt || item.assessment?.finalOutcome !== 'FAIL')
    throw conflict('This correction is unavailable.');
  const now = new Date();
  if (correction.leaseUntil && correction.leaseUntil > now) {
    if (correction.reviewerId === actor.userId) return correction;
    throw conflict('Another supervisor is working on this correction.');
  }
  const row = await tx.qaCorrection.update({ where: { id: correctionId }, data: {
    reviewerId: actor.userId, startedAt: now, leaseUntil: new Date(+now + reviewLeaseMs),
  } });
  await qaEvent(tx, actor, item.organizationId, item.id, 'CORRECTION_STARTED', { correctionId });
  return row;
}

export async function approveCorrection(tx: Db, actor: AnalyticsActor, correctionId: string) {
  const found = await tx.qaCorrection.findUnique({ where: { id: correctionId }, select: { sampleId: true } });
  if (!found) throw missing();
  const item = await lockedReview(tx, actor, found.sampleId);
  independent(actor, item);
  const correction = item.correction;
  if (!correction) throw missing();
  if (correction.approvedAt) return correction;
  const now = new Date();
  if (item.assessment?.finalOutcome !== 'FAIL' || correction.reviewerId !== actor.userId ||
      !correction.startedAt || !correction.leaseUntil || correction.leaseUntil <= now)
    throw conflict('Start a current correction review before approving.');
  const caseId = item.decision.case.id;
  await tx.$queryRaw`SELECT id FROM moderation_case WHERE id = ${caseId} FOR UPDATE`;
  const original = await tx.moderationDecisionVersion.findFirst({
    where: { caseId, effective: true }, orderBy: { version: 'desc' },
  });
  const candidate = await tx.moderationCase.findUniqueOrThrow({ where: { id: caseId } });
  if (original?.id !== item.decisionId || candidate.revision !== correction.expectedRevision ||
      !['APPROVED','REJECTED','ESCALATED'].includes(candidate.status))
    throw conflict('The original decision was superseded or the case is currently being worked.');

  const action = actions.parse(correction.action);
  const facility = await tx.parkingIntelligenceCase.findUniqueOrThrow({ where: { id: candidate.facilityId } });
  if (original.action === 'APPROVE' || action === 'APPROVE') {
    const label = await tx.parkingHumanLabel.findFirst({
      where: { caseId: facility.id, revision: { not: null } }, orderBy: { revision: 'desc' },
      select: { id: true, reviewedAt: true },
    });
    if (original.action === 'APPROVE' && (!original.publicationLabelId || label?.id !== original.publicationLabelId))
      throw conflict('The original publication is unavailable or a newer verification exists.');
    if (original.action !== 'APPROVE' && label && label.reviewedAt >= original.createdAt)
      throw conflict('A newer verification already covers this facility.');
  }
  let publicationLabelId: string | null = null;
  if (action === 'APPROVE' || original.action === 'APPROVE') {
    try {
      const publication = await publishReview(tx, actor.userId, facility.id, {
        expectedRevision: facility.reviewRevision,
        decision: action === 'APPROVE' ? 'CONFIRM_PARKING' : 'NEEDS_EVIDENCE',
        evidenceIds: correction.evidenceIds,
        expiresAt: new Date(+now + expiryMs).toISOString(),
        reason: correction.reason,
      });
      publicationLabelId = publication.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      throw new AppError(422, 'QA_PUBLICATION_UNSUPPORTED', 'Publication requires current, independent evidence and an unchanged verification revision.');
    }
  }
  const nextStatus = { APPROVE: 'APPROVED', REJECT: 'REJECTED', ESCALATE: 'ESCALATED' }[action];
  const newest = await tx.moderationDecisionVersion.findFirst({ where: { caseId }, orderBy: { version: 'desc' }, select: { version: true } });
  const version = await tx.moderationDecisionVersion.create({ data: {
    caseId, moderatorId: actor.superAdmin ? original.moderatorId : actor.userId,
    version: (newest?.version ?? original.version) + 1, action, reason: correction.reason,
    evidenceIds: correction.evidenceIds as Prisma.InputJsonValue, answers: { qaCorrectionId: correction.id },
    policyVersion: original.policyVersion, effective: true, qaEligible: false, publicationLabelId,
    pinnedPolicyId: original.pinnedPolicyId,
  } });
  await tx.moderationDecisionVersion.update({ where: { id: original.id }, data: { effective: false } });
  await tx.moderationCase.update({ where: { id: caseId }, data: {
    status: nextStatus, owner: null, leaseUntil: null, revision: { increment: 1 },
    ...(nextStatus === 'ESCALATED' ? {} : { activeKey: null }),
  } });
  const completed = await tx.qaCorrection.update({ where: { id: correctionId }, data: {
    approvedAt: now, leaseUntil: null, resultDecisionId: version.id, publicationLabelId,
    handlingSeconds: Math.max(0, Math.round((+now - +correction.startedAt) / 1000)),
  } });
  await tx.qaSample.update({ where: { id: item.id }, data: { status: 'CLOSED' } });
  await qaEvent(tx, actor, item.organizationId, item.id, 'CORRECTION_APPROVED', {
    correctionId, originalDecisionId: original.id, decisionId: version.id, status: nextStatus,
  }, { status: candidate.status });
  if (publicationLabelId) await qaEvent(tx, actor, item.organizationId, item.id, 'CORRECTION_PUBLISHED', {
    correctionId, decisionId: version.id, publicationLabelId,
  });
  await qaEvent(tx, actor, item.organizationId, item.id, 'CLOSED', { status: 'CLOSED' });
  return completed;
}
