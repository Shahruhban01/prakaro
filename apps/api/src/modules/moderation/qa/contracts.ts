import { z } from 'zod';
import { eligibleHandling } from '../handling-metrics';
import { Prisma } from '@prisma/client';

export const uuid = z.string().uuid();
export const reviewParam = z.object({ id: uuid });
export const outcomes = z.enum(['PASS', 'FAIL']);
export const actions = z.enum(['APPROVE', 'REJECT', 'ESCALATE']);
export const category = z.enum([
  'INCORRECT_DECISION', 'MISSING_EVIDENCE', 'INCORRECT_POLICY', 'INCORRECT_TAGS',
  'UNSUPPORTED_VERIFICATION', 'INCOMPLETE_REVIEW', 'OTHER',
]);
export const severity = z.enum(['MINOR', 'MAJOR', 'CRITICAL']);
export const reviewStatus = z.enum(['PENDING','ASSIGNED','IN_REVIEW','COMPLETED','DISPUTED','CLOSED']);
export const reason = z.string().trim().min(3).max(500);
const evidence = z.array(uuid).max(12).refine((ids) => new Set(ids).size === ids.length);
export const policyInput = z.object({
  organizationId: uuid, lobId: uuid.optional(), queueId: uuid.optional(),
  rate: z.number().int().min(0).max(10000), enabled: z.boolean(),
  passScore: z.number().int().min(0).max(100).default(100),
  failScore: z.number().int().min(0).max(100).default(0),
  expectedVersion: z.number().int().nonnegative(),
}).strict().refine((row) => !(row.lobId && row.queueId) && row.passScore >= row.failScore, 'Invalid scope or scoring.');

export const assessmentInput = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('PASS'), notes: reason.optional() }).strict(),
  z.object({ outcome: z.literal('FAIL'), notes: reason, category, severity,
    policyReference: z.string().trim().min(3).max(240), proposedAction: actions.optional() }).strict(),
]);
export const correctionInput = z.object({
  action: actions, reason, evidenceIds: evidence.default([]),
}).strict().refine((row) => row.action === 'APPROVE' ? row.evidenceIds.length > 0 : row.evidenceIds.length === 0,
  'Approval requires current independent evidence. Cite evidence only when confirming parking.');
export const adjudicationInput = z.object({
  action: z.enum(['UPHOLD','OVERTURN','REQUEST_REVIEW']), reason,
}).strict();
export const qaFilters = z.object({
  organizationId: uuid.optional(), lobId: uuid.optional(), queueId: uuid.optional(),
  moderatorId: uuid.optional(), auditorId: uuid.optional(), teamId: uuid.optional(),
  policyVersionId: uuid.optional(),
  status: reviewStatus.optional(), outcome: outcomes.optional(), category: category.optional(),
  severity: severity.optional(), view: z.enum(['all','assigned','available','completed','disputed','corrections']).default('all'),
  from: z.string().date().optional(), to: z.string().date().optional(),
  order: z.enum(['newest','oldest']).default('newest'), page: z.coerce.number().int().min(1).max(5000).default(1),
}).strict().refine(({ from, to }) => !from || !to || from <= to, 'Dates must be in order.');
export type QaFilters = z.infer<typeof qaFilters>;

export const qaEligibility = Prisma.sql`${eligibleHandling}
  AND d.qaEligible = TRUE AND h.isRemoderation = FALSE
  AND a.organizationId = q.organizationId AND a.lobId <> ''`;

export function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator / denominator * 1000) / 10 : null;
}

export function matchesDraw(draw: number, rate: number) {
  return draw >= 0 && draw < rate && draw < 10000;
}
