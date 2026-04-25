import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { getDb } from '../../src/db/index.js';

const webhookSecret = 'whsec_test_guest_passes';

describe('membership guest passes', () => {
  beforeEach(async () => {
    await truncateAll();
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET = webhookSecret;
    __resetConfigForTests();
    loadConfig();
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    __resetConfigForTests();
    loadConfig();
  });

  it('issues included guest passes for manual enrollment with membership expiry', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('guest-pass-manual@example.com');
      const token = await loginToken(app, 'guest-pass-manual@example.com');
      const visitor = await createVisitor(org.orgId, 'manual-pass@example.com');
      const tier = await createTier(org.orgId, 2);
      const expiresAt = '2027-04-25T12:00:00.000Z';

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${org.orgId}/memberships`,
        headers: { authorization: `Bearer ${token}` },
        payload: { visitorId: visitor.id, tierId: tier.id, expiresAt },
      });

      expect(res.statusCode).toBe(200);
      const membershipId = JSON.parse(res.body).data.id as string;
      const passes = await getDb()
        .selectFrom('guest_passes')
        .select(['code', 'expires_at'])
        .where('org_id', '=', org.orgId)
        .where('membership_id', '=', membershipId)
        .execute();
      expect(passes).toHaveLength(2);
      expect(passes.every((pass) => pass.code.startsWith('GP-'))).toBe(true);
      expect(passes.every((pass) => pass.expires_at?.toISOString() === expiresAt)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('issues guest passes once when a Stripe checkout webhook is retried', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('guest-pass-stripe@example.com');
      await getDb()
        .insertInto('org_stripe_accounts')
        .values({ org_id: org.orgId, stripe_account_id: 'acct_guest_pass', charges_enabled: true, payouts_enabled: true, default_currency: 'usd' })
        .execute();
      const visitor = await createVisitor(org.orgId, 'stripe-pass@example.com');
      const tier = await createTier(org.orgId, 3);
      const membership = await getDb()
        .insertInto('memberships')
        .values({ org_id: org.orgId, visitor_id: visitor.id, tier_id: tier.id, status: 'pending', metadata: JSON.stringify({ source: 'stripe_checkout' }) })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const payload = JSON.stringify({
        id: 'evt_guest_pass_checkout',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_guest_pass', client_reference_id: membership.id, payment_intent: 'pi_guest_pass', amount_total: 2500, currency: 'usd', metadata: { membershipId: membership.id } } },
      });

      for (let i = 0; i < 2; i += 1) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/stripe/webhook/${org.orgId}`,
          headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) },
          payload,
        });
        expect(res.statusCode).toBe(200);
      }

      const passCount = await getDb()
        .selectFrom('guest_passes')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('membership_id', '=', membership.id)
        .executeTakeFirstOrThrow();
      expect(Number(passCount.c)).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('redeems a valid guest pass at kiosk check-in', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('guest-pass-kiosk@example.com');
      await openKioskHours(org.locationId);
      const visitor = await createVisitor(org.orgId, 'redeem-pass@example.com');
      const tier = await createTier(org.orgId, 1);
      const membership = await createActiveMembership(org.orgId, visitor.id, tier.id);
      await getDb().insertInto('guest_passes').values({ org_id: org.orgId, membership_id: membership.id, code: 'GP-VALIDPASS', expires_at: tomorrow() }).execute();

      const res = await kioskCheckin(app, org.locationId, { guestPassCode: 'gp-validpass' });

      expect(res.statusCode).toBe(201);
      const visitId = JSON.parse(res.body).data.id as string;
      const pass = await getDb().selectFrom('guest_passes').select(['redeemed_at', 'redeemed_by_visit_id']).where('code', '=', 'GP-VALIDPASS').executeTakeFirstOrThrow();
      expect(pass.redeemed_at).toBeInstanceOf(Date);
      expect(pass.redeemed_by_visit_id).toBe(visitId);
    } finally {
      await app.close();
    }
  });

  it('rejects expired, redeemed, and cross-org guest pass redemption', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('guest-pass-reject@example.com');
      const other = await createTestOrg('guest-pass-other@example.com');
      await openKioskHours(org.locationId);
      const visitor = await createVisitor(org.orgId, 'reject-pass@example.com');
      const tier = await createTier(org.orgId, 1);
      const membership = await createActiveMembership(org.orgId, visitor.id, tier.id);
      await getDb().insertInto('guest_passes').values({ org_id: org.orgId, membership_id: membership.id, code: 'GP-EXPIRED', expires_at: yesterday() }).execute();
      await getDb().insertInto('guest_passes').values({ org_id: org.orgId, membership_id: membership.id, code: 'GP-USED', redeemed_at: new Date() }).execute();
      const otherVisitor = await createVisitor(other.orgId, 'other-pass@example.com');
      const otherTier = await createTier(other.orgId, 1);
      const otherMembership = await createActiveMembership(other.orgId, otherVisitor.id, otherTier.id);
      await getDb().insertInto('guest_passes').values({ org_id: other.orgId, membership_id: otherMembership.id, code: 'GP-OTHER' }).execute();

      expect((await kioskCheckin(app, org.locationId, { guestPassCode: 'GP-EXPIRED' })).statusCode).toBe(409);
      expect((await kioskCheckin(app, org.locationId, { guestPassCode: 'GP-USED' })).statusCode).toBe(409);
      expect((await kioskCheckin(app, org.locationId, { guestPassCode: 'GP-OTHER' })).statusCode).toBe(404);
      const visits = await getDb().selectFrom('visits').select(['id']).where('org_id', '=', org.orgId).execute();
      expect(visits).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

async function createVisitor(orgId: string, email: string) {
  return getDb().insertInto('visitors').values({ org_id: orgId, email }).returning(['id']).executeTakeFirstOrThrow();
}

async function createTier(orgId: string, guestPassesIncluded: number) {
  return getDb()
    .insertInto('membership_tiers')
    .values({ org_id: orgId, slug: `tier-${crypto.randomUUID()}`, name: 'Friend', price_cents: 2500, billing_interval: 'year', duration_days: 365, guest_passes_included: guestPassesIncluded, active: true })
    .returning(['id'])
    .executeTakeFirstOrThrow();
}

async function createActiveMembership(orgId: string, visitorId: string, tierId: string) {
  return getDb()
    .insertInto('memberships')
    .values({ org_id: orgId, visitor_id: visitorId, tier_id: tierId, status: 'active', started_at: new Date(), metadata: JSON.stringify({}) })
    .returning(['id'])
    .executeTakeFirstOrThrow();
}

async function openKioskHours(locationId: string) {
  await getDb()
    .insertInto('location_hours')
    .values([0, 1, 2, 3, 4, 5, 6].map((day) => ({ location_id: locationId, day_of_week: day, open_time: '00:00', close_time: '23:59', is_active: true })))
    .execute();
}

async function kioskCheckin(app: Awaited<ReturnType<typeof makeApp>>, locationId: string, payload: { guestPassCode?: string }) {
  const location = await getDb().selectFrom('locations').select(['qr_token']).where('id', '=', locationId).executeTakeFirstOrThrow();
  const config = await app.inject({ method: 'GET', url: `/api/v1/kiosk/${location.qr_token}/config` });
  const nonce = JSON.parse(config.body).data.nonce as string;
  return app.inject({
    method: 'POST',
    url: `/api/v1/kiosk/${location.qr_token}/checkin`,
    headers: { 'x-kiosk-nonce': nonce },
    payload: { formResponse: { name: 'Guest pass visitor', party_size: 1 }, ...payload },
  });
}

function sign(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function tomorrow(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function yesterday(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
