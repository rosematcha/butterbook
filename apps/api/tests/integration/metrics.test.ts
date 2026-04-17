import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from '../helpers/factories.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';

describe('/metrics', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    process.env.METRICS_TOKEN = 'test_metrics_token_must_be_at_least_16';
    __resetConfigForTests();
    loadConfig();
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.METRICS_TOKEN;
    __resetConfigForTests();
    loadConfig();
  });

  it('returns 401 without bearer', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
  });

  it('returns Prometheus text with correct auth', async () => {
    // Generate at least one request to populate counters.
    await app.inject({ method: 'GET', url: '/health/live' });
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer test_metrics_token_must_be_at_least_16' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toMatch(/# TYPE http_requests_total counter/);
    expect(res.body).toMatch(/http_requests_total\{/);
  });
});
