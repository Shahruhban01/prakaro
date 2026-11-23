# Phase 2 testing

Run the API and moderation commands from the repository root. Use a separate migrated database, synthetic Better Auth accounts, and the configured Vite origin.

```powershell
npm run api:build
npm run api:test
npm --prefix apps/moderation run build
npm --prefix apps/moderation test
npm --prefix apps/moderation run e2e
cd apps/mobile
flutter analyze
flutter test
```

Backend fixtures exercise the three identity domains, scoped organization creation, LOB grants, concurrent subscriptions, revocation, queue case isolation, mock search admission, report routing and unavailable AHT. React tests cover queue worklists, denied access, the read-only view and the global header. The browser workflow uses synthetic data with the real API and checks that a newly routed report changes pending workload through polling.


## Executed results

| Command | Result |
| --- | --- |
| `npm run api:build` | Passed |
| `npm run api:test` | 112 passed, zero failures, including concurrent queue creation and subscription |
| `npm --prefix apps/moderation run build` | Passed with Vite's size warning for the existing application bundle |
| `npm --prefix apps/moderation test` | 15 passed |
| `npm --prefix apps/moderation run e2e` | 2 passed in Chromium using real Fastify and Better Auth |
| `flutter analyze` | No issues |
| `flutter test --reporter expanded` | 125 passed |
| `prisma migrate deploy` and `prisma migrate diff --exit-code` | All five migrations applied on the isolated validation database with zero schema drift |

The browser queue scenario created and configured an owned queue, granted LOB access, routed a synthetic user report, observed the pending count increase through polling, subscribed as a moderator, opened the case with no mutation controls and received an access denial for another queue. It also verified the AUX header and disabled moderation prerequisites. The Phase 1 workforce scenario passed in the same run.

[Synthetic dashboard](milestone14-phase2-screenshots/queue-dashboard.png) · [Available Queues](milestone14-phase2-screenshots/available-queues.png) · [My Subscribed Queues](milestone14-phase2-screenshots/subscribed-queues.png) · [Read-only case](milestone14-phase2-screenshots/read-only-case.png)
