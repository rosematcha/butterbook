import type { FastifyInstance } from 'fastify';
import {
  publicMembershipCheckoutSchema,
  publicMembershipOrgParamSchema,
  type Permission,
} from '@butterbook/shared';
import { getDb, sql, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { publicTier } from '../services/memberships.js';
import { reservePromoCodeInTx } from '../services/promo-codes.js';
import { createStripeCheckoutSession } from '../services/stripe.js';

export function registerPublicMembershipRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/public/orgs/:orgSlug/membership-tiers',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug } = publicMembershipOrgParamSchema.parse(req.params);
      const org = await resolvePublicMembershipOrg(orgSlug);
      return withOrgRead(org.id, async (tx) => {
        const policy = await tx
          .selectFrom('org_membership_policies')
          .select(['enabled', 'public_page_enabled'])
          .where('org_id', '=', org.id)
          .executeTakeFirst();
        if (!policy?.enabled || !policy.public_page_enabled) throw new NotFoundError();
        const tiers = await tx
          .selectFrom('membership_tiers')
          .selectAll()
          .where('org_id', '=', org.id)
          .where('active', '=', true)
          .where('deleted_at', 'is', null)
          .orderBy('sort_order')
          .orderBy('name')
          .execute();
        return {
          data: {
            org: {
              id: org.id,
              slug: org.public_slug,
              name: org.name,
              logoUrl: org.logo_url,
              theme: org.theme,
            },
            tiers: tiers.map(publicTier),
          },
        };
      });
    },
  );

  app.post(
    '/api/v1/public/orgs/:orgSlug/memberships/checkout',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug } = publicMembershipOrgParamSchema.parse(req.params);
      const body = publicMembershipCheckoutSchema.parse(req.body);
      const org = await resolvePublicMembershipOrg(orgSlug);
      const actor = {
        userId: null,
        orgId: org.id,
        isSuperadmin: false,
        permissions: new Set<Permission>(),
        actorType: 'guest' as const,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      };

      return withOrgContext(org.id, actor, async ({ tx, audit }) => {
        const [policy, tier, stripe] = await Promise.all([
          tx.selectFrom('org_membership_policies').select(['enabled', 'public_page_enabled']).where('org_id', '=', org.id).executeTakeFirst(),
          tx
            .selectFrom('membership_tiers')
            .selectAll()
            .where('org_id', '=', org.id)
            .where('id', '=', body.tierId)
            .where('active', '=', true)
            .where('deleted_at', 'is', null)
            .executeTakeFirst(),
          tx
            .selectFrom('org_stripe_accounts')
            .select(['stripe_account_id', 'charges_enabled', 'default_currency'])
            .where('org_id', '=', org.id)
            .where('disconnected_at', 'is', null)
            .executeTakeFirst(),
        ]);
        if (!policy?.enabled || !policy.public_page_enabled) throw new NotFoundError();
        if (!tier) throw new NotFoundError('Membership tier not found.');
        if (!stripe?.charges_enabled) throw new ConflictError('This organization is not ready to accept online membership payments.');

        const promo = body.promoCode
          ? await reservePromoCodeInTx(tx, { orgId: org.id, tierId: tier.id, code: body.promoCode, amountCents: tier.price_cents })
          : null;
        const checkoutAmountCents = promo?.finalAmountCents ?? tier.price_cents;
        if (checkoutAmountCents <= 0) throw new ConflictError('Promo code reduces this membership to zero; online checkout requires a positive amount.');

        const visitor = await tx
          .insertInto('visitors')
          .values({
            org_id: org.id,
            email: body.email,
            first_name: body.firstName ?? null,
            last_name: body.lastName ?? null,
            phone: body.phone ?? null,
          })
          .onConflict((oc) =>
            oc
              .columns(['org_id', 'email'])
              .where('deleted_at', 'is', null)
              .doUpdateSet({
                first_name: sql`coalesce(visitors.first_name, excluded.first_name)`,
                last_name: sql`coalesce(visitors.last_name, excluded.last_name)`,
                phone: sql`coalesce(visitors.phone, excluded.phone)`,
                updated_at: new Date(),
              }),
          )
          .returning(['id'])
          .executeTakeFirstOrThrow();

        const membership = await tx
          .insertInto('memberships')
          .values({
            org_id: org.id,
            visitor_id: visitor.id,
            tier_id: tier.id,
            status: 'pending',
            started_at: null,
            expires_at: null,
            auto_renew: tier.billing_interval === 'month' || tier.billing_interval === 'year',
            metadata: JSON.stringify({
              source: 'stripe_checkout',
              ...(promo
                ? {
                    promoCodeId: promo.row.id,
                    promoCode: promo.row.code,
                    originalAmountCents: tier.price_cents,
                    discountCents: promo.discountCents,
                  }
                : {}),
            }),
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();

        const session = await createStripeCheckoutSession({
          orgSlug,
          stripeAccountId: stripe.stripe_account_id,
          membershipId: membership.id,
          visitorId: visitor.id,
          tierId: tier.id,
          tierName: tier.name,
          tierDescription: tier.description,
          amountCents: checkoutAmountCents,
          currency: stripe.default_currency,
          billingInterval: tier.billing_interval,
          customerEmail: body.email,
          ...(promo
            ? {
                promoCodeId: promo.row.id,
                promoCode: promo.row.code,
                originalAmountCents: tier.price_cents,
                discountCents: promo.discountCents,
              }
            : {}),
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
        });

        await tx
          .updateTable('memberships')
          .set({
            metadata: JSON.stringify({
              source: 'stripe_checkout',
              checkoutSessionId: session.id,
              ...(promo
                ? {
                    promoCodeId: promo.row.id,
                    promoCode: promo.row.code,
                    originalAmountCents: tier.price_cents,
                    discountCents: promo.discountCents,
                  }
                : {}),
            }),
          })
          .where('org_id', '=', org.id)
          .where('id', '=', membership.id)
          .execute();
        await audit({
          action: 'membership.checkout_started',
          targetType: 'membership',
          targetId: membership.id,
          diff: { after: { tierId: tier.id, visitorId: visitor.id, checkoutSessionId: session.id, promoCodeId: promo?.row.id ?? null } },
        });

        return { data: { url: session.url, sessionId: session.id, membershipId: membership.id, discountCents: promo?.discountCents ?? 0 } };
      });
    },
  );
}

async function resolvePublicMembershipOrg(orgSlug: string) {
  const org = await getDb()
    .selectFrom('orgs')
    .select(['id', 'public_slug', 'name', 'logo_url', 'theme'])
    .where('public_slug', '=', orgSlug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw new NotFoundError();
  return org;
}
