import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('idempotency on guest self-booking', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('retry with same key returns cached response', async () => {
    const { orgId, locationId } = await createTestOrg('i@example.com');
    const token = await loginToken(app, 'i@example.com');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    const org = await getDb().selectFrom('orgs').select(['public_slug']).where('id', '=', orgId).executeTakeFirstOrThrow();

    const payload = {
      scheduledAt: '2026-04-13T14:00:00-04:00',
      formResponse: { name: 'Dee', zip: '10001', party_size: 1 },
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${org.public_slug}/book/${locationId}`,
      headers: { 'idempotency-key': 'abc123' },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const id1 = (JSON.parse(first.body) as { data: { id: string } }).data.id;

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${org.public_slug}/book/${locationId}`,
      headers: { 'idempotency-key': 'abc123' },
      payload,
    });
    expect(second.statusCode).toBe(201);
    const id2 = (JSON.parse(second.body) as { data: { id: string } }).data.id;
    expect(id2).toBe(id1);

    // Different body, same key → 422.
    const third = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${org.public_slug}/book/${locationId}`,
      headers: { 'idempotency-key': 'abc123' },
      payload: { ...payload, formResponse: { ...payload.formResponse, party_size: 9 } },
    });
    expect(third.statusCode).toBe(422);
    expect(JSON.parse(third.body).type).toContain('idempotency_conflict');
  });
});
