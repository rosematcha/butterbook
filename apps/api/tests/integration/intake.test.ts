import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('public intake (slug-scoped)', () => {
  let app: FastifyInstance;
  let orgId: string;
  let slug: string;
  let ownerToken: string;
  let locationId: string;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    const owner = await createTestOrg('owner@example.com');
    orgId = owner.orgId;
    locationId = owner.locationId;
    const row = await getDb()
      .selectFrom('orgs')
      .select(['public_slug'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    slug = row.public_slug;
    ownerToken = await loginToken(app, 'owner@example.com');
    // Seed hours for every weekday so kiosk checkin lands in an open window.
    for (let d = 0; d < 7; d++) {
      await getDb()
        .insertInto('location_hours')
        .values({ location_id: locationId, day_of_week: d, open_time: '00:00', close_time: '23:59', is_active: true })
        .execute();
    }
  });

  it('GET /public/intake/:slug/config returns org + location + nonce', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/intake/${slug}/config` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { orgId: string; locationId: string; nonce: string } };
    expect(body.data.orgId).toBe(orgId);
    expect(body.data.locationId).toBe(locationId);
    expect(body.data.nonce).toMatch(/^\d+\.[0-9a-f]+$/);
  });

  it('GET /public/intake/:slug/form returns the org form fields', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/intake/${slug}/form` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { fields: unknown[] } };
    expect(Array.isArray(body.data.fields)).toBe(true);
  });

  it('404s for an unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/intake/does-not-exist/config' });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a soft-deleted org', async () => {
    await getDb().updateTable('orgs').set({ deleted_at: new Date() }).where('id', '=', orgId).execute();
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/intake/${slug}/config` });
    expect(res.statusCode).toBe(404);
  });

  it('POST checkin requires a valid nonce', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/public/intake/${slug}/checkin`,
      headers: { 'x-kiosk-nonce': 'garbage' },
      payload: { formResponse: { name: 'A', zip: '10001', party_size: 1 } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST checkin happy path creates a visit', async () => {
    const c = await app.inject({ method: 'GET', url: `/api/v1/public/intake/${slug}/config` });
    const { data } = JSON.parse(c.body) as { data: { nonce: string } };
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/public/intake/${slug}/checkin`,
      headers: { 'x-kiosk-nonce': data.nonce, 'idempotency-key': 'test-1' },
      payload: { formResponse: { name: 'Visitor', zip: '10001', party_size: 1 } },
    });
    expect(res.statusCode).toBe(201);
  });

  it('QR endpoint rejects invalid hex color with 422', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/qr?fg=notacolor`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('QR endpoint rejects invalid size with 422', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/qr?size=42`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('QR endpoint returns SVG when format=svg', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/qr?format=svg`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('<svg');
  });

  it('QR endpoint defaults to PNG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/qr`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });
});
