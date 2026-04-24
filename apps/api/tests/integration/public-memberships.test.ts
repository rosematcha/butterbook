import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { getDb } from '../../src/db/index.js';

describe('public memberships', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await truncateAll();
    process.env.STRIPE_SECRET_KEY = 'sk_test_public_memberships';
    __resetConfigForTests();
    loadConfig();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConfigForTests();
    loadConfig();
  });

  it('lists active public membership tiers when membership sales are enabled', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-public-tiers@example.com');
      const orgRow = await getDb().selectFrom('orgs').select(['public_slug']).where('id', '=', org.orgId).executeTakeFirstOrThrow();
      await getDb().updateTable('org_membership_policies').set({ enabled: true, public_page_enabled: true }).where('org_id', '=', org.orgId).execute();
      await getDb()
        .insertInto('membership_tiers')
        .values({
          org_id: org.orgId,
          slug: 'friend',
          name: 'Friend',
          price_cents: 2500,
          billing_interval: 'year',
          duration_days: 365,
          active: true,
        })
        .execute();
      await getDb()
        .insertInto('membership_tiers')
        .values({
          org_id: org.orgId,
          slug: 'archived',
          name: 'Archived',
          price_cents: 1000,
          billing_interval: 'year',
          active: false,
        })
        .execute();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/public/orgs/${orgRow.public_slug}/membership-tiers`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { tiers: Array<{ slug: string }> } };
      expect(body.data.tiers.map((t) => t.slug)).toEqual(['friend']);
    } finally {
      await app.close();
    }
  });

  it('creates a visitor and pending membership before returning a Stripe Checkout URL', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk_test_public_memberships',
        'stripe-account': 'acct_test_123',
      });
      expect(body.get('mode')).toBe('subscription');
      expect(body.get('customer_email')).toBe('ada@example.com');
      expect(body.get('line_items[0][price_data][recurring][interval]')).toBe('year');
      return new Response(JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-public-checkout@example.com');
      const orgRow = await getDb().selectFrom('orgs').select(['public_slug']).where('id', '=', org.orgId).executeTakeFirstOrThrow();
      await getDb().updateTable('org_membership_policies').set({ enabled: true, public_page_enabled: true }).where('org_id', '=', org.orgId).execute();
      await getDb()
        .insertInto('org_stripe_accounts')
        .values({
          org_id: org.orgId,
          stripe_account_id: 'acct_test_123',
          charges_enabled: true,
          payouts_enabled: true,
          default_currency: 'usd',
        })
        .execute();
      const tier = await getDb()
        .insertInto('membership_tiers')
        .values({
          org_id: org.orgId,
          slug: 'household',
          name: 'Household',
          price_cents: 5000,
          billing_interval: 'year',
          duration_days: 365,
          active: true,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${orgRow.public_slug}/memberships/checkout`,
        payload: {
          tierId: tier.id,
          email: 'Ada@Example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          successUrl: 'https://butterbook.app/join/test?success=1',
          cancelUrl: 'https://butterbook.app/join/test?cancel=1',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        data: {
          url: 'https://checkout.stripe.test/session',
          sessionId: 'cs_test_123',
        },
      });

      const visitor = await getDb().selectFrom('visitors').select(['id', 'email']).where('org_id', '=', org.orgId).executeTakeFirstOrThrow();
      expect(visitor.email).toBe('ada@example.com');
      const membership = await getDb().selectFrom('memberships').select(['status', 'visitor_id', 'tier_id', 'metadata']).where('org_id', '=', org.orgId).executeTakeFirstOrThrow();
      expect(membership).toMatchObject({ status: 'pending', visitor_id: visitor.id, tier_id: tier.id });
      expect(membership.metadata).toMatchObject({ checkoutSessionId: 'cs_test_123' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
