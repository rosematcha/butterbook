import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPromoCodeSchema,
  listPromoCodesQuerySchema,
  promoCodeIdParamSchema,
  publicPromoCodeValidationSchema,
  publicMembershipOrgParamSchema,
  updatePromoCodeSchema,
} from '@butterbook/shared';
import { getDb, type Tx, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';
import { publicPromoCode, validatePromoCodeInTx } from '../services/promo-codes.js';

const orgParam = z.object({ orgId: z.string().uuid() });

export function registerPromoCodeRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/promo-codes', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listPromoCodesQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'promo_codes.manage');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let query = tx.selectFrom('promo_codes').selectAll().where('org_id', '=', orgId);
      if (!includeDeleted) query = query.where('deleted_at', 'is', null);
      const rows = await query.orderBy('created_at', 'desc').execute();
      return { data: rows.map(publicPromoCode) };
    });
  });

  app.post('/api/v1/orgs/:orgId/promo-codes', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createPromoCodeSchema.parse(req.body);
    await req.requirePermission(orgId, 'promo_codes.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.membershipTierId) await assertTierBelongsToOrg(tx, orgId, body.membershipTierId);
      const row = await tx
        .insertInto('promo_codes')
        .values({
          org_id: orgId,
          code: body.code,
          description: body.description ?? null,
          discount_type: body.discountType,
          discount_percent: body.discountType === 'percent' ? body.discountPercent ?? null : null,
          discount_amount_cents: body.discountType === 'amount' ? body.discountAmountCents ?? null : null,
          membership_tier_id: body.membershipTierId ?? null,
          starts_at: body.startsAt ? new Date(body.startsAt) : null,
          expires_at: body.expiresAt ? new Date(body.expiresAt) : null,
          max_redemptions: body.maxRedemptions ?? null,
          active: body.active ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({ action: 'promo_code.created', targetType: 'promo_code', targetId: row.id, diff: { after: body } });
      return { data: publicPromoCode(row) };
    });
  });

  app.get('/api/v1/orgs/:orgId/promo-codes/:promoCodeId', async (req) => {
    const { orgId, promoCodeId } = promoCodeIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'promo_codes.manage');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx.selectFrom('promo_codes').selectAll().where('org_id', '=', orgId).where('id', '=', promoCodeId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: publicPromoCode(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/promo-codes/:promoCodeId', async (req) => {
    const { orgId, promoCodeId } = promoCodeIdParamSchema.parse(req.params);
    const body = updatePromoCodeSchema.parse(req.body);
    await req.requirePermission(orgId, 'promo_codes.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.membershipTierId) await assertTierBelongsToOrg(tx, orgId, body.membershipTierId);
      const current = await tx.selectFrom('promo_codes').selectAll().where('org_id', '=', orgId).where('id', '=', promoCodeId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!current) throw new NotFoundError();

      const nextType = body.discountType ?? (body.discountPercent !== undefined ? 'percent' : body.discountAmountCents !== undefined ? 'amount' : current.discount_type);
      const nextPercent = nextType === 'percent'
        ? body.discountPercent === undefined ? current.discount_percent : body.discountPercent
        : null;
      const nextAmount = nextType === 'amount'
        ? body.discountAmountCents === undefined ? current.discount_amount_cents : body.discountAmountCents
        : null;
      if (nextType === 'percent' && nextPercent == null) throw new ConflictError('Percent promo codes require discountPercent.');
      if (nextType === 'amount' && nextAmount == null) throw new ConflictError('Amount promo codes require discountAmountCents.');

      const updates: Record<string, unknown> = {
        discount_type: nextType,
        discount_percent: nextPercent,
        discount_amount_cents: nextAmount,
      };
      if (body.code !== undefined) updates.code = body.code;
      if (body.description !== undefined) updates.description = body.description;
      if (body.membershipTierId !== undefined) updates.membership_tier_id = body.membershipTierId;
      if (body.startsAt !== undefined) updates.starts_at = body.startsAt === null ? null : new Date(body.startsAt);
      if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt === null ? null : new Date(body.expiresAt);
      if (body.maxRedemptions !== undefined) updates.max_redemptions = body.maxRedemptions;
      if (body.active !== undefined) updates.active = body.active;

      const row = await tx.updateTable('promo_codes').set(updates).where('org_id', '=', orgId).where('id', '=', promoCodeId).where('deleted_at', 'is', null).returningAll().executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'promo_code.updated', targetType: 'promo_code', targetId: promoCodeId, diff: { after: body } });
      return { data: publicPromoCode(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/promo-codes/:promoCodeId', async (req) => {
    const { orgId, promoCodeId } = promoCodeIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'promo_codes.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx.updateTable('promo_codes').set({ deleted_at: new Date(), active: false }).where('org_id', '=', orgId).where('id', '=', promoCodeId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'promo_code.deleted', targetType: 'promo_code', targetId: promoCodeId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/public/orgs/:orgSlug/membership-promo-codes/validate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { orgSlug } = publicMembershipOrgParamSchema.parse(req.params);
    const body = publicPromoCodeValidationSchema.parse(req.body);
    const org = await getDb().selectFrom('orgs').select(['id']).where('public_slug', '=', orgSlug).where('deleted_at', 'is', null).executeTakeFirst();
    if (!org) throw new NotFoundError();
    return withOrgRead(org.id, async (tx) => {
      const tier = await tx.selectFrom('membership_tiers').select(['price_cents']).where('org_id', '=', org.id).where('id', '=', body.tierId).where('active', '=', true).where('deleted_at', 'is', null).executeTakeFirst();
      if (!tier) throw new NotFoundError('Membership tier not found.');
      const promo = await validatePromoCodeInTx(tx, { orgId: org.id, tierId: body.tierId, code: body.code, amountCents: tier.price_cents });
      return {
        data: {
          code: promo.row.code,
          discountType: promo.row.discount_type,
          discountPercent: promo.row.discount_percent,
          discountAmountCents: promo.row.discount_amount_cents,
          discountCents: promo.discountCents,
          finalAmountCents: promo.finalAmountCents,
        },
      };
    });
  });
}

async function assertTierBelongsToOrg(tx: Tx, orgId: string, tierId: string): Promise<void> {
  const tier = await tx.selectFrom('membership_tiers').select(['id']).where('org_id', '=', orgId).where('id', '=', tierId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!tier) throw new NotFoundError('Membership tier not found.');
}
