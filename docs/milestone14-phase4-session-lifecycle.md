# Milestone 14 Phase 4: Continuous Work Session Lifecycle

## 1. Work Session States

A continuous work session represents an uninterrupted period during which a moderator processes cases in a single queue.

```
       [ Moderator enters /queues/:id/moderate ]
                          │
                          ▼
            [ Check MODERATING AUX Status ]
             (Locked employee row in DB)
                          │
                          ▼
             POST /queues/:id/moderate/start
                          │
                          ▼
             ┌─────────────────────────┐
             │ Session Status: ACTIVE  │
             │ activeKey = moderatorId │
             └────────────┬────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │ Auto-Next Flow                    │ Leave / End Flow
        ▼                                   ▼
[ Submit Decision ]               [ Submit & Leave ] or [ Leave Session ]
- Record AHT                       - Record AHT (if Submit & Leave)
- casesCompleted++                 - Release held reservation (if any)
- status = 'ACTIVE'                - Session status: ENDED
- Allocate next random case        - activeKey = NULL
                                   - AUX lock released
```

---

## 2. Session Prerequisites
Continuous moderation cannot begin unless the moderator satisfies:
1. Valid moderator account (`moderatorAuth` session).
2. Active employee in an active Organization and active LOB.
3. Queue belongs to moderator's assigned LOB.
4. Moderator has an active subscription to the queue.
5. Moderator is actively in `MODERATING` AUX state with recent heartbeat ($< 90$ seconds).

---

## 3. Safe Session Exit Behaviors

### 3.1 `Submit & Leave`
- Commits review decision and publishes verification immediately.
- Creates `CaseHandlingRecord` with server-calculated `durationSeconds`.
- Increments `casesCompleted` and `submitAndLeaveCount`.
- Sets session status to `ENDED` and clears `activeKey`.
- Releases active case reservation keys.
- Unlocks the moderator's AUX status (`lockReason` returns to null).
- Navigates moderator to `/my-queues`.

### 3.2 `Leave Session` / `Release Case`
- If an active reservation is held, safely returns the case to `QUEUED` status and sets reservation status to `RELEASED`.
- Zero AHT handling credit is recorded.
- Clears reservation active keys.
- Ends work session and clears session `activeKey`.
- Unlocks moderator's AUX status.
- Navigates moderator to `/my-queues`.
