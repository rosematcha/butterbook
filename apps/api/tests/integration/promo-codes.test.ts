import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { getDb } from '../../src/db/index.js';

async function seedPublicMembership() {
  const org = await createTestOrg('owner-promo@example.com');
  const orgRow = await getDb().selectFrom('orgs').select(['public_slug']).where('id', '=', org.orgId).executeTakeFirstOrThrow();
  await getDb().updateTable('org_membership_policies').set({ enabled: true, public_page_enabled: true }).where('org_id', '=', org.orgId).execute();
  await getDb()
    .insertInto('org_stripe_accounts')
    .values({
      org_id: org.orgId,
      stripe_account_id: 'acct_promo_123',
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
  return { ...org, orgSlug: orgRow.public_slug, tierId: tier.id };
}

describe('promo codes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await truncateAll();
    process.env.STRIPE_SECRET_KEY = 'sk_test_promo_codes';
    __resetConfigForTests();
    loadConfig();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.STRIPE_SECRET_KEY;
    __resetConfigForTests();
    loadConfig();
  });

  it('supports admin create, update, list, and soft delete', async () => {
    const app = await makeApp();
    try {
      const seeded = await seedPublicMembership();
      const token = await loginToken(app, 'owner-promo@example.com');

      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${seeded.orgId}/promo-codes`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: 'spring10',
          description: 'Spring campaign',
          discountType: 'percent',
          discountPercent: 10,
          membershipTierId: seeded.tierId,
          maxRedemptions: 5,
        },
      });
      expect(created.statusCode).toBe(200);
      const promo = JSON.parse(created.body) as { data: { id: string; code: string; discountPercent: number } };
      expect(promo.data).toMatchObject({ code: 'SPRING10', discountPercent: 10 });

      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${seeded.orgId}/promo-codes/${promo.data.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { discountAmountCents: 750, description: null },
      });
      expect(updated.statusCode).toBe(200);
      expect(JSON.parse(updated.body)).toMatchObject({ data: { discountType: 'amount', discountAmountCents: 750, discountPercent: null } });

      const list = await app.inject({ method: 'GET', url: `/api/v1/orgs/${seeded.orgId}/promo-codes`, headers: { authorization: `Bearer ${token}` } });
      expect(list.statusCode).toBe(200);
      expect((JSON.parse(list.body) as { data: unknown[] }).data).toHaveLength(1);

      const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/orgs/${seeded.orgId}/promo-codes/${promo.data.id}`, headers: { authorization: `Bearer ${token}` } });
      expect(deleted.statusCode).toBe(200);
      const afterDelete = await app.inject({ method: 'GET', url: `/api/v1/orgs/${seeded.orgId}/promo-codes`, headers: { authorization: `Bearer ${token}` } });
      expect((JSON.parse(afterDelete.body) as { data: unknown[] }).data).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('validates expiry, tier scoping, and redemption limits before checkout', async () => {
    const app = await makeApp();
    try {
      const seeded = await seedPublicMembership();
      const otherTier = await getDb()
        .insertInto('membership_tiers')
        .values({ org_id: seeded.orgId, slug: 'solo', name: 'Solo', price_cents: 2500, billing_interval: 'year', active: true })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await getDb()
        .insertInto('promo_codes')
        .values({
          org_id: seeded.orgId,
          code: 'HOUSEHOLD',
          discount_type: 'percent',
          discount_percent: 20,
          membership_tier_id: seeded.tierId,
          max_redemptions: 1,
        })
        .execute();
      await getDb()
        .insertInto('promo_codes')
        .values({
          org_id: seeded.orgId,
          code: 'OLD',
          discount_type: 'amount',
          discount_amount_cents: 500,
          expires_at: new Date('2020-01-01T00:00:00Z'),
        })
        .execute();

      const wrongTier = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${seeded.orgSlug}/membership-promo-codes/validate`,
        payload: { tierId: otherTier.id, code: 'HOUSEHOLD' },
      });
      expect(wrongTier.statusCode).toBe(409);

      const expired = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${seeded.orgSlug}/membership-promo-codes/validate`,
        payload: { tierId: seeded.tierId, code: 'OLD' },
      });
      expect(expired.statusCode).toBe(409);

      const valid = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${seeded.orgSlug}/membership-promo-codes/validate`,
        payload: { tierId: seeded.tierId, code: 'HOUSEHOLD' },
      });
      expect(valid.statusCode).toBe(200);
      expect(JSON.parse(valid.body)).toMatchObject({ data: { discountCents: 1000, finalAmountCents: 4000 } });
    } finally {
      await app.close();
    }
  });

  it('applies a promo code to Stripe checkout and increments redemption count atomically', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get('line_items[0][price_data][unit_amount]')).toBe('4000');
      expect(body.get('metadata[promoCode]')).toBe('SAVE20');
      expect(body.get('metadata[originalAmountCents]')).toBe('5000');
      expect(body.get('metadata[discountCents]')).toBe('1000');
      return new Response(JSON.stringify({ id: 'cs_promo_123', url: 'https://checkout.stripe.test/promo' }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const app = await makeApp();
    try {
      const seeded = await seedPublicMembership();
      const promo = await getDb()
        .insertInto('promo_codes')
        .values({
          org_id: seeded.orgId,
          code: 'SAVE20',
          discount_type: 'percent',
          discount_percent: 20,
          max_redemptions: 1,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${seeded.orgSlug}/memberships/checkout`,
        payload: {
          tierId: seeded.tierId,
          email: 'member@example.com',
          promoCode: 'save20',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ data: { discountCents: 1000 } });

      const row = await getDb().selectFrom('promo_codes').select(['redeemed_count']).where('id', '=', promo.id).executeTakeFirstOrThrow();
      expect(row.redeemed_count).toBe(1);
      const membership = await getDb().selectFrom('memberships').select(['metadata']).where('org_id', '=', seeded.orgId).executeTakeFirstOrThrow();
      expect(membership.metadata).toMatchObject({ promoCode: 'SAVE20', discountCents: 1000 });

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/public/orgs/${seeded.orgSlug}/memberships/checkout`,
        payload: {
          tierId: seeded.tierId,
          email: 'second@example.com',
          promoCode: 'SAVE20',
        },
      });
      expect(second.statusCode).toBe(409);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
