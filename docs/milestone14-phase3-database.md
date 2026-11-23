# Attendance migration

`20261122040000_aux_attendance` is additive. It creates `attendance_session`, `aux_interval` and `aux_transition_audit`. A unique nullable active key permits one active attendance session per employee. A second nullable key permits one open interval per session. SQL checks validate key ownership and closure timestamp ordering. State and reason enums constrain persisted values. Employee rows are locked with `SELECT ... FOR UPDATE` before changes, including reconciliation. Organization and LOB IDs are historical snapshots and are validated from active workforce assignments when the session opens.

Existing employees start with empty attendance history. The migration leaves authentication and moderation records in place. Prisma validation and migration should run on a restored isolated database first. For an older installation, follow the [workforce migration baseline guide](milestone14-phase1-database.md) and [queue migration guide](milestone14-phase2-database.md) before applying Phase 3.

Use `npm --prefix apps/api run db:deploy` and `npm --prefix apps/api run db:generate`. Verify the active key and check constraints after deployment. Retain backups and test restore. A rollback should switch application and schema together using the verified backup procedure. Export and retain any new attendance history generated before rollback. Staff deactivation retains history. Physical database account deletion cascades dependent attendance and must be governed by retention policy.

