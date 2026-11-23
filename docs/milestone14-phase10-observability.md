# Phase 10 observability

`GET /health` is process liveness. `GET /ready` uses one shared in-flight MySQL SELECT and returns 503 after 1.5 seconds or on database error. Optional AI providers do not gate readiness. Use a private uptime monitor for readiness. Graceful shutdown drains Fastify and workers before closing Prisma, with a 25-second deadline.

The request completion log includes generated request ID, route template, method, status and duration. Aggregate 401 and 403 separately. Use route families for allocation latency, lease heartbeat failures, reservation conflicts, submission errors and policy publication failures. Worker warnings identify failed runs. Capture Prisma pool and MySQL database connections at the database or APM layer. Keep log retention scoped and do not enable raw Prisma tracing in production.

Pool saturation observed during the native benchmark now has a structured `db.pool.timeout` event and a retryable 503 with `Retry-After: 5`. The production API also admits at most two expensive reports per instance by default. Excess work receives `REPORT_BUSY` before it claims database connections. Set `REPORT_MAX_CONCURRENT` only after verifying the database pool budget and service targets. Treat admission rejections as service errors in availability reporting.

| Signal | Starting threshold | Severity and owner |
| --- | --- | --- |
| HTTP 5xx | Above 1% for five minutes | High, API on-call |
| Connection pressure | Above 80% of approved pool capacity for five minutes | High, database on-call |
| Analytics | p95 above two seconds for ten minutes | Warning, workforce engineering |
| Lease failures or submission errors | Twice the staging-established baseline for ten minutes | Warning, moderation operations |
| Sampling lag | Oldest unprocessed sample beyond fifteen minutes | High, QA engineering |
| Publication errors, migration failure or missed backup | Any persistent failed run | High, release or database on-call |

Group alerts by service, environment and signal. Use the deployment or rollback runbook before changing production state. Staging still needs collector wiring and notification tests.
