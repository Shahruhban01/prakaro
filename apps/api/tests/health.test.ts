import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { buildApp } from '../src/app';

describe('GET /health', () => {
  it('should return 200 and healthy status payload', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload) as { status: string; service: string };
    assert.deepEqual(body, {
      status: 'ok',
      service: 'prakaro-api',
    });
  });

  it('does not reuse untrusted correlation IDs and returns safety headers', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ url: '/health', headers: { 'request-id': 'caller-reference' } });
      assert.ok(response.headers['x-request-id']);
      assert.notEqual(response.headers['x-request-id'], 'caller-reference');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['x-frame-options'], 'DENY');
    } finally { await app.close(); }
  });

  it('keeps liveness healthy when the readiness database is unavailable and hides its error', async () => {
    const app = buildApp({ readinessCheck: async () => { throw new Error('private database detail'); } });
    try {
      const result = await app.inject('/ready');
      assert.equal(result.statusCode, 503);
      assert.deepEqual(result.json(), { status: 'unavailable' });
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal((await app.inject('/health')).statusCode, 200);
    } finally { await app.close(); }
  });

  it('shares an in-flight readiness probe and recovers once the database responds', async () => {
    let scans = 0;
    const app = buildApp({ readinessCheck: async () => {
      scans += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } });
    try {
      const results = await Promise.all([app.inject('/ready'), app.inject('/ready')]);
      assert.deepEqual(results.map((result) => result.json()), [{ status: 'ready' }, { status: 'ready' }]);
      assert.equal(scans, 1);
    } finally { await app.close(); }
  });

  it('limits authentication POSTs and prevents oversized authentication payloads', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/moderator-auth/sign-in/email',
        payload: { email: 'synthetic@example.test', password: 'x'.repeat(17000) } });
      assert.equal(response.statusCode, 413);
      assert.equal(response.headers['cache-control'], 'no-store');
      const attempts = await Promise.all(Array.from({ length: 61 }, () =>
        app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: {} })));
      assert.ok(attempts.some((attempt) => attempt.statusCode === 429));
    } finally { await app.close(); }
  });

  it('rejects excess report work without blocking liveness and restores capacity', async () => {
    let letReportFinish!: () => void;
    let reportStarted!: () => void;
    const blocked = new Promise<void>((resolve) => { letReportFinish = resolve; });
    const started = new Promise<void>((resolve) => { reportStarted = resolve; });
    const app = buildApp({ maxConcurrentReports: 1 });
    const url = '/api/v1/moderation/analytics/validation-test';
    app.get(url, async () => { reportStarted(); await blocked; return { ready: true }; });
    const first = Promise.resolve(app.inject(url));
    try {
      await started;
      const limited = await app.inject(url);
      assert.equal(limited.statusCode, 503);
      assert.equal(limited.headers['retry-after'], '5');
      assert.equal(limited.json().error.code, 'REPORT_BUSY');
      assert.equal((await app.inject('/health')).statusCode, 200);
      letReportFinish();
      assert.equal((await first).statusCode, 200);
      assert.equal((await app.inject(url)).statusCode, 200);
    } finally {
      letReportFinish();
      await first;
      await app.close();
    }
  });

  it('maps database pool pressure to a retryable response without database internals', async () => {
    const app = buildApp();
    app.get('/pool-test', async () => {
      throw new Prisma.PrismaClientKnownRequestError('private connection detail', {
        code: 'P2024', clientVersion: 'test',
      });
    });
    try {
      const response = await app.inject('/pool-test');
      assert.equal(response.statusCode, 503);
      assert.equal(response.headers['retry-after'], '5');
      assert.deepEqual(response.json(), { error: { code: 'DATABASE_BUSY', message: 'The database is busy. Try again shortly.' } });
    } finally { await app.close(); }
  });
});
