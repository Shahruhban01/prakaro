import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { env } from '../src/config/env';
import { initialize } from '../src/modules/moderation/setup';

async function run() {
  const target = new URL(env.DATABASE_URL);
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(target.hostname, '127.0.0.1');
  assert.match(target.pathname, /^\/prakaro_[a-z0-9_]+_test$/);
  const email = 'tls-' + randomUUID() + '@example.test';
  const password = 'Synthetic!' + randomUUID();
  await initialize(email, password, 'Synthetic TLS operator');
  const app = buildApp({ logger: false });
  try {
    const live = await app.inject('/ready');
    assert.equal(live.statusCode, 200);
    const response = await app.inject({
      method: 'POST', url: '/api/super-admin-auth/sign-in/email', payload: { email, password },
      headers: { origin: new URL(env.MODERATION_ORIGIN).origin, 'x-prakaro-console': '1' },
    });
    assert.equal(response.statusCode, 200);
    const cookies = String(response.headers['set-cookie']);
    assert.match(cookies, /HttpOnly/i);
    assert.match(cookies, /Secure/i);
    assert.match(cookies, /SameSite=Lax/i);
    assert.equal(response.headers['strict-transport-security'], 'max-age=31536000');
    assert.equal(response.headers['cache-control'], 'no-store');

    const attempt = () => app.inject({
      method: 'POST', url: '/api/auth/sign-in/email', payload: {}, remoteAddress: '192.0.2.50',
    });
    assert.equal((await attempt()).statusCode, 400);
    for (let index = 1; index < 10; index++) await attempt();
    const throttled = await attempt();
    assert.equal(throttled.statusCode, 429);
    assert.equal(throttled.json().error?.code, 'RATE_LIMIT_EXCEEDED');
    console.log('Native readiness, HSTS, no-store, secure staff cookies and production auth throttle passed.');
  } finally { await app.close(); }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name + ': ' + error.message : 'Security smoke failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
