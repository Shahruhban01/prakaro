# Milestone 14 Phase 4: Average Handling Time (AHT) in Seconds

## 1. Non-Negotiable Rule: Strict Measurement & Display in Seconds

Average Handling Time (AHT) in Prakaro is strictly measured, stored, and displayed in **seconds**.

### Prohibited Representations:
- ❌ Minutes (e.g. `1.4m`, `1.5 minutes`)
- ❌ Compound format (e.g. `1m 25s`)
- ❌ Clock format (e.g. `01:25`) for AHT metrics

### Required Representations:
- ✅ Integer or float seconds with unit `s` (e.g. `85s`, `112s`)
- ✅ `null` or `Unavailable` if no completed handling records exist.

---

## 2. Server-Authoritative Duration Computation

When a moderator submits a decision (`submitReservation`):
```typescript
const durationSeconds = Math.max(
  1,
  Math.round((now.getTime() - reservation.reservedAt.getTime()) / 1000),
);

await tx.caseHandlingRecord.create({
  data: {
    reservationId: reservation.id,
    caseId: reservation.caseId,
    queueId: reservation.queueId,
    moderatorId: reservation.moderatorId,
    sessionId: reservation.sessionId,
    durationSeconds,
    outcome: payload.action,
    isSubmitAndLeave,
    startedAt: reservation.reservedAt,
    endedAt: now,
  },
});
```
- Client-reported timestamps are **never trusted**.
- Duration is computed purely from server-recorded `reservedAt` and transaction submission `now`.
- Released or expired reservations record **0 seconds** and generate **zero handling records**.

---

## 3. Queue and Moderator AHT Queries

### Queue AHT (`GET /api/v1/moderation/queues/:id/aht`):
```typescript
const result = await prisma.caseHandlingRecord.aggregate({
  where: { queueId },
  _avg: { durationSeconds: true },
  _count: { id: true },
});

return {
  queueId,
  ahtSeconds: result._avg.durationSeconds !== null ? Math.round(result._avg.durationSeconds) : null,
  totalCases: result._count.id,
};
```

### Display Helper in React (`GlobalAuxControl.tsx`):
```typescript
export function formatAht(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return "Unavailable";
  }
  return `${Math.round(seconds)}s`;
}
```
