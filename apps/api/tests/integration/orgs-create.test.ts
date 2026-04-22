import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { MINIMAL_NAME_FIELD } from '@butterbook/shared';

describe('POST /api/v1/orgs — wizard-expanded create', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('accepts the full wizard payload and persists every field on orgs + primary location', async () => {
    await createUser('wizard@example.com');
    const token = await loginToken(app, 'wizard@example.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'The Whitman',
        publicSlug: 'the-whitman',
        address: '100 Main St',
        zip: '10001',
        country: 'US',
        city: 'New York',
        state: 'NY',
        timezone: 'America/New_York',
        terminology: 'appointment',
        timeModel: 'start_end',
        formFields: MINIMAL_NAME_FIELD,
      },
    });
    expect(res.statusCode).toBe(200);
    const orgId = (JSON.parse(res.body) as { data: { id: string } }).data.id;

    const org = await getDb().selectFrom('orgs').selectAll().where('id', '=', orgId).executeTakeFirstOrThrow();
    expect(org.country).toBe('US');
    expect(org.city).toBe('New York');
    expect(org.state).toBe('NY');
    expect(org.terminology).toBe('appointment');
    expect(org.time_model).toBe('start_end');
    expect(Array.isArray(org.form_fields) ? (org.form_fields as unknown[]).length : 0).toBe(1);

    const loc = await getDb().selectFrom('locations').selectAll().where('org_id', '=', orgId).where('is_primary', '=', true).executeTakeFirstOrThrow();
    expect(loc.country).toBe('US');
    expect(loc.city).toBe('New York');
    expect(loc.state).toBe('NY');
  });

  it('applies defaults when only legacy fields are provided', async () => {
    await createUser('legacy@example.com');
    const token = await loginToken(app, 'legacy@example.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Legacy Org',
        address: '1 Old Way',
        zip: '00000',
        timezone: 'America/New_York',
      },
    });
    expect(res.statusCode).toBe(200);
    const orgId = (JSON.parse(res.body) as { data: { id: string } }).data.id;

    const org = await getDb().selectFrom('orgs').selectAll().where('id', '=', orgId).executeTakeFirstOrThrow();
    expect(org.country).toBe('US');
    expect(org.terminology).toBe('visit');
    expect(org.time_model).toBe('start_only');
    // Default form still seeded when caller doesn't override.
    expect(Array.isArray(org.form_fields) ? (org.form_fields as unknown[]).length : 0).toBe(3);
  });

  it('401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      payload: {
        name: 'Unauthed',
        address: '1 Main St',
        zip: '10001',
        timezone: 'America/New_York',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects creating a second org for the same user with 409', async () => {
    const { userId } = await createTestOrg('mono@example.com');
    void userId;
    const token = await loginToken(app, 'mono@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Second Org',
        address: '2 Second St',
        zip: '10002',
        timezone: 'America/New_York',
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects unknown terminology with 422', async () => {
    await createUser('bad@example.com');
    const token = await loginToken(app, 'bad@example.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Bad Org',
        address: '1 Bad Way',
        zip: '10001',
        timezone: 'America/New_York',
        terminology: 'bogus',
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('GET /api/v1/orgs/slug-check', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('returns available: true when no org holds the slug', async () => {
    await createUser('checker@example.com');
    const token = await loginToken(app, 'checker@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orgs/slug-check?slug=totally-fresh-slug',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { available: true } });
  });

  it('returns available: false with a suggestion when taken', async () => {
    const { orgId } = await createTestOrg('taken@example.com');
    // Force a known slug on the seeded org.
    await getDb().updateTable('orgs').set({ public_slug: 'the-whitman' }).where('id', '=', orgId).execute();
    const token = await loginToken(app, 'taken@example.com');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orgs/slug-check?slug=the-whitman',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { available: boolean; suggestion?: string } };
    expect(body.data.available).toBe(false);
    expect(body.data.suggestion).toMatch(/^the-whitman-/);
  });

  it('rejects invalid slugs without probing the DB', async () => {
    await createUser('invalid@example.com');
    const token = await loginToken(app, 'invalid@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orgs/slug-check?slug=Not_A_Slug',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { available: false, reason: 'invalid' } });
  });

  it('401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orgs/slug-check?slug=anything',
    });
    expect(res.statusCode).toBe(401);
  });
});
