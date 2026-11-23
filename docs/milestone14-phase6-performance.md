# Phase 6 performance benchmark

Run `tsx scripts/benchmark-analytics.ts` from `apps/api` against a newly migrated loopback database named `prakaro_phase6_benchmark` or a suffixed variant. Seed mode refuses non-loopback targets and databases containing cases. It creates distinct canonical case, task, reservation, decision and handling records at 100, 10,000 and 100,000 completions. It validates the overview, queue and team counts at every scale. Tables and people in these databases are synthetic.

Use `--through=10000` to stop after the smaller scales, or `--measure-existing` to repeat read timings on a completed synthetic seed without changing it.

Each number is the median of three read timings in milliseconds. SELECT counts exclude transaction-control statements and authentication outside the measured service. The overview, queue and team measurements use the same report function as the API. The AHT and AUX timings use their production query helpers.

The first large run on the development server's 16 MiB buffer pool exceeded the interactive transaction timeout. EXPLAIN showed the optimizer driving some reports from queue and reservation indexes and looking up handling rows one at a time. The implementation anchors completion queries on the handling table and combines workspace dimensions and time/distribution scans. Final measurements use a separate local MariaDB 10.4 process with a 256 MiB buffer pool. Its data directory is distinct from the development server.

| Completed cases | Overview | Queue | Team | AHT | AUX |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 39ms | 28ms | 29ms | 2ms | 7ms |
| 10,000 | 651ms | 195ms | 291ms | 34ms | 6ms |
| 100,000 | 8,188ms | 1,902ms | 2,950ms | 351ms | 7ms |
| SELECTs per measurement | 18 | 17 | 17 | 1 | 4 |

The queue plan used the queue/submission index on the handling table and primary-key lookups for reservation, decision, work session and attendance. These are local medians. Concurrent polling and native MySQL 8.4 performance require separate deployment verification.
