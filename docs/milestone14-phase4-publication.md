# Milestone 14 Phase 4: Decision Effect & Verification Publication

## 1. Immediate Publication Without Mandatory QA Gate

In Milestone 14 Phase 4, moderator decisions take effect immediately upon submission.

### Decision Actions:
- **`APPROVE`**:
  - Updates the underlying `ParkingIntelligenceCase` status to `VERIFIED`.
  - Records verification timestamp and verified source.
  - Generates immutable `PUBLISH` entry in the `AuditLog` table.
  - Verified parking listings and badges are immediately reflected in database queries and exposed to the mobile API.
- **`REJECT`**:
  - Sets the `ModerationCase` status to `REJECTED`.
  - Records justification reason.
  - Updates parking intelligence status to `REJECTED`.
  - Generates immutable `MODERATOR_SUBMIT` audit log.
- **`ESCALATE`**:
  - Sets the `ModerationCase` status to `ESCALATED`.
  - Generates audit log indicating escalation for supervisor review.

---

## 2. Versioned Decision Storage

Every decision creates a new row in `moderation_decision_version`:
- `version`: Monotonically incrementing integer per case.
- `action`: `APPROVE`, `REJECT`, or `ESCALATE`.
- `reason`: Justification text provided by the moderator.
- `evidenceIds`: JSON array of independent evidence cited.
- `answers`: JSON map of form answers completed by the reviewer.
- `moderatorId`: Foreign key to `moderators.id`.
- `createdAt`: Server timestamp.

---

## 3. Audit Trail Integrity

All state transitions write to `audit_logs`:
- **`MODERATOR_SUBMIT`**: Records moderator ID, case ID, decision action, version number, and handling duration in seconds.
- **`PUBLISH`** (on APPROVE): Records publication actor, case code, target facility ID, and verification attributes.
- **`RESERVATION_RELEASE`**: Records case release without decision publication.
