# Phase 9 test workflow

The audited Phase 8 version had 124 API, 52 Vitest, seven Edge and 125 Flutter tests passing. The Phase 8 API and React baseline were rerun before Phase 9 integration. Previous behavior is exercised again by the full API and Edge suites.

Use only a freshly migrated isolated schema containing a test marker in its name. For a local installation of Edge supply `PRAKARO_TEST_BROWSER`, the existing console origin and API ports, and an isolated test Super Admin. Set `PRAKARO_PHASE9_SCREENSHOTS=1` to capture the Phase 9 scenario. The test uses synthetic team, schedule, cases and historical intake.

| Command | Purpose |
| --- | --- |
| `npm run api:build` | API TypeScript |
| `npm run api:test` | Complete API suite |
| `npm run api:lint` | Repository-wide API ESLint |
| `npm --prefix apps/moderation run build` | React TypeScript and Vite |
| `npm --prefix apps/moderation test` | Vitest |
| `npm --prefix apps/moderation run e2e` | Full Playwright suite |
| `flutter analyze`, `flutter test --reporter expanded` in `apps/mobile` | Mobile regressions |

Targeted ESLint includes the Phase 9 operations module, the modified analytics, QA and registration files, and the Phase 9 tests and benchmark. API tests verify DST, overnight and rotating shifts, overlap races, excused and unknown attendance, shared capacity, insufficient forecasting data, real handling and QA, historical team attribution, organization and team scope, alert deduplication and auditable CSV export.

In the first combined Edge run, the older workforce scenario assumed that a new employee would appear on the first page of the alphabetically sorted directory. Fixtures from the preceding scenarios filled that page. The scenario now uses directory search and still requires the exact created email to be visible before it proceeds to the audit and sign-in checks.
