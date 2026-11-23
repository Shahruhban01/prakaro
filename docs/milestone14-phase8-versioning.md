# Phase 8 versioning

An administrator creates a policy and a blank or cloned draft. Draft content can be edited using its current revision. Validation runs before transition to In Review and again before publication. A reviewer can return an In Review version to Draft. Publication freezes the document, publisher, effective timestamps and hash. Assigned scopes atomically end their prior interval and open a new interval at one timestamp.

A platform or organization administrator can publish and archive within scope. Policy write commands lock the organization row, and the database enforces a unique policy version number and a unique active assignment per scope. Revision checks reject stale requests and identical publication retries return the existing version. The SQL trigger protects frozen content, publication metadata and version identity; the API rejects edits on published and archived versions.

A rollback clones the chosen historical version into a new draft and repeats review and publication. Existing pins are unaffected. Archiving keeps the immutable version available for history and requires removing or advancing its active assignments. Legacy work continues to use its saved task form. Published content is effective when assigned. Assignment interval history represents subsequent scope changes.

Deployment uses `prisma migrate deploy` on an approved target. Confirm native MySQL 8.4 supports the checks and trigger with the migration account. For application rollback retain the additive migration and histories. Reconcile active policy-pinned cases before restoring software that predates policies, since it does not understand the pinned contract.
