# Phase 7 verification

## Phase 6 baseline

Before changing the implementation, the API build and 120 API tests passed. The moderation build and 42 Vitest tests passed. Edge passed five existing scenarios. Flutter analysis found no issues and 125 Flutter tests passed. Repository-wide API lint reported the 29 already documented in Phase 6.

## Commands

Use a fresh, dedicated database and apply Prisma migrations before running API or browser tests. Set the repository's existing Playwright API, console origin, and isolated test administrator settings. For a locally installed Edge, configure `PRAKARO_TEST_BROWSER` with the executable path. Set `PRAKARO_PHASE7_SCREENSHOTS=1` to capture the QA workflow.

| Command | Scope |
| --- | --- |
| `npm run api:build` | API TypeScript |
| `npm run api:test` | Complete API suite including QA |
| `npm run api:lint` | Repository-wide API lint |
| `npx eslint src/modules/moderation/qa src/modules/moderation/continuous-engine.ts src/modules/moderation/routes.ts src/app.ts scripts/benchmark-qa.ts tests/qa.test.ts tests/support/qa-fixture.ts` from `apps/api` | QA and directly modified API files |
| `npm --prefix apps/moderation run build` | React TypeScript and Vite |
| `npm --prefix apps/moderation test` | Vitest |
| `npm --prefix apps/moderation run e2e` | Full Playwright suite |
| `flutter analyze` from `apps/mobile` | Mobile static analysis |
| `flutter test --reporter expanded` from `apps/mobile` | Mobile regressions |

The QA API suite covers policy versioning and precedence, post-publication selection, repeated processing across ten concurrent transactions, competing claims, own-case exclusion, scoped reads, concurrent submissions and disputes, expired leases, overturns, and idempotent correction publication with original AHT preserved. React tests cover frozen evidence, missing history, sample counts, and validation. The Edge scenario applies a sampling policy in the console and uses real Fastify, Better Auth, and MariaDB to approve two synthetic cases on the continuous route, assess them, dispute a failure, commit a correction, verify its canonical label, and inspect the analytics and mobile QA layout.

## Benchmark method

Create separate empty localhost schemas named `prakaro_phase6_benchmark_<suffix>`. In each schema, run the migrations, then run `npx tsx scripts/benchmark-analytics.ts --through=N` and `npx tsx scripts/benchmark-qa.ts` from `apps/api`, where `N` is 100, 10000, or 100000. The benchmark rejects nonlocal or incorrectly named databases. The Phase 6 seeder supplies canonical handling, attendance and decision fixtures, and the QA benchmark seeds one policy and a mixed pending and finalized workload. The worker is measured before and after the database is populated. Worklist, quality groups, and dashboard use the median of three service calls. Claim and correction are actual transactions. The correction is an escalation without verification side effects. The browser and API tests separately validate withdrawal through the canonical publication service.

See the [implementation report](milestone14-phase7-final-report.md) for measured timings, final test counts, and deployment limitations.
