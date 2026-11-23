# Milestone 14 Phase 3 implementation report

The shared console header now connects to server-authoritative AUX. Workforce users can punch all six states, review their attendance history, and keep the same timeline across refreshes and tabs. The workforce view uses the existing organization and team permissions. Moderate remains gated for Phase 4.

## Files

| Area | Files |
| --- | --- |
| Prisma | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261122040000_aux_attendance/migration.sql` |
| API | `apps/api/src/modules/moderation/attendance.ts`, `attendance-routes.ts`, `workforce.ts`, `queue-operations.ts`, `apps/api/src/app.ts`, `src/config/env.ts` |
| React | `apps/moderation/src/attendanceApi.ts`, `components/GlobalAuxControl.tsx`, `components/Layout.tsx`, `pages/Attendance.tsx`, `pages/QueueOperations.tsx`, `pages/Login.tsx`, `App.tsx`, `workforce.css` |
| Verification | `apps/api/tests/attendance.test.ts`, `apps/moderation/src/__tests__/attendanceApi.test.tsx`, existing header and shell tests, `apps/moderation/e2e/attendance.spec.ts` |

See the [repository audit and endpoint map](milestone14-phase3-architecture.md), [attendance lifecycle](milestone14-phase3-aux-lifecycle.md), [reporting](milestone14-phase3-attendance.md), [security boundaries](milestone14-phase3-security.md), [migration details](milestone14-phase3-database.md), and [test evidence](milestone14-phase3-testing.md).

## Local startup

Point `DATABASE_URL` to a dedicated development database and set `MODERATION_ORIGIN=http://127.0.0.1:5173` for the API. Then run:

```powershell
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:generate
npm run api:dev
```

In a second terminal run `npm --prefix apps/moderation run dev`. Open the Vite URL and sign in as an active employee with an assigned organization and LOB. Use the platform account and the [bootstrap instructions](milestone14-phase1-final-report.md) to provision a synthetic employee or supervisor on a fresh test database.

## Deployment status

Migration validation used isolated MariaDB schemas. The configured deployment database and existing data remain outside this rollout. The prior legacy employee/LOB and queue ownership mapping requirements, unmatched report replay limitation, and lint backlog still apply. The Windows Prisma engine replacement lock recurred. The existing native engine and regenerated client were used for database validation. No historical attendance was backfilled. Timezone reporting uses UTC because organization configuration has no reporting timezone field.

