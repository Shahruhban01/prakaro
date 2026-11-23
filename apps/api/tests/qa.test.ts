import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { DiscoveryIntelligence, loadDiscoveryEvidence } from '../src/modules/intelligence/intelligence.discovery';
import { matchesDraw, percent } from '../src/modules/moderation/qa/contracts';
import { drainQaSamples, eligibleDecision, sampleDecision } from '../src/modules/moderation/qa/sampling';
import { createQaFixture } from './support/qa-fixture';

test('sampling cutoffs and weighted accuracy have exact endpoints and an absent denominator', () => {
  assert.equal(matchesDraw(0, 0), false);
  assert.equal(matchesDraw(9999, 10000), true);
  assert.equal(matchesDraw(999, 1000), true);
  assert.equal(matchesDraw(1000, 1000), false);
  assert.equal(percent(74, 80), 92.5);
  assert.equal(percent(0, 0), null);
});

test('durable post-decision QA, scoped concurrent assignment, disputes and publication correction', async (t) => {
  const fx = await createQaFixture(prisma);
  const app = buildApp();
  t.after(async () => { await app.close(); await prisma.$disconnect(); });
  async function login(email: string) {
    const response = await app.inject({ method: 'POST', url: '/api/moderator-auth/sign-in/email',
      payload: { email, password: fx.password } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().token as string;
  }
  const [mod, auditor, auditor2, supervisor, director, outsider, wrongLob] = await Promise.all(
    [fx.moderator, fx.auditor, fx.secondAuditor, fx.supervisor, fx.director, fx.outsider, fx.wrongLob].map(({ email }) => login(email)),
  );
  async function request(as: string, path: string, payload?: object, status = 200, root = 'moderation') {
    const response = await app.inject({
      method: payload ? 'POST' : 'GET', url: '/api/v1/' + root + '/' + path,
      headers: { authorization: 'Bearer ' + as }, payload,
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json();
  }
  const organizationPolicy = { organizationId: fx.org.id, rate: 2500, enabled: true, expectedVersion: 0 };
  await request(director, 'qa/policies', organizationPolicy);
  const queuePolicy = { ...organizationPolicy, queueId: fx.queue.id, rate: 0, passScore: 90, failScore: 5 };
  const zero = await request(director, 'qa/policies', queuePolicy);
  assert.equal(zero.version, 1);
  assert.equal((await request(director, 'qa/policies', queuePolicy)).id, zero.id);
  await request(auditor, 'qa/policies', queuePolicy, 403);

  await Promise.all([fx.createCase('A'), fx.createCase('B'), fx.createCase('C')]);
  async function punch(token: string) {
    const snapshot = await request(token, 'aux/me', undefined, 200, 'workforce');
    await request(token, 'aux/transition', {
      state: 'MODERATING', attendanceSessionId: snapshot.attendanceSessionId, version: snapshot.version,
    }, 200, 'workforce');
  }
  await punch(mod);
  const initial = await request(mod, 'queues/' + fx.queue.id + '/moderate/start', {});
  assert.ok(initial.reservation);
  assert.equal(await eligibleDecision(prisma, randomUUID()), undefined);
  async function approve(reservation: typeof initial.reservation, leave = false) {
    return request(mod, 'reservations/' + reservation.id + (leave ? '/submit-and-leave' : '/submit'), {
      action: 'APPROVE', reason: 'Synthetic inspection confirms the parking facility.',
      evidenceIds: [reservation.case.admission.facility.evidence[0].id], answers: { verification_basis: 'Independent inspection' },
    });
  }
  const first = await approve(initial.reservation);
  assert.ok(first.nextReservation && first.nextReservation.id !== initial.reservation.id);
  assert.equal(await prisma.qaSample.count({ where: { decisionId: first.decisionVersionId } }), 0);
  assert.equal(await prisma.parkingHumanLabel.count({
    where: { caseId: initial.reservation.case.facilityId, decision: 'CONFIRM_PARKING' },
  }), 1);
  await drainQaSamples();
  const declined = await prisma.qaSample.findUniqueOrThrow({ where: { decisionId: first.decisionVersionId } });
  assert.equal(declined.selection, 'NOT_SELECTED');
  assert.equal(declined.policyId, zero.id);
  assert.equal(declined.sampledAt, null);
  const full = await request(director, 'qa/policies', { ...queuePolicy, rate: 10000, expectedVersion: 1 });
  assert.equal(full.version, 2);
  assert.ok((await prisma.qaPolicy.findUniqueOrThrow({ where: { id: zero.id } })).effectiveTo);

  const second = await approve(first.nextReservation);
  const third = await approve(second.nextReservation, true);
  const secondAgain = await approve(first.nextReservation);
  assert.equal(secondAgain.decisionVersionId, second.decisionVersionId);
  const samples = await Promise.all(Array.from({ length: 10 }, () => prisma.$transaction(
    (tx) => sampleDecision(tx, second.decisionVersionId),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )));
  assert.equal(new Set(samples.map((item) => item?.id)).size, 1);
  await drainQaSamples();
  assert.equal(await prisma.qaSample.count({ where: { organizationId: fx.org.id, sampledAt: { not: null } } }), 2);
  assert.equal(samples[0]?.policyId, full.id);
  assert.equal((await request(director, 'qa/dashboard')).accuracy, null);
  assert.equal((await request(director, 'qa/dashboard')).coverage, 66.7);
  assert.equal((await request(director, 'qa/dashboard?queueId=' + fx.queue.id)).sampled, 2);
  assert.equal((await request(wrongLob, 'qa/reviews/claim-next', {})).id, null);
  await request(outsider, 'qa/reviews/' + samples[0]!.id, undefined, 404);
  await request(outsider, 'qa/dashboard?organizationId=' + fx.org.id, undefined, 403);

  const [a, b] = await Promise.all([request(auditor, 'qa/reviews/claim-next', {}), request(auditor2, 'qa/reviews/claim-next', {})]);
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.equal((await request(auditor, 'qa/reviews/claim-next', {})).id, a.id);
  const pass = await request(auditor, 'qa/reviews/' + a.id);
  const fail = await request(auditor2, 'qa/reviews/' + b.id);
  const facility = await prisma.parkingIntelligenceCase.findUniqueOrThrow({
    where: { id: fail.decision.case.facilityId }, select: { googlePlaceId: true },
  });
  const placeId = facility.googlePlaceId!;
  async function discoveryStatus() {
    const records = await loadDiscoveryEvidence([placeId], new Date());
    const intelligence = new DiscoveryIntelligence({
      displayEnabled: true, filteringEnabled: false, defaultMode: 'ALL_CANDIDATES', requireHumanReview: true,
    }, async () => records);
    const { data } = await intelligence.decorate([{
      id: 'google:' + placeId, name: 'Synthetic QA fixture', latitude: 0, longitude: 0, address: '',
      source: 'google', accessType: 'unknown', pricingType: 'unknown', ownershipType: 'unknown', openingStatus: 'unknown',
      parkingOptions: { freeParkingLot: null, paidParkingLot: null, freeGarageParking: null, paidGarageParking: null,
        freeStreetParking: null, paidStreetParking: null },
      hourlyRate: null, currency: null,
    }]);
    assert.equal(data.length, 1);
    return data[0]?.verification?.facilityStatus;
  }
  assert.equal(await discoveryStatus(), 'INDEPENDENTLY_VERIFIED');
  assert.equal(pass.decision.qaSnapshot.evidence[0].cited, true);
  await request(auditor, 'qa/reviews/' + a.id + '/start', { version: pass.assignmentVersion });
  await request(auditor2, 'qa/reviews/' + b.id + '/start', { version: fail.assignmentVersion });
  const passPayload = { version: pass.assignmentVersion, assessment: { outcome: 'PASS', notes: 'Evidence meets policy.' } };
  const passResponses = await Promise.all([
    request(auditor, 'qa/reviews/' + a.id + '/submit', passPayload),
    request(auditor, 'qa/reviews/' + a.id + '/submit', passPayload),
  ]);
  assert.equal(passResponses[0].id, passResponses[1].id);
  assert.equal(passResponses[0].score, 90);
  await request(auditor2, 'qa/reviews/' + b.id + '/submit', { version: fail.assignmentVersion, assessment: { outcome: 'FAIL' } }, 400);
  const failure = await request(auditor2, 'qa/reviews/' + b.id + '/submit', {
    version: fail.assignmentVersion, assessment: { outcome: 'FAIL', category: 'UNSUPPORTED_VERIFICATION',
      severity: 'MAJOR', policyReference: 'QA-1 §1', proposedAction: 'REJECT', notes: 'The evidence was subsequently found to be incomplete.' },
  });
  assert.equal(failure.score, 5);
  assert.equal((await request(director, 'qa/dashboard')).accuracy, 50);

  const disputePayload = { reason: 'Please independently check the original source.' };
  const [dispute, duplicateDispute] = await Promise.all([
    request(mod, 'qa/reviews/' + b.id + '/disputes', disputePayload),
    request(mod, 'qa/reviews/' + b.id + '/disputes', disputePayload),
  ]);
  assert.equal(dispute.id, duplicateDispute.id);
  assert.equal((await request(director, 'qa/dashboard')).evaluated, 1);
  await request(auditor2, 'qa/disputes/' + dispute.id + '/adjudicate', { action: 'UPHOLD', reason: 'Attempted self-adjudication.' }, 403);
  await request(supervisor, 'qa/disputes/' + dispute.id + '/adjudicate', { action: 'REQUEST_REVIEW', reason: 'Obtain another description of the source.' });
  await request(supervisor, 'qa/disputes/' + dispute.id + '/adjudicate', { action: 'UPHOLD', reason: 'Independent review upheld the finding.' });
  assert.equal((await request(director, 'qa/dashboard')).accuracy, 50);
  const comparison = await request(director, 'qa/analytics?dimension=queueId');
  assert.equal(comparison.rows[0].evaluated, 2);
  const handlingBefore = await prisma.caseHandlingRecord.aggregate({ where: { queueId: fx.queue.id },
    _count: { _all: true }, _sum: { durationSeconds: true } });
  const correction = await request(auditor2, 'qa/reviews/' + b.id + '/corrections', {
    action: 'REJECT', reason: 'Withdraw the unsupported verified badge.',
  });
  await request(auditor2, 'qa/corrections/' + correction.id + '/approve', {}, 403);
  await request(supervisor, 'qa/corrections/' + correction.id + '/start', {});
  const corrected = await Promise.all([
    request(supervisor, 'qa/corrections/' + correction.id + '/approve', {}),
    request(supervisor, 'qa/corrections/' + correction.id + '/approve', {}),
  ]);
  assert.equal(corrected[0].resultDecisionId, corrected[1].resultDecisionId);
  const versions = await prisma.moderationDecisionVersion.findMany({
    where: { caseId: fail.decision.case.id }, orderBy: { version: 'asc' },
  });
  assert.deepEqual(versions.map(({ action, effective }) => [action, effective]), [['APPROVE', false], ['REJECT', true]]);
  assert.equal((await prisma.parkingHumanLabel.findFirstOrThrow({
    where: { caseId: fail.decision.case.facilityId }, orderBy: { reviewedAt: 'desc' },
  })).decision, 'NEEDS_EVIDENCE');
  assert.equal(await discoveryStatus(), 'UNCONFIRMED');
  assert.deepEqual(await prisma.caseHandlingRecord.aggregate({ where: { queueId: fx.queue.id },
    _count: { _all: true }, _sum: { durationSeconds: true } }), handlingBefore);
  const audit = await request(supervisor, 'qa/reviews/' + b.id);
  assert.ok(audit.history.some((event: { action: string; actorName: string | null }) =>
    event.action === 'QA_CORRECTION_PUBLISHED' && event.actorName === fx.supervisor.name));
  assert.equal(audit.history.filter((event: { action: string }) => event.action === 'QA_CORRECTION_PUBLISHED').length, 1);
  assert.equal(await prisma.qaSample.count({ where: { decisionId: third.decisionVersionId } }), 1);

  const manual = await request(director, 'qa/samples/manual', { decisionId: first.decisionVersionId });
  assert.equal(manual.id, declined.id);
  assert.equal((await request(director, 'qa/dashboard')).manual, 1);
  await request(supervisor, 'qa/reviews/' + manual.id + '/assign', { auditorId: fx.moderator.id, version: 0 }, 403);
  assert.equal((await request(auditor, 'qa/reviews/claim-next', {})).id, manual.id);
  const oldAssignment = (await request(auditor, 'qa/reviews/' + manual.id)).assignmentVersion;
  await request(auditor, 'qa/reviews/' + manual.id + '/start', { version: oldAssignment });
  await prisma.qaSample.update({ where: { id: manual.id }, data: { leaseUntil: new Date(Date.now() - 5000) } });
  await request(auditor, 'qa/reviews/' + manual.id + '/submit', {
    version: oldAssignment, assessment: { outcome: 'PASS' },
  }, 409);
  assert.equal((await request(auditor2, 'qa/reviews/claim-next', {})).id, manual.id);
  const newAssignment = (await request(auditor2, 'qa/reviews/' + manual.id)).assignmentVersion;
  assert.ok(newAssignment > oldAssignment);
  await request(auditor2, 'qa/reviews/' + manual.id + '/start', { version: newAssignment });
  await request(auditor2, 'qa/reviews/' + manual.id + '/submit', {
    version: newAssignment, assessment: { outcome: 'FAIL', category: 'INCORRECT_POLICY', severity: 'MINOR',
      policyReference: 'Synthetic policy history', notes: 'Initial audit treated a superseded policy as current.' },
  });
  const secondDispute = await request(mod, 'qa/reviews/' + manual.id + '/disputes', { reason: 'Check the saved policy version.' });
  await request(supervisor, 'qa/disputes/' + secondDispute.id + '/adjudicate', {
    action: 'OVERTURN', reason: 'The original decision followed the saved policy.',
  });
  const overturned = (await request(supervisor, 'qa/reviews/' + manual.id)).assessment;
  assert.equal(overturned.originalOutcome, 'FAIL');
  assert.equal(overturned.finalOutcome, 'PASS');
  assert.equal((await request(director, 'qa/dashboard')).accuracy, 66.7);
  assert.equal((await request(director, 'qa/dashboard')).overturnRate, 50);
  assert.equal((await request(director, 'qa/dashboard')).coverage, 66.7);

  await prisma.moderator.update({ where: { id: fx.moderator.id }, data: { lobId: fx.otherLine.id } });
  assert.equal((await request(director, 'qa/dashboard?lobId=' + fx.line.id)).evaluated, 3);
  assert.equal((await request(director, 'qa/dashboard?lobId=' + fx.otherLine.id)).evaluated, 0);
  const historical = await request(supervisor, 'qa/reviews/' + b.id);
  assert.equal(historical.lob.id, fx.line.id);

  const rollback = new Error('Undo synthetic eligibility check');
  await assert.rejects(prisma.$transaction(async (tx) => {
    for (const status of ['ACTIVE', 'EXPIRED']) {
      await tx.moderationCaseReservation.update({ where: { id: initial.reservation.id }, data: {
        status, activeCaseKey: status === 'ACTIVE' ? initial.reservation.case.id : null,
        activeModeratorKey: status === 'ACTIVE' ? fx.moderator.id : null,
        releasedAt: status === 'ACTIVE' ? null : new Date(),
      } });
      assert.equal(await eligibleDecision(tx, first.decisionVersionId), undefined);
    }
    throw rollback;
  }), (error) => error === rollback);
});
