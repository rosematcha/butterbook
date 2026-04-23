import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

// Admin-owned booking page: GET returns the backfilled default row, PATCH
// writes values through, empty-string text fields normalize to null, and
// invalid values (negative lead-time, out-of-range window) reject with 422.

describe('booking-page admin routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('GET returns defaults for a freshly-created org', async () => {
    const { orgId } = await createTestOrg('bp-owner@example.com');
    const token = await loginToken(app, 'bp-owner@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toMatchObject({
      heroTitle: null,
      heroSubtitle: null,
      heroImageUrl: null,
      showPolicyOnPage: true,
      leadTimeMinHours: 0,
      bookingWindowDays: 60,
      maxPartySize: null,
      intakeSchedules: false,
    });
  });

  it('PATCH persists values and writes an audit entry', async () => {
    const { orgId } = await createTestOrg('bp-patch@example.com');
    const token = await loginToken(app, 'bp-patch@example.com');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        heroTitle: 'Plan your visit',
        heroSubtitle: 'We are open Wed–Sun',
        heroImageUrl: 'https://example.com/hero.jpg',
        introMarkdown: 'Welcome to the museum.',
        showPolicyOnPage: false,
        leadTimeMinHours: 24,
        bookingWindowDays: 30,
        maxPartySize: 8,
        intakeSchedules: true,
      },
    });
    expect(patch.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(after.body);
    expect(body.data).toMatchObject({
      heroTitle: 'Plan your visit',
      heroSubtitle: 'We are open Wed–Sun',
      heroImageUrl: 'https://example.com/hero.jpg',
      introMarkdown: 'Welcome to the museum.',
      showPolicyOnPage: false,
      leadTimeMinHours: 24,
      bookingWindowDays: 30,
      maxPartySize: 8,
      intakeSchedules: true,
    });

    const audits = await getDb()
      .selectFrom('audit_log')
      .select(['action', 'target_id'])
      .where('org_id', '=', orgId)
      .where('action', '=', 'org.booking_page_updated')
      .execute();
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.target_id).toBe(orgId);
  });

  it('blank string hero fields normalize to null', async () => {
    const { orgId } = await createTestOrg('bp-null@example.com');
    const token = await loginToken(app, 'bp-null@example.com');

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
      payload: { heroTitle: 'hi' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
      payload: { heroTitle: '   ' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.heroTitle).toBeNull();
  });

  it('rejects negative lead-time with 422', async () => {
    const { orgId } = await createTestOrg('bp-422@example.com');
    const token = await loginToken(app, 'bp-422@example.com');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
      payload: { leadTimeMinHours: -1 },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects out-of-range booking window with 422', async () => {
    const { orgId } = await createTestOrg('bp-422b@example.com');
    const token = await loginToken(app, 'bp-422b@example.com');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-page`,
      headers: { authorization: `Bearer ${token}` },
      payload: { bookingWindowDays: 999 },
    });
    expect(res.statusCode).toBe(422);
  });
});
