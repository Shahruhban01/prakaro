# Milestone 14 Phase 4: Strict Uniform Random Allocation Engine

## 1. Requirement & Rationale

Linear or biased case distribution causes:
- Cherry-picking by moderators looking for simpler cases.
- Inconsistent SLA delivery across queues.
- Vulnerability to collusion between reporters and reviewing moderators.

Phase 4 mandates **strict uniform random case allocation**.

---

## 2. Allocation Algorithm

Implemented in `apps/api/src/modules/moderation/continuous-engine.ts` (`allocateRandomPendingCase`):

```typescript
export async function allocateRandomPendingCase(
  tx: Tx,
  queueId: string,
  moderatorId: string,
  sessionId: string,
): Promise<ActiveReservationWithCase | null> {
  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 1. Fetch IDs of all eligible QUEUED tasks for this queue
    const eligibleTasks = await tx.moderationTask.findMany({
      where: {
        queueId,
        case: { status: 'QUEUED' },
      },
      select: { caseId: true },
    });

    if (eligibleTasks.length === 0) {
      return null;
    }

    // 2. Uniform random selection using crypto.randomInt (N candidate items)
    const randomIndex = randomInt(0, eligibleTasks.length);
    const chosenCaseId = eligibleTasks[randomIndex].caseId;

    // 3. Atomically attempt to lock and claim the chosen case using row lock
    const lockedRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM moderation_case
      WHERE id = ${chosenCaseId} AND status = 'QUEUED'
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      // Case was concurrently claimed; retry loop picks another random candidate
      continue;
    }

    const now = new Date();
    const leaseExpiresAt = new Date(+now + LEASE_DURATION_SECONDS * 1000);

    // 4. Update case status to IN_REVIEW with lease window
    await tx.moderationCase.update({
      where: { id: chosenCaseId },
      data: {
        status: 'IN_REVIEW',
        owner: moderatorId,
        claimedAt: now,
        leaseUntil: leaseExpiresAt,
      },
    });

    // 5. Create reservation with active uniqueness keys
    const reservation = await tx.moderationCaseReservation.create({
      data: {
        caseId: chosenCaseId,
        sessionId,
        moderatorId,
        queueId,
        status: 'ACTIVE',
        reservedAt: now,
        leaseExpiresAt,
        activeCaseKey: chosenCaseId,
        activeModeratorKey: moderatorId,
      },
      include: {
        case: {
          include: caseInclude,
        },
      },
    });

    return reservation as ActiveReservationWithCase;
  }

  return null;
}
```

---

## 3. Concurrency & Contention Guarantees

1. **Cryptographic Uniformity**: Uses Node.js `crypto.randomInt(0, N)`, ensuring each of the $N$ pending cases has equal probability $1/N$ of being selected on each allocation.
2. **Row Locking (`FOR UPDATE`)**: Prevents race conditions during simultaneous claims.
3. **Retry Loop with Collision Tolerance**: If two workers pick the same case simultaneously, only one acquires the lock; the other continues to the next random draw immediately.
4. **Active Key Collision Prevention**: Even under concurrent race conditions across separate sessions, MySQL unique constraints on `activeCaseKey` and `activeModeratorKey` guarantee no duplicate assignment can ever be committed.
