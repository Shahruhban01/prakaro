import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});
