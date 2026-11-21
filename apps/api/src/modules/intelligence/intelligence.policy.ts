import { z } from 'zod';
import {
  access,
  classification,
  pricing,
  type Classification,
  type Evidence,
} from './intelligence.schemas';
import { hasFinding, type RulesResult } from './intelligence.rules';

export const POLICY_VERSION = 'parking-display-v1';
export const discoveryMode = z.enum(['ALL_CANDIDATES', 'RECOMMENDED', 'VERIFIED_ONLY']);
export type DiscoveryMode = z.infer<typeof discoveryMode>;
export const reviewDecision = z.enum([
  'CONFIRM_PARKING',
  'CONFIRM_NON_PARKING',
  'CONFLICT',
  'NEEDS_EVIDENCE',
]);
export type ReviewDecision = z.infer<typeof reviewDecision>;
export const facilityStatus = z.enum([
  'INDEPENDENTLY_VERIFIED',
  'STRONGLY_SUPPORTED',
  'UNCONFIRMED',
  'CONTRADICTED',
]);
const reasonCode = z.enum([
  'INDEPENDENT_CONFIRMATION',
  'SUPPORTING_OBSERVATIONS',
  'INDEPENDENT_EXCLUSION',
  'EVIDENCE_CONFLICT',
  'EVIDENCE_INSUFFICIENT',
  'REVIEW_REQUIRED',
  'REVIEW_STALE',
  'ACCESS_UNCONFIRMED',
  'ACCESS_RESTRICTED',
  'VERIFICATION_UNAVAILABLE',
]);
export const parkingDecisionSchema = z
  .object({
    facilityStatus,
    displayCategory: facilityStatus,
    access,
    pricing,
    operatingStatus: z.enum(['OPEN', 'CLOSED', 'UNKNOWN']),
    reasonCodes: z.array(reasonCode),
    evidenceLevel: z.enum(['AUTHORITATIVE', 'INDEPENDENTLY_CORROBORATED', 'WEAK', 'INSUFFICIENT']),
    reviewRequired: z.boolean(),
    validUntil: z.string().datetime().optional(),
  })
  .strict();
export type ParkingDecision = z.infer<typeof parkingDecisionSchema>;
export type PolicyReview = ReviewDecision | 'STALE';

interface PolicyInput {
  evidence: Evidence[];
  rules: RulesResult;
  assessment?: Classification;
  review?: PolicyReview;
  requireHumanReview: boolean;
  openingStatus?: 'open' | 'closed' | 'unknown';
  validUntil?: Date;
  unavailable?: boolean;
}

export function decideParking(input: PolicyInput): ParkingDecision {
  const { evidence, rules, review, assessment } = input;
  const reasons: ParkingDecision['reasonCodes'] = [];
  const identityConflict =
    rules.classification === 'UNCERTAIN' &&
    rules.outcomes.some(({ rule }) => rule === 'CONFLICTING_EVIDENCE');
  const conflict = identityConflict || review === 'CONFLICT';
  const held = conflict || review === 'NEEDS_EVIDENCE' || review === 'STALE';
  const independentPositive = rules.classification === 'LIKELY_PARKING';
  const authoritative = evidence.some(
    ({ source, finding }) =>
      source !== 'PRAKARO_AUDIT' &&
      (finding === 'CONFIRMED_PARKING' || finding === 'CONFIRMED_NON_PARKING'),
  );
  const parkingObservations =
    hasFinding(evidence, 'MARKED_PARKING_BAYS') &&
    hasFinding(evidence, 'DEDICATED_PARKING_ENTRANCE') &&
    !hasFinding(evidence, 'NON_PARKING_BUSINESS_ON_SITE') &&
    !hasFinding(evidence, 'NO_PARKING_FOUND_ON_SITE');
  let status: ParkingDecision['facilityStatus'] = 'UNCONFIRMED';
  if (input.unavailable) reasons.push('VERIFICATION_UNAVAILABLE');
  else if (conflict) reasons.push('EVIDENCE_CONFLICT');
  else if (review === 'STALE') reasons.push('REVIEW_STALE');
  else if (review === 'NEEDS_EVIDENCE') reasons.push('REVIEW_REQUIRED');
  else if (
    independentPositive &&
    (review === 'CONFIRM_PARKING' || (!input.requireHumanReview && authoritative && !review))
  ) {
    status = 'INDEPENDENTLY_VERIFIED';
    reasons.push('INDEPENDENT_CONFIRMATION');
  } else if (
    rules.classification === 'LIKELY_NOT_PARKING' &&
    (review === 'CONFIRM_NON_PARKING' || (!input.requireHumanReview && authoritative && !review))
  ) {
    status = 'CONTRADICTED';
    reasons.push('INDEPENDENT_EXCLUSION');
  } else if (
    independentPositive ||
    (assessment === classification.enum.LIKELY_PARKING && parkingObservations)
  ) {
    status = 'STRONGLY_SUPPORTED';
    reasons.push('SUPPORTING_OBSERVATIONS');
  } else {
    reasons.push('EVIDENCE_INSUFFICIENT');
  }
  const accessStatus = review === 'CONFLICT' ? 'UNKNOWN' : rules.access;
  if (accessStatus === 'UNKNOWN') reasons.push('ACCESS_UNCONFIRMED');
  else if (accessStatus !== 'PUBLIC') reasons.push('ACCESS_RESTRICTED');
  const evidenceLevel =
    status === 'INDEPENDENTLY_VERIFIED' || status === 'CONTRADICTED'
      ? authoritative
        ? 'AUTHORITATIVE'
        : 'INDEPENDENTLY_CORROBORATED'
      : status === 'STRONGLY_SUPPORTED'
        ? 'INDEPENDENTLY_CORROBORATED'
        : evidence.length && !held && !input.unavailable
          ? 'WEAK'
          : 'INSUFFICIENT';

  return parkingDecisionSchema.parse({
    facilityStatus: status,
    displayCategory: status,
    access: accessStatus,
    pricing: review === 'CONFLICT' ? 'UNKNOWN' : rules.pricing,
    operatingStatus:
      input.openingStatus === 'open'
        ? 'OPEN'
        : input.openingStatus === 'closed'
          ? 'CLOSED'
          : 'UNKNOWN',
    reasonCodes: reasons,
    evidenceLevel,
    reviewRequired:
      held ||
      rules.needsHumanReview ||
      (status !== 'INDEPENDENTLY_VERIFIED' && status !== 'CONTRADICTED'),
    validUntil: input.validUntil?.toISOString(),
  });
}

const facilityOrder = facilityStatus.options;
export function compareRecommendations(left?: ParkingDecision, right?: ParkingDecision): number {
  const statusDifference =
    facilityOrder.indexOf(left?.facilityStatus ?? 'UNCONFIRMED') -
    facilityOrder.indexOf(right?.facilityStatus ?? 'UNCONFIRMED');
  if (statusDifference) return statusDifference;
  const evidenceOrder: ParkingDecision['evidenceLevel'][] = [
    'AUTHORITATIVE',
    'INDEPENDENTLY_CORROBORATED',
    'WEAK',
    'INSUFFICIENT',
  ];
  const evidenceDifference =
    evidenceOrder.indexOf(left?.evidenceLevel ?? 'INSUFFICIENT') -
    evidenceOrder.indexOf(right?.evidenceLevel ?? 'INSUFFICIENT');
  if (evidenceDifference) return evidenceDifference;
  const accessOrder: ParkingDecision['access'][] = [
    'PUBLIC',
    'UNKNOWN',
    'CUSTOMERS_ONLY',
    'RESTRICTED',
    'PRIVATE',
  ];
  return (
    accessOrder.indexOf(left?.access ?? 'UNKNOWN') - accessOrder.indexOf(right?.access ?? 'UNKNOWN')
  );
}
