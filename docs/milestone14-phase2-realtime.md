# Queue metrics and polling

The console polls authenticated endpoints every 15 seconds in the foreground and refetches on tab focus. Every request reevaluates authorization. A failed request shows an error state and the next poll can recover. Available and subscribed queue lists are bounded at 25 rows per request.

Pending includes open operational cases without a current authorized lease. In progress and active moderators count eligible current leases from historical records. Subscriptions count active authorized employees regardless of activity. Completed today uses distinct finalized cases with a publication audit event on the UTC reporting day. Cases without a trustworthy publication timestamp are excluded from the daily count.

AHT is returned as `ahtSeconds: null` because legacy leases do not supply eligible completed handling durations. The UI shows Unavailable. Future timing records will support weighted AHT in seconds.

