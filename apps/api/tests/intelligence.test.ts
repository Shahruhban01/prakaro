import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import {
  GeminiParkingProvider,
  type GeminiProvider,
} from '../src/modules/intelligence/intelligence.gemini';
import { evaluateMetrics } from '../src/modules/intelligence/intelligence.metrics';
import { evaluateRules } from '../src/modules/intelligence/intelligence.rules';
import type { AiOutput, Evidence } from '../src/modules/intelligence/intelligence.schemas';
import {
  IntelligenceService,
  type IntelligenceOptions,
} from '../src/modules/intelligence/intelligence.service';
import {
  createDiscoveryObserver,
  inspectProviderBatch,
} from '../src/modules/intelligence/intelligence.shadow';

const parkingName = 'Synthetic Google listing name';
const googleId = 'synthetic-google-place-id';
const secret = 'gemini-secret-test-value';
const observations = (...findings: Evidence['finding'][]): Evidence[] =>
  findings.map((finding, index) => ({ id: `E${index + 1}`, source: 'PRAKARO_AUDIT', finding }));
const input = { evidence: observations('MARKED_PARKING_BAYS', 'DEDICATED_PARKING_ENTRANCE') };
const validOutput: AiOutput = {
  classification: 'LIKELY_PARKING',
  confidence: 0.75,
  access: 'UNKNOWN',
  pricing: 'UNKNOWN',
  operatingInformation: 'UNKNOWN',
  evidenceIds: ['E1', 'E2'],
  reason: 'Supplied evidence supports a parking facility.',
  missingEvidence: ['Independent access policy'],
  needsHumanReview: false,
};

function setup(provider?: GeminiProvider, options: Partial<IntelligenceOptions> = {}) {
  let reserved = 0;
  const service = new IntelligenceService({
    enabled: true,
    shadowMode: true,
    model: 'gemini-2.5-flash-lite',
    dailyLimit: 50,
    concurrency: 2,
    timeoutMs: 100,
    provider,
    budget: {
      async reserve(day, limit) {
        assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
        if (reserved >= limit) return false;
        reserved++;
        return true;
      },
    },
    ...options,
  });
  return { service, reserved: () => reserved };
}

const successfulReply = async () => ({
  text: JSON.stringify(validOutput),
  inputTokens: 10,
  outputTokens: 5,
});

describe('parking intelligence rules', () => {
  it('distinguishes a confirmed private facility from an independent exclusion', () => {
    const rules = evaluateRules(
      observations('CONFIRMED_PARKING', 'PRIVATE_ACCESS', 'PAID_PARKING', 'PUBLISHED_HOURS'),
    );
    assert.equal(rules.classification, 'LIKELY_PARKING');
    assert.equal(rules.access, 'PRIVATE');
    assert.equal(rules.pricing, 'PAID');
    assert.equal(rules.operatingInformation, 'PUBLISHED_HOURS_AVAILABLE');
    assert.equal('openingStatus' in rules, false);
    assert.equal(
      evaluateRules(observations('CONFIRMED_NON_PARKING')).classification,
      'LIKELY_NOT_PARKING',
    );
  });

  it('treats category mismatch and duplicates as suspicious and preserves the full batch', () => {
    const batch = inspectProviderBatch([
      {
        id: 'dup',
        primaryType: 'car_repair',
        types: ['parking'],
        parkingOptions: { paidParkingLot: true },
      },
      { id: ' dup ', businessStatus: 'CLOSED_PERMANENTLY' },
    ]);
    assert.equal(batch.length, 2);
    for (const item of batch) {
      assert.equal(item.rules.classification, 'UNCERTAIN');
      assert.ok(item.rules.outcomes.some(({ rule }) => rule === 'DUPLICATE_PROVIDER_ID'));
    }
    assert.ok(
      batch[0]?.rules.outcomes.some(
        ({ rule, outcome }) => rule === 'CATEGORY_MISMATCH' && outcome === 'SUSPICIOUS',
      ),
    );
    assert.equal(
      evaluateRules([], { primaryType: 'parking' }).classification,
      'INSUFFICIENT_EVIDENCE',
    );
  });

  it('keeps missing or conflicting evidence uncertain and conflicts trigger human review', async () => {
    assert.equal(evaluateRules([]).classification, 'INSUFFICIENT_EVIDENCE');
    const evidence = observations(
      'CONFIRMED_PARKING',
      'CONFIRMED_NON_PARKING',
      'PUBLIC_ACCESS',
      'PRIVATE_ACCESS',
    );
    const rules = evaluateRules(evidence);
    assert.equal(rules.classification, 'UNCERTAIN');
    assert.equal(rules.access, 'UNKNOWN');
    assert.equal(rules.needsHumanReview, true);
    const { service, reserved } = setup({ classify: successfulReply });
    assert.equal((await service.verify({ evidence })).status, 'CONFLICT');
    assert.equal(reserved(), 0);
  });
});

describe('Gemini output and limits', () => {
  it('uses the official SDK with JSON schema, no tools, and only allowed evidence', async () => {
    let requests = 0;
    const provider = new GeminiParkingProvider(
      secret,
      'gemini-2.5-flash-lite',
      async (url, init) => {
        requests++;
        assert.match(String(url), /models\/gemini-2\.5-flash-lite:generateContent/);
        assert.doesNotMatch(String(url), new RegExp(secret));
        assert.equal(new Headers(init?.headers).get('x-goog-api-key'), secret);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.generationConfig.responseMimeType, 'application/json');
        assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
        assert.match(JSON.stringify(body.systemInstruction), /parking-verification-v1/);
        assert.equal(body.tools, undefined);
        assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), input);
        assert.doesNotMatch(
          String(init?.body),
          /gemini-secret-test-value|Synthetic Google listing|12\.345678|photo\/|user@example/,
        );
        return Response.json({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(validOutput) }], role: 'model' } },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 1 },
        });
      },
    );
    const { service } = setup(provider);
    assert.equal(
      (await service.verify({ ...input, coordinates: [12.345678, 74.123456] })).status,
      'NO_EVIDENCE',
    );
    assert.equal(
      (await service.verify({ evidence: [{ ...input.evidence[0], source: 'GOOGLE_PLACES' }] }))
        .status,
      'NO_EVIDENCE',
    );
    assert.equal(
      (
        await service.verify({
          evidence: [{ ...input.evidence[0], description: 'photo/user@example' }],
        })
      ).status,
      'NO_EVIDENCE',
    );
    const result = await service.verify(input);
    assert.equal(requests, 1);
    assert.equal(result.status, 'EVALUATED');
    assert.equal(result.baseline.classification, 'UNCERTAIN');
    assert.equal(result.result.classification, 'LIKELY_PARKING');
    assert.equal(result.usage.outputTokens, 6);
  });

  for (const [name, response, expected] of [
    ['malformed JSON', '{', 'INVALID_OUTPUT'],
    ['unknown evidence ID', { ...validOutput, evidenceIds: ['E1', 'E3'] }, 'UNSUPPORTED_CLAIM'],
    ['duplicate evidence ID', { ...validOutput, evidenceIds: ['E1', 'E1'] }, 'INVALID_OUTPUT'],
    [
      'hallucinated source URL',
      { ...validOutput, sourceUrl: 'https://example.invalid' },
      'INVALID_OUTPUT',
    ],
    [
      'hallucinated source in reasoning',
      { ...validOutput, reason: 'Visited https://example.invalid' },
      'INVALID_OUTPUT',
    ],
    ['unsupported price', { ...validOutput, pricing: 'PAID' }, 'UNSUPPORTED_CLAIM'],
    ['unsupported access', { ...validOutput, access: 'PUBLIC' }, 'UNSUPPORTED_CLAIM'],
    [
      'unsupported hours',
      { ...validOutput, operatingInformation: 'PUBLISHED_HOURS_AVAILABLE' },
      'UNSUPPORTED_CLAIM',
    ],
    ['unsupported facility claim', { ...validOutput, evidenceIds: ['E1'] }, 'UNSUPPORTED_CLAIM'],
  ] as const) {
    it(`falls back to rules on ${name}`, async () => {
      const { service } = setup({
        classify: async () => ({
          text: typeof response === 'string' ? response : JSON.stringify(response),
        }),
      });
      const result = await service.verify(input);
      assert.equal(result.status, expected);
      assert.deepEqual(result.result, result.baseline);
      assert.equal(result.assessment, undefined);
    });
  }

  it('aborts a timed-out request and uses the rules result without retry', async () => {
    let aborted = false;
    const { service } = setup(
      {
        classify: (_, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      },
      { timeoutMs: 10 },
    );
    const result = await service.verify(input);
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.usage.calls, 1);
    assert.equal(aborted, true);
  });

  it('handles 429 from the SDK without SDK retries and opens a local cooldown', async () => {
    let calls = 0;
    const provider = new GeminiParkingProvider(secret, 'gemini-2.5-flash-lite', async () => {
      calls++;
      return Response.json({ error: { status: 'RESOURCE_EXHAUSTED', code: 429 } }, { status: 429 });
    });
    const { service, reserved } = setup(provider);
    assert.equal((await service.verify(input)).status, 'QUOTA_EXHAUSTED');
    assert.equal((await service.verify(input)).status, 'QUOTA_EXHAUSTED');
    assert.equal(calls, 1);
    assert.equal(reserved(), 1);
  });

  it('caps retries at two attempts and budgets the retry', async () => {
    const provider = {
      classify: async () => {
        throw { status: 503 };
      },
    };
    const { service, reserved } = setup(provider);
    assert.equal((await service.verify(input)).status, 'PROVIDER_ERROR');
    assert.equal(reserved(), 2);
    const limited = setup(provider, { dailyLimit: 1 });
    assert.equal((await limited.service.verify(input)).status, 'BUDGET_EXHAUSTED');
    assert.equal((await limited.service.verify(input)).usage.calls, 0);
    assert.equal(limited.reserved(), 1);
  });

  it('falls back when disabled, shadow is off, key is absent, or shared budget fails', async () => {
    const provider = { classify: async () => assert.fail('Unexpected Gemini call') };
    assert.equal(
      (await setup(provider, { enabled: false }).service.verify(input)).status,
      'DISABLED',
    );
    assert.equal(
      (await setup(provider, { shadowMode: false }).service.verify(input)).status,
      'SHADOW_DISABLED',
    );
    assert.equal((await setup().service.verify(input)).status, 'NOT_CONFIGURED');
    const { service } = setup(provider, {
      budget: {
        reserve: async () => {
          throw Error(secret);
        },
      },
    });
    assert.equal((await service.verify(input)).status, 'BUDGET_UNAVAILABLE');
  });

  it('enforces concurrency without queuing work', async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, reserved } = setup(
      {
        classify: async () => {
          await wait;
          return successfulReply();
        },
      },
      { concurrency: 1 },
    );
    const first = service.verify(input);
    assert.equal((await service.verify(input)).status, 'BUSY');
    release();
    assert.equal((await first).status, 'EVALUATED');
    assert.equal(reserved(), 1);
  });
});

it('keeps the Fastify discovery response, filters and duplicates identical while shadow AI fails', async (t) => {
  const endpoint =
    '/api/v1/parking/nearby?latitude=12.345678&longitude=74.123456&radius=500&pricing=paid&openNow=true';
  const candidate = {
    id: googleId,
    primaryType: 'car_repair',
    displayName: { text: parkingName },
    location: { latitude: 12.345678, longitude: 74.123456 },
    parkingOptions: { paidParkingLot: true },
    currentOpeningHours: { openNow: true },
    photos: [{ name: 'photo/private-name' }],
  };
  const google = new GooglePlacesClient('google-secret', 500, async () =>
    Response.json({
      places: [
        candidate,
        candidate,
        { ...candidate, id: 'free', parkingOptions: { freeParkingLot: true } },
      ],
    }),
  );
  const slowProvider = new GeminiParkingProvider(
    secret,
    'gemini-2.5-flash-lite',
    async (_url, init) => {
      assert.deepEqual(JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text), input);
      await delay(500);
      return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, { status: 403 });
    },
  );
  const { service } = setup(slowProvider, { timeoutMs: 1000 });
  let finished = false;
  let finishStatus: unknown;
  let loadCalls = 0;
  const options = {
    evaluateWithGemini: true,
    maxPerBatch: 2,
    service,
    async loadCases(ids: string[]) {
      loadCalls++;
      assert.deepEqual(ids, [googleId, 'free']);
      return [{ id: 'independent-case', input, googlePlaceId: googleId }];
    },
    async claim() {
      return 'independent-run';
    },
    async finish(_id: string, result: Awaited<ReturnType<IntelligenceService['verify']>>) {
      finished = true;
      finishStatus = result.status;
    },
  };
  const shadow = buildApp({
    googlePlacesClient: google,
    parkingDiscoveryObserver: createDiscoveryObserver(
      () => assert.fail('Unexpected observer error'),
      { ...options, shadowMode: true },
    ),
  });
  const control = buildApp({
    googlePlacesClient: google,
    parkingDiscoveryObserver: createDiscoveryObserver(
      () => assert.fail('Unexpected observer error'),
      { ...options, shadowMode: false },
    ),
  });
  t.after(() => Promise.all([shadow.close(), control.close()]));
  const original = await control.inject(endpoint);
  assert.equal(loadCalls, 0);
  const result = await shadow.inject(endpoint);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload, original.payload);
  assert.equal(result.json().meta.count, 2);
  assert.equal(result.json().meta.totalDiscovered, 3);
  assert.ok(result.json().data.every(({ id }: { id: string }) => id === `google:${googleId}`));
  assert.doesNotMatch(result.payload, /gemini-secret-test-value|verification|classification/);
  assert.equal(finished, false);
  assert.equal((await shadow.inject(endpoint)).payload, original.payload);
  for (let polls = 0; !finished && polls < 100; polls++) await delay(20);
  assert.equal(finished, true);
  assert.equal(finishStatus, 'PROVIDER_ERROR');
  assert.equal(loadCalls, 1);
});

it('withholds performance rates for small cohorts and distinguishes abstentions from false negatives', async () => {
  const { service } = setup({ classify: successfulReply });
  const verification = await service.verify(input);
  const parking = { truth: 'LIKELY_PARKING' as const, verification };
  const nonParking = { truth: 'LIKELY_NOT_PARKING' as const, verification };
  assert.equal(evaluateMetrics([parking]).rulesOnly, null);
  const metrics = evaluateMetrics(
    [...Array.from({ length: 50 }, () => parking), ...Array.from({ length: 50 }, () => nonParking)],
    { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  );
  assert.equal(metrics.rulesOnly?.abstainedOnPositive, 50);
  assert.equal(metrics.rulesOnly?.falseNegativeRate, 0);
  assert.equal(metrics.rulesPlusGemini?.falsePositiveRate, 1);
  assert.equal(metrics.rulesPlusGemini?.recall, 1);
  assert.equal(metrics.ai.estimatedApiCostUsd, 0.002);
});
