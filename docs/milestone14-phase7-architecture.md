# Phase 7 architecture

A retained continuous-moderation decision and its valid handling record feed Quality Assurance. The submission transaction persists the decision, applies any permitted publication, records handling, and allocates the next case through the existing strict random allocator. The decision now retains a bounded QA snapshot. QA never gates submission, release, publication, or auto-next.

The Fastify QA worker reads committed records every three seconds. It runs one bounded batch per process and serializes duplicate decisions at the database row. The durable source is the existing handling table. A stopped worker resumes from unsampled rows. It logs operational errors through Fastify and closes cleanly with the server.

The React console has **Overview and worklist**, **Quality analytics**, and a role-gated **Sampling policies** view. Review details show frozen evidence and current evidence separately. The app shell keeps the existing top-right AUX control. QA assignments use separate leases and do not change staff AUX state.

The backend modules under `moderation/qa/` divide the workflow into validated contracts, sampling, review/assignment, correction, reporting, and Fastify routes. The React counterparts live under `components/qa/`.

`/api/v1/moderation/qa` provides `dashboard`, `options`, `reviews`, `analytics`, `policies`, and `disputes` reads. Authenticated mutations version sampling policies, manually select an eligible decision, claim/start/release/assign/read assessments, dispute and adjudicate, and request/start/approve corrections. List responses use 20-row pages. Worklist and dashboards poll every 15 seconds, and a successful mutation refreshes active QA queries.
