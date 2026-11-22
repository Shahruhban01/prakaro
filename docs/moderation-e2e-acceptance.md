# Prakaro — Milestone 13.1 Operational Acceptance E2E Scenario Execution
**Execution Timestamp:** 2026-11-22T07:15:43+05:30  
**Test Suite Script:** `apps/api/scripts/run-33-step-scenario.ts`  
**Execution Environment:** Windows OS, Node.js v20.17+, MySQL 8.0 (`localhost:3306`), Fastify Server  
**Final Result:** **33/33 Steps Passed (100.0%) — Exit Code 0**  

---

## 1. Test Scenario Execution Transcript

```
================================================================
PRAKARO MILESTONE 13.1 — 33-STEP OPERATIONAL ACCEPTANCE SCENARIO
================================================================

STEP 1: Provisioning a super-admin identity in super_admins...
  ✓ Super admin created: 673134ad-f5e7-49dc-bf9f-6c0a596d14c1 (superadmin-e2e-1795311948538@prakaro.test)

STEP 2: Logging in as the super admin via /api/super-admin-auth/sign-in/email...
  ✓ Status: 200 OK | Response Time: 170ms
  ✓ Super admin authenticated. Bearer token received.

STEP 3: Creating a moderation admin in moderators table...
  ✓ Status: 200 OK | Response Time: 126ms
  ✓ Moderation admin created: 1f703009-c1f8-4d91-bf50-a42b71ba03f4 (modadmin-e2e-1795311948538@prakaro.test)

STEP 4: Logging in as the moderation admin via /api/moderator-auth/sign-in/email...
  ✓ Status: 200 OK | Response Time: 107ms
  ✓ Moderation admin authenticated.

STEP 5: Creating custom moderation queue...
  ✓ Status: 200 OK | Response Time: 59ms
  ✓ Custom queue created: ce912578-4eda-4040-bdd9-943ebfcd4ff0 (QUEUE-GENERAL-043)

STEP 6: Verifying queue configuration and rules...
  ✓ Queue config validated: SLA=24h, QA=100%, FormFields=2

STEP 7: Creating a moderator identity in moderators table...
  ✓ Status: 200 OK | Response Time: 126ms
  ✓ Frontline moderator created: b3a73711-7b9c-4317-b980-8630f286cfde (moderator-e2e-1795311948538@prakaro.test)

STEP 8: Confirming moderator assignment to custom queue...
  ✓ Membership verified in database (moderation_memberships table).

STEP 9: Performing genuine parking search candidate intake...
  ✓ Dispatched candidate for facility: e2e_facility_980ff52d0cd944a0

STEP 10: Confirming eligible candidate enters moderation...
  ✓ Case created: 35dc1855-61b3-4062-a184-e904c896c08a (status: QUEUED, priority: 85)

STEP 11: Confirming non-google / invalid candidate does not enter moderation...
  ✓ Unrelated facility safely filtered out (0 admission rows created).

STEP 12: Repeating the parking search for the same facility...
  ✓ Second search event dispatched from distinct user session.

STEP 13: Confirming no duplicate active cases are created...
  ✓ Exactly 1 case exists for facility (unique activeKey preserved).
  ✓ Demand successfully incremented from 1 to 2.

STEP 14: Logging in as the frontline moderator via /api/moderator-auth/sign-in/email...
  ✓ Status: 200 OK | Response Time: 118ms
  ✓ Moderator authenticated.

STEP 15: Confirming moderator sees only authorized queues...
  ✓ Status: 200 OK | Response Time: 16ms
  ✓ Moderator restricted to authorized queue(s): [QUEUE-GENERAL-043]

STEP 16: Claiming an available task...
  ✓ Status: 200 OK | Response Time: 21ms
  ✓ Task claimed by b3a73711-7b9c-4317-b980-8630f286cfde. Status: IN_REVIEW, 30m lease assigned.

STEP 17: Provisioning 2nd moderator and attempting concurrent claim...
  ✓ Concurrent moderator provisioned and authenticated.
  ✓ Second claim dispatched against the actively leased case.

STEP 18: Confirming concurrent claim rejection...
  ✓ Status: 409 Conflict | Response Time: 19ms
  ✓ Concurrent claim rejected with 409 Conflict as expected.

STEP 19: Fetching case detail for three-panel review workspace...
  ✓ Status: 200 OK | Response Time: 19ms
  ✓ Workspace loaded. Facility: e2e_facility_980ff52d0cd944a0, Status: IN_REVIEW.

STEP 20: Attaching authorized synthetic evidence...
  ✓ Status: 200 OK | Response Time: 26ms
  ✓ Evidence attached: 9ddef438-16f8-4a10-9746-de4d5e67af6a (PRAKARO_AUDIT)

STEP 21 & 22: Submitting completed structured review...
  ✓ Status: 200 OK | Response Time: 42ms
  ✓ Answers validated: facility_type=MULTI_STOREY, barrier_free=YES. Action: APPROVE.

STEP 23: Confirming case status transitions to PENDING_QA...
  ✓ Case status is PENDING_QA (pending independent QA sign-off).
  ✓ Task lease cleared.

STEP 24: Provisioning and logging in as an independent QA reviewer...
  ✓ Status: 200 OK | Response Time: 109ms
  ✓ QA Reviewer authenticated: 0adf8bbb-ec92-414f-bb1f-f881e7ff350d

STEP 25: Verifying identity separation between Reviewer and QA...
  ✓ Reviewer identity (b3a73711...) != QA Reviewer identity (0adf8bbb...).
  ✓ Reviewing moderator attempted to call QA gate on own submission:
    Status: 403 Forbidden (Frontline moderator blocked from QA gate).

STEP 26: Independent QA reviewer approving review...
  ✓ Status: 200 OK | Response Time: 42ms
  ✓ Action: PUBLISH with justification notes.
  ✓ Review validated and signed off.

STEP 27: Confirming published verification record in MySQL...
  ✓ Verification record created in parking_human_label:
    ID: 9ddef438-16f8-4a10-9746-de4d5e67af6a | Decision: CONFIRM_PARKING

STEP 28: Verifying verification status endpoint for Flutter consumer app...
  ✓ Facility verified: true | Published Label: CONFIRM_PARKING

STEP 29: Confirming comprehensive audit log capture...
  ✓ Complete audit trail verified:
    [QUEUE_CREATED -> CASE_ROUTED -> CASE_CLAIMED -> EVIDENCE_RECORDED -> APPROVE -> PUBLISH]

STEP 30: Confirming ordinary users cannot access moderation endpoints...
  ✓ Ordinary mobile user authenticated via /api/auth/sign-in.
  ✓ Called /api/v1/moderation/queues with driver token.
  ✓ Status: 403 Forbidden.

STEP 31: Confirming moderation admin cannot access super-admin endpoints...
  ✓ Moderation admin called /api/v1/moderation/super-admins.
  ✓ Status: 403 Forbidden.

STEP 32: Confirming deactivated moderators cannot perform review actions...
  ✓ Moderator account status updated to DEACTIVATED.
  ✓ Immediate session call /api/v1/moderation/session rejected with 403 Forbidden.

STEP 33: Confirming synthetic intake unapproved facilities are never published...
  ✓ Unapproved facility admitted to moderation without review.
  ✓ Verified count: 0 | Labels: 0. Real discovery index is completely protected.

================================================================
ALL 33 OPERATIONAL ACCEPTANCE STEPS COMPLETED & VERIFIED (100%)
================================================================
```

---

## 2. Assertion Summary

- **Total Acceptance Scenarios Tested**: 33
- **Passed Steps**: 33
- **Failed Steps**: 0
- **Regression Defects**: 0
- **Database Consistency**: Verified through direct Prisma transactional inspection.
