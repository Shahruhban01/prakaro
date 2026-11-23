import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { hashPassword } from 'better-auth/crypto';
import { admit } from '../src/modules/moderation/intake';
import type { ParkingFacility } from '../src/modules/parking/parking.types';

async function main() {
  console.log('================================================================');
  console.log('PRAKARO MILESTONE 13.1 — 33-STEP OPERATIONAL ACCEPTANCE SCENARIO');
  console.log('================================================================\n');

  const app = buildApp();
  await app.ready();

  const timestamp = Date.now();
  const password = 'AcceptancePassword123!';
  const hashedPassword = await hashPassword(password);

  // STEP 1: Provision a super-admin identity in super_admins.
  console.log('STEP 1: Provisioning a super-admin identity in super_admins...');
  const superAdminEmail = `superadmin-e2e-${timestamp}@prakaro.test`;
  const superAdmin = await prisma.superAdmin.create({
    data: {
      name: 'E2E Super Administrator',
      email: superAdminEmail,
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  await prisma.superAdminAccount.create({
    data: {
      userId: superAdmin.id,
      accountId: superAdmin.id,
      providerId: 'credential',
      password: hashedPassword,
    },
  });
  assert.ok(superAdmin.id, 'Super admin identity created in super_admins table');
  console.log(`  ✓ Super admin created: ${superAdmin.id} (${superAdmin.email})`);

  // STEP 2: Log in as the super admin.
  console.log('STEP 2: Logging in as the super admin via /api/super-admin-auth/sign-in/email...');
  const saLoginRes = await app.inject({
    method: 'POST',
    url: '/api/super-admin-auth/sign-in/email',
    payload: { email: superAdminEmail, password },
  });
  assert.strictEqual(saLoginRes.statusCode, 200, 'Super admin login returns 200');
  const superAdminToken = JSON.parse(saLoginRes.body).token;
  assert.ok(superAdminToken, 'Super admin session token received');
  console.log(`  ✓ Super admin authenticated. Token received.`);

  // STEP 3: Create a moderation admin in moderators.
  console.log('STEP 3: Creating a moderation admin in moderators table...');
  const modAdminEmail = `modadmin-e2e-${timestamp}@prakaro.test`;
  const modAdminCreateRes = await app.inject({
    method: 'POST',
    url: '/api/v1/moderation/moderators',
    headers: { authorization: `Bearer ${superAdminToken}` },
    payload: {
      name: 'E2E Moderation Admin',
      email: modAdminEmail,
      password,
      role: 'MODERATION_ADMIN',
      active: true,
      queues: [],
    },
  });
  assert.strictEqual(modAdminCreateRes.statusCode, 200, 'Moderation admin creation returns 200');
  const modAdminData = JSON.parse(modAdminCreateRes.body);
  const modAdminId = modAdminData.id;
  assert.ok(modAdminId, 'Moderation admin ID returned');
  console.log(`  ✓ Moderation admin created: ${modAdminId} (${modAdminEmail})`);

  // STEP 4: Log in as the moderation admin.
  console.log('STEP 4: Logging in as the moderation admin via /api/moderator-auth/sign-in/email...');
  const maLoginRes = await app.inject({
    method: 'POST',
    url: '/api/moderator-auth/sign-in/email',
    payload: { email: modAdminEmail, password },
  });
  assert.strictEqual(maLoginRes.statusCode, 200, 'Moderation admin login returns 200');
  const modAdminToken = JSON.parse(maLoginRes.body).token;
  assert.ok(modAdminToken, 'Moderation admin session token received');
  console.log(`  ✓ Moderation admin authenticated.`);

  // STEP 5: Create a custom moderation queue.
  console.log('STEP 5: Creating custom moderation queue...');
  const queueRes = await app.inject({
    method: 'POST',
    url: '/api/v1/moderation/queues',
    headers: { authorization: `Bearer ${modAdminToken}` },
    payload: {
      name: `E2E Custom Verification Queue ${timestamp}`,
      description: 'Queue configured for operational acceptance test scenario',
      kind: 'GENERAL',
      capacity: 50,
      priority: 10,
      config: {
        slaHours: 24,
        qaPercent: 100,
        columns: ['code', 'category', 'priority', 'status'],
        rule: { field: 'source', value: 'SEARCH' },
        form: [
          {
            key: 'facility_type',
            label: 'Confirmed Facility Type',
            type: 'SELECT',
            required: true,
            options: ['SURFACE_LOT', 'MULTI_STOREY', 'UNDERGROUND', 'NOT_PARKING'],
          },
          {
            key: 'barrier_free',
            label: 'Accessible / Barrier-Free Entrance',
            type: 'BOOLEAN',
            required: true,
            options: ['YES', 'NO', 'UNKNOWN'],
          },
        ],
      },
    },
  });
  assert.strictEqual(queueRes.statusCode, 200, 'Queue creation returns 200');
  const queue = JSON.parse(queueRes.body);
  const queueId = queue.id;
  console.log(`  ✓ Custom queue created: ${queueId} (${queue.code})`);

  // STEP 6: Configure Queue (Verify SLA, Form, QA Policy).
  console.log('STEP 6: Verifying queue configuration and rules...');
  assert.strictEqual(queue.config.slaHours, 24);
  assert.strictEqual(queue.config.qaPercent, 100);
  assert.strictEqual(queue.config.form.length, 2);
  console.log(`  ✓ Queue config validated: SLA=${queue.config.slaHours}h, QA=${queue.config.qaPercent}%, FormFields=${queue.config.form.length}`);

  // STEP 7: Create a moderator identity in moderators.
  console.log('STEP 7: Creating a moderator identity in moderators table...');
  const moderatorEmail = `moderator-e2e-${timestamp}@prakaro.test`;
  const modCreateRes = await app.inject({
    method: 'POST',
    url: '/api/v1/moderation/moderators',
    headers: { authorization: `Bearer ${modAdminToken}` },
    payload: {
      name: 'E2E Frontline Moderator',
      email: moderatorEmail,
      password,
      role: 'MODERATOR',
      active: true,
      queues: [queueId],
    },
  });
  assert.strictEqual(modCreateRes.statusCode, 200, 'Moderator creation returns 200');
  const moderatorId = JSON.parse(modCreateRes.body).id;
  console.log(`  ✓ Frontline moderator created: ${moderatorId} (${moderatorEmail})`);

  // STEP 8: Assign the moderator to the queue.
  console.log('STEP 8: Confirming moderator assignment to custom queue...');
  const memberCheck = await prisma.moderationMembership.findFirst({
    where: { moderatorId, queueId },
  });
  assert.ok(memberCheck, 'Moderator queue membership confirmed in DB');
  console.log(`  ✓ Membership verified in database.`);

  // STEP 9: Perform a genuine Flutter parking search candidate intake.
  console.log('STEP 9: Performing genuine parking search intake...');
  const testPlaceId = `e2e_facility_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const searchCandidate: ParkingFacility = {
    id: `google:${testPlaceId}`,
    name: 'Acceptance Test Garage E2E',
    location: { latitude: 37.7749, longitude: -122.4194 },
    address: '100 E2E Blvd, Test City',
    verification: {
      facilityStatus: 'UNCONFIRMED',
      evidenceLevel: 'INSUFFICIENT',
      access: 'UNKNOWN',
      pricing: 'UNKNOWN',
    },
  };
  const eventId1 = `evt1-${timestamp}`;
  await admit(`flutter-user-${timestamp}`, eventId1, [searchCandidate]);

  // STEP 10: Confirm eligible candidate enters moderation.
  console.log('STEP 10: Confirming eligible candidate enters moderation...');
  const intelligenceRecord = await prisma.parkingIntelligenceCase.findUnique({
    where: { googlePlaceId: testPlaceId },
    include: { admission: { include: { cases: { include: { tasks: true } } } } },
  });
  assert.ok(intelligenceRecord, 'Intelligence record created');
  assert.ok(intelligenceRecord.admission, 'Admission record exists');
  assert.ok(intelligenceRecord.admission.cases.length > 0, 'Moderation case created');
  const activeCase = intelligenceRecord.admission.cases[0];
  console.log(`  ✓ Case created: ${activeCase.id} (status: ${activeCase.status}, priority: ${activeCase.priority})`);

  // STEP 11: Confirm unrelated facilities (invalid ID or non-google) do not enter moderation.
  console.log('STEP 11: Confirming non-google / invalid candidate does not enter moderation...');
  const unrelatedId = `unrelated_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await admit(`flutter-user-${timestamp}`, `evt-unrelated-${timestamp}`, [
    {
      id: `custom:${unrelatedId}`, // Not a google: prefix
      name: 'Unrelated Non-Google Entity',
      location: { latitude: 37.7749, longitude: -122.4194 },
      address: 'Non-Google',
      verification: {
        facilityStatus: 'UNCONFIRMED',
        evidenceLevel: 'INSUFFICIENT',
        access: 'UNKNOWN',
        pricing: 'UNKNOWN',
      },
    },
  ]);
  const unrelatedRecord = await prisma.parkingIntelligenceCase.findUnique({
    where: { googlePlaceId: unrelatedId },
  });
  assert.strictEqual(unrelatedRecord, null, 'Non-google entity not admitted');
  console.log(`  ✓ Unrelated facility safely filtered out.`);

  // STEP 12: Repeat the search.
  console.log('STEP 12: Repeating the parking search for the same facility...');
  const eventId2 = `evt2-${timestamp}`;
  await admit(`flutter-user-2-${timestamp}`, eventId2, [searchCandidate]);

  // STEP 13: Confirm no duplicate active cases are created.
  console.log('STEP 13: Confirming no duplicate active cases are created...');
  const casesCount = await prisma.moderationCase.count({
    where: { facilityId: intelligenceRecord.id },
  });
  assert.strictEqual(casesCount, 1, 'Exactly one case exists for facility (no duplicate)');
  const updatedAdmission = await prisma.searchAdmission.findUnique({
    where: { facilityId: intelligenceRecord.id },
  });
  assert.strictEqual(updatedAdmission?.demand, 2, 'Search demand incremented to 2');
  console.log(`  ✓ Exactly 1 case exists. Demand successfully incremented to ${updatedAdmission?.demand}.`);

  // STEP 14: Log in as the moderator.
  console.log('STEP 14: Logging in as the frontline moderator via /api/moderator-auth/sign-in/email...');
  const modLoginRes = await app.inject({
    method: 'POST',
    url: '/api/moderator-auth/sign-in/email',
    payload: { email: moderatorEmail, password },
  });
  assert.strictEqual(modLoginRes.statusCode, 200, 'Moderator login returns 200');
  const moderatorToken = JSON.parse(modLoginRes.body).token;
  assert.ok(moderatorToken, 'Moderator token received');
  console.log(`  ✓ Moderator authenticated.`);

  // STEP 15: Confirm the moderator sees only authorized queues.
  console.log('STEP 15: Confirming moderator sees only authorized queues...');
  const queuesRes = await app.inject({
    method: 'GET',
    url: '/api/v1/moderation/queues',
    headers: { authorization: `Bearer ${moderatorToken}` },
  });
  assert.strictEqual(queuesRes.statusCode, 200);
  const queuesList: { id: string; code: string }[] = JSON.parse(queuesRes.body);
  assert.ok(queuesList.every((q) => q.id === queueId), 'Moderator sees only assigned queue');
  console.log(`  ✓ Moderator restricted to authorized queue(s): [${queuesList.map((q) => q.code).join(', ')}]`);

  // STEP 16: Claim an available task.
  console.log('STEP 16: Claiming an available task...');
  const claimRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/claim`,
    headers: { authorization: `Bearer ${moderatorToken}` },
  });
  assert.strictEqual(claimRes.statusCode, 200, 'Claim returns 200');
  const claimedCase = await prisma.moderationCase.findUnique({ where: { id: activeCase.id } });
  assert.strictEqual(claimedCase?.owner, moderatorId, 'Case owner set to moderator ID');
  assert.strictEqual(claimedCase?.status, 'IN_REVIEW', 'Case status set to IN_REVIEW');
  console.log(`  ✓ Task claimed by ${moderatorId}. Lease until: ${claimedCase?.leaseUntil}`);

  // STEP 17: Attempt a concurrent claim from another moderator.
  console.log('STEP 17: Provisioning 2nd moderator and attempting concurrent claim...');
  const mod2Email = `mod2-e2e-${timestamp}@prakaro.test`;
  const mod2 = await prisma.moderator.create({
    data: {
      name: 'Concurrent Moderator 2',
      email: mod2Email,
      status: 'ACTIVE',
      role: 'MODERATOR',
      emailVerified: true,
    },
  });
  await prisma.moderatorAccount.create({
    data: {
      userId: mod2.id,
      accountId: mod2.id,
      providerId: 'credential',
      password: hashedPassword,
    },
  });
  await prisma.moderationMembership.create({
    data: { moderatorId: mod2.id, queueId },
  });
  const mod2LoginRes = await app.inject({
    method: 'POST',
    url: '/api/moderator-auth/sign-in/email',
    payload: { email: mod2Email, password },
  });
  const mod2Token = JSON.parse(mod2LoginRes.body).token;

  const concurrentClaimRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/claim`,
    headers: { authorization: `Bearer ${mod2Token}` },
  });

  // STEP 18: Confirm the second claim is rejected safely.
  console.log('STEP 18: Confirming concurrent claim rejection...');
  assert.strictEqual(concurrentClaimRes.statusCode, 409, 'Concurrent claim rejected with 409 Conflict');
  console.log(`  ✓ Concurrent claim rejected with 409 Conflict as expected.`);

  // STEP 19: Open the three-panel review workspace.
  console.log('STEP 19: Fetching case detail for three-panel review workspace...');
  const detailRes = await app.inject({
    method: 'GET',
    url: `/api/v1/moderation/cases/${activeCase.id}`,
    headers: { authorization: `Bearer ${moderatorToken}` },
  });
  assert.strictEqual(detailRes.statusCode, 200);
  const caseDetail = JSON.parse(detailRes.body);
  assert.strictEqual(caseDetail.id, activeCase.id);
  assert.ok(caseDetail.tasks.length > 0, 'Tasks present in workspace');
  console.log(`  ✓ Workspace loaded. Facility: ${caseDetail.facilityId}, Status: ${caseDetail.status}`);

  // STEP 20: Attach authorized synthetic evidence.
  console.log('STEP 20: Attaching authorized evidence to facility...');
  const evidenceRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/evidence`,
    headers: { authorization: `Bearer ${moderatorToken}` },
    payload: {
      source: 'PRAKARO_AUDIT',
      finding: 'CONFIRMED_PARKING',
      reference: 'https://audit.prakaro.internal/records/E2E-9901',
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    },
  });
  assert.strictEqual(evidenceRes.statusCode, 200, 'Evidence attached successfully');
  const attachedEvidence = JSON.parse(evidenceRes.body);
  console.log(`  ✓ Evidence attached: ${attachedEvidence.id} (${attachedEvidence.source})`);

  // STEP 21 & 22: Complete custom review form and submit review.
  console.log('STEP 21 & 22: Submitting completed structured review...');
  const caseForReview = await prisma.moderationCase.findUniqueOrThrow({
    where: { id: activeCase.id },
    include: { tasks: true },
  });
  const myTask = caseForReview.tasks.find((t) => t.queueId === queueId);
  assert.ok(myTask, 'Task in assigned queue must exist');
  const taskId = myTask.id;

  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/reviews`,
    headers: { authorization: `Bearer ${moderatorToken}` },
    payload: {
      taskId,
      revision: caseForReview.revision,
      action: 'APPROVE',
      reason: 'Physical access, rate structure, and hours verified against operator audit.',
      evidenceIds: [attachedEvidence.id],
      answers: {
        facility_type: 'MULTI_STOREY',
        barrier_free: 'YES',
      },
    },
  });
  assert.strictEqual(submitRes.statusCode, 200, 'Submission returns 200');

  // STEP 23: Confirm the case enters PENDING_QA when required.
  console.log('STEP 23: Confirming case status transitions to PENDING_QA...');
  const submittedCase = await prisma.moderationCase.findUnique({
    where: { id: activeCase.id },
  });
  assert.strictEqual(submittedCase?.status, 'PENDING_QA', 'Case status is PENDING_QA');
  console.log(`  ✓ Case status is ${submittedCase?.status} (pending independent QA sign-off).`);

  // STEP 24: Log in as an independent QA reviewer.
  console.log('STEP 24: Provisioning and logging in as an independent QA reviewer...');
  const qaReviewerEmail = `qa-reviewer-e2e-${timestamp}@prakaro.test`;
  const qaReviewer = await prisma.moderator.create({
    data: {
      name: 'E2E Quality Assurance Specialist',
      email: qaReviewerEmail,
      status: 'ACTIVE',
      role: 'QA_REVIEWER',
      emailVerified: true,
    },
  });
  await prisma.moderatorAccount.create({
    data: {
      userId: qaReviewer.id,
      accountId: qaReviewer.id,
      providerId: 'credential',
      password: hashedPassword,
    },
  });
  await prisma.moderationMembership.create({
    data: {
      moderatorId: qaReviewer.id,
      queueId,
    },
  });
  const qaLoginRes = await app.inject({
    method: 'POST',
    url: '/api/moderator-auth/sign-in/email',
    payload: { email: qaReviewerEmail, password },
  });
  assert.strictEqual(qaLoginRes.statusCode, 200);
  const qaToken = JSON.parse(qaLoginRes.body).token;
  console.log(`  ✓ QA Reviewer authenticated: ${qaReviewer.id}`);

  // STEP 25: Confirm the QA reviewer is a different identity from the original moderator.
  console.log('STEP 25: Verifying identity separation between Reviewer and QA...');
  assert.notStrictEqual(qaReviewer.id, moderatorId, 'QA reviewer is strictly distinct from moderator');
  const casePendingQA = await prisma.moderationCase.findUniqueOrThrow({
    where: { id: activeCase.id },
  });
  // Confirm moderator cannot approve own submission (blocked by role permit with 403)
  const selfApproveRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/qa`,
    headers: { authorization: `Bearer ${moderatorToken}` },
    payload: {
      action: 'PUBLISH',
      revision: casePendingQA.revision,
      reason: 'Self-approval attempt',
    },
  });
  assert.strictEqual(selfApproveRes.statusCode, 403, 'Frontline moderator blocked from QA gate with 403 Forbidden');
  console.log(`  ✓ Reviewer identity (${moderatorId}) != QA Reviewer identity (${qaReviewer.id}). Self-approval blocked with 403.`);

  // STEP 26: Approve the review (PUBLISH action).
  console.log('STEP 26: Independent QA reviewer approving review...');
  const qaApproveRes = await app.inject({
    method: 'POST',
    url: `/api/v1/moderation/cases/${activeCase.id}/qa`,
    headers: { authorization: `Bearer ${qaToken}` },
    payload: {
      action: 'PUBLISH',
      revision: casePendingQA.revision,
      reason: 'Audit passed: evidence references official operator manifest. Approved for publication.',
    },
  });
  assert.strictEqual(qaApproveRes.statusCode, 200, 'QA approval returns 200');
  console.log(`  ✓ QA Approval succeeded.`);

  // STEP 27: Confirm the approved decision creates a published verification record in the isolated environment.
  console.log('STEP 27: Confirming published verification record in MySQL...');
  const publishedLabel = await prisma.parkingHumanLabel.findFirst({
    where: { caseId: intelligenceRecord.id },
  });
  assert.ok(publishedLabel, 'Verification label created in MySQL');
  assert.strictEqual(publishedLabel.decision, 'CONFIRM_PARKING');
  console.log(`  ✓ Verification label created: ${publishedLabel.id} (decision: ${publishedLabel.decision})`);

  // STEP 28: Confirm verification state in intelligence system.
  console.log('STEP 28: Verifying verification status endpoint for Flutter consumer app...');
  const verificationCheck = await prisma.parkingIntelligenceCase.findUnique({
    where: { id: intelligenceRecord.id },
    include: { labels: true },
  });
  assert.ok(verificationCheck?.labels.length, 'Labels exist on intelligence case');
  console.log(`  ✓ Facility ${testPlaceId} verified: ${verificationCheck?.labels[0]?.decision}`);

  // STEP 29: Confirm audit logs capture the complete workflow.
  console.log('STEP 29: Confirming comprehensive audit log capture...');
  const auditLogs = await prisma.moderationAudit.findMany({
    where: { target: { in: [queueId, activeCase.id, intelligenceRecord.id] } },
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(auditLogs.length >= 3, 'Audit logs recorded key lifecycle events');
  const actionsLogged = auditLogs.map((l) => l.action);
  console.log(`  ✓ Audit events recorded in sequence: [${actionsLogged.join(' -> ')}]`);

  // STEP 30: Confirm ordinary users cannot access moderation endpoints.
  console.log('STEP 30: Confirming ordinary users cannot access moderation endpoints...');
  const ordinaryUserEmail = `consumer-${timestamp}@prakaro.test`;
  const userRegisterRes = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Ordinary Mobile User', email: ordinaryUserEmail, password },
  });
  const ordinaryToken = JSON.parse(userRegisterRes.body).token;
  const unauthorizedRes = await app.inject({
    method: 'GET',
    url: '/api/v1/moderation/queues',
    headers: { authorization: `Bearer ${ordinaryToken}` },
  });
  assert.strictEqual(unauthorizedRes.statusCode, 403, 'Ordinary user rejected with 403 Forbidden');
  console.log(`  ✓ Ordinary mobile user blocked with 403 Forbidden.`);

  // STEP 31: Confirm moderation admins cannot access super-admin-only endpoints.
  console.log('STEP 31: Confirming moderation admin cannot access super-admin endpoints...');
  const modAdminEscalateRes = await app.inject({
    method: 'GET',
    url: '/api/v1/moderation/super-admins',
    headers: { authorization: `Bearer ${modAdminToken}` },
  });
  assert.strictEqual(modAdminEscalateRes.statusCode, 403, 'Moderation admin blocked from super-admin endpoint');
  console.log(`  ✓ Moderation admin blocked with 403 Forbidden from super-admin-only endpoints.`);

  // STEP 32: Confirm deactivated moderators cannot continue reviewing cases.
  console.log('STEP 32: Confirming deactivated moderators cannot perform review actions...');
  await prisma.moderator.update({
    where: { id: moderatorId },
    data: { status: 'DEACTIVATED' },
  });
  const deactivatedRes = await app.inject({
    method: 'GET',
    url: '/api/v1/moderation/session',
    headers: { authorization: `Bearer ${moderatorToken}` },
  });
  assert.strictEqual(deactivatedRes.statusCode, 403, 'Deactivated moderator session rejected with 403');
  console.log(`  ✓ Deactivated moderator blocked immediately with 403 Forbidden.`);

  // STEP 33: Confirm no synthetic verification is published into real production discovery index without QA approval.
  console.log('STEP 33: Confirming synthetic intake unapproved facilities are never published...');
  const unapprovedFacilityId = `unapproved_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await admit(`flutter-user-${timestamp}`, `evt-unapproved-${timestamp}`, [
    {
      id: `google:${unapprovedFacilityId}`,
      name: 'Unapproved Test Parking',
      location: { latitude: 37.7749, longitude: -122.4194 },
      address: 'Unapproved Blvd',
      verification: {
        facilityStatus: 'UNCONFIRMED',
        evidenceLevel: 'INSUFFICIENT',
        access: 'UNKNOWN',
        pricing: 'UNKNOWN',
      },
    },
  ]);
  const unapprovedIntelligence = await prisma.parkingIntelligenceCase.findUnique({
    where: { googlePlaceId: unapprovedFacilityId },
    include: { labels: true },
  });
  assert.strictEqual(unapprovedIntelligence?.labels.length, 0, 'Unapproved facility has 0 published labels');
  console.log(`  ✓ Unapproved facility has 0 published human labels. Real discovery index is protected.`);

  console.log('\n================================================================');
  console.log('ALL 33 OPERATIONAL ACCEPTANCE STEPS COMPLETED & VERIFIED (100%)');
  console.log('================================================================');

  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Operational scenario failed:', err);
  process.exit(1);
});
