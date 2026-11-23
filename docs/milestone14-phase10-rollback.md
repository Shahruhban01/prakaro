# Phase 10 rollback procedure

## Application-Level Rollback

1. **Traffic Draining**:
   Direct ingress traffic away from the new revision to the previously validated release.
2. **Session Revocation**:
   If an authorization or session vulnerability is detected, revoke all active staff sessions:
   ```sql
   UPDATE moderator_session SET expiresAt = NOW() WHERE expiresAt > NOW();
   UPDATE session SET expiresAt = NOW() WHERE expiresAt > NOW();
   ```
3. **Artifact Rollback**:
   Re-deploy the previously approved API node binary and static Moderation Console bundle.
4. **Verification**:
   Execute `/ready` and `/health` probes, verify supervisor sign-in, and confirm AUX attendance state.

## Database-Level Rollback & Forward Recovery

1. **Prefer Additive Forward Migrations**:
   Never run destructive reverse DDL (`DROP COLUMN`, `DROP TABLE`) against live production data. All schema changes in Milestone 14 are backward-compatible and additive.
2. **Prohibited Commands**:
   Never execute `prisma migrate reset`, `prisma db push`, or manually delete rows from `_prisma_migrations` on production or staging environments.
3. **Point-In-Time Restoration Procedure**:
   If unrecoverable data corruption occurs:
   - Isolate the live database instance.
   - Restore the verified pre-deployment snapshot (`canonical_backup.sql`) into an empty, isolated recovery instance.
   - Replay binary logs up to the exact transaction prior to the incident.
   - Verify table row counts, relational integrity (92 foreign keys), triggers (2 triggers), and Prisma ledger (`_prisma_migrations`).
   - Switch application connection string to the restored instance and verify readiness.
