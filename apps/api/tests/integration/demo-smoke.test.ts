// Rot canary for the demo seed.
//
// The demo is a single seed function that touches ~10 tables. Any schema
// migration, RLS policy tweak, or permission-registry change can silently
// break the seed, and the only way we'd notice is a production deploy going
// live with a broken /demo/session. This test does the full thing — spins
// the app with DEMO_MODE=true, calls the provision route, then hits the
// admin pages a real demo visitor would land on — and asserts 200s.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { buildApp } from '../../src/app.js';
import { truncateAll } from '../helpers/factories.js';

describe('demo mode smoke', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // setup.ts has already called loadConfig() with DEMO_MODE unset. Reset
    // the cache and reload so the route registration sees DEMO_MODE=true.
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_MAX_ORGS = '512';
    process.env.DEMO_SESSION_TTL_HOURS = '12';
    __resetConfigForTests();
    loadConfig();
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.DEMO_MODE;
    __resetConfigForTests();
    loadConfig();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('provisions a demo session, lands on a live-looking org, responds to key admin reads', async () => {
    const prov = await app.inject({ method: 'POST', url: '/api/v1/demo/session' });
    expect(prov.statusCode).toBe(200);
    const body = JSON.parse(prov.body) as { data: { token: string; orgId: string; expiresAt: string } };
    const { token, orgId } = body.data;
    expect(token).toMatch(/.{32,}/);
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

    const auth = { authorization: `Bearer ${token}` };

    // The day-view, events list, members list, reports headcount, audit feed
    // are the five pages an admin lands on in the first 30 seconds. If any
    // schema change breaks the seed, one of these 200s will flip.
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const checks = [
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/locations` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/events` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/members` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/visits?from=${from}&to=${to}` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/reports/headcount?from=${from}&to=${to}` },
      { method: 'GET' as const, url: `/api/v1/orgs/${orgId}/audit` },
    ];
    for (const c of checks) {
      const res = await app.inject({ ...c, headers: auth });
      expect.soft(res.statusCode, `${c.method} ${c.url} -> ${res.body.slice(0, 200)}`).toBe(200);
    }
  });

  it('refuses invitation creation and org deletion on demo orgs', async () => {
    const prov = await app.inject({ method: 'POST', url: '/api/v1/demo/session' });
    const { token, orgId } = (JSON.parse(prov.body) as { data: { token: string; orgId: string } }).data;
    const auth = { authorization: `Bearer ${token}` };

    const inv = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/invitations`,
      headers: auth,
      payload: { email: 'x@example.com', roleIds: [], ttlHours: 24 },
    });
    expect(inv.statusCode).toBe(403);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}`,
      headers: auth,
    });
    expect(del.statusCode).toBe(403);
  });

  it('sets X-Robots-Tag: noindex on every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
  });
});
