import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { getDb } from '../../src/db/index.js';

const webhookSecret = 'whsec_test_membership_webhooks';

describe('Stripe webhooks', () => {
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

  it('activates a pending checkout membership and records the Stripe payment idempotently', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-stripe-webhook@example.com');
      await getDb()
        .insertInto('org_stripe_accounts')
        .values({
          org_id: org.orgId,
          stripe_account_id: 'acct_webhook_123',
          charges_enabled: true,
          payouts_enabled: true,
          default_currency: 'usd',
        })
        .execute();
      const visitor = await getDb()
        .insertInto('visitors')
        .values({ org_id: org.orgId, email: 'member@example.com', first_name: 'Museum', last_name: 'Member' })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const tier = await getDb()
        .insertInto('membership_tiers')
        .values({
          org_id: org.orgId,
          slug: 'friend',
          name: 'Friend',
          price_cents: 4200,
          billing_interval: 'year',
          duration_days: 365,
          active: true,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const membership = await getDb()
        .insertInto('memberships')
        .values({
          org_id: org.orgId,
          visitor_id: visitor.id,
          tier_id: tier.id,
          status: 'pending',
          metadata: JSON.stringify({ source: 'stripe_checkout', checkoutSessionId: 'cs_test_webhook' }),
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const payload = JSON.stringify({
        id: 'evt_checkout_completed',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_webhook',
            client_reference_id: membership.id,
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            payment_intent: 'pi_test_123',
            amount_total: 4200,
            currency: 'usd',
            metadata: { membershipId: membership.id, visitorId: visitor.id, tierId: tier.id },
          },
        },
      });

      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/stripe/webhook/${org.orgId}`,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sign(payload),
        },
        payload,
      });
      expect(first.statusCode).toBe(200);
      expect(JSON.parse(first.body)).toMatchObject({ data: { ok: true, handled: true } });

      const updated = await getDb()
        .selectFrom('memberships')
        .select(['status', 'started_at', 'expires_at', 'stripe_subscription_id', 'auto_renew'])
        .where('id', '=', membership.id)
        .executeTakeFirstOrThrow();
      expect(updated.status).toBe('active');
      expect(updated.started_at).toBeInstanceOf(Date);
      expect(updated.expires_at).toBeInstanceOf(Date);
      expect(updated.stripe_subscription_id).toBe('sub_test_123');
      expect(updated.auto_renew).toBe(true);

      const paymentCount = await getDb()
        .selectFrom('membership_payments')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('membership_id', '=', membership.id)
        .executeTakeFirstOrThrow();
      expect(Number(paymentCount.c)).toBe(1);
      const payment = await getDb()
        .selectFrom('membership_payments')
        .select(['stripe_charge_id'])
        .where('membership_id', '=', membership.id)
        .executeTakeFirstOrThrow();
      expect(payment.stripe_charge_id).toBe('pi_test_123');

      const eventOutbox = await getDb()
        .selectFrom('event_outbox')
        .select(['event_type', 'aggregate_id'])
        .where('aggregate_id', '=', membership.id)
        .execute();
      expect(eventOutbox).toMatchObject([{ event_type: 'membership.created', aggregate_id: membership.id }]);

      const duplicate = await app.inject({
        method: 'POST',
        url: `/api/v1/stripe/webhook/${org.orgId}`,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sign(payload),
        },
        payload,
      });
      expect(duplicate.statusCode).toBe(200);
      expect(JSON.parse(duplicate.body)).toMatchObject({ data: { ok: true, duplicate: true } });
      const stripeEvents = await getDb()
        .selectFrom('stripe_events')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('stripe_event_id', '=', 'evt_checkout_completed')
        .executeTakeFirstOrThrow();
      expect(Number(stripeEvents.c)).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('rejects webhook payloads with an invalid signature', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-stripe-webhook-invalid@example.com');
      await getDb()
        .insertInto('org_stripe_accounts')
        .values({
          org_id: org.orgId,
          stripe_account_id: 'acct_webhook_invalid',
          charges_enabled: true,
          payouts_enabled: true,
          default_currency: 'usd',
        })
        .execute();
      const payload = JSON.stringify({ id: 'evt_bad', type: 'invoice.paid', data: { object: {} } });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/stripe/webhook/${org.orgId}`,
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
        payload,
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });
});

function sign(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
