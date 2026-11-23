# Analytics API

Routes are under `/api/v1/moderation/analytics`.

| GET suffix | Report |
| --- | --- |
| `/overview` | Scoped overview and selected table dimension |
| `/moderators/me` | Authenticated employee |
| `/moderators/:id` | Authorized employee |
| `/teams` | Team comparison or selected team |
| `/lobs` | LOB comparison or selected LOB |
| `/organizations` | Authorized organizations |
| `/queues/:id` | Authorized queue |

Query parameters include timezone, preset (today, yesterday, 7days, 30days or custom), from, through, organizationId, lobId, teamId, queueId, moderatorId, status (accepted decision action), dimension, page, order and search. Custom periods may cover up to 93 local dates. Pages hold 20 table rows. The API validates filters and responses with Zod.

Responses include generation time, timezone, dates, totals, duration distribution, hourly and daily throughput, AUX, quality counts, scoped options and paginated table rows. Hourly data covers the last elapsed report day. Unavailable measures are explicit nulls. The root legacy route retains its compatibility response for platform and organization administrators. Other workforce roles use the scoped routes.
