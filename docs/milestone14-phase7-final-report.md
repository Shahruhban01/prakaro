# Milestone 14 Phase 7 implementation report

The Quality workspace now samples accepted continuous-moderation decisions after publication. It supports scoped auditor assignment, Pass and Fail assessment, disputes, independent adjudication, and versioned corrections. Continuous Submit → Next, the original AHT formula, and top-right AUX retain their existing behavior.

## Implementation

- `apps/api/prisma/schema.prisma` and `20261123010000_post_decision_qa` add versioned policies, samples, assessments, disputes, corrections, and frozen decision context.
- `apps/api/src/modules/moderation/qa/` contains the sampling worker query, assignment and assessment commands, scoped reports, and protected routes. Fastify schedules the worker. The existing continuous engine records the original publication reference.
- The existing React `QA.tsx` route and layout now use `components/qa/` for the worklist, oversight policies, decision review, and quality analytics.
- `qa.test.ts`, `QA.test.tsx`, and `e2e/qa.spec.ts` exercise the workflow at service, component, and browser levels. The browser data uses synthetic inspection records.
- `benchmark-qa.ts` measures the worker, scoped lists, assignment, grouped accuracy, dashboard aggregation, and correction against dedicated synthetic schemas.

## Verification

| Check | Result |
| --- | --- |
| API TypeScript build | Passed |
| API suite | 122 passed, 0 failed |
| Final targeted QA suite | 2 passed, including discovery status after correction, historical LOB attribution, and expired reservations |
| Targeted API ESLint | Passed |
| Repository-wide API ESLint | 29 inherited errors in the identity migration, scenario script, and Gemini module |
| React TypeScript and Vite | Passed with the existing large-chunk warning |
| Vitest | 48 passed across 10 files |
| Playwright in Edge | 6 passed, including the end-to-end QA correction and all five Phase 1–6 regressions |
| Flutter analysis | No issues found |
| Flutter tests | 125 passed |
| Prisma migrations | All nine applied to isolated test schemas |

See the [commands and benchmark method](milestone14-phase7-testing.md). An existing analytics browser scenario timed out while the large benchmark was seeding against the same server. The isolated regression rerun passed with its assertions intact.

## Synthetic benchmark

| Completed decisions | First 40 | Warm 40 | Warm samples/s | Worklist | Accuracy groups | Dashboard | Claim | Correction commit |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 482 ms | 468 ms | 85 | 23 ms | 12 ms | 54 ms | 57 ms | 78 ms |
| 10,000 | 453 ms | 690 ms | 58 | 95 ms | 126 ms | 679 ms | 57 ms | 113 ms |
| 100,000 | 449 ms | 2,764 ms | 14 | 1,446 ms | 211 ms | 6,648 ms | 211 ms | 56 ms |

Measurements use MariaDB 10.4.32 and synthetic cohorts with 20, 2,000, and 20,000 finalized assessments. The first two cohorts ran with a 16 MiB InnoDB buffer pool. The largest cohort used a fresh separate instance with 256 MiB after bulk seeding on the smaller instance exceeded its transaction timeout. Batch rates describe active processing. The running worker schedules at most 40 candidates per three-second tick per instance.

At 100,000 decisions, the sampling plan used `handling_report_submitted` for the completed range, primary-key lookups to establish attribution, and `qa_sample_decisionId_key` for exclusion. The scoped pending-list plan used `qa_sample_organizationId_lobId_status_sampledAt_idx`. Inspecting historical rows near the tail of the backlog and the dashboard's cohort and coverage queries were the slowest operations. The largest cohort's dashboard took 6.65 seconds at the median. Verify native MySQL 8.4 plans and concurrent dashboard polling before expanding beyond a scoped rollout.

## Screenshots

- [QA overview](milestone14-phase7-screenshots/qa-overview.png)
- [QA worklist](milestone14-phase7-screenshots/qa-worklist.png)
- [QA review workspace](milestone14-phase7-screenshots/qa-review.png)
- [Original decision](milestone14-phase7-screenshots/original-decision.png)
- [QA Pass](milestone14-phase7-screenshots/qa-pass.png)
- [QA Fail](milestone14-phase7-screenshots/qa-fail.png)
- [Dispute](milestone14-phase7-screenshots/qa-dispute.png)
- [Supervisor adjudication](milestone14-phase7-screenshots/supervisor-adjudication.png)
- [Correction](milestone14-phase7-screenshots/correction.png)
- [Quality analytics](milestone14-phase7-screenshots/qa-analytics.png)
- [Mobile QA](milestone14-phase7-screenshots/mobile-qa.png)
- [Top-right AUX](milestone14-phase7-screenshots/aux-header.png)

## Operational limits

Older decisions may lack exact evidence snapshots and canonical publication references. Withdrawal fails closed without that provenance. Team reports use the current roster. The permitted independent evidence workflow supplies textual references. The review does not add a photo service, AI calls, or a second-auditor assignment inside disputes. QA and correction timing are reported separately from moderator AHT. No production database migration was run.

## Phase 8 readiness

Phase 8 development can build on the QA workflow and its frozen policy references. QA production rollout depends on target MySQL 8.4 migration and performance checks. Product owners should start with a scoped sampling policy and use real outcomes to review auditor agreement and backlog before increasing coverage.
