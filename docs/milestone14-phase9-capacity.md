# Phase 9 capacity

Theoretical capacity is estimated allocated working seconds divided by historical weighted AHT in seconds, rounded down to whole cases per queue. AHT comes from the existing eligible decision records over the preceding 30 local days. A positive explicitly entered fallback is used only when measured AHT is absent. With neither, capacity is unavailable.

For each current active employee with a matching scheduled organization and LOB, the model clips the scheduled shift to the future planning window. It subtracts prorated break, meeting and training minutes, then applies the configured expected Moderating fraction. A queue receives time only if it is active, the employee's LOB has a live grant, and the employee is subscribed. Queue weights split that person's time across all eligible queues before the report filters restrict displayed queues. Zero weight removes that queue from allocation. Equal weights are the default.

Managers can compare request-level utilization and fallback AHT assumptions. Organization administrators can save assumptions and the reporting timezone with an optimistic revision. Baseline utilization defaults to 75%, explicitly as an assumption. No source is invented for staff without a schedule.

Projected backlog change equals expected new intake minus estimated processing capacity. Extra Moderating hours equal the remaining forecast cases times AHT, divided by 3,600. Existing pending workload is shown separately. These figures indicate coverage risk, not guaranteed staffing performance.
