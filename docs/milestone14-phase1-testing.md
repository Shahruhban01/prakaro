# Phase 1 validation

Backend integration uses separate Better Auth sessions and a disposable MySQL-compatible validation schema. It covers cross-organization reads and writes, single-LOB integrity, permitted staff provisioning, deactivation, two team leadership roles and audit attribution.

Run `npm run api:build`, `npm run api:test`, `npm --prefix apps/moderation test`, `npm --prefix apps/moderation run build`, `npm --prefix apps/moderation run e2e`, `flutter analyze` and `flutter test`. The browser test requires a migrated disposable database, an existing synthetic Super Admin, and `PRAKARO_TEST_ADMIN_EMAIL` and `PRAKARO_TEST_ADMIN_PASSWORD` in the local environment. Its workflow creates real synthetic organizations, LOBs and staff records in that database.


## Browser evidence

The workflow uses synthetic users and records. The dedicated validation and browser databases received the identity bridge and workforce migration. Prisma reported zero schema drift against the last validation database.

[Dashboard](milestone14-phase1-screenshots/workforce-dashboard.png) · [Organizations](milestone14-phase1-screenshots/organizations.png) · [LOB assignment](milestone14-phase1-screenshots/lob-assignment.png) · [Employees](milestone14-phase1-screenshots/employees.png) · [Team assignment](milestone14-phase1-screenshots/organization-teams.png) · [Mobile AUX](milestone14-phase1-screenshots/mobile-header.png)

## Results

| Command | Observed result |
| --- | --- |
| `npm run api:build` | TypeScript passed |
| `npm run api:test` | 120 passed against the isolated validation database |
| `npm --prefix apps/moderation run build` | TypeScript and Vite passed. Vite reported a large legacy entry chunk |
| `npm --prefix apps/moderation test` | 11 tests in five files passed |
| `npm --prefix apps/moderation run e2e` | One Chromium browser workflow passed with real Fastify, Better Auth and database persistence |
| `flutter analyze` | No issues |
| `flutter test --reporter expanded` | 125 passed |
| `prisma validate`, `prisma migrate deploy`, and `prisma migrate diff --exit-code` | Schema valid, all four migrations applied on the clean validation database, zero drift |
| `npm run api:lint` | Reports existing lint errors in migration utilities and legacy API code |

The browser test authenticated both platform and organization identities, created and assigned an LOB, provisioned a director and an employee, created a team, assigned its member, and confirmed that the organization director could not create an LOB. It checked AUX in the shared header and at a 390-pixel viewport.

The native Prisma generator encountered a Windows engine DLL replacement lock. The generated client used the existing matching engine successfully in schema and integration verification. Production migration and recovery remain deployment steps.
