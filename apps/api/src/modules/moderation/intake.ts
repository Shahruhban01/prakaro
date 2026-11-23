import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { auth } from '../../config/auth';
import { env } from '../../config/env';
import { prisma } from '../../common/database/prisma';
import { configSchema, matches } from './config';
import type { ParkingFacility } from '../parking/parking.types';

export type Tx = Prisma.TransactionClient;

export async function increment(tx: Tx, key: string, expiresAt?: Date) {
  await tx.$executeRaw`INSERT INTO moderation_counter (\`key\`, count, expiresAt)
    VALUES (${key}, 1, ${expiresAt ?? null})
    ON DUPLICATE KEY UPDATE count = count + 1`;
  return (await tx.moderationCounter.findUniqueOrThrow({ where: { key }, select: { count: true } }))
    .count;
}

export async function audit(
  tx: Tx,
  actor: string,
  action: string,
  target: string,
  after?: Prisma.InputJsonValue,
  before?: Prisma.InputJsonValue,
  actorType: string = 'MODERATOR',
  actorId?: string,
  actorSnapshot?: Prisma.InputJsonValue,
) {
  await tx.moderationAudit.create({
    data: {
      actor,
      actorType,
      actorId: actorId ?? (actor !== 'system' ? actor : null),
      actorSnapshot,
      action,
      target,
      after,
      before,
    },
  });
}

export async function route(
  tx: Tx,
  facilityId: string,
  category: string,
  trigger: string,
  facts: Record<string, string | number>,
  event: string,
  metadata?: Prisma.InputJsonValue,
) {
  const key = facilityId + ':' + category;
  const existing = await tx.moderationCase.findUnique({ where: { activeKey: key } });
  if (existing) return existing;

  const queues = await tx.moderationQueue.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { organizationId: { not: null }, organization: { active: true }, intakeEnabled: true },
        { organizationId: null },
      ],
    },
    orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    take: 100,
  });

  const eligible = [];
  for (const q of [
    ...queues.filter((q) => q.organizationId),
    ...queues.filter((q) => !q.organizationId),
  ]) {
    const conf = configSchema.parse(q.config);
    if (!matches(conf.rule, { ...facts, category, source: trigger, status: 'QUEUED' })) continue;
    const count = await tx.moderationTask.count({
      where: { queueId: q.id, case: { activeKey: { not: null } } },
    });
    if (count < q.capacity) {
      eligible.push({ q, conf });
      break;
    }
  }

  if (!eligible.length) return;

  const date = new Date(),
    day = date.toISOString().slice(0, 10);
  const limit = Number(process.env.MODERATION_DAILY_CASE_LIMIT ?? 50);
  const budget = await tx.moderationCounter.findUnique({ where: { key: 'cases:' + day } });
  if (!Number.isSafeInteger(limit) || limit < 1 || (budget?.count ?? 0) >= limit) return;

  await increment(tx, 'cases:' + day, new Date(+date + 172800000));
  const serial = await increment(tx, 'case-sequence');
  const record = await tx.moderationCase.create({
    data: {
      activeKey: key,
      facilityId,
      code: 'CASE-' + day.slice(0, 4) + '-' + String(serial).padStart(6, '0'),
      category,
      trigger,
      priority: eligible[0]!.q.priority,
      metadata: metadata ?? (facts as Prisma.InputJsonValue),
      tasks: {
        create: eligible.map(({ q, conf }) => ({
          queueId: q.id,
          queueVersion: q.version,
          form: conf,
          deadline: new Date(+date + conf.slaHours * 3600000),
        })),
      },
    },
  });

  await audit(
    tx,
    'system',
    'CASE_ROUTED',
    record.id,
    { event, queues: eligible.map(({ q }) => ({ id: q.id, version: q.version })) },
    undefined,
    'SYSTEM',
  );
  return record;
}

function digest(value: string) {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(value).digest('hex');
}

export async function admit(userId: string, eventId: string, items: ParkingFacility[]) {
  const now = new Date(),
    day = now.toISOString().slice(0, 10),
    expires = new Date(+now + 172800000);
  const actor = digest(day + ':' + userId);
  const event = digest(actor + ':' + eventId);

  return prisma.$transaction(
    async (tx) => {
      if (await tx.moderationCounter.findUnique({ where: { key: event } })) return;
      const traffic = await increment(tx, 'actor:' + actor, expires);
      if (traffic > 20) return;
      await increment(tx, event, expires);

      let created = 0;
      for (const item of items.slice(0, 20)) {
        if (!/^google:[A-Za-z0-9_-]{1,191}$/.test(item.id)) continue;
        const googlePlaceId = item.id.slice(7);
        const unique = digest(event + ':facility:' + googlePlaceId);
        if (await tx.moderationCounter.findUnique({ where: { key: unique } })) continue;
        await increment(tx, unique, expires);

        const facility = await tx.parkingIntelligenceCase.upsert({
          where: { googlePlaceId },
          create: {
            googlePlaceId,
            displayName: item.name,
            formattedAddress: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            placeMetadata: {
              accessType: item.accessType,
              pricingType: item.pricingType,
              openingStatus: item.openingStatus,
              hourlyRate: item.hourlyRate,
              currency: item.currency,
              parkingOptions: { ...item.parkingOptions },
            },
          },
          update: {
            displayName: item.name,
            formattedAddress: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            placeMetadata: {
              accessType: item.accessType,
              pricingType: item.pricingType,
              openingStatus: item.openingStatus,
              hourlyRate: item.hourlyRate,
              currency: item.currency,
              parkingOptions: { ...item.parkingOptions },
            },
          },
        });
        if (facility.googlePlaceId !== googlePlaceId) continue;

        const a = await tx.searchAdmission.upsert({
          where: { facilityId: facility.id },
          create: { facilityId: facility.id, firstEvent: event },
          update: { demand: { increment: 1 } },
        });

        if (created >= 2 || item.verification?.facilityStatus === 'INDEPENDENTLY_VERIFIED')
          continue;

        const active = await tx.moderationCase.findUnique({
          where: { activeKey: facility.id + ':NEW_FACILITY_VERIFICATION' },
        });

        if (
          !active &&
          (await route(
            tx,
            facility.id,
            'NEW_FACILITY_VERIFICATION',
            'SEARCH',
            {
              demand: a.demand,
              classification: item.verification?.facilityStatus ?? 'UNCONFIRMED',
              access: item.verification?.access ?? 'UNKNOWN',
              evidence: item.verification?.evidenceLevel ?? 'INSUFFICIENT',
              pricing: item.verification?.pricing ?? 'UNKNOWN',
            },
            event,
          ))
        ) {
          created++;
        }
      }
    },
    { isolationLevel: 'Serializable', timeout: 10000 },
  );
}

let pending = 0;
export function observeSearch(req: FastifyRequest, items: ParkingFacility[]) {
  if (
    process.env.MODERATION_INTAKE_ENABLED !== 'true' ||
    env.NODE_ENV === 'test' ||
    pending >= 4 ||
    !items.length
  )
    return;
  const id = z.string().uuid().safeParse(req.headers['x-prakaro-search']);
  if (!id.success || !req.headers.authorization) return;
  pending++;
  const headers = fromNodeHeaders({ authorization: req.headers.authorization });
  setImmediate(async () => {
    try {
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (session) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await admit(session.user.id, id.data, items);
            break;
          } catch (error) {
            if (
              attempt === 2 ||
              !(error instanceof Prisma.PrismaClientKnownRequestError) ||
              !['P2034', 'P2002'].includes(error.code)
            )
              throw error;
          }
        }
      }
    } catch {
      req.log.warn('Moderation search intake deferred or dropped');
    } finally {
      pending--;
    }
  });
}
