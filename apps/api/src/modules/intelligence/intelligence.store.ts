import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../common/database/prisma';
import { env } from '../../config/env';
import { GeminiParkingProvider, PROMPT_VERSION } from './intelligence.gemini';
import { aiInputSchema, type Evidence } from './intelligence.schemas';
import {
  IntelligenceService,
  type CallBudget,
  type VerificationResult,
} from './intelligence.service';

export const mysqlCallBudget: CallBudget = {
  async reserve(utcDay, limit) {
    // The initialization is idempotent. The guarded UPDATE atomically reserves one call.
    await prisma.$executeRaw`INSERT INTO parking_ai_daily_budget (utcDay, calls)
      VALUES (${utcDay}, 0) ON DUPLICATE KEY UPDATE utcDay = utcDay`;
    const updated = await prisma.parkingAiDailyBudget.updateMany({
      where: { utcDay, calls: { lt: limit } },
      data: { calls: { increment: 1 } },
    });
    return updated.count === 1;
  },
};

export function createIntelligenceService(enableGemini: boolean) {
  const provider =
    enableGemini && env.AI_VERIFICATION_ENABLED && env.AI_SHADOW_MODE && env.GEMINI_API_KEY
      ? new GeminiParkingProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL)
      : undefined;
  return new IntelligenceService({
    enabled: enableGemini && env.AI_VERIFICATION_ENABLED,
    shadowMode: env.AI_SHADOW_MODE,
    model: env.GEMINI_MODEL,
    dailyLimit: env.AI_MAX_CALLS_PER_DAY,
    concurrency: env.AI_MAX_CONCURRENT_REQUESTS,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    provider,
    budget: mysqlCallBudget,
  });
}

export async function loadApprovedCases(googlePlaceIds: string[]) {
  const now = new Date();
  const requested = new Set(googlePlaceIds);
  const cases = await prisma.parkingIntelligenceCase.findMany({
    where: { googlePlaceId: { in: googlePlaceIds } },
    select: {
      id: true,
      googlePlaceId: true,
      evidence: {
        where: { approvedAt: { lte: now }, expiresAt: { gt: now } },
        orderBy: { id: 'asc' },
        take: 13,
        select: { source: true, finding: true },
      },
    },
  });
  return cases.flatMap(({ id, googlePlaceId, evidence }) => {
    const input = aiInputSchema.safeParse({
      evidence: evidence.map((item, index) => ({ ...item, id: `E${index + 1}` })),
    });
    // Google IDs are opaque and case-sensitive. MySQL's default collation may match case variants.
    return googlePlaceId && requested.has(googlePlaceId) && input.success
      ? [{ id, googlePlaceId, input: input.data }]
      : [];
  });
}

export async function getVersion() {
  const key = { model: env.GEMINI_MODEL, promptVersion: PROMPT_VERSION };
  return prisma.parkingVerificationVersion
    .upsert({
      where: { model_promptVersion: key },
      create: key,
      update: {},
    })
    .catch((error: unknown) => {
      // Prisma 5 may implement this upsert as separate read/create statements on MySQL.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      return prisma.parkingVerificationVersion.findUniqueOrThrow({
        where: { model_promptVersion: key },
      });
    });
}

export async function claimRun(caseId: string, evidence: Evidence[]): Promise<string | undefined> {
  const version = await getVersion();
  const evidenceFingerprint = fingerprintFindings(evidence);
  try {
    const run = await prisma.parkingVerificationRun.create({
      data: {
        caseId,
        versionId: version.id,
        evidenceFingerprint,
        utcDay: new Date().toISOString().slice(0, 10),
      },
      select: { id: true },
    });
    return run.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }
}

export function fingerprintFindings(evidence: Evidence[]): string {
  const findings = evidence.map(({ source, finding }) => `${source}:${finding}`).sort();
  return createHash('sha256').update(JSON.stringify(findings)).digest('hex');
}

export async function finishRun(id: string, verification: VerificationResult) {
  await prisma.parkingVerificationRun.update({
    where: { id },
    data: {
      status: verification.status,
      outcome: verification.result.classification,
      ...verification.usage,
    },
  });
}
