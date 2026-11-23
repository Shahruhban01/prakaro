# AUX and attendance lifecycle

- Workforce sign-in and authenticated heartbeat start attendance in Non-moderating when the employee has no active timeline. A refresh leaves the timeline intact.
- One Better Auth session owns attendance at a time. Its tabs share the session. A second device can authenticate for existing read operations, while its AUX requests receive a conflict until the first session ends or expires.
- A punch closes the previous interval, records the next, increments the session version and stores an audit event in the same transaction. A punch to the current state is idempotent. A stale punch to a different state returns a conflict.
- Manual Offline remains an explicit AUX interval inside authenticated attendance. Presence stays separate, and Offline and Break are excluded from working time.
- Visible tabs send a heartbeat every 30 seconds. Writes are throttled per employee. The default stale threshold is 90 seconds and the inactivity limit is 900 seconds. Set `AUX_PRESENCE_STALE_SECONDS` and `AUX_INACTIVITY_SECONDS` on the API to adjust them.
- A stale heartbeat first produces Disconnected with the last AUX state preserved. Reconciliation later ends expired, disabled or inactive attendance and records the reason. Recovery through the same valid auth session creates a new interval in Non-moderating and audits recovery. Missing authentication caps the end at the last bounded inactivity cutoff or reconciliation time, whichever is earlier.
- User sign-out checks for an active case before closing attendance. The reconciler defers termination while a genuine lease is live. Existing queue operations still cannot create a lease.

