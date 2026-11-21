import { z } from 'zod';
import { auth } from '../../config/auth';
import { env } from '../../config/env';
import { prisma } from '../../common/database/prisma';
import { currentEvidence, fingerprintReview } from './intelligence.discovery';
import { POLICY_VERSION, reviewDecision } from './intelligence.policy';
import { evaluateRules } from './intelligence.rules';
import { evidenceSchema } from './intelligence.schemas';

export async function authorizeReviewer(token?: string): Promise<string> {
  const allowed = new Set(
    env.PARKING_REVIEW_ADMIN_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  if (
    !token ||
    !allowed.size ||
    !z
      .string()
      .max(2048)
      .regex(/^[A-Za-z0-9._~+/%=-]+$/)
      .safeParse(token).success
  ) {
    throw new Error('Authorized review session required.');
  }
  const session = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${token}` }),
    query: { disableCookieCache: true },
  });
  if (!session || !allowed.has(session.user.id))
    throw new Error('Authorized review session required.');
  return session.user.id;
}

const evidenceImport = z
  .array(
    evidenceSchema
      .omit({ id: true })
      .extend({
        reference: z.string().trim().min(1).max(500),
        expiresAt: z
          .string()
          .datetime()
          .transform((value) => new Date(value)),
      })
      .strict(),
  )
  .min(1)
  .max(12);
const importSchema = z
  .object({
    googlePlaceId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,191}$/)
      .optional(),
    evidence: evidenceImport,
  })
  .strict();
const recordSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    decision: reviewDecision,
    evidenceIds: z
      .array(z.string().uuid())
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length),
    expiresAt: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export class ParkingReviewService {
  private constructor(private readonly reviewerId: string) {}

  static async open(token?: string) {
    return new ParkingReviewService(await authorizeReviewer(token));
  }

  async createCase(payload: unknown) {
    const input = importSchema.parse(payload);
    const now = new Date();
    if (input.evidence.some(({ expiresAt }) => expiresAt <= now))
      throw new Error('Evidence expired.');
    return prisma.parkingIntelligenceCase.create({
      data: {
        googlePlaceId: input.googlePlaceId,
        evidence: { create: input.evidence.map((item) => ({ ...item, approvedAt: now })) },
      },
      select: { id: true, reviewRevision: true },
    });
  }

  async inspect(caseId: string) {
    return prisma.parkingIntelligenceCase.findUniqueOrThrow({
      where: { id: z.string().uuid().parse(caseId) },
      select: {
        id: true,
        googlePlaceId: true,
        reviewRevision: true,
        evidence: currentEvidence(new Date()),
        labels: { where: { revision: { not: null } }, orderBy: { revision: 'desc' }, take: 12 },
        runs: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 12,
          select: {
            id: true,
            status: true,
            outcome: true,
            createdAt: true,
            version: { select: { model: true, promptVersion: true } },
          },
        },
      },
    });
  }

  async reviseEvidence(caseId: string, payload: unknown) {
    const id = z.string().uuid().parse(caseId);
    const input = z
      .object({
        revokeIds: z
          .array(z.string().uuid())
          .max(12)
          .refine((ids) => new Set(ids).size === ids.length),
        add: z.union([z.tuple([]), evidenceImport]),
      })
      .strict()
      .parse(payload);
    const now = new Date();
    if (input.add.some(({ expiresAt }) => expiresAt <= now)) throw new Error('Evidence expired.');
    return prisma.$transaction(
      async (tx) => {
        const parkingCase = await tx.parkingIntelligenceCase.findUniqueOrThrow({ where: { id } });
        const revoked = await tx.parkingEvidenceReference.updateMany({
          where: { caseId: id, id: { in: input.revokeIds }, approvedAt: { not: null } },
          data: { approvedAt: null },
        });
        if (revoked.count !== input.revokeIds.length)
          throw new Error('Unknown evidence reference.');
        const active = await tx.parkingEvidenceReference.count({
          where: { caseId: id, ...currentEvidence(now).where },
        });
        if (active + input.add.length > 12)
          throw new Error('Reconcile active evidence before adding records.');
        if (input.add.length)
          await tx.parkingEvidenceReference.createMany({
            data: input.add.map((item) => ({ ...item, caseId: id, approvedAt: now })),
          });
        return { id: parkingCase.id, reviewRevision: parkingCase.reviewRevision };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async record(caseId: string, payload: unknown) {
    const input = recordSchema.parse(payload);
    const id = z.string().uuid().parse(caseId);
    const now = new Date();
    if (input.expiresAt <= now) throw new Error('Review expiry must be in the future.');
    return prisma.$transaction(
      async (tx) => {
        const updated = await tx.parkingIntelligenceCase.updateMany({
          where: { id, reviewRevision: input.expectedRevision },
          data: { reviewRevision: { increment: 1 } },
        });
        if (!updated.count) throw new Error('The review changed. Inspect again before recording.');
        const records = await tx.parkingEvidenceReference.findMany({
          where: { caseId: id, ...currentEvidence(now).where },
          orderBy: { id: 'asc' },
          take: 13,
        });
        if (records.length > 12) throw new Error('Reconcile current evidence before recording.');
        const selected = records.filter((record) => input.evidenceIds.includes(record.id));
        if (selected.length !== input.evidenceIds.length)
          throw new Error('Reference only active evidence for this case.');
        const asEvidence = (record: (typeof records)[number], index: number) =>
          evidenceSchema.parse({
            source: record.source,
            finding: record.finding,
            id: `E${index + 1}`,
          });
        const rules = evaluateRules(records.map(asEvidence));
        const cited = evaluateRules(selected.map(asEvidence));
        const confirmation =
          input.decision === 'CONFIRM_PARKING'
            ? 'LIKELY_PARKING'
            : input.decision === 'CONFIRM_NON_PARKING'
              ? 'LIKELY_NOT_PARKING'
              : undefined;
        if (
          confirmation &&
          (rules.classification !== confirmation || cited.classification !== confirmation)
        ) {
          throw new Error('Confirmation requires current and consistent independent evidence.');
        }
        const expiry = new Date(
          Math.min(
            input.expiresAt.getTime(),
            ...selected.map(({ expiresAt }) => expiresAt.getTime()),
          ),
        );
        return tx.parkingHumanLabel.create({
          data: {
            caseId: id,
            reviewerId: this.reviewerId,
            revision: input.expectedRevision + 1,
            reviewedAt: now,
            expiresAt: expiry,
            classification: confirmation ?? 'UNCERTAIN',
            access: rules.access,
            pricing: rules.pricing,
            decision: input.decision,
            evidenceReferences: input.evidenceIds,
            evidenceFingerprint: fingerprintReview(records),
            notes: input.reason,
            policyVersion: POLICY_VERSION,
          },
          select: { id: true, revision: true, decision: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
