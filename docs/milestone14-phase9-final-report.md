# Milestone 14 Phase 9 implementation report

Prakaro can schedule overnight and rotating work, record approved exceptions, compare attendance against the plan, and monitor live workforce activity. The operations console shows weighted-AHT capacity, history-based demand, staffing risk, finalized QA, operational alerts and authorized CSV exports. Planned hours, observed AUX, recorded attendance and case handling remain separate.

## Changes

- `apps/api/prisma/schema.prisma` and the additive migration `20261123030000_workforce_operations` add shift definitions, frozen occurrences, organization capacity assumptions, alert rules and alert events.
- `apps/api/src/modules/moderation/operations/` contains schedule, adherence, live workforce, capacity, forecast, executive, CSV, alert and polling services. The existing workforce and moderation routers register the endpoints. Fastify schedules the bounded alert worker.
- The Phase 6 analytics module reuses canonical handling eligibility and removes a redundant distinct count. The QA sampling coverage helper accepts an exact reporting window for executive metrics.
- `apps/moderation/src/components/operations/` adds Workforce Schedule, Attendance, Live Workforce, Capacity, Forecast, Staffing Gap, Executive, Team, Organization Comparison and Alerts. The employee directory links to scoped work status.
- `apps/api/tests/operations.test.ts`, `apps/moderation/src/__tests__/Operations.test.tsx`, and `apps/moderation/e2e/operations.spec.ts` exercise the workflows. The synthetic benchmark lives in `apps/api/scripts/benchmark-operations.ts`.

## Browser captures

- [Schedule](milestone14-phase9-screenshots/workforce-schedule.png)
- [Shift editor](milestone14-phase9-screenshots/shift-editor.png)
- [Attendance adherence](milestone14-phase9-screenshots/attendance-adherence.png)
- [Live workforce](milestone14-phase9-screenshots/live-workforce.png)
- [Capacity planning](milestone14-phase9-screenshots/capacity-planning.png)
- [Queue forecast](milestone14-phase9-screenshots/queue-forecast.png)
- [Executive overview](milestone14-phase9-screenshots/executive-overview.png)
- [Team performance](milestone14-phase9-screenshots/team-performance.png)
- [Organization comparison](milestone14-phase9-screenshots/organization-comparison.png)
- [Operational alerts](milestone14-phase9-screenshots/operational-alerts.png)
- [Mobile executive dashboard](milestone14-phase9-screenshots/mobile-executive-dashboard.png)
- [Top-right AUX](milestone14-phase9-screenshots/aux-top-right.png)

## Verification

| Command | Result |
| --- | --- |
| `npm run api:build` | Passed |
| `npm run api:test` | 129 passed, 0 failed |
| Targeted API ESLint | Passed |
| `npm run api:lint` | 29 inherited errors, 0 warnings |
| `npm --prefix apps/moderation run build` | TypeScript and Vite passed. Vite reported an oversized bundle warning. |
| `npm --prefix apps/moderation test` | 57 passed across 12 files |
| `npm --prefix apps/moderation run e2e` | 8 passed in Edge in 2.8 minutes using a fresh isolated schema |
| `flutter analyze` | No issues |
| `flutter test --reporter expanded` | 125 passed |
| `prisma migrate deploy` | 11 migrations applied to a fresh isolated schema, including workforce operations |

The 29 repository-wide lint errors were in `scripts/migrate-identities.ts`, `scripts/run-33-step-scenario.ts`, and `src/modules/intelligence/intelligence.gemini.ts`. Phase 9 changed none of those files.

The first combined browser run passed seven scenarios and found a paginated-directory assumption in the older workforce test. The synthetic employee was present in the database. After the test located the employee through directory search, the entire suite passed, including continuous allocation and Submit → Next, post-decision QA, policy version pinning and mobile AUX.

## Operational limits and Phase 10 readiness

Historical team reporting only attributes work that can be joined to a recorded team schedule. Heterogeneous tenant polling, sustained load, native MySQL 8.4 migration validation and production database sizing remain Phase 10 gates. Expected utilization, allocation weights and fallback AHT are disclosed assumptions. Forecasts remain unavailable where there are too few comparable historical days.

The migration was exercised on isolated local schemas. Phase 10 development can proceed on this foundation. Production capacity and release readiness require native database and deployment verification. See the [performance results](milestone14-phase9-performance.md), [test commands](milestone14-phase9-testing.md), and [security notes](milestone14-phase9-security.md).
