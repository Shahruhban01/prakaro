import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';

describe('Phase 10: Authorization Penetration Tests & Identity Boundary Hardening', () => {
  const app = buildApp();

  let superAdminToken: string;
  let superAdminId: string;
  let superAdminEmail: string;

  let modAdminToken: string;
  let modAdminId: string;
  let modAdminEmail: string;

  let moderator1Token: string;
  let moderator1Id: string;
  let moderator1Email: string;

  let moderator2Token: string;
  let moderator2Id: string;
  let moderator2Email: string;

  let ordinaryUserToken: string;
  let ordinaryUserId: string;

  let restrictedQueueId: string;
  let otherQueueId: string;
  let testCaseId: string;
  let testTaskId: string;
  let testIntelligenceId: string;

  before(async () => {
    await app.ready();

    // 1. Provision Super Admin
    superAdminEmail = `sec-super-${randomUUID()}@prakaro.test`;
    const password = 'SecPassword123!';
    const hashed = await hashPassword(password);
    const sa = await prisma.superAdmin.create({
      data: {
        name: 'Sec Super Admin',
        email: superAdminEmail,
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    superAdminId = sa.id;
    await prisma.superAdminAccount.create({
      data: {
        userId: sa.id,
        accountId: sa.id,
        providerId: 'credential',
        password: hashed,
      },
    });
    const saRes = await app.inject({
      method: 'POST',
      url: '/api/super-admin-auth/sign-in/email',
      payload: { email: superAdminEmail, password },
    });
    assert.strictEqual(saRes.statusCode, 200);
    superAdminToken = JSON.parse(saRes.body).token;

    // 2. Provision Moderation Admin (role: MODERATION_ADMIN)
    modAdminEmail = `sec-modadmin-${randomUUID()}@prakaro.test`;
    const ma = await prisma.moderator.create({
      data: {
        name: 'Sec Moderation Admin',
        email: modAdminEmail,
        status: 'ACTIVE',
        role: 'MODERATION_ADMIN',
        emailVerified: true,
      },
    });
    modAdminId = ma.id;
    await prisma.moderatorAccount.create({
      data: {
        userId: ma.id,
        accountId: ma.id,
        providerId: 'credential',
        password: hashed,
      },
    });
    const maRes = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email: modAdminEmail, password },
    });
    assert.strictEqual(maRes.statusCode, 200);
    modAdminToken = JSON.parse(maRes.body).token;

    // 3. Provision Moderator 1
    moderator1Email = `sec-mod1-${randomUUID()}@prakaro.test`;
    const m1 = await prisma.moderator.create({
      data: {
        name: 'Sec Moderator 1',
        email: moderator1Email,
        status: 'ACTIVE',
        role: 'MODERATOR',
        emailVerified: true,
      },
    });
    moderator1Id = m1.id;
    await prisma.moderatorAccount.create({
      data: {
        userId: m1.id,
        accountId: m1.id,
        providerId: 'credential',
        password: hashed,
      },
    });
    const m1Res = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email: moderator1Email, password },
    });
    assert.strictEqual(m1Res.statusCode, 200);
    moderator1Token = JSON.parse(m1Res.body).token;

    // 4. Provision Moderator 2
    moderator2Email = `sec-mod2-${randomUUID()}@prakaro.test`;
    const m2 = await prisma.moderator.create({
      data: {
        name: 'Sec Moderator 2',
        email: moderator2Email,
        status: 'ACTIVE',
        role: 'MODERATOR',
        emailVerified: true,
      },
    });
    moderator2Id = m2.id;
    await prisma.moderatorAccount.create({
      data: {
        userId: m2.id,
        accountId: m2.id,
        providerId: 'credential',
        password: hashed,
      },
    });
    const m2Res = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email: moderator2Email, password },
    });
    assert.strictEqual(m2Res.statusCode, 200);
    moderator2Token = JSON.parse(m2Res.body).token;

    // 5. Provision Ordinary User (Mobile Driver)
    const userEmail = `sec-user-${randomUUID()}@prakaro.test`;
    const uRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Ordinary Driver',
        email: userEmail,
        password,
      },
    });
    assert.strictEqual(uRes.statusCode, 200);
    const uBody = JSON.parse(uRes.body);
    ordinaryUserToken = uBody.token;
    ordinaryUserId = uBody.user.id;

    // 6. Create queues: restrictedQueue (only mod1) and otherQueue (only mod2)
    const q1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/moderation/queues',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Restricted Queue 1',
        kind: 'GENERAL',
        priority: 50,
        capacity: 100,
        config: {
          rule: { field: 'source', value: 'SEARCH' },
          columns: ['code', 'category', 'status', 'priority'],
          form: [],
          slaHours: 24,
          qaPercent: 100,
        },
      },
    });
    assert.strictEqual(q1Res.statusCode, 200);
    restrictedQueueId = JSON.parse(q1Res.body).id;

    const q2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/moderation/queues',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Other Queue 2',
        kind: 'ACCESS',
        priority: 60,
        capacity: 100,
        config: {
          rule: { field: 'source', value: 'SEARCH' },
          columns: ['code', 'category', 'status', 'priority'],
          form: [],
          slaHours: 24,
          qaPercent: 100,
        },
      },
    });
    assert.strictEqual(q2Res.statusCode, 200);
    otherQueueId = JSON.parse(q2Res.body).id;

    // Assign Mod 1 to restrictedQueue ONLY
    await prisma.moderationMembership.create({
      data: { moderatorId: moderator1Id, queueId: restrictedQueueId },
    });

    // Assign Mod 2 to otherQueue ONLY
    await prisma.moderationMembership.create({
      data: { moderatorId: moderator2Id, queueId: otherQueueId },
    });

    // Create a test case assigned to restrictedQueue
    const dummyPlaceId = `test_sec_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const f = await prisma.parkingIntelligenceCase.create({
      data: { googlePlaceId: dummyPlaceId },
    });
    testIntelligenceId = f.id;
    await prisma.searchAdmission.create({
      data: { facilityId: f.id, firstEvent: 'sec-event-1' },
    });
    const c = await prisma.moderationCase.create({
      data: {
        facilityId: f.id,
        category: 'SECURITY_TEST',
        trigger: 'SEARCH',
        code: `CASE-2026-${randomUUID().slice(0, 6)}`,
        status: 'QUEUED',
        tasks: {
          create: {
            queueId: restrictedQueueId,
            queueVersion: 1,
            form: {},
            deadline: new Date(Date.now() + 86400000),
          },
        },
      },
      include: { tasks: true },
    });
    testCaseId = c.id;
    testTaskId = c.tasks[0].id;
  });

  after(async () => {
    if (testIntelligenceId) {
      await prisma.moderationSubmission.deleteMany({ where: { case: { facilityId: testIntelligenceId } } }).catch(() => {});
      await prisma.moderationTask.deleteMany({ where: { case: { facilityId: testIntelligenceId } } }).catch(() => {});
      await prisma.moderationCase.deleteMany({ where: { facilityId: testIntelligenceId } }).catch(() => {});
      await prisma.searchAdmission.deleteMany({ where: { facilityId: testIntelligenceId } }).catch(() => {});
      await prisma.parkingIntelligenceCase.deleteMany({ where: { id: testIntelligenceId } }).catch(() => {});
    }
    const qIds = [restrictedQueueId, otherQueueId].filter(Boolean);
    if (qIds.length) {
      await prisma.moderationMembership.deleteMany({ where: { queueId: { in: qIds } } }).catch(() => {});
      await prisma.moderationTask.deleteMany({ where: { queueId: { in: qIds } } }).catch(() => {});
      await prisma.moderationQueue.deleteMany({ where: { id: { in: qIds } } }).catch(() => {});
    }
    if (superAdminId) {
      await prisma.superAdminSession.deleteMany({ where: { userId: superAdminId } }).catch(() => {});
      await prisma.superAdminAccount.deleteMany({ where: { userId: superAdminId } }).catch(() => {});
      await prisma.superAdmin.deleteMany({ where: { id: superAdminId } }).catch(() => {});
    }
    const mIds = [modAdminId, moderator1Id, moderator2Id].filter(Boolean);
    if (mIds.length) {
      await prisma.moderatorSession.deleteMany({ where: { userId: { in: mIds } } }).catch(() => {});
      await prisma.moderatorAccount.deleteMany({ where: { userId: { in: mIds } } }).catch(() => {});
      await prisma.moderator.deleteMany({ where: { id: { in: mIds } } }).catch(() => {});
    }
    if (ordinaryUserId) {
      await prisma.session.deleteMany({ where: { userId: ordinaryUserId } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: ordinaryUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: ordinaryUserId } }).catch(() => {});
    }
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Cross-Domain Access Denial', () => {
    it('ordinary user cannot access moderation queue list (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${ordinaryUserToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('ordinary user cannot access moderation case list (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/cases',
        headers: { authorization: `Bearer ${ordinaryUserToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('ordinary user cannot access super-admin endpoints (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/super-admins',
        headers: { authorization: `Bearer ${ordinaryUserToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderator cannot access super-admin management (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/super-admins',
        headers: { authorization: `Bearer ${moderator1Token}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderation admin cannot access super-admin management (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/super-admins',
        headers: { authorization: `Bearer ${modAdminToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderation admin cannot provision new super admin (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/super-admins',
        headers: { authorization: `Bearer ${modAdminToken}` },
        payload: {
          name: 'Rogue Super Admin',
          email: `rogue-${randomUUID()}@prakaro.test`,
          password: 'RoguePassword123!',
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('2. Queue Scoping & Task Claiming Restrictions', () => {
    it('moderator cannot view a queue they are not assigned to (403 Forbidden)', async () => {
      // Mod 2 is only in otherQueue, cannot inspect restrictedQueue
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/moderation/queues/${restrictedQueueId}`,
        headers: { authorization: `Bearer ${moderator2Token}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderator cannot claim a task from an unassigned queue (409 Conflict)', async () => {
      // Mod 2 is not assigned to restrictedQueue
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/claim`,
        headers: { authorization: `Bearer ${moderator2Token}` },
      });
      assert.strictEqual(res.statusCode, 409);
    });

    it('assigned moderator can claim task from their authorized queue', async () => {
      // Mod 1 is assigned to restrictedQueue
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/claim`,
        headers: { authorization: `Bearer ${moderator1Token}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(JSON.parse(res.body).ok, true);
    });
  });

  describe('3. Privilege Escalation Prevention', () => {
    it('moderation admin cannot promote themselves or anyone to SUPER_ADMIN (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/moderators',
        headers: { authorization: `Bearer ${modAdminToken}` },
        payload: {
          email: moderator1Email,
          role: 'SUPER_ADMIN',
          active: true,
          queues: [],
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderation admin cannot promote anyone to MODERATION_ADMIN (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/moderators',
        headers: { authorization: `Bearer ${modAdminToken}` },
        payload: {
          email: moderator2Email,
          role: 'MODERATION_ADMIN',
          active: true,
          queues: [],
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderation admin cannot modify their own role (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/moderators',
        headers: { authorization: `Bearer ${modAdminToken}` },
        payload: {
          email: modAdminEmail,
          role: 'SUPER_ADMIN',
          active: true,
          queues: [],
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('moderator cannot access moderator management endpoint (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/moderators',
        headers: { authorization: `Bearer ${moderator1Token}` },
        payload: {
          email: `new-${randomUUID()}@prakaro.test`,
          role: 'MODERATOR',
          active: true,
          queues: [],
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('4. Deactivated Account & Session Boundary Enforcement', () => {
    it('deactivated moderator token is rejected immediately on subsequent requests (403 Forbidden)', async () => {
      // Deactivate Mod 1 in database
      await prisma.moderator.update({
        where: { id: moderator1Id },
        data: { status: 'DEACTIVATED' },
      });

      // Mod 1 tries to access profile with existing session token
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
        headers: { authorization: `Bearer ${moderator1Token}` },
      });
      assert.strictEqual(res.statusCode, 403);

      // Reactivate Mod 1 for subsequent tests
      await prisma.moderator.update({
        where: { id: moderator1Id },
        data: { status: 'ACTIVE' },
      });
    });

    it('forged Bearer token is rejected with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
        headers: { authorization: 'Bearer completely_bogus_token_signature_123' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('forged session cookie is rejected with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
        headers: { cookie: 'prakaro_moderator.session_token=bogus_cookie_payload_xyz' },
      });
      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('5. Independent QA Gate Enforcement', () => {
    it('original reviewer cannot approve/publish their own review (409/403 Conflict)', async () => {
      // Release Mod 1 claim if claimed
      await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/release`,
        headers: { authorization: `Bearer ${moderator1Token}` },
      });

      // Mod 1 claims the case
      await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/claim`,
        headers: { authorization: `Bearer ${moderator1Token}` },
      });

      // Attach evidence by Mod 1
      const evRes = await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/evidence`,
        headers: { authorization: `Bearer ${moderator1Token}` },
        payload: {
          source: 'PRAKARO_AUDIT',
          reference: 'https://maps.google.com/test-evidence',
          finding: 'CONFIRMED_PARKING',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      if (evRes.statusCode !== 200) {
        console.error('Evidence injection failed:', evRes.statusCode, evRes.body);
      }

      // Fetch case to get evidence ID
      const caseData = await prisma.moderationCase.findUnique({
        where: { id: testCaseId },
        include: { admission: true },
      });
      const ev = await prisma.parkingEvidenceReference.findFirst({
        where: { caseId: caseData!.facilityId },
      });

      // Submit review by Mod 1
      await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/reviews`,
        headers: { authorization: `Bearer ${moderator1Token}` },
        payload: {
          taskId: testTaskId,
          revision: caseData!.revision,
          action: 'APPROVE',
          answers: {},
          evidenceIds: [ev!.id],
          reason: 'Verified by field moderator',
        },
      });

      // Mod 1 attempts QA approval on their own review
      const updatedCase = await prisma.moderationCase.findUnique({ where: { id: testCaseId } });
      const qaSelfApprovalRes = await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/qa`,
        headers: { authorization: `Bearer ${moderator1Token}` },
        payload: {
          action: 'PUBLISH',
          revision: updatedCase!.revision,
          reason: 'Attempting to self-approve my own review',
        },
      });

      // Must be rejected because review.reviewerId === a.userId
      if (![403, 409].includes(qaSelfApprovalRes.statusCode)) {
        console.error('qaSelfApprovalRes returned:', qaSelfApprovalRes.statusCode, qaSelfApprovalRes.body);
      }
      assert.ok(
        [403, 409].includes(qaSelfApprovalRes.statusCode),
        `Expected 403 or 409 but got ${qaSelfApprovalRes.statusCode}`,
      );
      // 1. Plain MODERATOR cannot perform QA (403 Forbidden)
      assert.strictEqual(qaSelfApprovalRes.statusCode, 403);
      assert.ok(
        JSON.parse(qaSelfApprovalRes.body).error.message.includes('Insufficient role permissions'),
      );

      // 2. Now promote Mod 1 temporarily to QA_REVIEWER, and try to approve their own review
      await prisma.moderator.update({
        where: { id: moderator1Id },
        data: { role: 'QA_REVIEWER' },
      });

      const qaReviewerSelfApprovalRes = await app.inject({
        method: 'POST',
        url: `/api/v1/moderation/cases/${testCaseId}/qa`,
        headers: { authorization: `Bearer ${moderator1Token}` },
        payload: {
          action: 'PUBLISH',
          revision: updatedCase!.revision,
          reason: 'Attempting self-approval as QA reviewer',
        },
      });

      // Must be rejected with 409 Conflict: Independent second reviewer required
      assert.strictEqual(qaReviewerSelfApprovalRes.statusCode, 409);
      assert.ok(
        JSON.parse(qaReviewerSelfApprovalRes.body).error.message.includes('Independent second reviewer required'),
      );
    });
  });
});
