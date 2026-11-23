import { env } from '../../config/env';
import { AuxStatus, type AttendanceEnd, type Prisma } from '@prisma/client';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error';

type Tx = Prisma.TransactionClient;
export type AttendanceIdentity = { moderatorId: string; authSessionId: string };
export const heartbeatSeconds = 30;
export const disconnectedMs = env.AUX_PRESENCE_STALE_SECONDS * 1000;
export const inactivityMs = env.AUX_INACTIVITY_SECONDS * 1000;
const openInterval = { where: { endedAt: null }, take: 1 } as const;
const activeInclude = { intervals: openInterval };
type ActiveAttendance = Prisma.AttendanceSessionGetPayload<{ include: typeof activeInclude }>;
export async function lockAttendanceEmployee(tx: Tx, moderatorId: string) {
  await tx.$queryRaw`SELECT id FROM moderators WHERE id = ${moderatorId} FOR UPDATE`;
}
export async function activeCaseLock(tx: Tx, moderatorId: string, now: Date) {
  const [legacy, continuous] = await Promise.all([
    tx.moderationCase.findFirst({
      where: { owner: moderatorId, status: 'IN_REVIEW', leaseUntil: { gt: now } },
      select: { id: true },
    }),
    tx.moderationCaseReservation.findFirst({
      where: { moderatorId, status: 'ACTIVE', leaseExpiresAt: { gt: now } },
      select: { id: true },
    }),
  ]);
  return Boolean(legacy || continuous);
}
function activeCaseError() {
  return new AppError(
    409,
    'ACTIVE_CASE',
    'Submit or safely release your active case before changing AUX or signing out.',
  );
}
async function loadEmployee(tx: Tx, moderatorId: string) {
  return tx.moderator.findUnique({
    where: { id: moderatorId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      lobId: true,
      organization: { select: { active: true } },
      lob: { select: { active: true, organizationId: true } },
    },
  });
}
type Employee = Awaited<ReturnType<typeof loadEmployee>>;
function enabled(employee: Employee) {
  return (
    employee?.status === 'ACTIVE' &&
    employee.organization?.active &&
    employee.lob?.active &&
    employee.lob.organizationId === employee.organizationId
  );
}
async function end(tx: Tx, current: ActiveAttendance, at: Date, reason: AttendanceEnd) {
  const interval = current.intervals[0];
  // System closures can be earlier than reconciliation but never earlier than the last authoritative punch.
  const boundary = new Date(
    Math.max(+current.startedAt, +(interval?.startedAt ?? current.startedAt), +at),
  );
  if (interval)
    await tx.auxInterval.update({
      where: { id: interval.id },
      data: { endedAt: boundary, openKey: null },
    });
  await tx.attendanceSession.update({
    where: { id: current.id },
    data: { endedAt: boundary, endReason: reason, activeKey: null, version: { increment: 1 } },
  });
  await tx.auxTransitionAudit.create({
    data: {
      sessionId: current.id,
      actorId: reason === 'USER_LOGOUT' ? current.moderatorId : 'system',
      source: reason,
      previous: interval?.state,
      createdAt: boundary,
    },
  });
}
async function reconcile(
  tx: Tx,
  current: ActiveAttendance,
  now: Date,
  employee: Employee,
  locked: boolean,
) {
  if (locked) return current;
  const auth = await tx.moderatorSession.findUnique({
    where: { id: current.authSessionId },
    select: { expiresAt: true },
  });
  const cutoff = new Date(+current.lastHeartbeatAt + inactivityMs);
  if (
    !enabled(employee) ||
    employee?.organizationId !== current.organizationId ||
    employee.lobId !== current.lobId
  ) {
    await end(tx, current, now, 'ADMIN_TERMINATED');
  } else if (!auth || auth.expiresAt <= now) {
    await end(
      tx,
      current,
      auth ? new Date(Math.min(+auth.expiresAt, +cutoff)) : new Date(Math.min(+now, +cutoff)),
      'SESSION_EXPIRED',
    );
  } else if (cutoff <= now) {
    await end(tx, current, cutoff, 'DISCONNECTED_TIMEOUT');
  } else return current;
  return null;
}
type AuxCommand =
  | { type: 'READ' | 'START' | 'HEARTBEAT' | 'LOGOUT' }
  | { type: 'TRANSITION'; state: AuxStatus; version: number; attendanceSessionId: string };
export async function applyAux(identity: AttendanceIdentity, command: AuxCommand) {
  return prisma.$transaction(async (tx) => {
    await lockAttendanceEmployee(tx, identity.moderatorId);
    const now = new Date();
    const [employee, auth, existing, locked] = await Promise.all([
      loadEmployee(tx, identity.moderatorId),
      tx.moderatorSession.findFirst({
        where: { id: identity.authSessionId, userId: identity.moderatorId, expiresAt: { gt: now } },
        select: { createdAt: true },
      }),
      tx.attendanceSession.findUnique({
        where: { activeKey: identity.moderatorId },
        include: activeInclude,
      }),
      activeCaseLock(tx, identity.moderatorId, now),
    ]);
    if (!auth) throw new UnauthorizedError();
    if (!employee || !enabled(employee) || !employee.organizationId || !employee.lobId)
      throw new ForbiddenError('Attendance requires an active workforce assignment.');
    let current = existing ? await reconcile(tx, existing, now, employee, locked) : null;
    if (current && current.authSessionId !== identity.authSessionId) {
      if (command.type === 'LOGOUT') return null; // This device owns no attendance to close.
      if (!locked) {
        await end(tx, current, now, 'SESSION_EXPIRED');
        current = null;
      } else {
        throw new AppError(
          409,
          'ATTENDANCE_DEVICE_CONFLICT',
          'Attendance belongs to another sign-in with an active case reservation.',
        );
      }
    }
    if (command.type === 'LOGOUT') {
      if (locked) throw activeCaseError();
      if (current) await end(tx, current, now, 'USER_LOGOUT');
      return null;
    }
    if (!current && (command.type === 'START' || command.type === 'HEARTBEAT')) {
      const last = await tx.attendanceSession.findFirst({
        where: { authSessionId: identity.authSessionId },
        orderBy: { startedAt: 'desc' },
        select: { endReason: true },
      });
      if (last?.endReason === 'USER_LOGOUT') throw new UnauthorizedError();
      if (locked) throw activeCaseError();
      const session = await tx.attendanceSession.create({
        data: {
          moderatorId: employee.id,
          organizationId: employee.organizationId,
          lobId: employee.lobId,
          authSessionId: identity.authSessionId,
          activeKey: employee.id,
          loginAt: auth.createdAt,
          startedAt: now,
          lastHeartbeatAt: now,
        },
      });
      const interval = await tx.auxInterval.create({
        data: {
          sessionId: session.id,
          openKey: session.id,
          state: 'NON_MODERATING',
          startedAt: now,
        },
      });
      await tx.auxTransitionAudit.create({
        data: {
          sessionId: session.id,
          actorId: employee.id,
          source: last ? 'RECOVERED' : 'LOGIN',
          next: interval.state,
          createdAt: now,
        },
      });
      current = { ...session, intervals: [interval] };
    }
    if (command.type === 'TRANSITION') {
      if (locked) throw activeCaseError();
      if (!current || current.id !== command.attendanceSessionId)
        throw new AppError(409, 'STALE_AUX', 'Refresh attendance before changing AUX.');
      const previous = current.intervals[0];
      if (!previous) throw new AppError(409, 'STALE_AUX', 'Attendance interval unavailable.');
      if (previous.state !== command.state) {
        if (current.version !== command.version)
          throw new AppError(
            409,
            'STALE_AUX',
            'AUX changed in another tab. Review the current status.',
          );
        await tx.auxInterval.update({
          where: { id: previous.id },
          data: { endedAt: now, openKey: null },
        });
        const next = await tx.auxInterval.create({
          data: {
            sessionId: current.id,
            openKey: current.id,
            state: command.state,
            startedAt: now,
          },
        });
        const updated = await tx.attendanceSession.update({
          where: { id: current.id },
          data: { version: { increment: 1 }, lastHeartbeatAt: now },
        });
        await tx.auxTransitionAudit.create({
          data: {
            sessionId: current.id,
            actorId: employee.id,
            source: 'PUNCH',
            previous: previous.state,
            next: next.state,
            createdAt: now,
          },
        });
        current = { ...updated, intervals: [next] };
      }
    }
    if (current && command.type === 'HEARTBEAT' && +now - +current.lastHeartbeatAt >= 25_000) {
      current.lastHeartbeatAt = (
        await tx.attendanceSession.update({
          where: { id: current.id },
          data: { lastHeartbeatAt: now },
          select: { lastHeartbeatAt: true },
        })
      ).lastHeartbeatAt;
    }
    const interval = current?.intervals[0];
    return {
      state: interval?.state ?? null,
      startedAt: interval?.startedAt ?? null,
      serverTime: now,
      attendanceSessionId: current?.id ?? null,
      version: current?.version ?? null,
      canTransition: Boolean(interval && !locked),
      lockReason: locked ? 'ACTIVE_CASE' : null,
      presence: !current
        ? 'SIGNED_OUT'
        : +now - +current.lastHeartbeatAt >= disconnectedMs
          ? 'DISCONNECTED'
          : 'ONLINE',
      lastHeartbeatAt: current?.lastHeartbeatAt ?? null,
      presenceStaleSeconds: env.AUX_PRESENCE_STALE_SECONDS,
    };
  });
}
// Phase 4 must acquire lockAttendanceEmployee in the same transaction before checking AUX and reserving.
export async function requireModeratingAux(tx: Tx, identity: AttendanceIdentity, now: Date) {
  const session = await tx.attendanceSession.findFirst({
    where: {
      activeKey: identity.moderatorId,
      authSessionId: identity.authSessionId,
      lastHeartbeatAt: { gte: new Date(+now - disconnectedMs) },
      intervals: { some: { endedAt: null, state: 'MODERATING' } },
    },
    select: { id: true },
  });
  if (!session)
    throw new AppError(
      409,
      'MODERATING_AUX_REQUIRED',
      'A current Moderating AUX session is required.',
    );
  return session.id;
}

export async function reconcileStaleAttendance() {
  const now = new Date(),
    cutoff = new Date(+now - inactivityMs);
  const candidates = await prisma.$queryRaw<
    { moderatorId: string }[]
  >`SELECT a.moderatorId FROM attendance_session a
    JOIN moderators m ON m.id=a.moderatorId
    LEFT JOIN moderator_sessions s ON s.id=a.authSessionId
    LEFT JOIN organizations o ON o.id=m.organizationId
    LEFT JOIN lobs l ON l.id=m.lobId
    WHERE a.endedAt IS NULL AND (a.lastHeartbeatAt <= ${cutoff} OR s.id IS NULL OR s.expiresAt <= ${now}
      OR m.status <> 'ACTIVE' OR o.active IS NULL OR o.active = FALSE OR l.active IS NULL OR l.active = FALSE
      OR m.organizationId <> a.organizationId OR m.lobId <> a.lobId)
      AND NOT EXISTS (SELECT 1 FROM moderation_case c WHERE c.owner=a.moderatorId AND c.status='IN_REVIEW' AND c.leaseUntil > ${now})
    ORDER BY a.lastHeartbeatAt LIMIT 100`;
  for (const { moderatorId } of candidates) {
    await prisma.$transaction(async (tx) => {
      await lockAttendanceEmployee(tx, moderatorId);
      const at = new Date();
      const current = await tx.attendanceSession.findUnique({
        where: { activeKey: moderatorId },
        include: activeInclude,
      });
      if (current)
        await reconcile(
          tx,
          current,
          at,
          await loadEmployee(tx, moderatorId),
          await activeCaseLock(tx, moderatorId, at),
        );
    });
  }
}
