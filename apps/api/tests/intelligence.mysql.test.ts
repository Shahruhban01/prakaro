import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, it } from 'node:test';
import { prisma } from '../src/common/database/prisma';
import { buildApp } from '../src/app';
import { env } from '../src/config/env';
import { ParkingReviewService } from '../src/modules/intelligence/intelligence.review';
import {
  claimRun,
  createIntelligenceService,
  finishRun,
  loadApprovedCases,
  mysqlCallBudget,
} from '../src/modules/intelligence/intelligence.store';

after(() => prisma.$disconnect());

it('requires an allowlisted Better Auth session and appends corrections to the audit trail', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const originalAllowlist = env.PARKING_REVIEW_ADMIN_IDS;
  t.after(() => {
    env.PARKING_REVIEW_ADMIN_IDS = originalAllowlist;
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      name: 'Synthetic reviewer',
      email: `${randomUUID()}@prakaro.test`,
      password: 'ParkingReview123!',
    },
  });
  assert.equal(response.statusCode, 200);
  const { token, user } = response.json();
  t.after(() => prisma.user.delete({ where: { id: user.id } }));
  env.PARKING_REVIEW_ADMIN_IDS = 'different-user';
  await assert.rejects(ParkingReviewService.open(token), /Authorized review session required/);
  env.PARKING_REVIEW_ADMIN_IDS = user.id;
  await assert.rejects(ParkingReviewService.open(), /Authorized review session required/);
  const reviewer = await ParkingReviewService.open(token);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const created = await reviewer.createCase({
    evidence: [
      {
        source: 'PRAKARO_AUDIT',
        finding: 'CONFIRMED_PARKING',
        reference: 'synthetic-audit-record',
        expiresAt,
      },
    ],
  });
  t.after(() => prisma.parkingIntelligenceCase.delete({ where: { id: created.id } }));
  const inspected = await reviewer.inspect(created.id);
  const evidence = inspected.evidence[0];
  assert.ok(evidence);
  const review = {
    expectedRevision: 0,
    decision: 'CONFIRM_PARKING',
    evidenceIds: [evidence.id],
    expiresAt,
    reason: 'Recorded independent inspection.',
  };
  assert.equal((await reviewer.record(created.id, review)).revision, 1);
  await assert.rejects(reviewer.record(created.id, review), /review changed/);
  assert.equal(
    (
      await reviewer.record(created.id, {
        ...review,
        expectedRevision: 1,
        decision: 'NEEDS_EVIDENCE',
        reason: 'Request current access evidence.',
      })
    ).revision,
    2,
  );
  const corrected = await reviewer.inspect(created.id);
  assert.deepEqual(
    corrected.labels.map(({ revision, reviewerId, decision }) => ({
      revision,
      reviewerId,
      decision,
    })),
    [
      { revision: 2, reviewerId: user.id, decision: 'NEEDS_EVIDENCE' },
      { revision: 1, reviewerId: user.id, decision: 'CONFIRM_PARKING' },
    ],
  );
  assert.deepEqual(corrected.labels[1]?.evidenceReferences, [evidence.id]);
});

it('reserves an isolated MySQL budget atomically under concurrent callers', async (t) => {
  const utcDay = new Date(Date.UTC(2200, 0, randomInt(1, 60_000))).toISOString().slice(0, 10);
  await prisma.parkingAiDailyBudget.create({ data: { utcDay } });
  t.after(() => prisma.parkingAiDailyBudget.delete({ where: { utcDay } }));
  const reservations = await Promise.all(
    Array.from({ length: 12 }, () => mysqlCallBudget.reserve(utcDay, 3)),
  );
  assert.equal(reservations.filter(Boolean).length, 3);
  assert.equal(
    (await prisma.parkingAiDailyBudget.findUniqueOrThrow({ where: { utcDay } })).calls,
    3,
  );
});

it('loads approved current independent evidence, deduplicates runs and persists minimal results', async (t) => {
  const googlePlaceId = `Synthetic-${randomUUID()}`;
  const now = Date.now();
  const reference = 'synthetic-private-record';
  const parkingCase = await prisma.parkingIntelligenceCase.create({
    data: {
      googlePlaceId,
      evidence: {
        create: [
          {
            source: 'PRAKARO_AUDIT',
            finding: 'MARKED_PARKING_BAYS',
            reference,
            approvedAt: new Date(now - 60_000),
            expiresAt: new Date(now + 60_000),
          },
          {
            source: 'PRAKARO_AUDIT',
            finding: 'CONFIRMED_NON_PARKING',
            reference,
            approvedAt: new Date(now - 60_000),
            expiresAt: new Date(now - 1000),
          },
          {
            source: 'PARKING_OPERATOR',
            finding: 'PUBLIC_ACCESS',
            reference,
            expiresAt: new Date(now + 60_000),
          },
        ],
      },
    },
  });
  t.after(() => prisma.parkingIntelligenceCase.delete({ where: { id: parkingCase.id } }));
  assert.deepEqual(await loadApprovedCases([googlePlaceId.toLowerCase()]), []);
  const [approved] = await loadApprovedCases([googlePlaceId]);
  assert.ok(approved);
  assert.deepEqual(approved.input.evidence, [
    { id: 'E1', source: 'PRAKARO_AUDIT', finding: 'MARKED_PARKING_BAYS' },
  ]);
  const claims = await Promise.all(
    Array.from({ length: 5 }, () => claimRun(parkingCase.id, approved.input.evidence)),
  );
  assert.equal(claims.filter(Boolean).length, 1);
  const id = claims.find(Boolean);
  assert.ok(id);
  const result = await createIntelligenceService(false).verify(approved.input);
  await finishRun(id, result);
  const run = await prisma.parkingVerificationRun.findUniqueOrThrow({ where: { id } });
  assert.equal(run.status, result.status);
  assert.equal(run.outcome, 'UNCERTAIN');
  assert.equal(run.calls, 0);
  assert.doesNotMatch(JSON.stringify(run), /synthetic-private-record|MARKED_PARKING_BAYS/);
});
