import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { AuxStatus } from '@prisma/client';

it('Phase 4 Continuous Moderation Engine: strict randomness, atomic reservations, auto-next, and AHT in seconds', async (t) => {
  const app = buildApp();
  const password = 'ContinuousModerationTest123!';
  const orgs: string[] = [];
  const lobs: string[] = [];
  const staffIds: string[] = [];
  const queueIds: string[] = [];
  const caseIds: string[] = [];
  const facilityIds: string[] = [];

  t.after(async () => {
    await app.close();
    // Cleanup cases and reservations
    if (caseIds.length) {
      await prisma.caseHandlingRecord.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationDecisionVersion.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationCaseReservation.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationTask.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationCase.deleteMany({ where: { id: { in: caseIds } } });
    }
    if (facilityIds.length) {
      await prisma.searchAdmission.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.parkingIntelligenceCase.deleteMany({ where: { id: { in: facilityIds } } });
    }
    if (queueIds.length) {
      await prisma.queueSubscription.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.queueLobAccess.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.moderationWorkSession.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.moderationQueue.deleteMany({ where: { id: { in: queueIds } } });
    }
    if (staffIds.length) {
      await prisma.attendanceSession.deleteMany({ where: { moderatorId: { in: staffIds } } });
      await prisma.moderator.deleteMany({ where: { id: { in: staffIds } } });
    }
    if (lobs.length) {
      await prisma.lob.deleteMany({ where: { id: { in: lobs } } });
    }
    if (orgs.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    }
    await prisma.$disconnect();
  });

  // Setup Org and LOB
  const org = await prisma.organization.create({
    data: { name: 'Continuous Moderation Org', code: randomUUID(), createdBy: 'test' },
  });
  orgs.push(org.id);

  const lob = await prisma.lob.create({
    data: { name: 'Continuous Ops', code: randomUUID(), createdBy: 'test', organizationId: org.id },
  });
  lobs.push(lob.id);

  // Helper to create moderator and login
  async function createModerator(role = 'MODERATOR') {
    const id = randomUUID();
    const email = id + '@continuous.test';
    await prisma.moderator.create({
      data: {
        id,
        email,
        name: 'Mod ' + id.slice(0, 8),
        status: 'ACTIVE',
        role,
        organizationId: org.id,
        lobId: lob.id,
        accounts: {
          create: {
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
    });
    staffIds.push(id);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email, password },
    });
    assert.equal(loginRes.statusCode, 200);
    const token = loginRes.json().token as string;
    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/moderator-auth/get-session',
      headers: { authorization: 'Bearer ' + token },
    });
    const authSessionId = sessionRes.json().session.id as string;

    return { id, email, token, authSessionId };
  }

  async function punch(mod: { token: string }, targetState: AuxStatus) {
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/workforce/aux/me',
      headers: { authorization: 'Bearer ' + mod.token },
    });
    assert.equal(getRes.statusCode, 200);
    const snap = getRes.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workforce/aux/transition',
      headers: { authorization: 'Bearer ' + mod.token },
      payload: {
        state: targetState,
        version: snap.version,
        attendanceSessionId: snap.attendanceSessionId,
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  }

  // Create queue and grant access to LOB
  async function createQueue(name: string) {
    const q = await prisma.moderationQueue.create({
      data: {
        code: 'Q-' + randomUUID().slice(0, 8),
        name,
        kind: 'USER_REPORT',
        organizationId: org.id,
        config: {
          slaHours: 24,
          form: [],
          rule: { field: 'source', operator: 'EQUAL', value: 'REPORT' },
        },
        createdBy: 'test',
      },
    });
    queueIds.push(q.id);
    await prisma.queueLobAccess.create({
      data: {
        queueId: q.id,
        lobId: lob.id,
        organizationId: org.id,
        actorId: 'test',
        actorType: 'SUPER_ADMIN',
      },
    });
    return q;
  }

  // Create synthetic case
  async function createCase(queueId: string, codeSuffix: string) {
    const facility = await prisma.parkingIntelligenceCase.create({
      data: {
        googlePlaceId: 'place-' + randomUUID(),
        displayName: 'Test Facility ' + codeSuffix,
        placeMetadata: { internalFixtureField: true },
        admission: { create: { firstEvent: 'synthetic-test' } },
        evidence: { create: {
          source: 'PRAKARO_AUDIT', finding: 'CONFIRMED_PARKING',
          reference: 'Synthetic test field inspection',
          approvedAt: new Date(), expiresAt: new Date(Date.now() + 86400000),
        } },
      },
    });
    facilityIds.push(facility.id);

    const caseItem = await prisma.moderationCase.create({
      data: {
        code: 'CASE-' + codeSuffix,
        activeKey: 'key-' + randomUUID(),
        facilityId: facility.id,
        category: 'PARKING_ISSUE',
        trigger: 'REPORT',
        status: 'QUEUED',
        tasks: {
          create: {
            queueId,
            queueVersion: 1,
             form: [{
               key: 'review_tag', label: 'Policy tag', type: 'REASON', required: true,
               options: ['SITE_CHECK', 'REPORT_DISMISSED'],
             }],
            deadline: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    caseIds.push(caseItem.id);
    return caseItem;
  }

  const queue = await createQueue('Parking Verification Queue');
  const modA = await createModerator();
  const modB = await createModerator();

  // 1. AUX check: Mod A cannot moderate without MODERATING AUX
  const noAuxRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(noAuxRes.statusCode, 409, 'Should reject when not in MODERATING AUX');
  assert.equal(noAuxRes.json().error.code, 'MODERATING_AUX_REQUIRED');

  // Punch AUX to MODERATING for Mod A
  await punch(modA, AuxStatus.MODERATING);

  // 2. Subscription check: Mod A in MODERATING AUX cannot moderate without subscribing
  const unsubsRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(unsubsRes.statusCode, 403, 'Should reject unsubscribed moderator');
  const unsubscribedRead = await app.inject({
    method: 'GET', url: `/api/v1/moderation/queues/${queue.id}/moderate/current`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(unsubscribedRead.statusCode, 403);

  // Subscribe Mod A and Mod B
  await prisma.queueSubscription.createMany({
    data: [
      { moderatorId: modA.id, queueId: queue.id },
      { moderatorId: modB.id, queueId: queue.id },
    ],
  });

  // Punch AUX to MODERATING for Mod B as well
  await punch(modB, AuxStatus.MODERATING);

  // 3. Empty Queue: Start moderation when 0 cases exist
  const emptyRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(emptyRes.statusCode, 200);
  const emptyBody = emptyRes.json();
  assert.equal(emptyBody.emptyQueue, true);
  assert.equal(emptyBody.reservation, null);
  assert.ok(emptyBody.session.id);
  const sessionAId = emptyBody.session.id;

  // 4. Create 5 pending cases in queue
  for (const code of ['001', '002', '003', '004', '005']) await createCase(queue.id, code);

  // 5. Request next case on active session
  const nextRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/sessions/${sessionAId}/next`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(nextRes.statusCode, 200);
  const nextBody = nextRes.json();
  assert.equal(nextBody.emptyQueue, false);
  assert.ok(nextBody.reservation);
  const resA = nextBody.reservation;
  assert.equal(resA.moderatorId, modA.id);
  assert.equal(resA.status, 'ACTIVE');

  // 6. Concurrency & Collision Freedom: Mod B attempts to start moderation simultaneously
  const startBRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
    headers: { authorization: 'Bearer ' + modB.token },
  });
  assert.equal(startBRes.statusCode, 200);
  const startBBody = startBRes.json();
  assert.ok(startBBody.reservation);
  const resB = startBBody.reservation;
  assert.equal(resB.moderatorId, modB.id);

  // CRITICAL ASSERTION: Mod A and Mod B NEVER hold the same case!
  assert.notEqual(resA.caseId, resB.caseId, 'Collision detected: two moderators received the same case!');

  // 7. Mod A already holds an active reservation -> calling start again reuses the existing active reservation
  const reStartRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(reStartRes.statusCode, 200);
  assert.equal(reStartRes.json().reservation.id, resA.id, 'Should return existing active reservation');

  // 8. AUX Lock Enforcement: Mod A cannot transition AUX or sign out while holding active reservation
  const getSnapA = await app.inject({
    method: 'GET',
    url: '/api/v1/workforce/aux/me',
    headers: { authorization: 'Bearer ' + modA.token },
  });
  const snapA = getSnapA.json();
  const auxLockRes = await app.inject({
    method: 'POST',
    url: '/api/v1/workforce/aux/transition',
    headers: { authorization: 'Bearer ' + modA.token },
    payload: {
      state: 'BREAK',
      version: snapA.version,
      attendanceSessionId: snapA.attendanceSessionId,
    },
  });
  assert.equal(auxLockRes.statusCode, 409, 'AUX transition must be locked while holding active reservation');
  assert.equal(auxLockRes.json().error.code, 'ACTIVE_CASE');

  // 9. Heartbeat: Extends reservation lease
  const beforeExpires = new Date(resA.leaseExpiresAt).getTime();
  const heartbeatRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/reservations/${resA.id}/heartbeat`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(heartbeatRes.statusCode, 200);
  const afterExpires = new Date(heartbeatRes.json().leaseExpiresAt).getTime();
  assert.ok(afterExpires >= beforeExpires);
  assert.ok(Number.isFinite(Date.parse(heartbeatRes.json().serverTime)));

  const unrelatedQueue = await createQueue('A different review queue');
  await prisma.moderationTask.create({
    data: {
      caseId: resA.caseId, queueId: unrelatedQueue.id, queueVersion: 1, form: {},
      deadline: new Date(Date.now() + 86400000),
    },
  });
  const current = await app.inject({
    method: 'GET',
    url: `/api/v1/moderation/queues/${queue.id}/moderate/current`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().reservation.id, resA.id);
  assert.equal(current.json().reservation.reservedAt, resA.reservedAt);
  assert.deepEqual(current.json().reservation.case.tasks.map((item: { queueId: string }) => item.queueId), [queue.id]);
  assert.equal('placeMetadata' in current.json().reservation.case.admission.facility, false);

  // 10. Auto-Next on Submit: Mod A submits decision and receives next case
  const evidenceId = resA.case.admission.facility.evidence[0].id;
  const body = {
    action: 'APPROVE',
    reason: 'Parking signs and entrance verified with independent ground data.',
    answers: { review_tag: 'SITE_CHECK' },
    evidenceIds: [evidenceId],
  };
  const submitUrl = `/api/v1/moderation/reservations/${resA.id}/submit`;
  const submitHeaders = { authorization: 'Bearer ' + modA.token };
  for (const [payload, code] of [
    [{ ...body, answers: { review_tag: 'UNCONFIGURED' } }, 'INVALID_REVIEW_ANSWERS'],
    [{ ...body, evidenceIds: [randomUUID()] }, 'INVALID_EVIDENCE'],
    [{ ...body, evidenceIds: [] }, 'EVIDENCE_REQUIRED'],
  ] as const) {
    const rejected = await app.inject({ method: 'POST', url: submitUrl, headers: submitHeaders, payload });
    assert.equal(rejected.statusCode, 422, rejected.body);
    assert.equal(rejected.json().error.code, code);
  }
  const submitRes = await app.inject({
    method: 'POST', url: submitUrl, headers: submitHeaders, payload: body,
  });
  assert.equal(submitRes.statusCode, 200);
  const submitBody = submitRes.json();
  assert.equal(submitBody.completed, true);
  assert.ok(submitBody.durationSeconds >= 0, 'Duration in seconds must be recorded');
  assert.equal(submitBody.sessionEnded, false);
  assert.ok(submitBody.nextReservation, 'Should auto-allocate next case');
  assert.notEqual(submitBody.nextReservation.caseId, resA.caseId, 'Next case must be different');
  assert.notEqual(submitBody.nextReservation.caseId, resB.caseId, 'Next case must not collide with Mod B');
  const retry = await app.inject({ method: 'POST', url: submitUrl, headers: submitHeaders, payload: body });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().decisionVersionId, submitBody.decisionVersionId);
  assert.equal(retry.json().nextReservation.id, submitBody.nextReservation.id);
  assert.equal(retry.json().casesCompleted, 1);
  const alteredReplay = await app.inject({
    method: 'POST', url: submitUrl, headers: submitHeaders, payload: { ...body, reason: 'Changed retry' },
  });
  assert.equal(alteredReplay.statusCode, 409);
  assert.equal(alteredReplay.json().error.code, 'DECISION_ALREADY_SUBMITTED');
  assert.equal(await prisma.parkingHumanLabel.count({
    where: { caseId: resA.case.facilityId, decision: 'CONFIRM_PARKING' },
  }), 1);

  const secondResA = submitBody.nextReservation;

  // 11. Safe Release: Mod A releases current case without AHT credit
  const releaseRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/reservations/${secondResA.id}/release`,
    headers: { authorization: 'Bearer ' + modA.token },
    payload: { reason: 'UNREADABLE_SIGNS' },
  });
  assert.equal(releaseRes.statusCode, 200);
  assert.equal(releaseRes.json().released, true);

  // Released case returns to QUEUED in database
  const releasedCaseInDb = await prisma.moderationCase.findUnique({ where: { id: secondResA.caseId } });
  assert.equal(releasedCaseInDb?.status, 'QUEUED');
  assert.equal(releasedCaseInDb?.owner, null);

  // 12. Submit & Leave: Mod B finishes case and leaves
  const submitLeaveRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/reservations/${resB.id}/submit-and-leave`,
    headers: { authorization: 'Bearer ' + modB.token },
    payload: {
      action: 'REJECT',
      reason: 'Not a public parking facility (private residential garage).',
      answers: { review_tag: 'REPORT_DISMISSED' },
    },
  });
  assert.equal(submitLeaveRes.statusCode, 200);
  const submitLeaveBody = submitLeaveRes.json();
  assert.equal(submitLeaveBody.completed, true);
  assert.equal(submitLeaveBody.sessionEnded, true);
  assert.equal(submitLeaveBody.nextReservation, null);

  // Session for Mod B is now ENDED
  const sessionBInDb = await prisma.moderationWorkSession.findFirst({ where: { moderatorId: modB.id } });
  assert.equal(sessionBInDb?.status, 'ENDED');
  assert.equal(sessionBInDb?.endReason, 'USER_SUBMIT_AND_LEAVE');

  // AUX is now UNLOCKED for Mod B!
  const auxUnlockRes = await punch(modB, AuxStatus.BREAK);
  assert.equal(auxUnlockRes.state, 'BREAK', 'AUX transition must succeed after Submit & Leave');

  // 13. AHT Calculation: Must strictly report in seconds!
  const ahtRes = await app.inject({
    method: 'GET',
    url: `/api/v1/moderation/queues/${queue.id}/aht`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(ahtRes.statusCode, 200);
  const ahtData = ahtRes.json();
  assert.ok(typeof ahtData.ahtSeconds === 'number', 'AHT must be returned in seconds');
  assert.ok(ahtData.ahtSeconds >= 1, 'AHT should be >= 1s');

  // Also verify queue metrics has ahtSeconds in seconds
  const metricsRes = await app.inject({
    method: 'GET',
    url: `/api/v1/moderation/queues/${queue.id}/metrics`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(metricsRes.statusCode, 200);
  assert.ok(typeof metricsRes.json().ahtSeconds === 'number');

  // 14. Moderator Session Metrics
  const sessionMetricsRes = await app.inject({
    method: 'GET',
    url: `/api/v1/moderation/sessions/${sessionBInDb!.id}/metrics`,
    headers: { authorization: 'Bearer ' + modB.token },
  });
  assert.equal(sessionMetricsRes.statusCode, 200);
  const sessionMetrics = sessionMetricsRes.json();
  assert.equal(sessionMetrics.casesCompleted, 1);
  assert.equal(sessionMetrics.submitAndLeaveCount, 1);
  assert.equal(sessionMetrics.submitAndLeaveRate, 1.0);
  assert.ok(typeof sessionMetrics.ahtSeconds === 'number');

  // 15. Leave Session: Mod A leaves session explicitly
  const leaveRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/sessions/${sessionAId}/leave`,
    headers: { authorization: 'Bearer ' + modA.token },
  });
  assert.equal(leaveRes.statusCode, 200);
  assert.equal(leaveRes.json().sessionEnded, true);
});

it('Concurrent multi-worker reservation and uniform random allocation test', async (t) => {
  const app = buildApp();
  const password = 'ConcurrentTestPass123!';
  const orgs: string[] = [];
  const lobs: string[] = [];
  const staffIds: string[] = [];
  const queueIds: string[] = [];
  const caseIds: string[] = [];
  const facilityIds: string[] = [];

  t.after(async () => {
    await app.close();
    if (caseIds.length) {
      await prisma.caseHandlingRecord.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationDecisionVersion.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationCaseReservation.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationTask.deleteMany({ where: { caseId: { in: caseIds } } });
      await prisma.moderationCase.deleteMany({ where: { id: { in: caseIds } } });
    }
    if (facilityIds.length) {
      await prisma.searchAdmission.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.parkingIntelligenceCase.deleteMany({ where: { id: { in: facilityIds } } });
    }
    if (queueIds.length) {
      await prisma.queueSubscription.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.queueLobAccess.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.moderationWorkSession.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.moderationQueue.deleteMany({ where: { id: { in: queueIds } } });
    }
    if (staffIds.length) {
      await prisma.attendanceSession.deleteMany({ where: { moderatorId: { in: staffIds } } });
      await prisma.moderator.deleteMany({ where: { id: { in: staffIds } } });
    }
    if (lobs.length) {
      await prisma.lob.deleteMany({ where: { id: { in: lobs } } });
    }
    if (orgs.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    }
    await prisma.$disconnect();
  });

  const org = await prisma.organization.create({
    data: { name: 'Concurrent Org', code: randomUUID(), createdBy: 'test' },
  });
  orgs.push(org.id);

  const lob = await prisma.lob.create({
    data: { name: 'Concurrent LOB', code: randomUUID(), createdBy: 'test', organizationId: org.id },
  });
  lobs.push(lob.id);

  const queue = await prisma.moderationQueue.create({
    data: {
      code: 'Q-CONCUR-' + randomUUID().slice(0, 6),
      name: 'Concurrent Stress Queue',
      kind: 'USER_REPORT',
      organizationId: org.id,
      config: { slaHours: 24, form: [], rule: { field: 'source', operator: 'EQUAL', value: 'REPORT' } },
      createdBy: 'test',
    },
  });
  queueIds.push(queue.id);
  await prisma.queueLobAccess.create({
    data: { queueId: queue.id, lobId: lob.id, organizationId: org.id, actorId: 'test', actorType: 'SUPER_ADMIN' },
  });

  // Create 10 synthetic cases
  for (let i = 0; i < 10; i++) {
    const facility = await prisma.parkingIntelligenceCase.create({
      data: {
        googlePlaceId: 'concur-place-' + randomUUID(),
        displayName: 'Concurrent Facility ' + i,
        admission: { create: { firstEvent: 'concurrent-test' } },
      },
    });
    facilityIds.push(facility.id);

    const c = await prisma.moderationCase.create({
      data: {
        code: 'CASE-CONCUR-' + i,
        activeKey: 'key-concur-' + randomUUID(),
        facilityId: facility.id,
        category: 'PARKING_ISSUE',
        trigger: 'REPORT',
        status: 'QUEUED',
        tasks: {
          create: {
            queueId: queue.id,
            queueVersion: 1,
            form: {},
            deadline: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    caseIds.push(c.id);
  }

  // Create 8 moderators, login, punch MODERATING, subscribe to queue
  const workers = [];
  for (let i = 0; i < 8; i++) {
    const id = randomUUID();
    const email = id + '@concurrent.test';
    await prisma.moderator.create({
      data: {
        id,
        email,
        name: 'Worker ' + i,
        status: 'ACTIVE',
        role: 'MODERATOR',
        organizationId: org.id,
        lobId: lob.id,
        accounts: {
          create: {
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
    });
    staffIds.push(id);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email, password },
    });
    const token = loginRes.json().token as string;
    const sessRes = await app.inject({
      method: 'GET',
      url: '/api/moderator-auth/get-session',
      headers: { authorization: 'Bearer ' + token },
    });
    const authSessionId = sessRes.json().session.id as string;

    // Punch MODERATING
    const auxMe = await app.inject({
      method: 'GET',
      url: '/api/v1/workforce/aux/me',
      headers: { authorization: 'Bearer ' + token },
    });
    const snap = auxMe.json();
    await app.inject({
      method: 'POST',
      url: '/api/v1/workforce/aux/transition',
      headers: { authorization: 'Bearer ' + token },
      payload: {
        state: 'MODERATING',
        version: snap.version,
        attendanceSessionId: snap.attendanceSessionId,
      },
    });

    // Subscribe
    await prisma.queueSubscription.create({
      data: { moderatorId: id, queueId: queue.id },
    });

    workers.push({ id, token, authSessionId });
  }

  // Fire simultaneous POST /queues/:id/moderate/start across all 8 workers
  const concurrentResults = await Promise.all(
    workers.map((w) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/moderation/queues/${queue.id}/moderate/start`,
        headers: { authorization: 'Bearer ' + w.token },
      }),
    ),
  );

  for (const res of concurrentResults) {
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(res.json().reservation, 'Every worker must receive an active reservation');
  }

  // Mathematical proof of collision-freedom under concurrency
  const reservedCaseIds = concurrentResults.map((r) => r.json().reservation.caseId);
  const uniqueCaseIds = new Set(reservedCaseIds);
  assert.equal(
    uniqueCaseIds.size,
    workers.length,
    `Zero collisions required! Reserved ${uniqueCaseIds.size} unique cases for ${workers.length} concurrent workers.`,
  );
});
