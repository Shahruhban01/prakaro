# Phase 9 performance

## Changes

The Phase 6 diagnostic query no longer recalculates distinct decision IDs. A unique decision-version foreign key already enforces the invariant, and the other diagnostic joins are unique-key lookups. The query still counts scanned completions, missing work-time attribution and orphaned reservations. Its result was compared against the previous expression on the same cohort.

The executive report uses focused totals for eligible handling and finalized QA instead of loading both complete Phase 6 and Phase 7 dashboard payloads. It reuses the live workforce read and current backlog when planning tomorrow. A short in-flight coalescer shares equivalent broad administrator requests in the same tenant. Individual and team requests bypass it. Access is checked on every request. An error evicts the cached result.

## Isolated benchmark

The benchmark used 10,000 synthetic handling records and a separate MariaDB 10.4 instance with a 256 MiB InnoDB buffer pool. All eleven migrations were applied. The existing Phase 6 seeder supplied valid handling and reservation links, and the Phase 9 benchmark seeded independent QA samples. These are synthetic measurements on local MariaDB.

| Operation | Median |
| --- | ---: |
| Existing Phase 6 overview in this run | 898 ms |
| Previous Phase 6 diagnostic expression | 172 ms |
| Revised Phase 6 diagnostic expression, same counts | 113 ms |
| Existing Phase 7 QA dashboard | 567 ms |
| Cold Phase 9 executive overview | 1,921 ms |

The Phase 6 and 7 dashboards and the new executive overview return different data. The equivalent comparison is the diagnostic expression. The queue query plan used the handling queue/submission index, then primary-key lookups for reservation, decision, work session and attendance. Historical 100,000-record Phase 6 and Phase 7 figures remain prior benchmarks and were not remeasured in this run.

## Concurrent executive polling

Each burst used a new Fastify instance, separately authenticated synthetic staff accounts, the same organization-wide request, and a cold coalescing cache. Fastify injection exercises request handling, access checks and real SQL, excluding network hops and browser rendering. Database counters cover the local isolated instance. API CPU is cumulative process CPU over the burst.

| Users | Median | P95 | Errors | DB Questions | DB connections / peak | API CPU | API RSS | DB memory |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 2,775 ms | 2,775 ms | 0 | 118 | 9 / 9 | 1,001 ms | 171 MiB | 296.1 MB |
| 50 | 2,701 ms | 2,702 ms | 0 | 394 | 9 / 9 | 2,030 ms | 175 MiB | 298.4 MB |
| 100 | 3,326 ms | 3,326 ms | 0 | 744 | 9 / 9 | 2,641 ms | 181 MiB | 299.9 MB |

Authentication and per-request authorization still query the database. Coalescing avoids a full report for each equivalent originator. These bursts do not cover heterogeneous cross-tenant queries, steady-state polling, network latency or database CPU. Native MySQL 8.4 testing and a longer workload remain production gates.

Reproduce using `scripts/benchmark-analytics.ts --through=10000` and then `scripts/benchmark-operations.ts` from `apps/api` on a dedicated local schema matching `prakaro_phase6_benchmark`. The benchmark rejects nonsynthetic schemas and reused QA fixtures.
