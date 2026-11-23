# Phase 8 policy model

| Record | Responsibility |
| --- | --- |
| ModerationPolicy | Tenant ownership, name, category, description and creator |
| PolicyVersion | Unique sequential number, lifecycle state, revision, document, publication metadata and SHA-256 hash |
| PolicyAssignment | Effective interval for one organization, LOB or queue scope, tied to an exact version |
| PolicyClarification | One bounded conversation per reservation, including the pinned version and organizational context |
| ClarificationMessage | Append-only entry with actor, action and timestamp |

Additive migration `20261123020000_versioned_moderation_policies` adds the five tables and optional references on reservations and decisions. The existing queue configuration version and Phase 7 audit events remain valid. Policy version references use restrictive foreign keys. The migration preserves legacy data and leaves old policy references null. It does not infer any historical publication.

(Queue > LOB > Organization) is resolved from the organization and LOB recorded on the moderation session’s attendance record. A queue-wide override covers all granted LOBs. Without it, employees sharing a queue receive their own LOB rules or the organization fallback. If no assignment applies, the task’s original queue configuration still governs. Archived queues and inactive LOBs cannot receive new assignments.
