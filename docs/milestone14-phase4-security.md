# Milestone 14 Phase 4: Security, Tenant Boundaries & Identity Protection

## 1. Tripartite Identity Domain Separation

Prakaro maintains strict separation across three distinct authentication and identity domains:
1. `users` (Consumer mobile parking discovery users)
2. `super_admins` (Platform administrators)
3. `moderators` (Workforce operations personnel)

### Rules Enforced:
- Continuous moderation is exclusive to `moderatorAuth` sessions (`staff()` fallback for super admin inspection only).
- Mobile users and end users cannot authenticate against moderation endpoints or hold work sessions.
- Super admins cannot be assigned cases or hold active moderation work sessions meant for queue moderators.

---

## 2. Multi-Tenant Workforce Scoping

Before a moderator can interact with a queue:
- **Organization Active Check**: The moderator's employer organization must be active (`active = true`).
- **LOB Active Check**: The moderator's Line of Business must be active (`active = true`).
- **LOB Matching**: The queue must belong to the moderator's assigned LOB (`queue.lobId === moderator.lobId`).
- **Queue Subscription Check**: The moderator must have an active subscription in `queue_subscriptions`.

If any of these conditions fails, Fastify throws HTTP 403 `FORBIDDEN` or 409 `INVALID_SESSION`.

---

## 3. Server-Authoritative Active-Case Lock (HTTP 409 `ACTIVE_CASE`)

To prevent moderators from abandoning active cases or clocking out while holding leased inventory:
1. `activeCaseLock(tx, moderatorId, now)` inspects both `moderationCase` and `moderationCaseReservation` for any active reservation where `leaseExpiresAt > now`.
2. While an active reservation exists:
   - `POST /api/v1/workforce/aux/transition` rejects with HTTP 409 `ACTIVE_CASE`.
   - `POST /api/moderator-auth/sign-out` rejects with HTTP 409 `ACTIVE_CASE`.
   - In the React frontend, all AUX options (Break, Lunch, Meeting, etc.) in `GlobalAuxControl` are disabled.
3. The lock is only released when the moderator either:
   - Submits a valid decision (`submitReservation`).
   - Safely releases the case (`releaseReservation`).
   - Safely ends the session with `Submit & Leave`.
