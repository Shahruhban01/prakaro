import type { AiOutput, Classification, Evidence } from './intelligence.schemas';

export const RULES_VERSION = 'parking-rules-v1';

export interface RuleOutcome {
  rule: string;
  outcome: 'SUPPORTING' | 'SUSPICIOUS' | 'INFORMATIONAL';
  reason: string;
}

export interface RulesResult {
  classification: Classification;
  access: AiOutput['access'];
  pricing: AiOutput['pricing'];
  operatingInformation: AiOutput['operatingInformation'];
  needsHumanReview: boolean;
  outcomes: RuleOutcome[];
}

export interface ProviderSignals {
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  parkingOption?: boolean;
  duplicate?: boolean;
}

const accessFindings = {
  PUBLIC: 'PUBLIC_ACCESS',
  PRIVATE: 'PRIVATE_ACCESS',
  CUSTOMERS_ONLY: 'CUSTOMERS_ONLY_ACCESS',
  RESTRICTED: 'RESTRICTED_ACCESS',
} as const;
const pricingFindings = { FREE: 'FREE_PARKING', PAID: 'PAID_PARKING' } as const;
const hoursFindings = {
  PUBLISHED_HOURS_AVAILABLE: 'PUBLISHED_HOURS',
  NO_PUBLISHED_HOURS: 'NO_PUBLISHED_HOURS',
} as const;

export function hasFinding(evidence: Evidence[], finding: Evidence['finding']): boolean {
  return evidence.some((item) => item.finding === finding);
}

export function warrantsGemini(result: RulesResult, evidence: Evidence[]): boolean {
  return (
    result.classification === 'UNCERTAIN' &&
    !result.outcomes.some(({ rule }) => rule === 'CONFLICTING_EVIDENCE') &&
    evidence.some(
      ({ finding }) =>
        finding === 'MARKED_PARKING_BAYS' ||
        finding === 'DEDICATED_PARKING_ENTRANCE' ||
        finding === 'NON_PARKING_BUSINESS_ON_SITE' ||
        finding === 'NO_PARKING_FOUND_ON_SITE',
    )
  );
}

function resolveAttribute<T extends string>(
  evidence: Evidence[],
  findings: Record<T, Evidence['finding']>,
): { value: T | 'UNKNOWN'; conflict: boolean } {
  const matches = (Object.keys(findings) as T[]).filter((value) =>
    hasFinding(evidence, findings[value]),
  );
  return {
    value: matches.length === 1 ? (matches[0] ?? 'UNKNOWN') : 'UNKNOWN',
    conflict: matches.length > 1,
  };
}

export function evaluateRules(evidence: Evidence[], provider: ProviderSignals = {}): RulesResult {
  const outcomes: RuleOutcome[] = [];
  const parking = hasFinding(evidence, 'CONFIRMED_PARKING');
  const exclusion = hasFinding(evidence, 'CONFIRMED_NON_PARKING');
  if (parking)
    outcomes.push({
      rule: 'INDEPENDENT_CONFIRMATION',
      outcome: 'SUPPORTING',
      reason: 'A reviewed independent record confirms a parking facility.',
    });
  if (exclusion)
    outcomes.push({
      rule: 'INDEPENDENT_EXCLUSION',
      outcome: 'SUSPICIOUS',
      reason: 'A reviewed independent record identifies a non-parking listing.',
    });
  if (provider.primaryType === 'parking' || provider.types?.includes('parking'))
    outcomes.push({
      rule: 'PARKING_CATEGORY',
      outcome: 'SUPPORTING',
      reason: 'Provider lists a parking category.',
    });
  if (provider.primaryType && provider.primaryType !== 'parking')
    outcomes.push({
      rule: 'CATEGORY_MISMATCH',
      outcome: 'SUSPICIOUS',
      reason: 'Provider primary category is outside the parking category.',
    });
  if (provider.parkingOption)
    outcomes.push({
      rule: 'PARKING_AMENITY',
      outcome: 'INFORMATIONAL',
      reason: 'Provider lists a parking option which may be a business amenity.',
    });
  if (
    provider.businessStatus === 'CLOSED_PERMANENTLY' ||
    provider.businessStatus === 'CLOSED_TEMPORARILY'
  ) {
    outcomes.push({
      rule: 'PROVIDER_CLOSED_STATUS',
      outcome: 'INFORMATIONAL',
      reason: 'Provider reports a closure.',
    });
  }
  if (provider.duplicate)
    outcomes.push({
      rule: 'DUPLICATE_PROVIDER_ID',
      outcome: 'SUSPICIOUS',
      reason: 'Provider identifier repeats within the same response.',
    });

  const access = resolveAttribute(evidence, accessFindings);
  const pricing = resolveAttribute(evidence, pricingFindings);
  const hours = resolveAttribute(evidence, hoursFindings);
  const parkingObservation =
    hasFinding(evidence, 'MARKED_PARKING_BAYS') ||
    hasFinding(evidence, 'DEDICATED_PARKING_ENTRANCE');
  const noParkingObservation = hasFinding(evidence, 'NO_PARKING_FOUND_ON_SITE');
  const classificationConflict =
    (parking && exclusion) ||
    ((parking || parkingObservation) && noParkingObservation) ||
    (exclusion && parkingObservation);
  const conflict = classificationConflict || access.conflict || pricing.conflict || hours.conflict;
  if (conflict)
    outcomes.push({
      rule: 'CONFLICTING_EVIDENCE',
      outcome: 'SUSPICIOUS',
      reason: 'Reviewed evidence contains competing findings.',
    });

  let classification: Classification = 'INSUFFICIENT_EVIDENCE';
  if (classificationConflict) classification = 'UNCERTAIN';
  else if (parking) classification = 'LIKELY_PARKING';
  else if (exclusion) classification = 'LIKELY_NOT_PARKING';
  else if (evidence.length || outcomes.some(({ outcome }) => outcome === 'SUSPICIOUS')) {
    classification = 'UNCERTAIN';
  }

  return {
    classification,
    access: access.value,
    pricing: pricing.value,
    operatingInformation: hours.value,
    needsHumanReview:
      conflict ||
      classification === 'INSUFFICIENT_EVIDENCE' ||
      classification === 'UNCERTAIN' ||
      outcomes.some(({ rule }) => rule === 'DUPLICATE_PROVIDER_ID'),
    outcomes,
  };
}
