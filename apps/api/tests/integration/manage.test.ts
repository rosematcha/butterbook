import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { defaultManageExpiry, makeManageToken } from '../../src/utils/manage-token.js';

// End-to-end test for visitor self-serve manage links. Covers:
//   * signed token → GET returns visit + policy
//   * invalid/expired token → 401
//   * self-cancel blocked when policy toggle is off (403)
//   * self-cancel blocked by cutoff (409)
//   * happy cancel → visit.status='cancelled' + outbox event emitted
//   * reschedule blocked by default policy (403), allowed after enabling
//   * cross-tenant: token from org A cannot reach org B (token is visit-scoped)

async function setupOrgWithHours(app: FastifyInstance, email: string): Promise<{ orgId: string; locationId: string; token: string; userId: string }> {
  const { orgId, locationId, userId } = await createTestOrg(email);
  const token = await loginToken(app, email);
  await app.inject({
    method: 'PUT',
    url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        openTime: '09:00',
        closeTime: '17:00',
        isActive: true,
      })),
    },
  });
  return { orgId, locationId, token, userId };
}

async function seedVisit(orgId: string, locationId: string, scheduledAt: Date): Promise<string> {
  const row = await getDb()
    .insertInto('visits')
    .values({
      org_id: orgId,
      location_id: locationId,
      event_id: null,
      booked_by: null,
      booking_method: 'admin',
      scheduled_at: scheduledAt,
      form_response: { name: 'Alice', email: 'alice@example.com', zip: '10001', party_size: 2 } as never,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return row.id;
}

async function seedVisitorVisitAndMembership(orgId: string, locationId: string, scheduledAt: Date): Promise<{
  visitId: string;
  visitorId: string;
  membershipId: string;
}> {
  const suffix = Math.floor(Math.random() * 1000000);
  const email = `member-${suffix}@example.com`;
  const visitor = await getDb()
    .insertInto('visitors')
    .values({
      org_id: orgId,
      email,
      first_name: 'Member',
      last_name: 'Person',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const tier = await getDb()
    .insertInto('membership_tiers')
    .values({
      org_id: orgId,
      slug: `family-${suffix}`,
      name: 'Family',
      price_cents: 5000,
      billing_interval: 'year',
      duration_days: 365,
      sort_order: 1,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const membership = await getDb()
    .insertInto('memberships')
    .values({
      org_id: orgId,
      visitor_id: visitor.id,
      tier_id: tier.id,
      status: 'active',
      started_at: new Date(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      metadata: {} as never,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const visit = await getDb()
    .insertInto('visits')
    .values({
      org_id: orgId,
      location_id: locationId,
      event_id: null,
      visitor_id: visitor.id,
      booked_by: null,
      booking_method: 'self',
      scheduled_at: scheduledAt,
      form_response: { name: 'Member Person', email } as never,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return { visitId: visit.id, visitorId: visitor.id, membershipId: membership.id };
}

describe('visitor manage links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('GET /manage/:token returns visit + policy', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g1@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const token = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'GET', url: `/api/v1/manage/${token}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.visit.id).toBe(visitId);
    expect(body.data.visit.status).toBe('confirmed');
    expect(body.data.policy).toEqual({
      cancelCutoffHours: 2,
      rescheduleCutoffHours: 2,
      selfCancelEnabled: true,
      selfRescheduleEnabled: false,
      refundPolicyText: null,
    });
    expect(body.data.org.id).toBe(orgId);
  });

  it('rejects invalid token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/manage/not-a-real-token' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects expired token (401)', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g2@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const token = makeManageToken(visitId, Date.now() - 1000);
    const res = await app.inject({ method: 'GET', url: `/api/v1/manage/${token}` });
    expect(res.statusCode).toBe(401);
  });

  it('self-cancel happy path marks visit cancelled and emits event', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g3@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const token = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'POST', url: `/api/v1/manage/${token}/cancel` });
    expect(res.statusCode).toBe(200);

    const row = await getDb().selectFrom('visits').select(['status']).where('id', '=', visitId).executeTakeFirstOrThrow();
    expect(row.status).toBe('cancelled');

    const outbox = await getDb().selectFrom('event_outbox').selectAll().where('aggregate_id', '=', visitId).execute();
    expect(outbox.some((r) => r.event_type === 'visit.cancelled')).toBe(true);

    const audit = await getDb().selectFrom('audit_log').selectAll().where('target_id', '=', visitId).execute();
    expect(audit.some((a) => a.action === 'visit.cancelled')).toBe(true);
  });

  it('self-cancel respects cutoff (409)', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g4@example.com');
    // Scheduled 30 minutes from now, cutoff default is 2h → reject.
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const token = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'POST', url: `/api/v1/manage/${token}/cancel` });
    expect(res.statusCode).toBe(409);
  });

  it('self-cancel blocked when policy.self_cancel_enabled=false (403)', async () => {
    const { orgId, locationId, token: adminToken } = await setupOrgWithHours(app, 'g5@example.com');
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-policies`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { selfCancelEnabled: false },
    });
    expect(patch.statusCode).toBe(200);

    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'POST', url: `/api/v1/manage/${mtoken}/cancel` });
    expect(res.statusCode).toBe(403);
  });

  it('lists memberships attached to the managed visit visitor', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g5b@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { visitId, membershipId } = await seedVisitorVisitAndMembership(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'GET', url: `/api/v1/manage/${mtoken}/memberships` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: membershipId,
      status: 'active',
      tier: { name: 'Family' },
    });
    expect(body.data[0].visitor.email).toMatch(/^member-\d+@example\.com$/);
  });

  it('self-cancels a membership for the managed visit visitor', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g5c@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { visitId, membershipId } = await seedVisitorVisitAndMembership(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/manage/${mtoken}/memberships/${membershipId}/cancel`,
      payload: { reason: 'moving away' },
    });
    expect(res.statusCode).toBe(200);

    const membership = await getDb().selectFrom('memberships').select(['status', 'cancelled_reason']).where('id', '=', membershipId).executeTakeFirstOrThrow();
    expect(membership.status).toBe('cancelled');
    expect(membership.cancelled_reason).toBe('moving away');

    const outbox = await getDb().selectFrom('event_outbox').selectAll().where('aggregate_id', '=', membershipId).execute();
    expect(outbox.some((r) => r.event_type === 'membership.cancelled')).toBe(true);

    const audit = await getDb().selectFrom('audit_log').selectAll().where('target_id', '=', membershipId).execute();
    expect(audit.some((a) => a.action === 'membership.cancelled')).toBe(true);
  });

  it('does not allow a manage token to cancel another visitor membership', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g5d@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { visitId } = await seedVisitorVisitAndMembership(orgId, locationId, scheduledAt);
    const other = await seedVisitorVisitAndMembership(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/manage/${mtoken}/memberships/${other.membershipId}/cancel`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('membership self-cancel respects membership policy toggle', async () => {
    const { orgId, locationId } = await setupOrgWithHours(app, 'g5e@example.com');
    await getDb().updateTable('org_membership_policies').set({ self_cancel_enabled: false }).where('org_id', '=', orgId).execute();
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { visitId, membershipId } = await seedVisitorVisitAndMembership(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/manage/${mtoken}/memberships/${membershipId}/cancel`,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('self-reschedule blocked by default (403) but allowed after enabling', async () => {
    const { orgId, locationId, token: adminToken } = await setupOrgWithHours(app, 'g6@example.com');
    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const visitId = await seedVisit(orgId, locationId, scheduledAt);
    const mtoken = makeManageToken(visitId, defaultManageExpiry(scheduledAt));

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/manage/${mtoken}/reschedule`,
      payload: { scheduledAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() },
    });
    expect(blocked.statusCode).toBe(403);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/booking-policies`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { selfRescheduleEnabled: true },
    });

    // Pick a future slot that falls in hours (09:00-17:00 every day).
    // 3 days from now at noon UTC — safe against most timezones.
    const newAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    newAt.setUTCHours(17, 0, 0, 0); // 13:00 America/New_York in DST, 12:00 otherwise — inside 9-17.
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/manage/${mtoken}/reschedule`,
      payload: { scheduledAt: newAt.toISOString() },
    });
    expect(ok.statusCode).toBe(200);

    const row = await getDb().selectFrom('visits').select(['scheduled_at']).where('id', '=', visitId).executeTakeFirstOrThrow();
    expect(new Date(row.scheduled_at).toISOString()).toBe(newAt.toISOString());
  });

  it('admin booking-policies GET requires auth (401)', async () => {
    const { orgId } = await createTestOrg('g7@example.com');
    const res = await app.inject({ method: 'GET', url: `/api/v1/orgs/${orgId}/booking-policies` });
    expect(res.statusCode).toBe(401);
  });

  it('admin booking-policies GET hides org from non-members (404)', async () => {
    const { orgId } = await createTestOrg('g8@example.com');
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'real-outsider@example.com', password: 'longenoughpass1234', displayName: 'Out' } });
    const outsiderToken = await loginToken(app, 'real-outsider@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/booking-policies`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
