# Phase 6 metric contracts

Reporting dates are inclusive local calendar dates from the caller’s IANA timezone. The server converts them to a half-open UTC range. Work after the snapshot time is excluded. All handling and AUX quantities use seconds. Counts are whole numbers. Ratios without a denominator are null.

| Metric | Source, eligibility and attribution |
| --- | --- |
| Completed | Unique accepted case handling records linked to a completed reservation and matching decision. Accepted approve, reject and escalate actions count as moderator submissions. Group by submission time and recorded queue. |
| Handling total and weighted AHT | Sum persisted duration and divide by eligible handling count. Round the displayed mean to one decimal second. An empty mean is null. |
| Handling percentiles | Exact frequency distribution. Type 7 linear interpolation at zero-based index (n − 1) × p. Round to one decimal second. |
| Intake | Distinct canonical cases with a current task in the selected queue and creation time in the period. The intake workflow creates the task with the case. |
| Pending | Distinct canonical cases in eligible pending states in an active queue, excluding valid held reservations and active legacy leases. Current snapshot. |
| Release and expiry | Release uses the recorded release time. Expiry uses the lease deadline for expired reservations and expired-but-unreconciled active leases. |
| Net flow | Intake minus accepted completions. Returns null where shared backlog is unavailable or an outcome filter changes the completion population. |
| AUX seconds | Intersect persisted intervals with the reporting window. Closed boundaries come from attendance records. Open intervals stop at now, auth expiry or inactivity cutoff. First-started interval owns overlap. |
| AUX utilization | Moderating seconds divided by recorded AUX seconds excluding Offline. No time is attributed to a queue. |
| Cases per hour | Completed divided by eligible Moderating seconds ÷ 3600. Round to one decimal case per hour. |
| Active moderator | Active employee in an active organization and LOB, online by the existing heartbeat threshold, with Moderating AUX. Current queue uses a valid reservation. |
| Session count | Moderation sessions started in the requested period and scope. |
| Historical backlog | Unavailable. Current task state and net flow cannot reconstruct historical queue balances. |

Multiple LOB grants never multiply totals for the same queue or canonical case. LOB rows show shared queue backlog. Their sums can exceed organization backlog if a queue serves several LOBs. Team comparisons report current roster cohorts and can overlap. Organization and overview totals deduplicate by the source completion records. Case counts describe work volume. They do not measure review quality.
