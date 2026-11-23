# Phase 5 verification

## Phase 4 baseline

The continuous engine and migration existed in the checkout. The Phase 4 final report was absent. The API build passed, both focused engine tests passed and all 22 React tests passed. The original four-scenario Playwright suite initially passed three scenarios. Continuous moderation failed because the visible AUX transition remained enabled immediately after reservation. Synchronizing the attendance query on reservation start and session exit fixed the lag. The unchanged baseline assertions then passed all four scenarios.

## Isolated environments

The baseline, API regression, and Edge workflow used separate throwaway local databases. Each schema used the existing seven Prisma migrations with `prisma migrate deploy`. Browser tests bootstrapped a synthetic platform operator and seeded independent synthetic inspection references. They used the existing Better Auth, Fastify, and Prisma paths. No production database was used.

The browser workflow exercises the workspace at 1440 × 900, 1024 × 768, 768 × 1024, and 390 × 844. It verifies refresh restoration, server-side AUX lock and stale lease rejection, recovery from an interrupted submit, persisted evidence-backed approval, auto-next, session exit, nonmutating View, safe release, queue depletion, keyboard focus, and seconds-based AHT. Other browser scenarios cover workforce, queues and attendance.

## Commands

- `npm run api:build`
- `npm run api:test`
- `npm run api:lint`
- `npm --prefix apps/moderation run build`
- `npm --prefix apps/moderation test`
- `npm --prefix apps/moderation run e2e`
- `flutter analyze` and `flutter test --reporter expanded` from `apps/mobile`

Set `PRAKARO_PHASE5_SCREENSHOTS=1` when running Playwright against the isolated browser database to regenerate the screenshots. Existing database and browser environment variables are documented in the previous phase testing notes. The screenshots contain synthetic facility evidence.

## Results

| Check | Result |
| --- | --- |
| API TypeScript build | Passed |
| Full API tests | 116 passed, 0 failed, 0 skipped |
| API lint | 29 errors in the existing identity migration script, 33-step scenario script, and Gemini module |
| Targeted lint for Phase 5 API files | Passed |
| React TypeScript and Vite build | Passed. Vite reported a large-chunk warning. |
| Vitest | 37 passed across 8 files |
| Full Playwright suite in Microsoft Edge | 4 passed against a freshly migrated isolated database |
| Flutter analyze | No issues found |
| Flutter tests | 125 passed |

An intermediate run against a reused browser database exposed an ambiguous queue-routing fixture and stale UI after a test-only AUX transition made directly through the API. The acceptance run used a fresh database and reloaded the active page before asserting the next AUX punch. The assertions for lock enforcement, routing and queue counts stayed in place.
