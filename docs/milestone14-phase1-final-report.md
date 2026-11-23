# Milestone 14 Phase 1 implementation report

## Repository audit

The installed console used React, Vite and TanStack Query and already supported queue, case, evidence and review workflows. Fastify used three independent Better Auth configurations backed by separate identity, account and session tables. Legacy moderation roles lacked organization boundaries. The schema contained no organization, LOB, team or attendance records. The all-phases specification lives under `docs/moderation`.

The configured local database had three active operational staff without organization mappings, nine legacy queue memberships, 98 audit records and zero currently assigned cases at audit time. Validation used only dedicated databases.

## Changes

- Added workforce models and historical migration reconciliation under `apps/api/prisma`.
- Added organization, LOB, staff, team and dashboard routes in `apps/api/src/modules/moderation/workforce.ts`.
- Scoped existing moderation access, added queue configuration delegation, and tightened console mutation origin validation.
- Replaced the authenticated React layout and added the global AUX control, scoped dashboard and four workforce directories. Directory records include editing and assignment workflows.
- Added backend integration tests, React AUX and shell tests, and a Playwright workflow against real Better Auth and Fastify endpoints.
- Kept the Flutter design and discovery flow. Corrected a pre-existing API and Flutter discrepancy where Verified Only included strongly supported candidates. Independently verified records now satisfy that filter.

## Local startup

Use a dedicated local MySQL database. Follow [migration instructions](milestone14-phase1-database.md) before deploying to a database with existing records. Set `MODERATION_ORIGIN=http://127.0.0.1:5173` and `BETTER_AUTH_URL=http://localhost:3000` in the API environment. Use a local platform account.

```powershell
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:generate
npm run api:dev
```

Open a second terminal.

```powershell
npm --prefix apps/moderation install
npm --prefix apps/moderation run dev
```

Open the Vite URL and choose **Super Admin** on the sign-in screen. If a new validation database lacks a platform account, use the existing initializer with credentials read from process environment variables.

```powershell
cd apps/api
.\node_modules\.bin\tsx.cmd -e "import { initialize } from './src/modules/moderation/setup'; initialize(process.env.PRAKARO_TEST_ADMIN_EMAIL!, process.env.PRAKARO_TEST_ADMIN_PASSWORD!, 'Platform Operator')"
```

## Boundaries

Existing deployment data remains in its original database. Map pending staff explicitly before enabling workforce access there. AUX is visible throughout the console and punching is unavailable until attendance persistence ships. Organization-owned queue routing, LOB subscriptions, continuous moderation and sampling remain in their designated phases.

See [testing](milestone14-phase1-testing.md), [database](milestone14-phase1-database.md) and [permissions](milestone14-phase1-permissions.md).

