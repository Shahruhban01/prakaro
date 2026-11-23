# Milestone 14 Phase 4: Atomic Reservations & Leases

## 1. Reservation Lifecycle State Machine

```
                   ┌──────────────┐
                   │   QUEUED     │
                   └──────┬───────┘
                          │ allocateRandomPendingCase()
                          ▼
                   ┌──────────────┐
       ┌───────────┤    ACTIVE    ├────────────┐
       │           └───┬──────────┘            │
       │ heartbeat()   │                       │
       ▼               │                       │
┌──────────────┐       │                       │
│ EXTEND LEASE │       │                       │
└──────────────┘       ▼                       ▼
           submitReservation()          releaseReservation()
                       │                  or expiry
                       ▼                       ▼
               ┌───────────────┐       ┌───────────────┐
               │   COMPLETED   │       │   RELEASED    │
               │ (Recorded AHT)│       │  / EXPIRED    │
               └───────────────┘       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │ Back to QUEUED│
                                       │  (0 AHT credit)
                                       └───────────────┘
```

---

## 2. Lease Parameters & Heartbeats

- **Default Lease Duration**: 300 seconds (5 minutes), configured via `LEASE_DURATION_SECONDS`.
- **Heartbeat Interval**: Moderation workspace sends a heartbeat every 30 seconds (`POST /api/v1/moderation/reservations/:id/heartbeat`).
- **Heartbeat Expiry Extension**: Each heartbeat extends `leaseExpiresAt` to `now + LEASE_DURATION_SECONDS` and updates `moderationCase.leaseUntil`.
- **Lease Expiry Reclaim**: `expireStaleReservations` is invoked prior to allocations:
  - If `status = 'ACTIVE'` and `leaseExpiresAt <= now`:
    - Reservation status is marked `EXPIRED`.
    - Active keys (`activeCaseKey`, `activeModeratorKey`) are set to `NULL`.
    - Case status is safely reverted to `QUEUED`.
    - Case `owner`, `claimedAt`, and `leaseUntil` are set to `null`.

---

## 3. Strict 1-Active-Case Guarantee

1. **Database-Level Constraint**:
   - `UNIQUE INDEX (activeCaseKey)` ensures no two reservations can simultaneously be active for the same case.
   - `UNIQUE INDEX (activeModeratorKey)` ensures no moderator can hold more than one active case across all queues in the system.
2. **Transaction-Level Enforcement**:
   - Starting a work session verifies active reservations before allocating.
   - Reconnecting or refreshing uses `GET /queues/:id/moderate/current`, which never generates a duplicate reservation and seamlessly restores the ongoing active reservation.
