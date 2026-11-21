import { createHash } from 'node:crypto';
import { prisma } from '../../common/database/prisma';
import { env } from '../../config/env';
import { PROMPT_VERSION } from './intelligence.gemini';
import {
  POLICY_VERSION,
  decideParking,
  reviewDecision,
  type DiscoveryMode,
  type ParkingDecision,
} from './intelligence.policy';
import { evaluateRules } from './intelligence.rules';
import { aiInputSchema, classification } from './intelligence.schemas';
import { fingerprintFindings } from './intelligence.store';
import type { ParkingFacility } from '../parking/parking.types';

export interface DiscoveryIntelligenceOptions {
  displayEnabled: boolean;
  filteringEnabled: boolean;
  defaultMode: DiscoveryMode;
  requireHumanReview: boolean;
}

export const discoveryIntelligenceOptions: DiscoveryIntelligenceOptions = {
  displayEnabled: env.PARKING_INTELLIGENCE_DISPLAY_ENABLED,
  filteringEnabled: env.PARKING_INTELLIGENCE_FILTERING_ENABLED,
  defaultMode:
    env.NODE_ENV === 'production' && env.PARKING_INTELLIGENCE_DEFAULT_MODE === 'VERIFIED_ONLY'
      ? 'ALL_CANDIDATES'
      : env.PARKING_INTELLIGENCE_DEFAULT_MODE,
  requireHumanReview: env.PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW,
};

export const MODEL_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
export const currentEvidence = (now: Date) => ({
  where: { approvedAt: { lte: now }, expiresAt: { gt: now } },
  orderBy: { id: 'asc' as const },
  take: 13,
});

interface EvidenceRecord {
  id: string;
  source: string;
  finding: string;
  approvedAt: Date | null;
  expiresAt: Date;
}

export function fingerprintReview(records: EvidenceRecord[]): string {
  const values = records.map(({ id, source, finding, approvedAt, expiresAt }) => [
    id,
    source,
    finding,
    approvedAt?.toISOString(),
    expiresAt.toISOString(),
  ]);
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export async function loadDiscoveryEvidence(googlePlaceIds: string[], now: Date) {
  return prisma.parkingIntelligenceCase.findMany({
    where: { googlePlaceId: { in: googlePlaceIds } },
    select: {
      googlePlaceId: true,
      evidence: {
        ...currentEvidence(now),
        select: { id: true, source: true, finding: true, expiresAt: true, approvedAt: true },
      },
      labels: {
        where: { revision: { not: null } },
        orderBy: { revision: 'desc' },
        take: 1,
        select: {
          decision: true,
          expiresAt: true,
          evidenceFingerprint: true,
          policyVersion: true,
          reviewedAt: true,
          reviewerId: true,
        },
      },
      runs: {
        where: {
          status: 'EVALUATED',
          createdAt: { gte: new Date(now.getTime() - MODEL_RESULT_TTL_MS), lte: now },
          version: { model: env.GEMINI_MODEL, promptVersion: PROMPT_VERSION },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { outcome: true, evidenceFingerprint: true, createdAt: true },
      },
    },
  });
}

const LOOKUP_TIMEOUT_MS = 300;
const MAX_ACTIVE_LOOKUPS = 8;

export class DiscoveryIntelligence {
  private activeLookups = 0;

  constructor(
    readonly options: DiscoveryIntelligenceOptions,
    private readonly load = loadDiscoveryEvidence,
  ) {}

  async decorate(candidates: ParkingFacility[]): Promise<{
    data: ParkingFacility[];
    available: boolean;
  }> {
    if (!this.options.displayEnabled || !candidates.length)
      return { data: candidates, available: true };
    const now = new Date();
    const ids = [
      ...new Set(
        candidates
          .filter(({ id }) => id.startsWith('google:'))
          .map(({ id }) => id.slice('google:'.length))
          .filter((id) => id.length <= 191),
      ),
    ];
    let records: Awaited<ReturnType<typeof loadDiscoveryEvidence>> | null = [];
    if (ids.length > 0) records = await this.lookup(ids, now);
    const allowed = new Set(ids);
    const byId = new Map(
      records
        ?.filter(({ googlePlaceId }) => googlePlaceId && allowed.has(googlePlaceId))
        .map((record) => [`google:${record.googlePlaceId}`, record]),
    );
    const data = candidates.map((candidate) => ({
      ...candidate,
      verification: this.decide(
        candidate.openingStatus,
        byId.get(candidate.id),
        now,
        records === null,
      ),
    }));
    return { data, available: records !== null };
  }

  private async lookup(ids: string[], now: Date) {
    if (this.activeLookups >= MAX_ACTIVE_LOOKUPS) return null;
    this.activeLookups++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const query = Promise.resolve()
      .then(() => this.load(ids, now))
      .catch(() => null)
      .finally(() => {
        this.activeLookups--;
      });
    try {
      return await Promise.race([
        query,
        new Promise<null>((resolve) => {
          timer = setTimeout(resolve, LOOKUP_TIMEOUT_MS, null);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private decide(
    openingStatus: ParkingFacility['openingStatus'],
    record: Awaited<ReturnType<typeof loadDiscoveryEvidence>>[number] | undefined,
    now: Date,
    unavailable: boolean,
  ): ParkingDecision {
    const parsed = aiInputSchema.safeParse({
      evidence: record?.evidence.map(({ source, finding }, index) => ({
        source,
        finding,
        id: `E${index + 1}`,
      })),
    });
    const evidence = parsed.success ? parsed.data.evidence : [];
    const label = record?.labels[0];
    const labelDecision = reviewDecision.safeParse(label?.decision);
    const review =
      record &&
      label &&
      labelDecision.success &&
      label.reviewerId &&
      label.policyVersion === POLICY_VERSION &&
      label.reviewedAt <= now &&
      label.expiresAt &&
      label.expiresAt > now &&
      record.evidence.length <= 12 &&
      label.evidenceFingerprint === fingerprintReview(record.evidence)
        ? labelDecision.data
        : label
          ? 'STALE'
          : undefined;
    const run = record?.runs[0];
    const assessment =
      run && run.evidenceFingerprint === fingerprintFindings(evidence)
        ? classification.safeParse(run.outcome)
        : undefined;
    const expiration =
      parsed.success && record
        ? Math.min(
            ...record.evidence.map(({ expiresAt }) => expiresAt.getTime()),
            label?.expiresAt && review !== 'STALE' ? label.expiresAt.getTime() : Infinity,
            assessment?.success && run ? run.createdAt.getTime() + MODEL_RESULT_TTL_MS : Infinity,
          )
        : Infinity;
    return decideParking({
      evidence,
      rules: evaluateRules(evidence),
      review,
      assessment: assessment?.data,
      requireHumanReview: this.options.requireHumanReview,
      openingStatus,
      reviewedAt: review && review !== 'STALE' ? label?.reviewedAt : undefined,
      validUntil: Number.isFinite(expiration) ? new Date(expiration) : undefined,
      unavailable,
    });
  }
}
