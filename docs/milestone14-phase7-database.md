# Phase 7 database

Migration `20261123010000_post_decision_qa` adds five tables. Apply it with `prisma migrate deploy` to an approved target before starting the new API.

| Table | Purpose |
| --- | --- |
| `qa_policy` | Versioned sampling rates, scoring, effective dates, and one active policy per scope |
| `qa_sample` | One terminal sampling result per decision version, plus assignment and lease when selected |
| `qa_assessment` | Original and finalized QA outcome, validated error details and elapsed seconds |
| `qa_dispute` | Moderator challenge and independent resolution history |
| `qa_correction` | Scoped correction request, reviewer lease, elapsed seconds and resulting decision version |

Existing moderation decision versions gain an optional JSON snapshot, a publication reference, and unique case/version attribution. Historic rows keep their own recorded metadata and may lack snapshots. QA events use the existing append-only service path for the moderation audit table. Tenant/date, worklist, assignee, outcome and dispute indexes cover QA access patterns. Foreign keys retain histories and SQL checks enforce common state invariants.

The migration is additive and was applied to isolated local MariaDB schemas. Keep the additive tables during application rollback and stop the new API worker. Existing moderation can continue using the pre-QA application version. QA records require the team's ordinary backup, access and retention controls. Test deploys against the intended MySQL 8.4 configuration before production.
