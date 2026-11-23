import { Prisma } from '@prisma/client';

export const handlingSources = Prisma.sql`
  FROM case_handling_record h
  LEFT JOIN moderation_case_reservation r ON r.id = h.reservationId
  LEFT JOIN moderation_decision_version d ON d.id = h.decisionVersionId
  LEFT JOIN moderation_work_session s ON s.id = h.sessionId
  LEFT JOIN attendance_session a ON a.id = s.attendanceSessionId`;

export const eligibleHandling = Prisma.sql`
  r.status = 'COMPLETED'
  AND r.caseId = h.caseId AND r.moderatorId = h.moderatorId
  AND r.queueId = h.queueId AND r.sessionId = h.sessionId
  AND s.moderatorId = h.moderatorId AND s.queueId = h.queueId
  AND (a.id IS NULL OR a.moderatorId = h.moderatorId)
  AND d.caseId = h.caseId AND d.moderatorId = h.moderatorId
  AND d.action = h.action AND h.action IN ('APPROVE','REJECT','ESCALATE')
  AND h.durationSeconds >= 0 AND h.startedAt = r.reservedAt
  AND h.submittedAt >= h.startedAt AND h.submittedAt <= r.leaseExpiresAt`;

export const eligibleTotals = Prisma.sql`
  COUNT(*) AS completed,
  COALESCE(SUM(h.durationSeconds), 0) AS handlingSeconds,
  COALESCE(SUM(h.isSubmitAndLeave), 0) AS submitAndLeave,
  MAX(h.submittedAt) AS lastCompletedAt`;

export type TotalsRow = {
  completed: bigint;
  handlingSeconds: Prisma.Decimal | bigint;
  submitAndLeave: Prisma.Decimal | bigint;
  lastCompletedAt: Date | null;
};

export function handlingTotals(row?: TotalsRow) {
  const completed = Number(row?.completed ?? 0);
  const handlingSeconds = Number(row?.handlingSeconds ?? 0);
  return {
    completed,
    handlingSeconds,
    ahtSeconds: averageHandlingSeconds(handlingSeconds, completed),
    lastCompletedAt: row?.lastCompletedAt?.toISOString() ?? null,
  };
}

export function averageHandlingSeconds(seconds: number, count: number) {
  return count ? Math.round(seconds / count * 10) / 10 : null;
}

export async function scopedHandling(tx: Prisma.TransactionClient, where: Prisma.Sql) {
  const [row] = await tx.$queryRaw<TotalsRow[]>(Prisma.sql`
    SELECT STRAIGHT_JOIN ${eligibleTotals} ${handlingSources} WHERE ${eligibleHandling} AND (${where})`);
  return { ...handlingTotals(row), submitAndLeave: Number(row?.submitAndLeave ?? 0) };
}

export type Frequency = { seconds: number; count: bigint | number };

/** Exact, linearly interpolated percentiles at (n - 1) * p (Hyndman–Fan type 7). */
export function handlingDistribution(frequencies: Frequency[]) {
  const count = frequencies.reduce((total, item) => total + Number(item.count), 0);
  const seconds = frequencies.reduce((total, item) => total + item.seconds * Number(item.count), 0);
  function at(rank: number) {
    let cumulative = 0;
    for (const item of frequencies) {
      cumulative += Number(item.count);
      if (rank < cumulative) return item.seconds;
    }
    return 0;
  }
  function percentile(p: number) {
    if (!count) return null;
    const rank = (count - 1) * p;
    const lower = Math.floor(rank);
    return Math.round((at(lower) + (at(Math.ceil(rank)) - at(lower)) * (rank - lower)) * 10) / 10;
  }
  return {
    count, min: percentile(0), max: percentile(1), median: percentile(0.5),
    p75: percentile(0.75), p90: percentile(0.9), p95: percentile(0.95),
    mean: averageHandlingSeconds(seconds, count),
  };
}
