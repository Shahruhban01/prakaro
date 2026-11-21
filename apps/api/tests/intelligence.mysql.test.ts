import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, it } from 'node:test';
import { prisma } from '../src/common/database/prisma';
import {
  claimRun,
  createIntelligenceService,
  finishRun,
  loadApprovedCases,
  mysqlCallBudget,
} from '../src/modules/intelligence/intelligence.store';

after(() => prisma.$disconnect());

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
