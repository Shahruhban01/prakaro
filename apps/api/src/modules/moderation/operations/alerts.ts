import { Prisma, type WorkforceAlertRule } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../common/database/prisma';
import { pendingStatuses } from '../analytics-data';
import type { AnalyticsActor, Database } from '../analytics-scope';
import { inactivityMs } from '../attendance';
import { canAdmin, conflict, missing, organizationFor, requireAccess, scheduleAudit, uuid } from './schedule';

export const ruleInput = z.object({
  organizationId: uuid, queueId: uuid.optional(),
  metric: z.enum(['QUEUE_BACKLOG','STALE_ATTENDANCE','QA_BACKLOG','STAFFING_SHORTFALL']),
  severity: z.enum(['INFO','WARNING','CRITICAL']), threshold: z.number().int().min(1).max(1000000),
  intervalSeconds: z.number().int().min(30).max(86400), cooldownSeconds: z.number().int().min(0).max(604800),
  enabled: z.boolean(), revision: z.number().int().nonnegative().optional(),
}).strict().refine((input) => input.metric === 'QUEUE_BACKLOG' || input.metric === 'QA_BACKLOG' || !input.queueId, 'This metric uses organization scope.');

export async function saveRule(db: Database, actor: AnalyticsActor, input: z.infer<typeof ruleInput>, id?: string) {
  requireAccess(canAdmin(actor));
  const org = await organizationFor(db, actor, input.organizationId);
  if (!org) throw missing();
  if (input.queueId && !await db.moderationQueue.findFirst({ where: { id: input.queueId, organizationId: org.id } })) throw missing();
  const { revision, ...values } = input;
  const data = { ...values, queueId: input.queueId ?? null, nextEvaluationAt: new Date() };
  if (id) {
    await db.$queryRaw`SELECT id FROM workforce_alert_rule WHERE id = ${id} FOR UPDATE`;
    const updated = await db.workforceAlertRule.updateMany({ where: { id, organizationId: org.id, revision: revision ?? -1 },
      data: { ...data, revision: { increment: 1 } } });
    if (!updated.count) throw conflict('The alert rule is unavailable or changed.');
    await db.workforceAlertEvent.updateMany({ where: { activeKey: id }, data: { activeKey: null, resolvedAt: new Date() } });
    await scheduleAudit(db, actor, org.id, id, 'ALERT_RULE_UPDATED', { ...values, revision: (revision ?? 0) + 1 });
    return db.workforceAlertRule.findUniqueOrThrow({ where: { id } });
  }
  const row = await db.workforceAlertRule.create({ data });
  await scheduleAudit(db, actor, org.id, row.id, 'ALERT_RULE_CREATED', { ...values, revision: 1 });
  return row;
}
async function metricValue(db: Database, rule: WorkforceAlertRule, now: Date) {
  const organizationId = rule.organizationId;
  if (rule.metric === 'STALE_ATTENDANCE') return db.attendanceSession.count({ where: { organizationId, endedAt: null,
    lastHeartbeatAt: { lt: new Date(+now - inactivityMs) } } });
  if (rule.metric === 'QA_BACKLOG') return db.qaSample.count({ where: {
    organizationId, queueId: rule.queueId ?? undefined, OR: [{ status: 'PENDING' }, {
      status: { in: ['ASSIGNED','IN_REVIEW'] }, leaseUntil: { lte: now },
    }],
  } });
  if (rule.metric === 'STAFFING_SHORTFALL') {
    const [row] = await db.$queryRaw<{ value: bigint }[]>`
      SELECT COUNT(*) AS value FROM workforce_shift_assignment w JOIN moderators e ON e.id=w.employeeId
      WHERE w.organizationId=${organizationId} AND w.kind='SHIFT' AND w.cancelledAt IS NULL
        AND w.startsAt <= ${now} AND w.endsAt > ${now} AND e.organizationId=w.organizationId AND e.lobId=w.lobId AND e.status='ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM attendance_session a
          WHERE a.moderatorId=w.employeeId AND a.organizationId=w.organizationId AND a.endedAt IS NULL
          AND a.lastHeartbeatAt >= ${new Date(+now - inactivityMs)})`;
    return Number(row?.value ?? 0);
  }
  const [row] = await db.$queryRaw<{ value: bigint }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT c.id) AS value FROM moderation_queue q JOIN moderation_task t ON t.queueId=q.id
      JOIN moderation_case c ON c.id=t.caseId
    WHERE q.organizationId=${organizationId} AND q.status='ACTIVE'
      ${rule.queueId ? Prisma.sql`AND q.id=${rule.queueId}` : Prisma.empty}
      AND c.status IN (${Prisma.join(pendingStatuses)})
      AND NOT (c.status='IN_REVIEW' AND c.owner IS NOT NULL AND COALESCE(c.leaseUntil > ${now},FALSE))
      AND NOT EXISTS (SELECT 1 FROM moderation_case_reservation r WHERE r.activeCaseKey=c.id AND r.status='ACTIVE'
        AND r.leaseExpiresAt > ${now})`);
  return Number(row?.value ?? 0);
}

async function checkRule(db: Database, id: string, now: Date) {
  await db.$queryRaw`SELECT id FROM workforce_alert_rule WHERE id = ${id} FOR UPDATE`;
  const row = await db.workforceAlertRule.findFirst({ where: { id, enabled: true, nextEvaluationAt: { lte: now }, organization: { active: true } } });
  if (!row) return;
  const value = await metricValue(db, row, now);
  const active = await db.workforceAlertEvent.findUnique({ where: { activeKey: id } });
  if (active && value < row.threshold) {
    await db.workforceAlertEvent.update({ where: { id: active.id }, data: { activeKey: null, resolvedAt: now, observed: value } });
    await db.moderationAudit.create({ data: { organizationId: row.organizationId, target: active.id,
      action: 'WORKFORCE_ALERT_RESOLVED', actor: 'system', actorType: 'SYSTEM', after: { ruleId: id, value } } });
  } else if (active && active.observed !== value) {
    await db.workforceAlertEvent.update({ where: { id: active.id }, data: { observed: value } });
  } else if (!active && value >= row.threshold) {
    const latest = await db.workforceAlertEvent.findFirst({ where: { ruleId: id }, orderBy: { triggeredAt: 'desc' } });
    const cooldownAt = latest ? +(latest.resolvedAt ?? latest.triggeredAt) + row.cooldownSeconds * 1000 : 0;
    if (+now >= cooldownAt) {
      const event = await db.workforceAlertEvent.create({ data: { ruleId: id, activeKey: id, observed: value, threshold: row.threshold,
        severity: row.severity, triggeredAt: now } });
      await db.moderationAudit.create({ data: { organizationId: row.organizationId, target: event.id,
        action: 'WORKFORCE_ALERT_TRIGGERED', actor: 'system', actorType: 'SYSTEM', after: { ruleId: id, value, threshold: row.threshold } } });
    }
  }
  await db.workforceAlertRule.update({ where: { id }, data: { nextEvaluationAt: new Date(+now + row.intervalSeconds * 1000) } });
}

export async function drainWorkforceAlerts(now = new Date()) {
  const due = await prisma.workforceAlertRule.findMany({
    where: { enabled: true, nextEvaluationAt: { lte: now }, organization: { active: true } }, orderBy: { nextEvaluationAt: 'asc' },
    select: { id: true }, take: 12,
  });
  for (const row of due) await prisma.$transaction((tx) => checkRule(tx, row.id, now),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 12000 });
  return due.length;
}
export async function acknowledge(db: Database, actor: AnalyticsActor, id: string) {
  requireAccess(canAdmin(actor));
  await db.$queryRaw`SELECT id FROM workforce_alert_event WHERE id = ${id} FOR UPDATE`;
  const row = await db.workforceAlertEvent.findFirst({ where: { id, rule: {
    organizationId: actor.superAdmin ? undefined : actor.organizationId ?? '',
  } }, include: { rule: { select: { organizationId: true } } } });
  if (!row) throw missing();
  if (row.acknowledgedAt) return row;
  const result = await db.workforceAlertEvent.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy: actor.userId } });
  await scheduleAudit(db, actor, row.rule.organizationId, id, 'ALERT_ACKNOWLEDGED', { ruleId: row.ruleId, actorId: actor.userId });
  return result;
}
