# Phase 8 verification

## Baseline

Before the implementation, the API TypeScript build and all 122 API tests passed. React TypeScript, Vite and 48 Vitest tests passed. Flutter analysis found no issues and all 125 Flutter tests passed. Repository-wide ESLint showed the 29 inherited errors in the identity migration script, scenario script and Gemini module. The first baseline Edge run had four passes. The analytics scenario exceeded its existing five-second assertion while other suites ran, and the QA fixture rejected the baseline schema name because it lacked a test marker. The final isolated browser rerun uses the correct test schema and keeps the original assertions.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run api:build` | API TypeScript |
| `npm run api:test` | Complete API suite |
| `npm run api:lint` | Repository-wide API ESLint |
| `npx eslint src/modules/moderation/policy src/modules/moderation/qa src/modules/moderation/continuous-engine.ts src/modules/moderation/continuous-routes.ts src/modules/moderation/routes.ts scripts/benchmark-policies.ts tests/policy.test.ts` from `apps/api` | Targeted lint |
| `npm --prefix apps/moderation run build` | React TypeScript and Vite |
| `npm --prefix apps/moderation test` | React/Vitest |
| `npm --prefix apps/moderation run e2e` | Full Edge browser suite |
| `flutter analyze` from `apps/mobile` | Flutter analysis |
| `flutter test --reporter expanded` from `apps/mobile` | Flutter regressions |

Apply Prisma migrations to a dedicated local database before running SQL and browser tests. Configure the repository's console origin/API proxy, isolated admin account and optional `PRAKARO_TEST_BROWSER` executable. Use a schema name containing `test` so synthetic QA fixtures pass their safety guard. Set `PRAKARO_PHASE8_SCREENSHOTS=1` to capture the policy acceptance workflow.

API tests verify validation, field and tag conditions, tenant boundaries, effective assignment precedence, version numbers, concurrent publication retry, update/delete protection, active pins, immediate canonical publication, auto-next, historical QA and clarification audit. React tests validate list access, editing, previews, publication confirmation and pinned decision payloads. Browser tests use distinct Better Auth sessions for admin, moderator, supervisor, QA auditor and an outsider. Fixtures are synthetic.

## Reproducing performance tests

Create a fresh local schema named `prakaro_phase8_benchmark` or a suffixed variant. Apply migrations, then run `npx tsx scripts/benchmark-policies.ts` from `apps/api` with that schema selected by `DATABASE_URL`. The script refuses nonlocal addresses and databases containing organizations. It seeds 100 policies, 1,000 policies, and a third tenant with 1,000 policies and 10,000 initial versions. It reports median of five read timings and query counts, one publication per cohort, and per-batch times for 500 valid and 500 invalid validations. The SQL timings cover service/query paths under synthetic load and exclude HTTP, authentication and browser rendering.
