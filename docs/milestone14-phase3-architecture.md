# AUX implementation and repository audit

Phase 2 had separate mobile, platform and workforce Better Auth sessions, tenant-scoped workforce lookups, queue subscriptions, authenticated polling and a shared AUX header in the unavailable state. Prisma had no attendance tables. Case mutations were disabled, but legacy case records could still contain an owner and an unexpired lease.

Phase 3 adds an attendance session, its state intervals, and an append-only transition audit. Fastify owns timestamps and state changes. The React header reads that state and calculates display time using a server offset. UTC reporting aggregates interval intersections. Workforce visibility uses the same organization and team scopes as staff management.

| API under /api/v1/workforce | Purpose |
| --- | --- |
| GET /aux/me | Current authoritative AUX, timer origin, version and lock |
| POST /aux/transition | Version-checked punch |
| POST /attendance/heartbeat | Open or recover attendance and refresh presence |
| GET /attendance/me | Current attendance projection |
| GET /attendance/me/history | Own attendance reporting |
| GET /aux/organization | Scoped live workforce view |
| GET /aux/team?teamId=… | Explicit team view |
| GET /aux/staff/:id/history | Scoped staff attendance |

The console adds `/my-attendance` and `/workforce/aux`, with staff history drill-down. AHT continues to use seconds and is independent of attendance.

