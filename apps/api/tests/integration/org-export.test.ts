import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('org export', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('superadmin exports org as JSON with expected sections', async () => {
    const { orgId, locationId } = await createTestOrg('e@example.com');
    const token = await loginToken(app, 'e@example.com');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = JSON.parse(res.body) as {
      exportedAt: string;
      org: { id: string };
      locations: unknown[];
      location_hours: unknown[];
      audit_log: unknown[];
    };
    expect(body.org.id).toBe(orgId);
    expect(Array.isArray(body.locations)).toBe(true);
    expect(body.locations.length).toBeGreaterThan(0);
    expect(body.location_hours.length).toBe(1);
    expect(body.audit_log.length).toBeGreaterThan(0); // org.created at minimum
  });

  it('non-superadmin is forbidden', async () => {
    const { orgId } = await createTestOrg('e2@example.com');
    const otherUserId = await createUser('member@example.com');
    await getDb().insertInto('org_members').values({ org_id: orgId, user_id: otherUserId, is_superadmin: false }).execute();
    const token = await loginToken(app, 'member@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
