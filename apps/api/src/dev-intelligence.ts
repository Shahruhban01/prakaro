import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { createInterface } from 'node:readline';

// Load flags before importing any module that snapshots the environment.
dotenv.config();
async function main() {
  if ((process.env.NODE_ENV ?? 'development') !== 'development') {
    throw new Error('This profile requires NODE_ENV=development.');
  }
  Object.assign(process.env, {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3121',
    AI_VERIFICATION_ENABLED: 'true',
    AI_SHADOW_MODE: 'true',
    PARKING_INTELLIGENCE_DISPLAY_ENABLED: 'true',
    PARKING_INTELLIGENCE_FILTERING_ENABLED: 'true',
    PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW: 'true',
    PARKING_INTELLIGENCE_DEFAULT_MODE: 'ALL_CANDIDATES',
  });
  const { env } = await import('./config/env');
  const { prisma } = await import('./common/database/prisma');
  const { createIntelligenceService } = await import('./modules/intelligence/intelligence.store');
  const { buildApp } = await import('./app');
  const { DiscoveryIntelligence, discoveryIntelligenceOptions } =
    await import('./modules/intelligence/intelligence.discovery');
  let latestDiscovery: { verified: number; unconfirmed: number; available: boolean } | null = null;
  class ObservedDiscovery extends DiscoveryIntelligence {
    override async decorate(
      items: Parameters<InstanceType<typeof DiscoveryIntelligence>['decorate']>[0],
    ) {
      const result = await super.decorate(items);
      latestDiscovery = {
        verified: result.data.filter(
          (item) => item.verification?.facilityStatus === 'INDEPENDENTLY_VERIFIED',
        ).length,
        unconfirmed: result.data.filter(
          (item) => item.verification?.facilityStatus === 'UNCONFIRMED',
        ).length,
        available: result.available,
      };
      return result;
    }
  }
  const app = buildApp({
    parkingIntelligence: new ObservedDiscovery(discoveryIntelligenceOptions),
  });
  const service = createIntelligenceService(true);
  let lastSmoke: { status: string; at: string; calls: number } | null = null;
  const report = join(await mkdtemp(join(tmpdir(), 'prakaro-diagnostics-')), 'index.html');
  async function diagnostics() {
    const day = new Date().toISOString().slice(0, 10);
    const latest = (status: string[]) =>
      prisma.parkingVerificationRun.findFirst({
        where: { calls: { gt: 0 }, status: { in: status } },
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true },
      });
    const db = await Promise.all([
      prisma.parkingAiDailyBudget.findUnique({ where: { utcDay: day } }),
      prisma.parkingVerificationRun.groupBy({ by: ['caseId'], where: { status: 'EVALUATED' } }),
      latest(['EVALUATED']),
      latest([
        'TIMEOUT',
        'INVALID_OUTPUT',
        'UNSUPPORTED_CLAIM',
        'QUOTA_EXHAUSTED',
        'MODEL_UNAVAILABLE',
        'PROVIDER_ERROR',
      ]),
    ])
      .then(([budget, cases, success, error]) => ({
        dailyRequests: budget?.calls ?? 0,
        evaluatedCases: cases.length,
        lastSuccess: success?.createdAt.toISOString() ?? null,
        lastError: error ? { status: error.status, at: error.createdAt.toISOString() } : null,
      }))
      .catch(() => null);
    const success = lastSmoke?.status === 'EVALUATED' ? lastSmoke.at : null;
    const failure =
      lastSmoke && lastSmoke.calls && lastSmoke.status !== 'EVALUATED' ? lastSmoke : null;
    const snapshot = {
      profile: 'local-intelligence',
      day,
      model: env.GEMINI_MODEL,
      keyConfigured: Boolean(env.GEMINI_API_KEY),
      aiEnabled: env.AI_VERIFICATION_ENABLED,
      shadow: env.AI_SHADOW_MODE,
      ...discoveryIntelligenceOptions,
      dailyLimit: env.AI_MAX_CALLS_PER_DAY,
      databaseAvailable: Boolean(db),
      dailyRequests: db?.dailyRequests ?? null,
      evaluatedCases: db?.evaluatedCases ?? null,
      lastSuccess: [success, db?.lastSuccess].filter(Boolean).sort().at(-1) ?? null,
      lastError:
        failure && failure.at > (db?.lastError?.at ?? '')
          ? failure.status
          : (db?.lastError?.status ?? null),
      latestDiscovery,
      lastSyntheticSmoke: lastSmoke,
    };
    const json = JSON.stringify(snapshot, null, 2);
    console.log(json);
    const escaped = json.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    await writeFile(
      report,
      '<!doctype html><meta charset="utf-8"><title>Prakaro development diagnostics</title><style>body{margin:32px;font:16px system-ui;color:#182238}pre{font:16px/1.5 monospace}</style><h1>Parking intelligence</h1><p>Local development diagnostics</p><pre>' +
        escaped +
        '</pre>',
    );
    console.log('Local diagnostics snapshot: ' + report);
  }
  await app.listen({ host: env.HOST, port: env.PORT });
  if (process.argv.includes('--smoke')) {
    const result = await service.verify({
      evidence: [
        { id: 'E1', source: 'PRAKARO_AUDIT', finding: 'MARKED_PARKING_BAYS' },
        { id: 'E2', source: 'PRAKARO_AUDIT', finding: 'DEDICATED_PARKING_ENTRANCE' },
      ],
    });
    lastSmoke = { status: result.status, at: new Date().toISOString(), calls: result.usage.calls };
    console.log(
      JSON.stringify({
        syntheticSmoke: result.status,
        classification: result.assessment?.classification,
        usage: result.usage,
      }),
    );
  }
  await diagnostics();
  // The local operator's terminal is the diagnostic interface. Nothing is exposed over HTTP.
  const terminal = createInterface({ input: process.stdin });
  terminal.on('line', (line) => {
    if (line.trim() === 'diagnostics') void diagnostics();
  });
}
main().catch(() => {
  console.error(
    'Development profile failed. Check NODE_ENV, port 3121 and database configuration.',
  );
  process.exitCode = 1;
});
