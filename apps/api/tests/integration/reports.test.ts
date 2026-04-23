import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';

describe('reports', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  async function seedVisits(orgId: string, locationId: string, token: string): Promise<void> {
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    // Two visits on the same Monday, party 2 + 3.
    for (const [name, partySize] of [['A', 2], ['B', 3]] as const) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${orgId}/visits`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          locationId,
          scheduledAt: '2026-04-13T14:00:00-04:00',
          formResponse: { name, zip: '10001', party_size: partySize },
        },
      });
      expect(res.statusCode).toBe(200);
    }
  }

  it('headcount rolls up party_size by day', async () => {
    const { orgId, locationId } = await createTestOrg('r@example.com');
    const token = await loginToken(app, 'r@example.com');
    await seedVisits(orgId, locationId, token);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/reports/headcount?group_by=day&from=2026-04-01T00:00:00Z&to=2026-04-30T00:00:00Z`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: Array<{ bucket: string; headcount: number; visits: number }> };
    const mon = body.data.find((r) => r.bucket === '2026-04-13');
    expect(mon).toBeDefined();
    expect(mon!.headcount).toBe(5);
    expect(mon!.visits).toBe(2);
  });

  it('booking-sources groups by method', async () => {
    const { orgId, locationId } = await createTestOrg('rs@example.com');
    const token = await loginToken(app, 'rs@example.com');
    await seedVisits(orgId, locationId, token);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/reports/booking-sources`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: Array<{ booking_method: string; visits: number; headcount: number }> };
    const admin = body.data.find((r) => r.booking_method === 'admin');
    expect(admin?.visits).toBe(2);
    expect(admin?.headcount).toBe(5);
  });

  it('CSV export returns text/csv with correct headers', async () => {
    const { orgId, locationId } = await createTestOrg('csv@example.com');
    const token = await loginToken(app, 'csv@example.com');
    await seedVisits(orgId, locationId, token);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/reports/visits/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/visits\.csv/);
    const lines = res.body.split('\n');
    expect(lines[0]).toBe('id,scheduled_at,status,booking_method,location_id,event_id,party_size,pii_redacted');
    expect(lines.length).toBe(3); // header + 2 rows
  });

  it('visits report paginates row-level results', async () => {
    const { orgId, locationId } = await createTestOrg('visits-report@example.com');
    const token = await loginToken(app, 'visits-report@example.com');
    await seedVisits(orgId, locationId, token);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/reports/visits?page=1&limit=1`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: Array<{ id: string }>; meta: { total: number; pages: number; limit: number } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(2);
    expect(body.meta.pages).toBe(2);
    expect(body.meta.limit).toBe(1);
  });

  it('reports require reports.view (403 for non-superadmin without role)', async () => {
    const { orgId, locationId } = await createTestOrg('perm@example.com');
    const ownerToken = await loginToken(app, 'perm@example.com');
    await seedVisits(orgId, locationId, ownerToken);

    // Register a second user + add them to the org without reports.view.
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'nobody@example.com', password: 'longenoughpass1234' },
    });
    // Use invitations? Quicker: insert the membership directly.
    const { getDb } = await import('../../src/db/index.js');
    const u = await getDb().selectFrom('users').select('id').where('email', '=', 'nobody@example.com').executeTakeFirstOrThrow();
    await getDb().insertInto('org_members').values({ org_id: orgId, user_id: u.id, is_superadmin: false }).execute();
    const guestToken = await loginToken(app, 'nobody@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/reports/headcount`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
