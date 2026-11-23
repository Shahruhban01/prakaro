# Analytics database changes

Migration `20261123000000_performance_analytics` adds five nonunique indexes. They cover platform completion time, organization and LOB attendance start, queue lease status and expiry, and queue release status and time. Existing moderator/queue completion, attendance interval, active-key and unique decision indexes remain authoritative.

The work session links to the attendance session used during moderation. Its saved organization and LOB identify historical work after an employee’s reassignment. A historical record with no attendance attribution may use its queue’s organization. Its LOB remains unavailable. Current team membership defines cohort reports and is labeled accordingly.

Deployment uses `prisma migrate deploy`. Roll back the application first if needed. The additive indexes can remain during rollback. No application data needs to be rewritten.
