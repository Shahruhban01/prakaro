# Milestone 14 Phase 6 implementation report

The console now provides operations, personal, team, LOB, organization, queue and workforce performance reports. They use accepted handling records and recorded attendance. The benchmark and browser evidence use synthetic records in local databases.

## Files

- The backend adds `analytics.ts`, `analytics-calendar.ts`, `analytics-scope.ts`, `analytics-data.ts`, and `handling-metrics.ts` under the moderation module.
- Existing moderation routes and queue/session AHT lookups use the centralized definitions. The Prisma migration adds five report indexes.
- The React console uses `pages/Analytics.tsx` and `components/analytics/`, with route, navigation and completion refresh integration in the existing layout and moderation hook.
- Verification lives in `apps/api/tests/analytics.test.ts`, `apps/api/scripts/benchmark-analytics.ts`, `Analytics.test.tsx`, the analytics Edge scenario, and the extended continuous moderation scenario.

## Verification

The weighted example reports 100s from 1,200 handling seconds over 12 cases. The timezone tests cover India’s fractional UTC offset and 23-hour and 25-hour days in New York. The overnight AUX test splits one interval across local dates and records overlapping source anomalies.

The final regression passed 120 API tests, 42 React tests, five Playwright scenarios and 125 Flutter tests. Flutter analysis and both builds passed. The existing 29 repository-wide API lint errors remain. The Phase 6 analytics code passes targeted lint.

## Screenshots

- [Operations overview](milestone14-phase6-screenshots/operations-overview.png)
- [Moderator performance](milestone14-phase6-screenshots/moderator-performance.png)
- [Team analytics](milestone14-phase6-screenshots/team-analytics.png)
- [LOB analytics](milestone14-phase6-screenshots/lob-analytics.png)
- [Organization analytics](milestone14-phase6-screenshots/organization-analytics.png)
- [Queue analytics](milestone14-phase6-screenshots/queue-analytics.png)
- [AUX utilization](milestone14-phase6-screenshots/aux-utilization.png)
- [Mobile analytics](milestone14-phase6-screenshots/mobile-analytics.png)
- [Global AUX header](milestone14-phase6-screenshots/global-aux-header.png)

## Known limitations

Historical backlog is unavailable because no canonical backlog snapshot series exists. Historical team performance uses current roster cohorts. Historical LOB and organization use the attendance snapshot at work time. Photo attachments and case-scoped AI recommendations remain outside the analytics phase. Local benchmarks use MariaDB 10.4. Production MySQL measurements depend on deployment sizing and traffic.

## Phase 7 readiness

The analytics implementation is ready as the development baseline for Phase 7. Apply the additive report indexes before deploying the API. The final 100,000-case overview took 8.19 seconds at the local median. Validate concurrent polling on the target MySQL environment before broad rollout and track the existing lint debt.

See the [metric contracts](milestone14-phase6-metric-contracts.md), [API contract](milestone14-phase6-analytics-api.md), [performance measurements](milestone14-phase6-performance.md), and [verification log](milestone14-phase6-testing.md).
