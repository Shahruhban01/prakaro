# Role-Based Access Control (RBAC) & Governance

## 1. Moderation Roles Matrix

The platform defines 7 distinct operational roles enforced via `ModerationStaff` profiles backed by Better Auth sessions:

| Role | Hierarchy Level | Primary Capabilities | Boundary Constraints |
| :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | Level 1 (Executive) | Global access, queue creation/deletion, staff promotion/removal, AI provider configuration, system audit log, emergency overrides. | Unrestricted across all queues and settings. |
| `ADMIN` | Level 2 | Queue management, staff role assignment, QA review, metric dashboards. | Cannot modify other Admins or Super Admins. |
| `MODERATION_MANAGER` | Level 3 | Capacity allocation, queue configuration tuning, review form design, performance metrics. | Cannot alter global system auth or API keys. |
| `SUPERVISOR` | Level 4 | Shift management, task escalation resolution, secondary QA approval, moderator coaching. | Scoped to assigned operational queues. |
| `QA_REVIEWER` | Level 5 | Quality assurance audit, decision verification, `PUBLISH` or `REOPEN` actions. | Cannot publish own reviews; independent audit required. |
| `MODERATOR` | Level 6 | Task claiming, evidence gathering, review form completion, task release. | Strictly confined to assigned queue memberships. |
| `VIEWER` | Level 7 (Read-Only) | Read-only inspection of queues, case history, analytics, and audit logs. | Forbidden from claiming, modifying, or creating any data. |

---

## 2. Queue-Level Boundaries

Staff members with non-administrative roles (`MODERATOR`, `QA_REVIEWER`, `SUPERVISOR`) operate under strict queue boundary scoping:

```typescript
// Fastify Authorization Scope Enforcement
const queueScope = (a: Actor) => (a.admin ? {} : { queueId: { in: a.queues } });
const scope = (a: Actor) => (a.admin ? {} : { tasks: { some: queueScope(a) } });
```

- When listing cases (`GET /cases`), a moderator only sees cases routed to their assigned queues.
- When claiming a task (`POST /cases/:id/claim`), the system verifies that the moderator belongs to at least one active queue associated with the case.
- Accessing or modifying a case outside assigned queues immediately throws `HTTP 403 Forbidden`.

---

## 3. Immutable Audit Trail

Every operational action across the moderation platform is recorded in the `ModerationAudit` table:
- **Captured Data**: `actor` (user ID or `system`), `action` (e.g. `QUEUE_CREATED`, `CASE_ROUTED`, `CASE_CLAIMED`, `CASE_RELEASED`, `REVIEW_SUBMITTED`, `QA_VERIFIED`, `STAFF_UPDATED`), `target` (entity ID), `before` (prior state snapshot), `after` (new state snapshot), `createdAt` (UTC timestamp).
- **Immutability**: Audit log records have no update or delete endpoints. They provide an unalterable history for security and compliance audits.
