import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { enableBillingGating, setOrgPlan } from '../helpers/plan.js';
import { getDb } from '../../src/db/index.js';
import { currentPeriodYyyymm } from '../../src/services/billing-usage.js';

async function seedHoursAllWeek(locationId: string): Promise<void> {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    location_id: locationId,
    day_of_week: dow,
    open_time: '00:00',
    close_time: '23:59',
    is_active: true,
  }));
  await getDb().insertInto('location_hours').values(rows).execute();
}

function nextWeekdayAt(hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('usage counters and snapshot', () => {
  let app: FastifyInstance;
  let orgId: string;
  let locationId: string;
  let ownerToken: string;
  let cleanupBilling: () => void;

  beforeAll(async () => {
    app = await makeApp();
    cleanupBilling = enableBillingGating();
  });

  afterAll(async () => {
    cleanupBilling();
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    const r = await createTestOrg();
    orgId = r.orgId;
    locationId = r.locationId;
    ownerToken = await loginToken(app, 'owner@example.com');
    await seedHoursAllWeek(locationId);
  });

  it('GET /usage returns zero counters with Free caps when gating is enabled', async () => {
    await setOrgPlan(orgId, 'free');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.plan).toBe('free');
    expect(body.data.appointments.used).toBe(0);
    expect(body.data.appointments.cap).toBe(200);
    expect(body.data.appointments.overCap).toBe(false);
    expect(body.data.events.cap).toBe(4);
  });

  it('admin visit creation increments appointment counter', async () => {
    await setOrgPlan(orgId, 'professional');
    const create = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        locationId,
        scheduledAt: nextWeekdayAt(15),
        formResponse: { name: 'Visitor', zip: '00000', party_size: 1 },
      },
    });
    expect(create.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.appointments.used).toBe(1);
  });

  it('cancelling a visit does not decrement the counter', async () => {
    await setOrgPlan(orgId, 'professional');
    const create = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        locationId,
        scheduledAt: nextWeekdayAt(15),
        formResponse: { name: 'V', zip: '00000', party_size: 1 },
      },
    });
    expect(create.statusCode).toBe(200);
    const visitId = JSON.parse(create.body).data.id;
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits/${visitId}/cancel`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(cancel.statusCode).toBe(200);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(JSON.parse(res.body).data.appointments.used).toBe(1);
  });

  it('overshooting cap is soft (booking succeeds, overCap=true)', async () => {
    await setOrgPlan(orgId, 'free');
    const period = currentPeriodYyyymm('America/New_York');
    await getDb()
      .insertInto('org_usage_periods')
      .values({
        org_id: orgId,
        period_yyyymm: period,
        appointments_count: 200,
        events_count: 0,
      })
      .execute();
    const create = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        locationId,
        scheduledAt: nextWeekdayAt(15),
        formResponse: { name: 'V', zip: '00000', party_size: 1 },
      },
    });
    expect(create.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.data.appointments.used).toBe(201);
    expect(body.data.appointments.overCap).toBe(true);
  });

  it('publishing an event increments the event counter; re-publishing does not double-count', async () => {
    await setOrgPlan(orgId, 'professional');
    const startsAt = nextWeekdayAt(15);
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
    const create = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Tour',
        locationId,
        startsAt,
        endsAt,
        capacity: 10,
        slug: 'tour-1',
      },
    });
    expect(create.statusCode).toBe(200);
    const eventId = JSON.parse(create.body).data.id;

    const pub1 = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/${eventId}/publish`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(pub1.statusCode).toBe(200);

    const pub2 = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/${eventId}/publish`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(pub2.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/usage`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(JSON.parse(res.body).data.events.used).toBe(1);
  });
});
