# Prakaro — Trust & Safety Role-Based Access Control (RBAC) & Authorization Architecture
**Document Version:** 1.0.0 (Milestone 13.1 RBAC Hardening)  
**Classification:** Enterprise Security Architecture  
**Authoritative Enforcement:** Fastify Middleware & MySQL Foreign Constraints  

---

## 1. Role Hierarchy & Permission Matrix

Prakaro separates administrative capabilities into seven explicit, strictly enforced tiers. Platform administration is decoupled from moderation operations:

```
[ SUPER_ADMIN ]
      │ (Platform Infrastructure, AI Keys, Super Admin Provisioning)
      ▼
[ MODERATION_ADMIN ]
      │ (Queue Management, Moderator Onboarding, SLAs, Analytics)
      ▼
[ MODERATION_MANAGER ]
      │ (Operational Dispatch, SLA Monitoring, Queue Capacities)
      ▼
[ SUPERVISOR ]
      │ (Arbitrate Escalations, Complex Overrides, Claim Overrides)
      ▼
[ QA_REVIEWER ]
      │ (Independent Review Auditing, Publish Verifications, Reopen Cases)
      ▼
[ MODERATOR ]
      │ (Frontline Claiming, Evidence Evaluation, Form Submissions)
      ▼
[ VIEWER ]
        (Read-Only Auditing & Reporting)
```

### Complete Capability Matrix

| Capability / API Operation | `SUPER_ADMIN` | `MODERATION_ADMIN` | `MODERATION_MANAGER` | `SUPERVISOR` | `QA_REVIEWER` | `MODERATOR` | `VIEWER` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Manage Super Admins** (`/super-admins`) | **YES** | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) |
| **Configure AI Providers & Keys** (`/ai/providers`, `/ai/test`) | **YES** | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) |
| **System Audit Trail** (`/audit-log`) | **YES** | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) |
| **Create / Modify Queues** (`POST/PUT /queues`) | **YES** | **YES** | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) |
| **Provision & Assign Moderators** (`POST /moderators`) | **YES** | **YES** | NO (403) | NO (403) | NO (403) | NO (403) | NO (403) |
| **View Operations Analytics** (`/analytics`) | **YES** | **YES** | **YES** | **YES** | NO (403) | NO (403) | NO (403) |
| **Arbitrate Escalations** (`/escalations`) | **YES** | **YES** | **YES** | **YES** | NO (403) | NO (403) | NO (403) |
| **Publish QA Verifications** (`POST /cases/:id/qa` `PUBLISH`) | **YES** | **YES** | NO (403) | **YES** | **YES** | NO (403) | NO (403) |
| **Reopen Defective Cases** (`POST /cases/:id/qa` `REOPEN`) | **YES** | **YES** | NO (403) | **YES** | **YES** | NO (403) | NO (403) |
| **Claim Assigned Queue Tasks** (`POST /cases/:id/claim`) | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | NO (403) |
| **Attach Evidence to Facility** (`POST /cases/:id/evidence`) | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | NO (403) |
| **Submit Case Review** (`POST /cases/:id/reviews`) | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | NO (403) |
| **Read Cases & Queues (Assigned)** | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** |

---

## 2. Server-Side Enforcement Mechanisms

Client-side UI navigation guards merely optimize UX; all security is enforced by Fastify server handlers:

### 2.1 The `permit` Function
```typescript
function permit(a: Actor, ...allowed: string[]) {
  if (allowed.length === 0) return;
  if (!a.admin && !allowed.includes(a.role)) {
    throw new ForbiddenError('Insufficient role permissions for this operation.');
  }
}
```
- If an operation requires `SUPER_ADMIN` (e.g. `POST /super-admins`), the check explicitly validates `if (!a.superAdmin) throw new ForbiddenError(...)`.
- `MODERATION_ADMIN` satisfies `a.admin`, granting queue and moderator management, but is blocked from infrastructure operations.

### 2.2 Queue-Level Boundary Isolation
Moderators without global admin status are constrained to their explicitly assigned queues:
```typescript
const queueScope = (a: Actor) => (a.admin ? {} : { queueId: { in: a.queues } });
const scope = (a: Actor) => (a.admin ? {} : { tasks: { some: queueScope(a) } });
```
When querying cases (`GET /cases`), claiming tasks (`POST /cases/:id/claim`), or submitting reviews (`POST /cases/:id/reviews`), the Prisma query automatically injects `scope(a)` and `queueScope(a)`. An attempt to access a case in an unassigned queue throws a `404 Not Found` or `403 Forbidden`.

---

## 3. Privilege Escalation Defenses

1. **Role Grant Restrictions**:
   - Only a `SUPER_ADMIN` can assign `SUPER_ADMIN` or `MODERATION_ADMIN` roles.
   - A `MODERATION_ADMIN` attempting to assign `SUPER_ADMIN` or `MODERATION_ADMIN` to any user is immediately rejected with `403 Forbidden`.
2. **Self-Promotion Prevention**:
   - An administrator cannot modify their own role. Attempting to change one's own role triggers an explicit `ForbiddenError('Cannot modify your own administrative role or status.')`.
3. **Deactivated Identity Rejection**:
   - Once a moderator's status is toggled to `DEACTIVATED`, every subsequent API invocation fails at the session resolution layer with `403 Forbidden`.

---

## 4. Independent QA Gate & Dual-Identity Separation

To guarantee data integrity and eliminate conflict-of-interest errors, the publication of verified parking attributes requires two distinct identities:
1. **The Reviewing Moderator**: Claims the case, evaluates synthetic/physical evidence, completes the form, and submits the review. The case transitions to `PENDING_QA`.
2. **The QA Reviewer / Auditor**: Must be an independent identity. The server explicitly enforces:
   ```typescript
   if (!review || review.reviewerId === a.userId) {
     throw fail('Independent second reviewer required.');
   }
   ```
   If the reviewer attempts to call the QA gate (`POST /cases/:id/qa`) on their own submission, the request is rejected with `409 Conflict`.
