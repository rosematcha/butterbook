import type { FastifyInstance } from 'fastify';
import { stripeConnectCallbackQuerySchema, stripeOrgParamSchema } from '@butterbook/shared';
import { sql, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError } from '../errors/index.js';
import { getConfig } from '../config.js';
import {
  buildStripeConnectUrl,
  exchangeStripeConnectCode,
  verifyStripeConnectState,
} from '../services/stripe.js';

export function registerStripeRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/stripe', async (req) => {
    const { orgId } = stripeOrgParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'stripe.manage');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('org_stripe_accounts')
        .select(['stripe_account_id', 'charges_enabled', 'payouts_enabled', 'default_currency', 'connected_at', 'disconnected_at'])
        .where('org_id', '=', orgId)
        .executeTakeFirst();
      return {
        data: row
          ? {
              connected: row.disconnected_at === null,
              stripeAccountId: row.stripe_account_id,
              chargesEnabled: row.charges_enabled,
              payoutsEnabled: row.payouts_enabled,
              defaultCurrency: row.default_currency,
              connectedAt: row.connected_at,
              disconnectedAt: row.disconnected_at,
            }
          : {
              connected: false,
              stripeAccountId: null,
              chargesEnabled: false,
              payoutsEnabled: false,
              defaultCurrency: 'usd',
              connectedAt: null,
              disconnectedAt: null,
            },
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/stripe/connect', async (req) => {
    const { orgId } = stripeOrgParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'stripe.manage');
    return { data: { url: buildStripeConnectUrl(orgId) } };
  });

  app.delete('/api/v1/orgs/:orgId/stripe', async (req) => {
    const { orgId } = stripeOrgParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'stripe.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await tx
        .updateTable('org_stripe_accounts')
        .set({ disconnected_at: new Date(), charges_enabled: false, payouts_enabled: false })
        .where('org_id', '=', orgId)
        .execute();
      await audit({ action: 'stripe.disconnected', targetType: 'org', targetId: orgId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/stripe/connect/callback', async (req, reply) => {
    const query = stripeConnectCallbackQuerySchema.parse(req.query);
    const { orgId } = verifyStripeConnectState(query.state);
    if (query.error) {
      throw new ConflictError(query.error_description ?? query.error);
    }
    if (!query.code) throw new ConflictError('Missing Stripe Connect code');
    const account = await exchangeStripeConnectCode(query.code);
    await withOrgContext(
      orgId,
      { userId: null, orgId, isSuperadmin: false, permissions: new Set(), actorType: 'system', ip: req.ip, userAgent: req.headers['user-agent'] ?? null },
      async ({ tx, audit }) => {
        await tx
          .insertInto('org_stripe_accounts')
          .values({
            org_id: orgId,
            stripe_account_id: account.stripeAccountId,
            charges_enabled: account.chargesEnabled,
            payouts_enabled: account.payoutsEnabled,
            default_currency: account.defaultCurrency,
            disconnected_at: null,
          })
          .onConflict((oc) =>
            oc.column('org_id').doUpdateSet({
              stripe_account_id: sql`excluded.stripe_account_id`,
              charges_enabled: sql`excluded.charges_enabled`,
              payouts_enabled: sql`excluded.payouts_enabled`,
              default_currency: sql`excluded.default_currency`,
              disconnected_at: null,
              connected_at: new Date(),
            }),
          )
          .execute();
        await audit({ action: 'stripe.connected', targetType: 'org', targetId: orgId, diff: { after: { stripeAccountId: account.stripeAccountId } } });
      },
    );
    return reply.redirect(`${getConfig().APP_BASE_URL.replace(/\/$/, '')}/app/memberships/policies`);
  });
}
