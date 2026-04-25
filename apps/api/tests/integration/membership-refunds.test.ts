import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { getDb } from '../../src/db/index.js';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';

describe('membership refunds', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await truncateAll();
    process.env.STRIPE_SECRET_KEY = 'sk_test_membership_refunds';
    __resetConfigForTests();
    loadConfig();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConfigForTests();
    loadConfig();
  });

  it('creates a Stripe refund for Stripe payments through the connected account', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(String(_url)).toBe('https://api.stripe.com/v1/refunds');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk_test_membership_refunds',
        'stripe-account': 'acct_refund_123',
        'idempotency-key': expect.stringContaining('membership-refund:'),
      });
      expect(body.get('charge')).toBe('ch_refund_123');
      expect(body.get('amount')).toBe('2500');
      return new Response(JSON.stringify({ id: 're_test_123' }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-refund-stripe@example.com');
      const token = await loginToken(app, 'owner-refund-stripe@example.com');
      await getDb()
        .insertInto('org_stripe_accounts')
        .values({
          org_id: org.orgId,
          stripe_account_id: 'acct_refund_123',
          charges_enabled: true,
          payouts_enabled: true,
          default_currency: 'usd',
        })
        .execute();
      const { membershipId, paymentId } = await seedMembershipPayment(org.orgId, 'stripe', 5000, 'ch_refund_123');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${org.orgId}/memberships/${membershipId}/refund`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountCents: 2500, notes: 'Partial refund' },
      });

      expect(res.statusCode).toBe(200);
      const payment = await getDb()
        .selectFrom('membership_payments')
        .select(['refunded_at', 'refunded_amount_cents', 'notes'])
        .where('id', '=', paymentId)
        .executeTakeFirstOrThrow();
      expect(payment.refunded_at).toBeInstanceOf(Date);
      expect(payment.refunded_amount_cents).toBe(2500);
      expect(payment.notes).toBe('Partial refund');
      const membership = await getDb().selectFrom('memberships').select(['status', 'auto_renew']).where('id', '=', membershipId).executeTakeFirstOrThrow();
      expect(membership.status).toBe('active');
      expect(membership.auto_renew).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('does not call Stripe for manual payments and rejects over-refunds', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-refund-manual@example.com');
      const token = await loginToken(app, 'owner-refund-manual@example.com');
      const { membershipId, paymentId } = await seedMembershipPayment(org.orgId, 'manual', 3000, null);

      const overRefund = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${org.orgId}/memberships/${membershipId}/refund`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountCents: 4000 },
      });
      expect(overRefund.statusCode).toBe(409);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${org.orgId}/memberships/${membershipId}/refund`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const payment = await getDb()
        .selectFrom('membership_payments')
        .select(['refunded_amount_cents'])
        .where('id', '=', paymentId)
        .executeTakeFirstOrThrow();
      expect(payment.refunded_amount_cents).toBe(3000);
      const membership = await getDb().selectFrom('memberships').select(['status']).where('id', '=', membershipId).executeTakeFirstOrThrow();
      expect(membership.status).toBe('refunded');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

async function seedMembershipPayment(
  orgId: string,
  source: 'manual' | 'stripe',
  amountCents: number,
  stripeChargeId: string | null,
): Promise<{ membershipId: string; paymentId: string }> {
  const visitor = await getDb()
    .insertInto('visitors')
    .values({ org_id: orgId, email: `refund-${crypto.randomUUID()}@example.com` })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const tier = await getDb()
    .insertInto('membership_tiers')
    .values({
      org_id: orgId,
      slug: `refund-${crypto.randomUUID()}`,
      name: 'Refundable',
      price_cents: amountCents,
      billing_interval: 'year',
      duration_days: 365,
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
      started_at: new Date('2026-01-01T00:00:00Z'),
      expires_at: new Date('2027-01-01T00:00:00Z'),
      auto_renew: true,
      metadata: JSON.stringify({}),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const payment = await getDb()
    .insertInto('membership_payments')
    .values({
      org_id: orgId,
      membership_id: membership.id,
      amount_cents: amountCents,
      currency: 'usd',
      source,
      stripe_charge_id: stripeChargeId,
      paid_at: new Date('2026-01-01T00:00:00Z'),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return { membershipId: membership.id, paymentId: payment.id };
}
