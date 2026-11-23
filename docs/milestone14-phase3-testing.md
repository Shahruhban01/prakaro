# Phase 3 validation

Run the API and browser suites only against a dedicated migrated database. Use synthetic workforce accounts and the configured browser origin. The existing Phase 1 and Phase 2 browser scenarios run alongside the Phase 3 acceptance test. Browser screenshots contain synthetic records only.

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

The attendance integration suite covers authoritative starts, six punches, duplicate idempotency, concurrent updates, device isolation, temporary disconnection, cross-organization and team access, lease locking, logout, session expiry and overnight interval aggregation.

