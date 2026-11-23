# Milestone 14 Phase 4: Continuous Moderation Engine Architecture

## 1. Overview & Operational Principles

Milestone 14 Phase 4 delivers the **Production Continuous Moderation Engine** for Prakaro Trust & Safety. It transitions moderation from manual task-cherrypicking or linear FIFO queues to a high-throughput, conflict-free, server-authoritative push delivery engine.

### Non-Negotiable Operational Rules Enforced:
1. **Queue-Scoped Execution (`/queues/:queueId/moderate`)**: Continuous moderation is entered strictly in the context of an accessible, subscribed queue.
2. **Uniform Cryptographic Random Allocation**: Active cases are allocated uniformly at random ($k \in [0, N-1]$) among all eligible `QUEUED` tasks for that queue. Priority-first, oldest-first, FIFO, or moderator-selective bias is strictly prevented.
3. **Atomic Leased Reservations (Zero Collisions)**: Each case reservation is enforced by database row-level locking (`FOR UPDATE`) and unique active keys (`activeCaseKey` and `activeModeratorKey`). Two moderators can never hold the same case, and a moderator can never hold more than one active case simultaneously.
4. **Server-Authoritative AUX Integration & Lock**:
   - Starting continuous moderation strictly requires an active `MODERATING` AUX session.
   - While a reservation is held (`status = 'ACTIVE'`), all AUX state transitions and sign-outs are rejected with HTTP 409 `ACTIVE_CASE`.
5. **Immediate Decision Effect & Audit Publication**: When a moderator submits an `APPROVE`, `REJECT`, or `ESCALATE` decision:
   - The decision version is permanently saved.
   - For `APPROVE`, parking intelligence verification is updated and published immediately.
   - Immutable audit logs are created (`MODERATOR_SUBMIT` and `PUBLISH`).
   - No mandatory QA gates block publication in Phase 4.
6. **Auto-Next Continuous Flow**: Submitting a decision automatically commits the handling record and seamlessly allocates the next random case in the exact same session without page reloads.
7. **Submit & Leave vs Safe Release**:
   - `Submit & Leave`: Commits the decision, records handling AHT, closes the session, and unlocks the moderator's AUX.
   - `Release Case`: Safely returns the case to `QUEUED` status with zero AHT penalty and unlocks the moderator's AUX.
8. **AHT Strictly in Seconds**: All Average Handling Time (AHT) metrics and timers are calculated and displayed strictly in seconds (e.g. `45s`, `112s`). Displaying minutes (e.g. `1m 25s`) or fractional minutes is strictly forbidden.

---

## 2. Component Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React Moderation Console                        │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │    GlobalAuxControl      │         │      ModerateSession      │   │
│   │   [MODERATING | LOCKED]  │         │  ⏱ Derived Server Timer   │   │
│   └─────────────▲────────────┘         │  Case & Evidence Details  │   │
│                 │                      │  Human Review Action Form │   │
│                 │                      │  [Submit (Next Case)]     │   │
│                 │                      │  [Submit & Leave]         │   │
│                 │                      │  [Release Case]           │   │
│                 │                      └─────────────▲─────────────┘   │
└─────────────────┼────────────────────────────────────┼─────────────────┘
                  │                                    │
                  ▼                                    ▼
       /api/v1/workforce/aux/*               /api/v1/moderation/*
                  │                                    │
┌─────────────────┴────────────────────────────────────┴─────────────────┐
│                          Fastify API Engine                            │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │    Attendance Module     │         │ ContinuousEngine Service  │   │
│   │  - lockAttendanceEmployee│         │  - startWorkSession       │   │
│   │  - requireModeratingAux  │◄───────►│  - allocateRandomPending  │   │
│   │  - activeCaseLock (409)  │         │  - submitReservation      │   │
│   │  - reconcileStale        │         │  - releaseReservation     │   │
│   └──────────────────────────┘         │  - calculateQueueAht      │   │
│                                        └─────────────▲─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            MySQL 8.4 Database                          │
│                                                                        │
│  - moderation_work_session (ACTIVE unique per moderator)               │
│  - moderation_case_reservation (activeCaseKey, activeModeratorKey)     │
│  - case_handling_record (server-computed durationSeconds)              │
│  - moderation_decision_version (immutable versioned decisions)         │
│  - moderation_case (row-locked status transitions)                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Fastify Route Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/v1/moderation/queues/:id/moderate/start` | Starts work session and allocates initial random case |
| `GET` | `/api/v1/moderation/queues/:id/moderate/current` | Reads active session & reservation (does NOT allocate) |
| `GET` | `/api/v1/moderation/sessions/:id` | Returns work session details and stats |
| `POST` | `/api/v1/moderation/sessions/:id/next` | Requests next random pending case for active session |
| `POST` | `/api/v1/moderation/sessions/:id/leave` | Safely releases held reservation and ends session |
| `POST` | `/api/v1/moderation/reservations/:id/heartbeat` | Extends reservation lease expiry |
| `POST` | `/api/v1/moderation/reservations/:id/submit` | Commits decision, records AHT, auto-allocates next case |
| `POST` | `/api/v1/moderation/reservations/:id/submit-and-leave` | Commits decision, ends session, releases AUX lock |
| `POST` | `/api/v1/moderation/reservations/:id/release` | Safely releases reservation back to queue without AHT |
| `GET` | `/api/v1/moderation/queues/:id/aht` | Calculates server-authoritative queue AHT in integer seconds |
| `GET` | `/api/v1/moderation/sessions/:id/metrics` | Calculates moderator session AHT and completion rates |
