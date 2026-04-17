import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('general visit booking', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('admin books visit when within hours', async () => {
    const { orgId, locationId } = await createTestOrg('b@example.com');
    const token = await loginToken(app, 'b@example.com');

    // PUT hours: Mon 9-17
    const hoursRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    expect(hoursRes.statusCode).toBe(200);

    // Mon 2026-04-13 14:00 NY = 18:00 UTC
    const visitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        scheduledAt: '2026-04-13T14:00:00-04:00',
        formResponse: { name: 'Alice', zip: '10001', party_size: 2 },
      },
    });
    expect(visitRes.statusCode).toBe(200);
    const rows = await getDb().selectFrom('visits').selectAll().where('org_id', '=', orgId).execute();
    expect(rows.length).toBe(1);
  });

  it('refuses visit outside hours', async () => {
    const { orgId, locationId } = await createTestOrg('c@example.com');
    const token = await loginToken(app, 'c@example.com');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        scheduledAt: '2026-04-13T22:00:00-04:00', // 10pm NY, outside
        formResponse: { name: 'Bob', zip: '10001', party_size: 1 },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).type).toContain('availability_conflict');
  });
});
