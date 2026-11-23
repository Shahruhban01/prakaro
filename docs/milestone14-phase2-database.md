# Queue database migration

`20261122030000_queue_operations` adds grants, subscription state, version snapshots, and queue/task indexes. Composite foreign keys require the queue and its granted LOB to belong to the same organization. The subscription composite primary key prevents two active preferences for an employee and queue. Existing cases, submissions, task rule/form snapshots, and audits keep their original IDs.

Use a backed-up disposable database first. Follow [Phase 1 baselining instructions](milestone14-phase1-database.md) when the database was provisioned before the identity-domain migrations existed. Run `npm --prefix apps/api run db:deploy` and `npm --prefix apps/api run db:generate`. Never reset production tables. For a deployed system, rehearse backup restore and schema validation before switching the application version.

Legacy unowned queues remain visible to platform administrators. Review their historical cases, assign ownership through queue settings, and explicitly select LOBs. Adoption is blocked when a case already belongs to a queue owned by another organization. Legacy memberships are preserved for historical investigation and do not create grants. A queue owner is immutable after assignment.

Revoking grants and pausing queues releases matching historical leases and keeps submissions and audit history. Access also ends when workforce membership, the organization or the LOB is inactive. Where historical grants still reference a LOB, its organization transfer requires a reviewed migration. No workforce or queue migrations were applied to the configured deployment database during implementation.

