import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { AppError, ForbiddenError } from '../../common/errors/app-error';
import { lockAttendanceEmployee, requireModeratingAux, type AttendanceIdentity } from './attendance';
import { question, validateAnswers } from './config';
import { z } from 'zod';
import { publishReview } from '../intelligence/intelligence.review';
import { scopedHandling } from './handling-metrics';
import { policyDocument, policySelect, reporterExplanation, validatePolicyDecision } from './policy/contracts';
import { resolvePolicy } from './policy/service';
import { source } from '../intelligence/intelligence.schemas';

type Tx = Prisma.TransactionClient;

export const LEASE_DURATION_SECONDS = 300; // 5 minutes

export type SubmitDecisionPayload = {
  action: 'APPROVE' | 'REJECT' | 'ESCALATE';
  reason: string;
  evidenceIds?: string[];
  answers?: Record<string, unknown>;
  tagIds?: string[];
  policyVersionId?: string;
};

export const caseInclude = {
  admission: {
    include: {
      facility: {
        select: {
          id: true,
          reviewRevision: true,
          displayName: true,
          formattedAddress: true,
          googlePlaceId: true,
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
  tasks: {
    include: {
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
} as const;

export const reservationInclude = { case: { include: caseInclude }, pinnedPolicy: { select: policySelect } } as const;

const savedForm = z.union([
  z.object({ form: z.array(question), reviewPolicy: z.string().optional() }),
  z.array(question).transform((form) => ({ form, reviewPolicy: undefined })),
  z.object({}).strict().transform(() => ({ form: [], reviewPolicy: undefined })),
]);

export function readContinuousForm(snapshot: Prisma.JsonValue) {
  const parsed = savedForm.safeParse(snapshot);
  if (!parsed.success)
    throw new AppError(409, 'INVALID_REVIEW_FORM', 'The saved queue form is unavailable.');
  return parsed.data;
}

export async function expireStaleReservations(tx: Tx, now: Date) {
  const expired = await tx.moderationCaseReservation.findMany({
    where: {
      status: 'ACTIVE',
      leaseExpiresAt: { lte: now },
    },
    select: { id: true, caseId: true },
  });

  if (expired.length === 0) return 0;

  let count = 0;
  for (const item of expired) {
    const expiredLease = await tx.moderationCaseReservation.updateMany({
      where: { id: item.id, status: 'ACTIVE', leaseExpiresAt: { lte: now } },
      data: {
        status: 'EXPIRED', activeCaseKey: null, activeModeratorKey: null,
        releasedAt: now, releaseReason: 'LEASE_EXPIRED',
      },
    });
    if (!expiredLease.count) continue;
    count++;
    await tx.moderationCase.updateMany({
      where: { id: item.caseId, status: 'IN_REVIEW' },
      data: { status: 'QUEUED', owner: null, leaseUntil: null },
    });
  }
  return count;
}

export async function requireContinuousQueue(tx: Tx, moderatorId: string, queueId: string) {
  const mod = await tx.moderator.findUnique({
    where: { id: moderatorId },
    include: { organization: true, lob: true },
  });

  if (
    !mod ||
    mod.status !== 'ACTIVE' ||
    !mod.organization?.active ||
    !mod.lob?.active ||
    mod.lob.organizationId !== mod.organizationId
  ) {
    throw new ForbiddenError('Moderator account is inactive or not assigned to an active LOB.');
  }

  // Verify LOB access to queue
  const lobAccess = await tx.queueLobAccess.findFirst({
    where: {
      queueId,
      lobId: mod.lobId!,
      revokedAt: null,
      organizationId: mod.organization.id,
      queue: { organizationId: mod.organization.id },
    },
    select: { queue: { select: { status: true } } },
  });
  if (!lobAccess) {
    throw new ForbiddenError('Your line of business does not have access to this queue.');
  }
  if (lobAccess.queue.status !== 'ACTIVE')
    throw new AppError(409, 'QUEUE_UNAVAILABLE', 'The moderation queue is unavailable.');

  // Verify subscription
  const subscription = await tx.queueSubscription.findFirst({
    where: {
      queueId,
      moderatorId,
      unsubscribedAt: null,
    },
  });
  if (!subscription) {
    throw new ForbiddenError('You must subscribe to this queue before starting moderation.');
  }
}

export async function startWorkSession(tx: Tx, identity: AttendanceIdentity, queueId: string) {
  const { moderatorId } = identity;
  await lockAttendanceEmployee(tx, moderatorId);
  const now = new Date();
  const attendanceSessionId = await requireModeratingAux(tx, identity, now);
  await requireContinuousQueue(tx, moderatorId, queueId);

  await expireStaleReservations(tx, now);

  // Check for existing active session
  const existingSession = await tx.moderationWorkSession.findFirst({
    where: { moderatorId, status: 'ACTIVE' },
  });

  if (existingSession) {
    if (existingSession.queueId !== queueId) {
      throw new AppError(
        409,
        'ACTIVE_SESSION_EXISTS',
        'You already have an active work session in another queue. Leave that session first.',
      );
    }
    if (existingSession.attendanceSessionId !== attendanceSessionId)
      throw new AppError(409, 'INVALID_SESSION', 'The previous moderation session must be ended.');
    await tx.moderationWorkSession.update({
      where: { id: existingSession.id },
      data: { lastActivityAt: now },
    });
    return { session: existingSession, isExisting: true };
  }

  const session = await tx.moderationWorkSession.create({
    data: {
      moderatorId,
      queueId,
      attendanceSessionId,
      activeKey: moderatorId,
      status: 'ACTIVE',
      startedAt: now,
      lastActivityAt: now,
    },
  });

  return { session, isExisting: false };
}

export async function allocateRandomPendingCase(
  tx: Tx,
  queueId: string,
  moderatorId: string,
  sessionId: string,
  now: Date = new Date(),
) {
  // Check if moderator already holds an active reservation
  const existingRes = await tx.moderationCaseReservation.findFirst({
    where: {
      moderatorId,
      status: 'ACTIVE',
      leaseExpiresAt: { gt: now },
    },
    include: reservationInclude,
  });

  if (existingRes) {
    return existingRes;
  }

  await expireStaleReservations(tx, now);

  for (let attempt = 0; attempt < 8; attempt++) {
    // Query eligible pending cases for this queue
    const eligibleCases = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM moderation_case c
      JOIN moderation_task t ON t.caseId = c.id
      WHERE t.queueId = ${queueId}
        AND c.status = 'QUEUED'
        AND c.activeKey IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM moderation_case_reservation r
          WHERE r.caseId = c.id
            AND r.status = 'ACTIVE'
            AND r.leaseExpiresAt > ${now}
        )
        AND (c.leaseUntil IS NULL OR c.leaseUntil <= ${now})
      ORDER BY c.id
    `);

    if (!eligibleCases.length) {
      return null;
    }

    // Uniform random selection across eligible cases
    const randomIndex = crypto.randomInt(0, eligibleCases.length);
    const selectedCaseId = eligibleCases[randomIndex]!.id;

    // Lock selected row
    const lockedCase = await tx.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
      SELECT id, status FROM moderation_case WHERE id = ${selectedCaseId} FOR UPDATE
    `);

    if (!lockedCase[0] || lockedCase[0].status !== 'QUEUED') {
      continue;
    }

    const leaseExpiresAt = new Date(+now + LEASE_DURATION_SECONDS * 1000);
    const work = await tx.moderationWorkSession.findUniqueOrThrow({ where: { id: sessionId },
      select: { attendanceSession: { select: { organizationId: true, lobId: true } } } });
    const attribution = work.attendanceSession;
    const pinnedPolicyId = attribution?.organizationId && attribution.lobId
      ? await resolvePolicy(tx, attribution.organizationId, attribution.lobId, queueId, now) : null;

    try {
      const reservation = await tx.moderationCaseReservation.create({
        data: {
          caseId: selectedCaseId,
          moderatorId,
          sessionId,
          queueId,
          status: 'ACTIVE',
          activeCaseKey: selectedCaseId,
          activeModeratorKey: moderatorId,
          reservedAt: now,
          leaseExpiresAt,
          pinnedPolicyId,
        },
      });

      await tx.moderationCase.update({
        where: { id: selectedCaseId },
        data: {
          status: 'IN_REVIEW',
          owner: moderatorId,
          leaseUntil: leaseExpiresAt,
        },
      });

      await tx.moderationWorkSession.update({
        where: { id: sessionId },
        data: { lastActivityAt: now },
      });

      return await tx.moderationCaseReservation.findUnique({
        where: { id: reservation.id },
        include: reservationInclude,
      });
    } catch {
      continue;
    }
  }

  return null;
}

export async function heartbeatReservation(
  tx: Tx,
  reservationId: string,
  identity: AttendanceIdentity,
) {
  const { moderatorId } = identity;
  await lockAttendanceEmployee(tx, moderatorId);
  const now = new Date();
  const reservation = await tx.moderationCaseReservation.findFirst({
    where: {
      id: reservationId,
      moderatorId,
      status: 'ACTIVE',
    },
    include: { session: true },
  });

  if (!reservation || reservation.leaseExpiresAt <= now) {
    throw new AppError(409, 'RESERVATION_EXPIRED', 'Reservation lease has expired or is invalid.');
  }
  await requireContinuousQueue(tx, moderatorId, reservation.queueId);
  const attendanceId = await requireModeratingAux(tx, identity, now);
  if (reservation.session.status !== 'ACTIVE' || reservation.session.attendanceSessionId !== attendanceId)
    throw new AppError(409, 'INVALID_SESSION', 'The moderation session is no longer active.');

  const leaseExpiresAt = new Date(+now + LEASE_DURATION_SECONDS * 1000);

  const renewed = await tx.moderationCaseReservation.updateMany({
    where: { id: reservationId, status: 'ACTIVE', leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt },
  });
  if (!renewed.count) throw new AppError(409, 'RESERVATION_EXPIRED', 'Reservation lease expired.');

  await tx.moderationCase.update({
    where: { id: reservation.caseId },
    data: { leaseUntil: leaseExpiresAt },
  });

  await tx.moderationWorkSession.update({
    where: { id: reservation.sessionId },
    data: { lastActivityAt: now },
  });

  return { ok: true, leaseExpiresAt, serverTime: new Date() };
}

export async function submitReservation(
  tx: Tx,
  reservationId: string,
  identity: AttendanceIdentity,
  payload: SubmitDecisionPayload,
  isSubmitAndLeave: boolean = false,
) {
  const { moderatorId } = identity;
  await lockAttendanceEmployee(tx, moderatorId);
  const now = new Date();

  const reservation = await tx.moderationCaseReservation.findUnique({
    where: { id: reservationId },
    include: {
      session: true,
      ...reservationInclude,
    },
  });

  if (!reservation || reservation.moderatorId !== moderatorId) {
    throw new AppError(409, 'INVALID_RESERVATION', 'No active reservation found.');
  }
  await requireContinuousQueue(tx, moderatorId, reservation.queueId);
  const attendanceId = await requireModeratingAux(tx, identity, now);
  if (reservation.session.attendanceSessionId !== attendanceId)
    throw new AppError(409, 'INVALID_SESSION', 'The moderation session is no longer active.');

  const evidenceIds = [...new Set(payload.evidenceIds ?? [])].sort();
  const rawTags = payload.tagIds ?? [];
  const tagIds = [...rawTags].sort();
  const answers = payload.answers ?? {};
  if ((payload.policyVersionId ?? null) !== reservation.pinnedPolicyId)
    throw new AppError(409, 'PINNED_POLICY_MISMATCH', 'Reload the case using its assigned policy version.');
  if (rawTags.length !== new Set(rawTags).size || (!reservation.pinnedPolicyId && rawTags.length))
    throw new AppError(422, 'INVALID_POLICY_TAGS', 'Choose distinct tags from this case’s assigned policy.');
  if (reservation.status === 'COMPLETED') {
    // The reservation is the durable idempotency key. Retry only the same decision.
    const record = await tx.caseHandlingRecord.findUnique({
      where: { reservationId },
      include: { decisionVersion: true },
    });
    const prior = record?.decisionVersion;
    if (record && prior && record.isSubmitAndLeave === isSubmitAndLeave &&
      prior.action === payload.action && prior.reason === payload.reason.trim() &&
      isDeepStrictEqual(prior.evidenceIds, evidenceIds) && isDeepStrictEqual(prior.answers, answers) &&
      isDeepStrictEqual(prior.policyTags ?? [], tagIds)) {
      const nextReservation = await tx.moderationCaseReservation.findFirst({
        where: { sessionId: reservation.sessionId, status: 'ACTIVE', leaseExpiresAt: { gt: now } },
        include: reservationInclude,
      });
      return {
        completed: true, durationSeconds: record.durationSeconds, handlingRecordId: record.id,
        decisionVersionId: prior.id, sessionEnded: reservation.session.status !== 'ACTIVE',
        casesCompleted: reservation.session.casesCompleted, nextReservation,
        emptyQueue: !nextReservation, serverTime: new Date(),
      };
    }
    throw new AppError(409, 'DECISION_ALREADY_SUBMITTED', 'This case already has a submitted decision.');
  }
  if (reservation.status !== 'ACTIVE' || reservation.session.status !== 'ACTIVE')
    throw new AppError(409, 'INVALID_RESERVATION', 'No active reservation found.');

  if (reservation.leaseExpiresAt <= now) {
    throw new AppError(409, 'LEASE_EXPIRED', 'Case reservation lease expired before submission.');
  }

  if (!['APPROVE', 'REJECT', 'ESCALATE'].includes(payload.action)) {
    throw new AppError(400, 'INVALID_ACTION', 'Decision action must be APPROVE, REJECT, or ESCALATE.');
  }

  if (!payload.reason || typeof payload.reason !== 'string' || payload.reason.trim().length < 3) {
    throw new AppError(400, 'INVALID_REASON', 'A decision reason of at least 3 characters is required.');
  }

  const task = reservation.case.tasks.find(({ queueId }) => queueId === reservation.queueId);
  if (!task) throw new AppError(409, 'INVALID_REVIEW_FORM', 'The case is no longer in this queue.');
  const { form, reviewPolicy } = reservation.pinnedPolicy ? { form: [], reviewPolicy: undefined } : readContinuousForm(task.form);
  const facility = reservation.case.admission.facility;
  const activeEvidence = facility.evidence.filter(
    (item) => item.approvedAt && item.approvedAt <= now && item.expiresAt > now,
  );
  if (evidenceIds.some((id) => !activeEvidence.some((item) => item.id === id)))
    throw new AppError(422, 'INVALID_EVIDENCE', 'Select only current evidence from this case.');
  const pinned = reservation.pinnedPolicy && policyDocument.safeParse(reservation.pinnedPolicy.document);
  if (pinned && !pinned.success)
    throw new AppError(409, 'INVALID_REVIEW_FORM', 'The pinned policy is unavailable.');
  if (pinned) {
    const independentIds = activeEvidence.filter((item) => evidenceIds.includes(item.id) && source.safeParse(item.source).success)
      .map(({ id }) => id);
    const errors = validatePolicyDecision(pinned.data, payload.action, answers, tagIds, independentIds,
      reservation.case.trigger === 'REPORT' && reporterExplanation(reservation.case.metadata));
    if (Object.keys(errors).length)
      throw new AppError(422, 'INVALID_POLICY_DECISION', Object.values(errors)[0] ?? 'Review the pinned policy requirements.');
  } else if (!validateAnswers(form, answers, evidenceIds))
    throw new AppError(422, 'INVALID_REVIEW_ANSWERS', 'Review the required fields and permitted choices.');

  const completedAt = new Date();
  const claimed = await tx.moderationCaseReservation.updateMany({
    where: { id: reservation.id, status: 'ACTIVE', leaseExpiresAt: { gt: completedAt } },
    data: { status: 'COMPLETED', activeCaseKey: null, activeModeratorKey: null },
  });
  if (!claimed.count) throw new AppError(409, 'LEASE_EXPIRED', 'Case reservation expired before submission.');

  let publicationLabelId: string | null = null;
  if (payload.action === 'APPROVE') {
    if (!evidenceIds.length)
      throw new AppError(422, 'EVIDENCE_REQUIRED', 'Approval requires current independent evidence.');
    try {
      const publication = await publishReview(tx, moderatorId, facility.id, {
        expectedRevision: facility.reviewRevision,
        decision: 'CONFIRM_PARKING',
        evidenceIds,
        expiresAt: new Date(Math.min(...activeEvidence.filter((item) =>
          evidenceIds.includes(item.id)).map(({ expiresAt }) => +expiresAt))).toISOString(),
        reason: payload.reason.trim(),
      });
      publicationLabelId = publication.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      throw new AppError(422, 'UNSUPPORTED_APPROVAL', 'Approval requires current, consistent evidence supporting a parking facility.');
    }
  }

  const durationSeconds = Math.max(1, Math.round((+completedAt - +reservation.reservedAt) / 1000));

  const priorVersions = await tx.moderationDecisionVersion.count({
    where: { caseId: reservation.caseId },
  });

  const decisionVersion = await tx.moderationDecisionVersion.create({
    data: {
      caseId: reservation.caseId,
      version: priorVersions + 1,
      moderatorId,
      action: payload.action,
      reason: payload.reason.trim(),
      evidenceIds,
      answers: answers as Prisma.InputJsonValue,
      policyVersion: task.queueVersion,
      effective: true,
      qaEligible: true,
      publicationLabelId,
      pinnedPolicyId: reservation.pinnedPolicyId,
      ...(pinned ? { policyTags: tagIds } : {}),
      qaSnapshot: {
        facilityId: facility.id, queueVersion: task.queueVersion, form, reviewPolicy: reviewPolicy ?? null,
        evidence: activeEvidence.sort((a, b) => Number(evidenceIds.includes(b.id)) - Number(evidenceIds.includes(a.id)))
          .slice(0, 12).map(({ id, source, finding, reference, expiresAt }) =>
          ({ id, source, finding, reference, expiresAt: expiresAt.toISOString(), cited: evidenceIds.includes(id) })),
        truncated: activeEvidence.length > 12,
        publication: publicationLabelId ? 'CONFIRM_PARKING' : null,
      },
      createdAt: completedAt,
    },
  });

  const handlingRecord = await tx.caseHandlingRecord.create({
    data: {
      caseId: reservation.caseId,
      moderatorId,
      queueId: reservation.queueId,
      sessionId: reservation.sessionId,
      reservationId: reservation.id,
      decisionVersionId: decisionVersion.id,
      startedAt: reservation.reservedAt,
      submittedAt: completedAt,
      durationSeconds,
      action: payload.action,
      isSubmitAndLeave,
      isRemoderation: false,
    },
  });

  const nextStatus =
    payload.action === 'APPROVE' ? 'APPROVED' : payload.action === 'REJECT' ? 'REJECTED' : 'ESCALATED';

  await tx.moderationCase.update({
    where: { id: reservation.caseId },
    data: {
      status: nextStatus,
      owner: null,
      leaseUntil: null,
      revision: { increment: 1 },
      ...(nextStatus !== 'ESCALATED' ? { activeKey: null } : {}),
    },
  });

  if (payload.action === 'APPROVE') {
    await tx.moderationAudit.create({
      data: {
        actor: moderatorId,
        actorType: 'MODERATOR',
        actorId: moderatorId,
        action: 'PUBLISH',
        target: reservation.caseId,
        after: { status: 'APPROVED', decisionVersionId: decisionVersion.id },
      },
    });
  }

  await tx.moderationAudit.create({
    data: {
      actor: moderatorId,
      actorType: 'MODERATOR',
      actorId: moderatorId,
      action: 'MODERATOR_SUBMIT',
      target: reservation.caseId,
      after: {
        action: payload.action,
        durationSeconds,
        decisionVersionId: decisionVersion.id,
        isSubmitAndLeave,
      },
    },
  });

  if (isSubmitAndLeave) {
    await tx.moderationWorkSession.update({
      where: { id: reservation.sessionId },
      data: {
        casesCompleted: { increment: 1 },
        submitAndLeaveCount: { increment: 1 },
        lastActivityAt: now,
        status: 'ENDED',
        endedAt: now,
        endReason: 'USER_SUBMIT_AND_LEAVE',
        activeKey: null,
      },
    });

    return {
      completed: true,
      durationSeconds,
      handlingRecordId: handlingRecord.id,
      decisionVersionId: decisionVersion.id,
      sessionEnded: true,
      casesCompleted: reservation.session.casesCompleted + 1,
      nextReservation: null,
      emptyQueue: false,
      serverTime: new Date(),
    };
  } else {
    await tx.moderationWorkSession.update({
      where: { id: reservation.sessionId },
      data: {
        casesCompleted: { increment: 1 },
        lastActivityAt: now,
      },
    });

    // Auto-next: allocate next random case
    let nextReservation = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      nextReservation = await allocateRandomPendingCase(
        tx,
        reservation.queueId,
        moderatorId,
        reservation.sessionId,
        new Date(),
      );
      if (nextReservation) break;
    }

    return {
      completed: true,
      durationSeconds,
      handlingRecordId: handlingRecord.id,
      decisionVersionId: decisionVersion.id,
      sessionEnded: false,
      casesCompleted: reservation.session.casesCompleted + 1,
      nextReservation,
      emptyQueue: !nextReservation,
      serverTime: new Date(),
    };
  }
}

export async function releaseReservation(
  tx: Tx,
  reservationId: string,
  moderatorId: string,
  reason: string = 'USER_RELEASE',
  now: Date = new Date(),
) {
  const reservation = await tx.moderationCaseReservation.findFirst({
    where: {
      id: reservationId,
      moderatorId,
      status: 'ACTIVE',
    },
  });

  if (!reservation) {
    throw new AppError(404, 'NOT_FOUND', 'Active reservation not found.');
  }

  await tx.moderationCaseReservation.update({
    where: { id: reservationId },
    data: {
      status: 'RELEASED',
      activeCaseKey: null,
      activeModeratorKey: null,
      releasedAt: now,
      releaseReason: reason,
    },
  });

  await tx.moderationCase.update({
    where: { id: reservation.caseId },
    data: {
      status: 'QUEUED',
      owner: null,
      leaseUntil: null,
    },
  });

  await tx.moderationWorkSession.update({
    where: { id: reservation.sessionId },
    data: { lastActivityAt: now },
  });

  await tx.moderationAudit.create({
    data: {
      actor: moderatorId,
      actorType: 'MODERATOR',
      actorId: moderatorId,
      action: 'CASE_RELEASED',
      target: reservation.caseId,
      after: { reason },
    },
  });

  return { ok: true, released: true };
}

export async function leaveWorkSession(
  tx: Tx,
  sessionId: string,
  moderatorId: string,
  reason: string = 'USER_LEAVE',
  now: Date = new Date(),
) {
  const session = await tx.moderationWorkSession.findFirst({
    where: {
      id: sessionId,
      moderatorId,
      status: 'ACTIVE',
    },
  });

  if (!session) {
    return { ok: true, sessionEnded: true };
  }

  // Release any active reservation
  const activeReservation = await tx.moderationCaseReservation.findFirst({
    where: {
      sessionId: session.id,
      moderatorId,
      status: 'ACTIVE',
    },
  });

  if (activeReservation) {
    await releaseReservation(tx, activeReservation.id, moderatorId, reason, now);
  }

  await tx.moderationWorkSession.update({
    where: { id: session.id },
    data: {
      status: 'ENDED',
      endedAt: now,
      endReason: reason,
      activeKey: null,
      lastActivityAt: now,
    },
  });

  return { ok: true, sessionEnded: true };
}

export async function calculateQueueAht(tx: Tx, queueId: string): Promise<number | null> {
  return (await scopedHandling(tx, Prisma.sql`h.queueId = ${queueId}`)).ahtSeconds;
}

export async function calculateModeratorMetrics(
  tx: Tx,
  moderatorId: string,
  queueId?: string,
) {
  const queueClause = queueId ? Prisma.sql`AND h.queueId = ${queueId}` : Prisma.empty;
  const result = await scopedHandling(tx, Prisma.sql`h.moderatorId = ${moderatorId} ${queueClause}`);
  const { completed: total, submitAndLeave: leaveCount, ahtSeconds } = result;

  return {
    casesCompleted: total,
    submitAndLeaveCount: leaveCount,
    submitAndLeaveRate: total > 0 ? Number((leaveCount / total).toFixed(4)) : 0,
    ahtSeconds,
  };
}
