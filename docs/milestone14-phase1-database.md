# Workforce migrations

The schema adds organizations, LOBs, teams and explicit team links to the existing Moderator identity model. Composite keys enforce employee/LOB and team/employee organization consistency. A check requires organization and LOB for every active staff record. Assigned LOBs containing staff must be emptied before reassignment. Existing active employees without a mapping enter `PENDING_ASSIGNMENT`; staff activation requires an active organization and LOB.

## Deployment

1. Export a restricted-access backup with `mysqldump --single-transaction --routines --triggers` and verify restoration on a separate database. Record staff roles and status counts, queue memberships, case ownership, reviewer IDs and audit totals before proceeding.
2. Run Prisma schema diff against the expected identity schema. Fresh databases apply all migrations. A database already provisioned with the three identity domains by the earlier deployment process must first be baselined. After verifying each migration's resulting schema exists, use `prisma migrate resolve --applied <migration-name>` for the matching historical migrations through `20261122010000_identity_domains`. Never resolve the workforce migration before it has been applied.
3. Databases on the old shared-identity schema must map any orphaned case owner or reviewer IDs before deploying. The historical bridge keeps user IDs, moderation links and case references, and creates pending moderator identities from matching legacy references without copying passwords or sessions. Provision separate credentials explicitly.
4. Use `prisma migrate deploy` and `prisma generate`. Map pending staff through the platform employee directory, preserving staff IDs and historical references.
5. For rollback, restore the verified backup on a separate target and switch traffic back to the matching application release. Export or reconcile any workforce changes made after the backup before cutover.

Do not apply the historical identity bridge to a database already running the separate identity domains.

