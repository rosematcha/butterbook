import type { Selectable } from 'kysely';
import type { Tx } from '../db/index.js';
import type { PromoCodesTable } from '../db/types.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

type PromoCodeRow = Selectable<PromoCodesTable>;

export function publicPromoCode(row: PromoCodeRow) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discount_type,
    discountPercent: row.discount_percent,
    discountAmountCents: row.discount_amount_cents,
    membershipTierId: row.membership_tier_id,
    startsAt: row.starts_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    active: row.active,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function calculatePromoDiscount(row: PromoCodeRow, amountCents: number): { discountCents: number; finalAmountCents: number } {
  const discountCents = row.discount_type === 'percent'
    ? Math.floor((amountCents * (row.discount_percent ?? 0)) / 100)
    : Math.min(row.discount_amount_cents ?? 0, amountCents);
  return {
    discountCents,
    finalAmountCents: Math.max(0, amountCents - discountCents),
  };
}

export async function validatePromoCodeInTx(
  tx: Tx,
  input: { orgId: string; tierId: string; code: string; amountCents: number; now?: Date },
) {
  const now = input.now ?? new Date();
  const row = await tx
    .selectFrom('promo_codes')
    .selectAll()
    .where('org_id', '=', input.orgId)
    .where('code', '=', input.code.toUpperCase())
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw new NotFoundError('Promo code not found.');
  assertPromoUsable(row, input.tierId, now);
  return { row, ...calculatePromoDiscount(row, input.amountCents) };
}

export async function reservePromoCodeInTx(
  tx: Tx,
  input: { orgId: string; tierId: string; code: string; amountCents: number; now?: Date },
) {
  const now = input.now ?? new Date();
  const row = await tx
    .selectFrom('promo_codes')
    .selectAll()
    .where('org_id', '=', input.orgId)
    .where('code', '=', input.code.toUpperCase())
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new NotFoundError('Promo code not found.');
  assertPromoUsable(row, input.tierId, now);
  await tx
    .updateTable('promo_codes')
    .set({ redeemed_count: row.redeemed_count + 1 })
    .where('org_id', '=', input.orgId)
    .where('id', '=', row.id)
    .execute();
  return { row, ...calculatePromoDiscount(row, input.amountCents) };
}

function assertPromoUsable(row: PromoCodeRow, tierId: string, now: Date): void {
  if (!row.active) throw new ConflictError('Promo code is inactive.');
  if (row.starts_at && row.starts_at > now) throw new ConflictError('Promo code is not active yet.');
  if (row.expires_at && row.expires_at <= now) throw new ConflictError('Promo code has expired.');
  if (row.membership_tier_id && row.membership_tier_id !== tierId) {
    throw new ConflictError('Promo code does not apply to this membership tier.');
  }
  if (row.max_redemptions !== null && row.redeemed_count >= row.max_redemptions) {
    throw new ConflictError('Promo code has reached its redemption limit.');
  }
}
