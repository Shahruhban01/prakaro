# Phase 6 testing

The isolated API, browser, and benchmark databases use the same eight Prisma migrations. Synthetic fixtures demonstrate weighted aggregation, invalid and duplicate exclusion, scoped access, shared queue counts, historical LOB changes, timezone boundaries and presence. The browser extends the continuous workflow to compare My Performance with committed handling records. The dedicated analytics scenario checks supervisor and director scope, time filters, polling, mobile overflow and the location of AUX.

| Command | Phase 5 baseline |
| --- | --- |
| `npm run api:build` | Passed |
| `npm run api:test` | 116 passed |
| `npm --prefix apps/moderation run build` | Passed |
| `npm --prefix apps/moderation test` | 37 passed |
| `flutter analyze` | No issues |
| `flutter test --reporter expanded` | 125 passed |

Additional Phase 6 commands are `npm run api:lint` and `npm --prefix apps/moderation run e2e`. The latter runs the existing four browser scenarios plus the analytics acceptance scenario. Set `PRAKARO_PHASE6_SCREENSHOTS=1` to save analytics screenshots during Edge runs. Launch against a fresh local database with the existing Playwright console and API environment variables.

## Final regression results

| Check | Result |
| --- | --- |
| API TypeScript build | Passed |
| API tests | 120 passed, 0 failed, 0 skipped |
| API lint | 29 inherited errors across the identity migration script, 33-step scenario script and Gemini module |
| Targeted lint for Phase 6 analytics files | Passed |
| React TypeScript and Vite build | Passed. Vite reported a large-chunk warning. |
| Vitest | 42 passed across 9 files |
| Playwright in Microsoft Edge | 5 passed, including all 4 existing regression scenarios |
| Flutter analyze | No issues found |
| Flutter tests | 125 passed |

Early browser runs exposed fixture issues. Workforce employee codes require uppercase and ambient attendance from signed-in reviewers makes the utilization percentage vary. The final test checks the exact persisted Moderating seconds and confirms live polling against a fresh database.
