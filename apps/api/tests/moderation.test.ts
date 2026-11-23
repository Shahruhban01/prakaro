import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { admit } from '../src/modules/moderation/intake';
import type { ParkingFacility } from '../src/modules/parking/parking.types';

describe('Milestone 13: Search-Driven Parking Verification & Moderation Platform', () => {
  const app = buildApp();

  let adminToken: string;
  let adminUserId: string;

  let modToken: string;
  let modUserId: string;
  let modEmail: string;

  let viewerToken: string;
  let viewerUserId: string;

  let unprivilegedToken: string;
  let unprivilegedUserId: string;

  let createdQueueId: string;
  let reportQueueId: string;
  let testCaseId: string;
  let testPlaceId: string;
  let testIntelligenceId: string;

  let organizationId = '';
  let lobId = '';
  before(async () => {
    await app.ready();
    const org = await prisma.organization.create({
      data: { name: 'Synthetic test organization', code: randomUUID(), createdBy: 'test' },
    });
    organizationId = org.id;
    const lob = await prisma.lob.create({
      data: { name: 'Synthetic test LOB', code: randomUUID(), createdBy: 'test', organizationId },
    });
    lobId = lob.id;

    // 1. Create Super Admin in super_admins & sign in via /api/super-admin-auth/sign-in/email
    const adminEmail = `admin-${randomUUID()}@prakaro.test`;
    const adminPassword = 'Password123!';
    const hashedAdminPassword = await hashPassword(adminPassword);
    const superAdmin = await prisma.superAdmin.create({
      data: {
        name: 'Mod Super Admin',
        email: adminEmail,
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    adminUserId = superAdmin.id;
    await prisma.superAdminAccount.create({
      data: {
        userId: superAdmin.id,
        accountId: superAdmin.id,
        providerId: 'credential',
        password: hashedAdminPassword,
      },
    });
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/super-admin-auth/sign-in/email',
      payload: { email: adminEmail, password: adminPassword },
    });
    assert.strictEqual(adminRes.statusCode, 200);
    const adminBody = JSON.parse(adminRes.body);
    adminToken = adminBody.token;

    // 2. Create Moderator in moderators & sign in via /api/moderator-auth/sign-in/email
    modEmail = `mod-${randomUUID()}@prakaro.test`;
    const modPassword = 'Password123!';
    const hashedModPassword = await hashPassword(modPassword);
    const moderator = await prisma.moderator.create({
      data: {
        organizationId,
        lobId,
        name: 'Field Moderator',
        email: modEmail,
        status: 'ACTIVE',
        role: 'MODERATOR',
        emailVerified: true,
      },
    });
    modUserId = moderator.id;
    await prisma.moderatorAccount.create({
      data: {
        userId: moderator.id,
        accountId: moderator.id,
        providerId: 'credential',
        password: hashedModPassword,
      },
    });
    const modRes = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email: modEmail, password: modPassword },
    });
    assert.strictEqual(modRes.statusCode, 200);
    const modBody = JSON.parse(modRes.body);
    modToken = modBody.token;

    // 3. Create Viewer in moderators & sign in via /api/moderator-auth/sign-in/email
    const viewerEmail = `viewer-${randomUUID()}@prakaro.test`;
    const viewerPassword = 'Password123!';
    const hashedViewerPassword = await hashPassword(viewerPassword);
    const viewer = await prisma.moderator.create({
      data: {
        organizationId,
        lobId,
        name: 'Auditor Viewer',
        email: viewerEmail,
        status: 'ACTIVE',
        role: 'VIEWER',
        emailVerified: true,
      },
    });
    viewerUserId = viewer.id;
    await prisma.moderatorAccount.create({
      data: {
        userId: viewer.id,
        accountId: viewer.id,
        providerId: 'credential',
        password: hashedViewerPassword,
      },
    });
    const viewerRes = await app.inject({
      method: 'POST',
      url: '/api/moderator-auth/sign-in/email',
      payload: { email: viewerEmail, password: viewerPassword },
    });
    assert.strictEqual(viewerRes.statusCode, 200);
    const viewerBody = JSON.parse(viewerRes.body);
    viewerToken = viewerBody.token;

    // 4. Create Unprivileged regular user (ordinary mobile app user)
    const unprivRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        name: 'Regular App User',
        email: `user-${randomUUID()}@prakaro.test`,
        password: 'Password123!',
      },
    });
    assert.strictEqual(unprivRes.statusCode, 200);
    const unprivBody = JSON.parse(unprivRes.body);
    unprivilegedToken = unprivBody.token;
    unprivilegedUserId = unprivBody.user.id;
  });

  after(async () => {
    // Clean up in reverse dependency order
    const queueIds = [createdQueueId, reportQueueId].filter(Boolean);
    if (testIntelligenceId) {
      await prisma.moderationSubmission
        .deleteMany({ where: { case: { facilityId: testIntelligenceId } } })
        .catch(() => {});
      await prisma.moderationTask
        .deleteMany({ where: { case: { facilityId: testIntelligenceId } } })
        .catch(() => {});
      await prisma.moderationCase
        .deleteMany({ where: { facilityId: testIntelligenceId } })
        .catch(() => {});
      await prisma.searchAdmission
        .deleteMany({ where: { facilityId: testIntelligenceId } })
        .catch(() => {});
      await prisma.parkingEvidenceReference
        .deleteMany({ where: { caseId: testIntelligenceId } })
        .catch(() => {});
      await prisma.parkingHumanLabel
        .deleteMany({ where: { caseId: testIntelligenceId } })
        .catch(() => {});
      await prisma.parkingIntelligenceCase
        .deleteMany({ where: { id: testIntelligenceId } })
        .catch(() => {});
    }
    if (queueIds.length) {
      await prisma.queueConfigurationVersion.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.queueLobAccess.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.queueSubscription.deleteMany({ where: { queueId: { in: queueIds } } });
      await prisma.moderationMembership
        .deleteMany({ where: { queueId: { in: queueIds } } })
        .catch(() => {});
      await prisma.moderationTask
        .deleteMany({ where: { queueId: { in: queueIds } } })
        .catch(() => {});
      await prisma.moderationQueue.deleteMany({ where: { id: { in: queueIds } } }).catch(() => {});
    }
    if (adminUserId) {
      await prisma.superAdminSession.deleteMany({ where: { userId: adminUserId } }).catch(() => {});
      await prisma.superAdminAccount.deleteMany({ where: { userId: adminUserId } }).catch(() => {});
      await prisma.superAdmin.deleteMany({ where: { id: adminUserId } }).catch(() => {});
    }
    const modIds = [modUserId, viewerUserId].filter(Boolean);
    if (modIds.length) {
      await prisma.moderatorSession
        .deleteMany({ where: { userId: { in: modIds } } })
        .catch(() => {});
      await prisma.moderatorAccount
        .deleteMany({ where: { userId: { in: modIds } } })
        .catch(() => {});
      await prisma.moderator.deleteMany({ where: { id: { in: modIds } } }).catch(() => {});
    }
    if (unprivilegedUserId) {
      await prisma.session.deleteMany({ where: { userId: unprivilegedUserId } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: unprivilegedUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: unprivilegedUserId } }).catch(() => {});
    }
    await app.close();
    await prisma.lob.deleteMany({ where: { id: lobId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  describe('1. Authentication & RBAC Boundaries', () => {
    it('rejects unauthenticated requests to moderation endpoints with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects regular non-staff user requests with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
        headers: { authorization: `Bearer ${unprivilegedToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('returns staff profile and assigned queues for authorized staff', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/session',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.role, 'SUPER_ADMIN');
      assert.strictEqual(data.admin, true);
    });

    it('denies VIEWER role from creating queues with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          name: 'Unauthorized Queue',
          kind: 'GENERAL',
          priority: 50,
          capacity: 100,
          config: {
            rule: { field: 'source', value: 'SEARCH' },
            columns: ['code', 'category', 'status', 'priority'],
            form: [],
            slaHours: 24,
            qaPercent: 50,
          },
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('2. Queue Management, Atomic Codes & Config Validation', () => {
    it('creates a moderation queue with nested rule and dynamic questions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Airport & Transit Verification',
          organizationId,
          intakeEnabled: true,
          description: 'High-priority intake queue for airport and transit parking discovery',
          kind: 'GENERAL',
          priority: 80,
          capacity: 500,
          config: {
            rule: {
              op: 'OR',
              children: [
                { field: 'category', value: 'NEW_FACILITY_VERIFICATION' },
                { field: 'source', value: 'SEARCH' },
              ],
            },
            columns: ['code', 'category', 'status', 'priority', 'owner', 'createdAt'],
            form: [
              {
                key: 'facility_exists',
                label: 'Does an authentic vehicle parking facility exist at this location?',
                type: 'BOOLEAN',
                required: true,
                options: [],
              },
            ],
            slaHours: 24,
            qaPercent: 100,
          },
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const queue = JSON.parse(res.body);
      assert.ok(queue.id);
      assert.match(queue.code, /^QUEUE-GENERAL-\d{3}$/);
      assert.strictEqual(queue.name, 'Airport & Transit Verification');
      assert.strictEqual(queue.version, 1);
      assert.strictEqual(queue.status, 'ACTIVE');

      createdQueueId = queue.id;
    });

    it('creates a secondary REPORT queue for user complaints', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'User Problem Reports',
          organizationId,
          intakeEnabled: true,
          description: 'Queue for user-submitted problem reports',
          kind: 'REPORT',
          priority: 90,
          capacity: 200,
          config: {
            rule: { field: 'source', value: 'REPORT' },
            columns: ['code', 'category', 'status', 'priority'],
            form: [],
            slaHours: 12,
            qaPercent: 100,
          },
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const queue = JSON.parse(res.body);
      reportQueueId = queue.id;
    });

    it('rejects queue creation with invalid nested rule or invalid operators', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Invalid Queue',
          kind: 'GENERAL',
          priority: 10,
          capacity: 100,
          config: {
            rule: {
              op: 'INVALID_OP',
              children: [{ field: 'category', value: 'AIRPORT' }],
            },
            columns: ['code'],
            form: [],
            slaHours: 12,
            qaPercent: 0,
          },
        },
      });
      assert.strictEqual(res.statusCode, 400);
    });

    it('inspects queue by ID and lists queues', async () => {
      const inspectRes = await app.inject({
        method: 'GET',
        url: `/api/v1/moderation/queues/${createdQueueId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(inspectRes.statusCode, 200);
      const queue = JSON.parse(inspectRes.body);
      assert.strictEqual(queue.id, createdQueueId);
      assert.strictEqual(queue.config.form.length, 1);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/queues',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(listRes.statusCode, 200);
      const list = JSON.parse(listRes.body);
      assert.ok(Array.isArray(list));
      assert.ok(list.some((q: { id: string }) => q.id === createdQueueId));
    });

    it('updates queue settings and automatically increments configuration version', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/moderation/queues/${createdQueueId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Airport & Transit Verification (Updated)',
          description: 'Updated SLA and description',
          kind: 'GENERAL',
          priority: 85,
          capacity: 600,
          status: 'ACTIVE',
          version: 1,
          config: {
            rule: { field: 'source', value: 'SEARCH' },
            columns: ['code', 'category', 'status', 'priority'],
            form: [
              {
                key: 'facility_exists',
                label: 'Does facility exist?',
                type: 'BOOLEAN',
                required: true,
                options: [],
              },
            ],
            slaHours: 48,
            qaPercent: 100,
          },
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const updated = JSON.parse(res.body);
      assert.strictEqual(updated.version, 2);
      assert.strictEqual(updated.name, 'Airport & Transit Verification (Updated)');
    });
  });

  describe('3. Staff Assignment & Queue-Level Authorization', () => {
    it('grants access to the LOB and keeps subscriptions separate', async () => {
      const moderator = { authorization: `Bearer ${modToken}` },
        admin = { authorization: `Bearer ${adminToken}` };
      const path = '/api/v1/moderation/queues/' + createdQueueId;
      const direct = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/moderators',
        headers: admin,
        payload: { email: modEmail, role: 'MODERATOR', queues: [createdQueueId] },
      });
      assert.equal(direct.statusCode, 400);
      assert.equal((await app.inject({ url: path, headers: moderator })).statusCode, 403);
      const grant = await app.inject({
        method: 'PUT',
        url: path + '/lobs',
        headers: admin,
        payload: { lobIds: [lobId], version: 2 },
      });
      assert.equal(grant.statusCode, 200, grant.body);
      assert.equal((await app.inject({ url: path, headers: moderator })).statusCode, 200);
      assert.equal(
        (await app.inject({ url: '/api/v1/moderation/my-queues', headers: moderator })).json()
          .length,
        0,
      );
      const results = await Promise.all(
        [1, 2].map(() =>
          app.inject({ method: 'POST', url: path + '/subscribe', headers: moderator, payload: {} }),
        ),
      );
      assert.ok(results.some((result) => result.statusCode === 200));
      assert.ok(results.every((result) => [200, 409].includes(result.statusCode)));
      assert.equal(
        await prisma.queueSubscription.count({
          where: { queueId: createdQueueId, unsubscribedAt: null },
        }),
        1,
      );
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: path + '/subscribe',
            headers: moderator,
            payload: { moderatorId: viewerUserId },
          })
        ).statusCode,
        400,
      );
      const mine = await app.inject({ url: '/api/v1/moderation/my-queues', headers: moderator });
      assert.equal(mine.json()[0].id, createdQueueId);
    });

    it('lists all moderators for supervisor and admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/moderators',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      const list = JSON.parse(res.body);
      assert.ok(Array.isArray(list));
      assert.ok(list.some((m: { userId: string }) => m.userId === modUserId));
    });
  });

  describe('4. Search-Driven Intake & Admission Deduplication', () => {
    it('admits user search discovery candidate and creates deduplicated case with activeKey', async () => {
      testPlaceId = `test_place_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const candidate: ParkingFacility = {
        id: `google:${testPlaceId}`,
        name: 'Aerocity Metro Parking',
        location: { latitude: 28.556, longitude: 77.1 },
        address: 'Aerocity, New Delhi',
        verification: {
          facilityStatus: 'UNCONFIRMED',
          evidenceLevel: 'INSUFFICIENT',
          access: 'UNKNOWN',
          pricing: 'UNKNOWN',
        },
      };

      const eventId = randomUUID();
      // Execute admission pipeline
      await admit(unprivilegedUserId, eventId, [candidate]);

      const intelligenceCase = await prisma.parkingIntelligenceCase.findUnique({
        where: { googlePlaceId: testPlaceId },
      });
      assert.ok(intelligenceCase, 'Intelligence case should be created');
      testIntelligenceId = intelligenceCase.id;

      const admission = await prisma.searchAdmission.findUnique({
        where: { facilityId: testIntelligenceId },
      });
      assert.ok(admission, 'Search admission record should exist');
      assert.strictEqual(admission.demand, 1);

      const modCase = await prisma.moderationCase.findUnique({
        where: { activeKey: `${testIntelligenceId}:NEW_FACILITY_VERIFICATION` },
        include: { tasks: true },
      });
      assert.ok(modCase, 'Moderation case should be routed and created');
      assert.match(modCase.code, /^CASE-\d{4}-\d{6}$/);
      assert.ok(modCase.tasks.length > 0, 'Task should be created for eligible queue');

      const ourTask = modCase.tasks.find((t) => t.queueId === createdQueueId);
      assert.ok(ourTask, 'Task in createdQueueId must exist');

      testCaseId = modCase.id;

      // Repeat admission with identical facility - verify deduplication (activeKey prevents duplicate case)
      const secondEventId = randomUUID();
      await admit(unprivilegedUserId, secondEventId, [candidate]);

      const totalCasesForFacility = await prisma.moderationCase.count({
        where: { facilityId: testIntelligenceId },
      });
      assert.strictEqual(totalCasesForFacility, 1, 'Should NOT create duplicate active case');

      const updatedAdmission = await prisma.searchAdmission.findUnique({
        where: { facilityId: testIntelligenceId },
      });
      assert.strictEqual(updatedAdmission?.demand, 2, 'Search demand should be incremented');
    });

    it('lists admitted cases filtered by queue or status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/moderation/cases?queue=${createdQueueId}&status=QUEUED`,
        headers: { authorization: `Bearer ${modToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok(data.items.length > 0);
      assert.ok(data.items.some((c: { id: string }) => c.id === testCaseId));
    });
  });

  it('renders queue-contained read-only cases, reports metrics, and denies revoked access', async () => {
    const moderator = { authorization: `Bearer ${modToken}` },
      admin = { authorization: `Bearer ${adminToken}` };
    const path = '/api/v1/moderation/queues/' + createdQueueId;
    const caseView = await app.inject({ url: path + '/cases/' + testCaseId, headers: moderator });
    assert.equal(caseView.statusCode, 200, caseView.body);
    const wrongQueue = await app.inject({
      url: '/api/v1/moderation/queues/' + reportQueueId + '/cases/' + testCaseId,
      headers: admin,
    });
    assert.equal(wrongQueue.statusCode, 404);
    const snapshot = await app.inject({ url: path + '/metrics', headers: moderator });
    assert.equal(snapshot.statusCode, 200, snapshot.body);
    assert.deepEqual(snapshot.json(), {
      pending: 1,
      inProgress: 0,
      completed: 0,
      completedToday: 0,
      activeModerators: 0,
      subscribedModerators: 1,
      ahtSeconds: null,
      reportingTimezone: 'UTC',
    });
    assert.equal(
      (await app.inject({ method: 'POST', url: path + '/moderate', headers: moderator }))
        .statusCode,
      409,
    );
    for (const action of ['claim', 'reviews', 'evidence', 'qa', 'release']) {
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/moderation/cases/' + testCaseId + '/' + action,
            headers: moderator,
            payload: {},
          })
        ).statusCode,
        403,
      );
    }
    assert.equal(
      (await prisma.moderationCase.findUniqueOrThrow({ where: { id: testCaseId } })).owner,
      null,
    );
    assert.equal(
      (await app.inject({ method: 'DELETE', url: path + '/subscribe', headers: moderator }))
        .statusCode,
      200,
    );
    assert.ok(
      (await prisma.queueSubscription.findFirstOrThrow({ where: { queueId: createdQueueId } }))
        .unsubscribedAt,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: path + '/subscribe', headers: moderator }))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: path + '/lobs',
          headers: admin,
          payload: { version: 3, lobIds: [] },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: path + '/metrics', headers: moderator })).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: path + '/subscribe', headers: moderator }))
        .statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: '/api/v1/moderation/my-queues', headers: moderator })).json().length,
      0,
    );
  });

  describe('8. AI Model Discovery & Smoke Test', () => {
    it('lists available AI providers and default verified model (gemini-3.5-flash-lite)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/ai/providers',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.geminiModel, 'geminiModel should be reported');
      assert.strictEqual(body.geminiModel, 'gemini-3.5-flash-lite');
      assert.ok(body.priority.includes('gemini'));
    });
  });

  describe('9. Problem Reports & Immutable Audit Log', () => {
    it('accepts user problem report and writes audit entry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/moderation/reports',
        headers: { authorization: `Bearer ${unprivilegedToken}` },
        payload: {
          placeId: testPlaceId,
          category: 'PRICE',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.ok, true);
      const routed = await prisma.moderationCase.findFirst({
        where: { facilityId: testIntelligenceId, trigger: 'REPORT' },
        include: { tasks: true },
      });
      assert.equal(routed?.tasks[0]?.queueId, reportQueueId);
    });

    it('queries immutable audit trail and analytics metrics', async () => {
      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/audit-log',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(auditRes.statusCode, 200);
      const auditEntries = JSON.parse(auditRes.body);
      assert.ok(Array.isArray(auditEntries));
      assert.ok(auditEntries.length > 0);
      assert.ok(
        auditEntries.some((e: { action: string }) =>
          [
            'QUEUE_CREATED',
            'CASE_ROUTED',
            'CASE_CLAIMED',
            'CASE_RELEASED',
            'PUBLISH',
            'REPORT_RECEIVED',
          ].includes(e.action),
        ),
      );

      const analyticsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/moderation/analytics',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(analyticsRes.statusCode, 200);
      const stats = JSON.parse(analyticsRes.body);
      assert.ok(typeof stats.totalCases === 'number');
    });
  });
});
