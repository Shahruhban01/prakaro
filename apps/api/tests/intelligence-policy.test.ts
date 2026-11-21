import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildApp } from '../src/app';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import {
  DiscoveryIntelligence,
  fingerprintReview,
  type loadDiscoveryEvidence,
} from '../src/modules/intelligence/intelligence.discovery';
import { comparePolicyMetrics } from '../src/modules/intelligence/intelligence.policy-metrics';
import { decideParking, POLICY_VERSION } from '../src/modules/intelligence/intelligence.policy';
import { evaluateRules } from '../src/modules/intelligence/intelligence.rules';
import { IntelligenceService } from '../src/modules/intelligence/intelligence.service';
import type { Evidence } from '../src/modules/intelligence/intelligence.schemas';

function findings(...items: Evidence['finding'][]): Evidence[] {
  return items.map((finding, index) => ({
    id: `E${index + 1}`,
    finding,
    source: 'PARKING_OPERATOR',
  }));
}

it('separates facility existence from private access, pricing and current status', () => {
  const evidence = findings('CONFIRMED_PARKING', 'PRIVATE_ACCESS', 'PAID_PARKING');
  const rules = evaluateRules(evidence);
  const base = { evidence, rules, requireHumanReview: true };
  assert.equal(decideParking(base).facilityStatus, 'STRONGLY_SUPPORTED');
  const verified = decideParking({ ...base, review: 'CONFIRM_PARKING', openingStatus: 'closed' });
  assert.equal(verified.facilityStatus, 'INDEPENDENTLY_VERIFIED');
  assert.equal(verified.access, 'PRIVATE');
  assert.equal(verified.pricing, 'PAID');
  assert.equal(verified.operatingStatus, 'CLOSED');
  assert.equal(decideParking({ ...base, review: 'STALE' }).facilityStatus, 'UNCONFIRMED');
  assert.equal(decideParking({ ...base, review: 'CONFLICT' }).facilityStatus, 'UNCONFIRMED');
  assert.equal(
    decideParking({ ...base, requireHumanReview: false }).facilityStatus,
    'INDEPENDENTLY_VERIFIED',
  );
});

it('uses a validated Gemini outcome only with matching independent observations', () => {
  const evidence = findings('MARKED_PARKING_BAYS', 'DEDICATED_PARKING_ENTRANCE');
  const assisted = decideParking({
    evidence,
    rules: evaluateRules(evidence),
    assessment: 'LIKELY_PARKING',
    requireHumanReview: true,
  });
  assert.equal(assisted.facilityStatus, 'STRONGLY_SUPPORTED');
  const noEvidence = decideParking({
    evidence: [],
    rules: evaluateRules([], { primaryType: 'parking' }),
    assessment: 'LIKELY_PARKING',
    requireHumanReview: false,
  });
  assert.equal(noEvidence.facilityStatus, 'UNCONFIRMED');
  const conflicting = findings('CONFIRMED_PARKING', 'CONFIRMED_NON_PARKING');
  const result = decideParking({
    evidence: conflicting,
    rules: evaluateRules(conflicting),
    review: 'CONFIRM_PARKING',
    requireHumanReview: true,
  });
  assert.equal(result.facilityStatus, 'UNCONFIRMED');
  assert.ok(result.reasonCodes.includes('EVIDENCE_CONFLICT'));
});

const endpoint = '/api/v1/parking/nearby?latitude=10&longitude=20&radius=1000';
const places = [
  {
    id: 'near',
    location: { latitude: 10, longitude: 20 },
    parkingOptions: { freeParkingLot: true },
    currentOpeningHours: { openNow: true },
  },
  {
    id: 'private',
    location: { latitude: 10.001, longitude: 20 },
    currentOpeningHours: { openNow: true },
  },
  {
    id: 'public',
    location: { latitude: 10.002, longitude: 20 },
    currentOpeningHours: { openNow: false },
  },
  {
    id: 'stale',
    location: { latitude: 10.003, longitude: 20 },
    parkingOptions: { paidParkingLot: true },
  },
  { id: 'public-unchecked', location: { latitude: 10.004, longitude: 20 } },
];
const date = (diff: number) => new Date(Date.now() + diff);
type Record = Awaited<ReturnType<typeof loadDiscoveryEvidence>>[number];
function record(
  googlePlaceId: string,
  evidence: Evidence[],
  reviewed: boolean,
  stale = false,
): Record {
  const rows = evidence.map(({ id, finding, source }) => ({
    id,
    source,
    finding,
    expiresAt: date(60_000),
    approvedAt: date(-1000),
  }));
  return {
    googlePlaceId,
    evidence: rows,
    labels: reviewed
      ? [
          {
            decision: 'CONFIRM_PARKING',
            reviewedAt: date(-5000),
            reviewerId: 'admin',
            expiresAt: date(stale ? -1000 : 60_000),
            policyVersion: POLICY_VERSION,
            evidenceFingerprint: fingerprintReview(rows),
          },
        ]
      : [],
    runs: [],
  };
}

it('supports explicit modes, ordering, validated parameters and compatible filters', async (t) => {
  const records = [
    record('private', findings('CONFIRMED_PARKING', 'PRIVATE_ACCESS', 'FREE_PARKING'), true),
    record('public', findings('CONFIRMED_PARKING', 'PUBLIC_ACCESS', 'PAID_PARKING'), true),
    record('stale', findings('CONFIRMED_PARKING'), true, true),
    record('public-unchecked', findings('CONFIRMED_PARKING', 'PUBLIC_ACCESS'), false),
  ];
  const client = new GooglePlacesClient('mock-key', 2000, async () => Response.json({ places }));
  const options = {
    displayEnabled: true,
    filteringEnabled: true,
    defaultMode: 'ALL_CANDIDATES' as const,
    requireHumanReview: true,
  };
  const app = buildApp({
    googlePlacesClient: client,
    parkingIntelligence: new DiscoveryIntelligence(options, async () => records),
  });
  t.after(() => app.close());
  const ids = (body: { data: { id: string }[] }) => body.data.map(({ id }) => id.slice(7));
  const all = (await app.inject(endpoint)).json();
  assert.deepEqual(ids(all), ['near', 'private', 'public', 'stale', 'public-unchecked']);
  assert.equal(all.data[3].verification.facilityStatus, 'UNCONFIRMED');
  assert.ok(all.data[3].verification.reasonCodes.includes('REVIEW_STALE'));
  assert.deepEqual(ids((await app.inject(endpoint + '&mode=VERIFIED_ONLY')).json()), [
    'private',
    'public',
  ]);
  assert.deepEqual(ids((await app.inject(endpoint + '&mode=RECOMMENDED')).json()), [
    'public',
    'private',
    'public-unchecked',
    'near',
    'stale',
  ]);
  assert.deepEqual(
    ids((await app.inject(endpoint + '&mode=RECOMMENDED&sort=distance')).json()),
    ids(all),
  );
  assert.deepEqual(ids((await app.inject(endpoint + '&pricing=free&openNow=true')).json()), [
    'near',
    'private',
  ]);
  assert.deepEqual(ids((await app.inject(endpoint + '&pricing=paid')).json()), ['public', 'stale']);
  assert.deepEqual(ids((await app.inject(endpoint + '&access=public')).json()), [
    'public',
    'public-unchecked',
  ]);
  const empty = (
    await app.inject(endpoint + '&mode=VERIFIED_ONLY&access=public&openNow=true')
  ).json();
  assert.equal(empty.meta.intelligence.notice, 'NO_VERIFIED_PARKING');
  assert.equal((await app.inject(endpoint + '&mode=bogus')).statusCode, 400);
});

it('fails open on lookup errors and does not consult the store with display disabled', async (t) => {
  const client = new GooglePlacesClient('mock-key', 2000, async () => Response.json({ places }));
  const options = {
    displayEnabled: true,
    filteringEnabled: true,
    defaultMode: 'ALL_CANDIDATES' as const,
    requireHumanReview: true,
  };
  let lookups = 0;
  const failed = async () => {
    lookups++;
    throw Error('Database unavailable');
  };
  const app = buildApp({
    googlePlacesClient: client,
    parkingIntelligence: new DiscoveryIntelligence(options, failed),
  });
  const disabled = buildApp({
    googlePlacesClient: client,
    parkingIntelligence: new DiscoveryIntelligence({ ...options, displayEnabled: false }, failed),
  });
  const displayOnly = buildApp({
    googlePlacesClient: client,
    parkingIntelligence: new DiscoveryIntelligence(
      { ...options, filteringEnabled: false },
      async () => [],
    ),
  });
  t.after(() => Promise.all([app.close(), disabled.close(), displayOnly.close()]));
  const original = (await disabled.inject(endpoint + '&mode=VERIFIED_ONLY')).json();
  assert.equal(original.meta.intelligence, undefined);
  assert.equal(original.data[0].verification, undefined);
  assert.equal(lookups, 0);
  const unavailable = (await app.inject(endpoint + '&mode=VERIFIED_ONLY')).json();
  assert.equal(unavailable.meta.intelligence.notice, 'VERIFICATION_UNAVAILABLE');
  assert.deepEqual(
    unavailable.data.map(({ id }: { id: string }) => id),
    original.data.map(({ id }: { id: string }) => id),
  );
  const visible = (await displayOnly.inject(endpoint + '&mode=VERIFIED_ONLY')).json();
  assert.equal(visible.data.length, original.data.length);
  assert.equal(visible.meta.intelligence.notice, 'FILTERING_DISABLED');
  assert.equal(lookups, 1);
});

it('separates the public usability and facility confusion matrices and withholds small samples', async () => {
  const evidence = findings('CONFIRMED_PARKING', 'PRIVATE_ACCESS');
  const service = new IntelligenceService({
    enabled: false,
    shadowMode: true,
    model: 'test',
    dailyLimit: 0,
    concurrency: 1,
    timeoutMs: 100,
    budget: { reserve: async () => false },
  });
  const verification = await service.verify({ evidence });
  const decision = decideParking({
    evidence,
    rules: verification.baseline,
    review: 'CONFIRM_PARKING',
    requireHumanReview: true,
  });
  const privateRow = {
    id: 'r1',
    scenario: 'PRIVATE_PARKING',
    truth: 'LIKELY_PARKING' as const,
    truthAccess: 'PRIVATE' as const,
    verification,
    decision,
  };
  assert.equal(comparePolicyMetrics([privateRow]).genuineParking.policy, null);
  const negatives = { ...privateRow, truth: 'LIKELY_NOT_PARKING' as const };
  const publicRows = { ...privateRow, truthAccess: 'PUBLIC' as const };
  const summary = comparePolicyMetrics([
    ...Array.from({ length: 40 }, () => privateRow),
    ...Array.from({ length: 30 }, () => negatives),
    ...Array.from({ length: 30 }, () => publicRows),
  ]);
  assert.equal(summary.genuineParking.policy?.matrix.positive.positive, 70);
  assert.equal(summary.genuineParking.policy?.falsePositiveRate, 1);
  assert.equal(summary.publiclyUsableParking.policy?.matrix.positive.negative, 30);
  assert.equal(summary.publiclyUsableParking.policy?.falseNegativeRate, 1);
  assert.equal(summary.verifiedCoverage, 1);
});
