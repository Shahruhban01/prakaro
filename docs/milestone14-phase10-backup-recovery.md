# Phase 10 backup and recovery

## Backup Architecture & Policy

- **Tooling**: Native `mysqldump` with options `--single-transaction --no-tablespaces --routines --triggers --events --hex-blob`.
- **Target Engine**: MySQL 8.4.13 Community Server.
- **RPO / RTO**:
  - RPO Target: Point-in-time recovery via continuous binary logs.
  - RTO Target: Cold restore under 15 minutes for baseline operational data.

## Issue Resolution: Trigger Formatting in Logical Dumps

### Root Cause
During initial logical restores on MySQL 8.4, `mysql.exe` failed with:
```
ERROR 1064 (42000) at line 1213: You have an error in your SQL syntax; check the manual near ' */' at line 9
```
In migration `20261123020000_versioned_moderation_policies`, `CREATE TRIGGER policy_version_preserve_publication` was authored as a single statement trigger without a compound statement block (`BEGIN ... END;`). When `mysqldump` exported the trigger inside version-specific comments `/*!50003 ... */` under `DELIMITER ;;`, it placed a statement semicolon immediately before `*/;`. MySQL client's delimiter parser misinterpreted the trailing semicolon as the end of the statement while the delimiter was still `;;`, producing Error 1064.

### Remediation
The trigger definition was wrapped in `BEGIN ... END;` in migration `20261123020000_versioned_moderation_policies/migration.sql`:
```sql
CREATE TRIGGER policy_version_preserve_publication
BEFORE UPDATE ON moderation_policy_version
FOR EACH ROW
BEGIN
  IF OLD.publishedAt IS NOT NULL AND (NEW.publishedAt IS NULL OR NEW.publishedAt <> OLD.publishedAt) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Policy publication timestamp cannot be altered once published';
  END IF;
END;;
```

## Native Backup & Restore Drill Evidence

A live drill was executed against native MySQL 8.4.13 (port 3384):
1. **Full Dump Execution**:
   ```bash
   mysqldump -u root -P 3384 -h 127.0.0.1 --single-transaction --routines --triggers --events --result-file="canonical_backup.sql" prakaro_canonical_mysql84
   ```
   Generated clean dump archive with proper delimiter boundaries.
2. **Fresh Schema Restore**:
   Created database `prakaro_canonical_restore_test` and executed restore:
   ```bash
   mysql -u root -P 3384 -h 127.0.0.1 -e "source canonical_backup.sql" prakaro_canonical_restore_test
   ```
3. **Verification**:
   - Total Tables: 60 tables restored.
   - Total Triggers: 2 triggers restored and validated.
   - Restoration Time: Completed in under 12 seconds.
   - Errors: 0 syntax or relational errors.
   - Migration Status: All 11 `_prisma_migrations` records intact and active.
