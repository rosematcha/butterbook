import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';

describe('auth', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('registers + logs in + fetches /me', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@example.com', password: 'longenoughpass1234', displayName: 'A' },
    });
    expect(reg.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@example.com', password: 'longenoughpass1234' },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = JSON.parse(login.body) as {
      data: { token: string; membership: unknown };
    };
    const token = loginBody.data.token;
    // Login carries membership so the web client can seed its React Query
    // cache and skip the /auth/me round-trip on /app. Freshly registered
    // user has no org yet, so it's null here.
    expect(loginBody.data).toHaveProperty('membership');
    expect(loginBody.data.membership).toBeNull();

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = JSON.parse(me.body) as { data: { user: { email: string }; membership: unknown } };
    expect(meBody.data.user.email).toBe('a@example.com');
    // A freshly-registered user has no org yet — membership is null, not an array.
    expect(meBody.data.membership).toBeNull();
  });

  it('login response includes membership for users who belong to an org', async () => {
    // Used by the web client to seed React Query so /app doesn't re-fetch /me.
    const { orgId } = await createTestOrg('owner@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'owner@example.com', password: 'longenoughpass1234' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: {
        membership: { orgId: string; orgName: string; isSuperadmin: boolean } | null;
      };
    };
    expect(body.data.membership).not.toBeNull();
    expect(body.data.membership!.orgId).toBe(orgId);
    expect(body.data.membership!.isSuperadmin).toBe(true);
  });

  it('rejects short passwords as 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@example.com', password: 'short' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 401 with wrong password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@example.com', password: 'longenoughpass1234' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@example.com', password: 'wrongwrongwrong12' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).type).toContain('authentication_required');
  });

  it('login timing is roughly constant between registered and unregistered emails', async () => {
    // If the unregistered-email path short-circuited (no argon2 call), the
    // timing gap would be ~100ms. The equalized path should be well under 50ms
    // apart. Use a generous margin to stay non-flaky on slower CI hardware.
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'exists@example.com', password: 'longenoughpass1234' },
    });
    // Warm the dummy-hash cache so the first unregistered call doesn't pay the
    // one-time computation cost.
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'warmup@example.com', password: 'wrongwrongwrong12' },
    });
    const time = async (email: string): Promise<number> => {
      const t0 = performance.now();
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'wrongwrongwrong12' },
      });
      return performance.now() - t0;
    };
    const existing: number[] = [];
    const missing: number[] = [];
    for (let i = 0; i < 5; i++) {
      existing.push(await time('exists@example.com'));
      missing.push(await time('never-registered-' + i + '@example.com'));
    }
    const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const diff = Math.abs(avg(existing) - avg(missing));
    expect(diff).toBeLessThan(50);
  });
});
