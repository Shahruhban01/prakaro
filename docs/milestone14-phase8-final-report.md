# Milestone 14 Phase 8 implementation report

Prakaro now supports organization-owned draft policies, reviewed publication, immutable versions, assignment history, dynamic tags and review fields, independently enforced evidence requirements, and case-specific clarification threads. Moderation resolves the effective version at reservation time. Historical QA reads the original version and can filter reports by policy version.

## Files and migration

- `apps/api/prisma/schema.prisma` and `20261123020000_versioned_moderation_policies/migration.sql` add the policy, assignment and clarification tables, decision and reservation pins, version state checks, and immutability triggers.
- `apps/api/src/modules/moderation/policy/` contains `contracts.ts`, `service.ts`, `routes.ts` and `clarifications.ts`. The existing `moderation/routes.ts` registers them and `apps/api/package.json` includes the new API tests.
- `continuous-engine.ts` and `continuous-routes.ts` pin and validate policy rules. `qa/contracts.ts`, `qa/routes.ts`, `qa/reviews.ts`, `qa/sampling.ts` and `qa/corrections.ts` read and preserve the frozen version. Legacy tasks retain their saved form and parking approval retains the canonical verification rule.
- `apps/moderation/src/components/policy/` contains `PolicyPages.tsx`, `PolicyEditor.tsx`, `PolicyReference.tsx`, `DynamicReview.tsx`, `Clarifications.tsx`, `policyApi.ts` and `policy.css`.
- `App.tsx` and `Layout.tsx` integrate the pages. `DecisionForm.tsx`, `ModerateWorkspace.tsx`, `workspaceContract.ts` and `QueueOperations.tsx` display pinned or current guidance. `QaDashboard.tsx`, `QaReviewWorkspace.tsx` and `qa-api.ts` integrate policy filtering and historical review.
- `apps/api/tests/policy.test.ts`, `apps/moderation/src/__tests__/Policies.test.tsx`, and `apps/moderation/e2e/policies.spec.ts` cover the end-to-end workflow. `apps/api/scripts/benchmark-policies.ts` runs the synthetic scale measurements.

## Verified behavior

The API lifecycle test checks queue-over-LOB-over-organization precedence, concurrent publication retries, update and deletion protection, and the unchanged policy on an active reservation. It verifies that approval requires current independent evidence, that approved decisions publish immediately, and that an archived original policy stays available through QA after a newer version becomes effective.

The new Edge workflow creates and edits a policy through the console, publishes and assigns it, exchanges a clarification in separate staff sessions, advances cases on the same route, and opens the original version in historical QA. It also checks organization isolation, mobile width and top-right AUX. The fixture’s parking evidence is synthetic.

| Check | Result |
| --- | --- |
| API TypeScript build | Passed |
| API tests | 124 passed, 0 failed or skipped |
| Targeted API ESLint | Passed |
| Repository-wide API ESLint | 29 inherited errors in the identity migration script, scenario script and Gemini module |
| React TypeScript and Vite production build | Passed with the existing large-chunk warning |
| Vitest | 52 passed across 11 files |
| Playwright in Edge | 7 passed, including all six Phase 1–7 scenarios |
| Flutter analysis | No issues found |
| Flutter tests | 125 passed |
| Prisma migrations | All ten applied to fresh isolated schemas |

[Executed commands, fixture setup and baseline results](milestone14-phase8-testing.md)

## Synthetic performance benchmark

Times are in milliseconds on local MariaDB 10.4.32. Read figures are medians. Publication is one transaction that includes advancing an active assignment. Validation rows each measure 500 in-process calls.

| Operation | 100 policies | 1,000 policies | 10,000 versions | SQL statements per measurement |
| --- | ---: | ---: | ---: | ---: |
| Policy resolution | 2.455 | 2.365 | 2.489 | 1 |
| Version lookup | 1.797 | 1.532 | 1.577 | 1 |
| Active assignment lookup | 1.474 | 1.439 | 1.403 | 1 |
| Valid form and tags, 500 | 3.058 | 2.409 | 0.690 | 0 |
| Invalid tag, 500 | 1.391 | 1.202 | 0.576 | 0 |
| Clarification list page | 1.901 | 2.234 | 1.634 | 1 |
| Historical QA detail and policy | 14.168 | 16.717 | 20.086 | 16 |
| Publication with one assignment | 50.152 | 50.501 | 55.612 | 19 |

Reproduce using the [test and benchmark commands](milestone14-phase8-testing.md). The local run excludes request authentication and rendering, and it does not establish a MySQL 8.4 capacity target.

## Browser captures

- [Policy overview](milestone14-phase8-screenshots/policy-overview.png)
- [Policy editor](milestone14-phase8-screenshots/policy-editor.png)
- [Tag configuration](milestone14-phase8-screenshots/tag-configuration.png)
- [Review form builder](milestone14-phase8-screenshots/review-form-builder.png)
- [Evidence requirements](milestone14-phase8-screenshots/evidence-requirements.png)
- [Policy preview](milestone14-phase8-screenshots/policy-preview.png)
- [Version comparison](milestone14-phase8-screenshots/version-comparison.png)
- [Policy assignment](milestone14-phase8-screenshots/policy-assignment.png)
- [Clarification request](milestone14-phase8-screenshots/clarification-request.png)
- [Supervisor response](milestone14-phase8-screenshots/supervisor-clarification-response.png)
- [Pinned moderation workspace](milestone14-phase8-screenshots/pinned-moderation-workspace.png)
- [Historical QA policy](milestone14-phase8-screenshots/qa-historical-policy.png)
- [Mobile policy management](milestone14-phase8-screenshots/mobile-policy-management.png)
- [AUX in the header](milestone14-phase8-screenshots/aux-top-right.png)

## Operational limits and Phase 9 readiness

Legacy decisions retain their historical queue snapshot if available. Required evidence currently uses independent references and existing reporter notes. Other categories can be configured as optional guidance until authorized typed evidence exists. The existing organization-admin role holds both policy editing and publication capabilities. Assignment changes take effect immediately and do not alter reserved work. Clarifications use the existing lease and do not automatically change policies.

Phase 9 development can build on version-linked QA and clarification data. Production deployment should first validate the additive migration, triggers and concurrent read/write load on MySQL 8.4. No migration was applied to a production database, and Flutter source files were unchanged.
