# Workforce permissions

| Identity | Read scope | Writes |
| --- | --- | --- |
| Super Admin | Platform-wide | Organizations, LOBs, staff, teams and queue delegation |
| Organization Director | Own organization | Organization details, staff and teams. Queue configuration when delegated |
| Manager | Explicitly assigned teams | Read access in Phase 1 |
| Moderation Supervisor | Explicitly assigned moderation teams | Read access in Phase 1 |
| QA Supervisor | Explicitly assigned quality teams | Read access in Phase 1 |
| Moderator, QA Reviewer, Viewer | Own profile and authorized resources | No workforce administration |
| Mobile user | Mobile identity domain | Workforce endpoints denied |

Only Super Admin assigns or creates LOBs or provisions directors. Staff cannot edit their own membership or role. Deactivated organizations and LOBs revoke staff access at session validation. Membership updates invalidate existing sessions when role, status or organizational membership changes.

Legacy queue access continues through explicitly assigned shared queues. Organization-owned queues can be configured by delegated directors. LOB subscriptions and organization-owned intake routing belong to Phase 2. Existing global case data remains available through its authorized legacy route, with queue navigation preferred.

