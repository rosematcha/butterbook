import { sql, type Tx } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

interface MembershipRow {
  id: string;
  visitor_id: string;
  tier_id: string;
  status: 'pending' | 'active' | 'expired' | 'lapsed' | 'cancelled' | 'refunded';
  started_at: Date | null;
  expires_at: Date | null;
  auto_renew: boolean;
  cancelled_at: Date | null;
  cancelled_reason: string | null;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
  visitor_email: string;
  visitor_first_name: string | null;
  visitor_last_name: string | null;
  tier_slug: string;
  tier_name: string;
  tier_price_cents: number;
  tier_billing_interval: string;
}

export function publicTier(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  duration_days: number | null;
  guest_passes_included: number;
  member_only_event_access: boolean;
  max_active: number | null;
  sort_order: number;
  active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    billingInterval: row.billing_interval,
    durationDays: row.duration_days,
    guestPassesIncluded: row.guest_passes_included,
    memberOnlyEventAccess: row.member_only_event_access,
    maxActive: row.max_active,
    sortOrder: row.sort_order,
    active: row.active,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function publicMembership(row: MembershipRow) {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    tierId: row.tier_id,
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    autoRenew: row.auto_renew,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancelledReason: row.cancelled_reason,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    visitor: {
      email: row.visitor_email,
      firstName: row.visitor_first_name,
      lastName: row.visitor_last_name,
    },
    tier: {
      slug: row.tier_slug,
      name: row.tier_name,
      priceCents: row.tier_price_cents,
      billingInterval: row.tier_billing_interval,
    },
  };
}

export async function selectMembership(tx: Tx, orgId: string, membershipId: string) {
  return tx
    .selectFrom('memberships')
    .innerJoin('visitors', 'visitors.id', 'memberships.visitor_id')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .selectAll('memberships')
    .select([
      'visitors.email as visitor_email',
      'visitors.first_name as visitor_first_name',
      'visitors.last_name as visitor_last_name',
      'membership_tiers.slug as tier_slug',
      'membership_tiers.name as tier_name',
      'membership_tiers.price_cents as tier_price_cents',
      'membership_tiers.billing_interval as tier_billing_interval',
    ])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.id', '=', membershipId)
    .executeTakeFirst() as Promise<MembershipRow | undefined>;
}

export async function createMembershipInTx(
  tx: Tx,
  input: {
    orgId: string;
    visitorId: string;
    tierId: string;
    startsAt?: Date;
    expiresAt?: Date | null;
    autoRenew?: boolean;
    amountCents?: number;
    currency?: string;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const [visitor, tier] = await Promise.all([
    tx.selectFrom('visitors').select(['id', 'email']).where('org_id', '=', input.orgId).where('id', '=', input.visitorId).where('deleted_at', 'is', null).executeTakeFirst(),
    tx.selectFrom('membership_tiers').selectAll().where('org_id', '=', input.orgId).where('id', '=', input.tierId).where('deleted_at', 'is', null).executeTakeFirst(),
  ]);
  if (!visitor || !tier) throw new NotFoundError('Visitor or tier not found.');
  if (!tier.active) throw new ConflictError('Membership tier is inactive.');

  if (tier.max_active != null) {
    const count = await tx
      .selectFrom('memberships')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('org_id', '=', input.orgId)
      .where('tier_id', '=', tier.id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (Number(count?.c ?? 0) >= tier.max_active) throw new ConflictError('Membership tier is full.');
  }

  const startsAt = input.startsAt ?? new Date();
  const expiresAt = input.expiresAt === undefined ? defaultMembershipExpiry(startsAt, tier.duration_days, tier.billing_interval) : input.expiresAt;
  const membership = await tx
    .insertInto('memberships')
    .values({
      org_id: input.orgId,
      visitor_id: input.visitorId,
      tier_id: input.tierId,
      status: 'active',
      started_at: startsAt,
      expires_at: expiresAt,
      auto_renew: input.autoRenew ?? false,
      metadata: JSON.stringify(input.metadata ?? {}),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  await tx
    .insertInto('membership_payments')
    .values({
      membership_id: membership.id,
      org_id: input.orgId,
      amount_cents: input.amountCents ?? tier.price_cents,
      currency: input.currency ?? 'usd',
      source: 'manual',
      paid_at: new Date(),
      notes: input.notes ?? null,
    })
    .execute();

  return { membershipId: membership.id, visitorEmail: visitor.email, tierName: tier.name, expiresAt };
}

export async function cancelMembershipInTx(tx: Tx, orgId: string, membershipId: string, reason?: string | null) {
  const row = await tx
    .updateTable('memberships')
    .set({ status: 'cancelled', cancelled_at: new Date(), cancelled_reason: reason ?? null, auto_renew: false })
    .where('org_id', '=', orgId)
    .where('id', '=', membershipId)
    .where('status', 'in', ['pending', 'active', 'expired', 'lapsed'])
    .returning(['id', 'visitor_id', 'tier_id', 'expires_at'])
    .executeTakeFirst();
  if (!row) throw new NotFoundError();
  return row;
}

export async function renewMembershipInTx(
  tx: Tx,
  orgId: string,
  membershipId: string,
  input: { expiresAt?: Date | null; amountCents?: number; currency?: string; notes?: string | null },
) {
  const current = await tx
    .selectFrom('memberships')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select([
      'memberships.id',
      'memberships.expires_at',
      'memberships.tier_id',
      'membership_tiers.duration_days',
      'membership_tiers.billing_interval',
      'membership_tiers.price_cents',
    ])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.id', '=', membershipId)
    .executeTakeFirst();
  if (!current) throw new NotFoundError();
  const base = current.expires_at && current.expires_at > new Date() ? current.expires_at : new Date();
  const expiresAt = input.expiresAt === undefined ? defaultMembershipExpiry(base, current.duration_days, current.billing_interval) : input.expiresAt;
  await tx.updateTable('memberships').set({ status: 'active', expires_at: expiresAt, cancelled_at: null, cancelled_reason: null }).where('org_id', '=', orgId).where('id', '=', membershipId).execute();
  await tx
    .insertInto('membership_payments')
    .values({
      membership_id: membershipId,
      org_id: orgId,
      amount_cents: input.amountCents ?? current.price_cents,
      currency: input.currency ?? 'usd',
      source: 'manual',
      paid_at: new Date(),
      notes: input.notes ?? null,
    })
    .execute();
  return { expiresAt };
}

export async function activeMembershipSatisfiesTier(tx: Tx, orgId: string, visitorId: string, requiredTierId: string): Promise<boolean> {
  const required = await tx.selectFrom('membership_tiers').select(['sort_order']).where('org_id', '=', orgId).where('id', '=', requiredTierId).executeTakeFirst();
  if (!required) return false;
  const row = await tx
    .selectFrom('memberships')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select(['memberships.id'])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.visitor_id', '=', visitorId)
    .where('memberships.status', '=', 'active')
    .where((eb) => eb.or([eb('memberships.expires_at', 'is', null), eb('memberships.expires_at', '>', new Date())]))
    .where('membership_tiers.sort_order', '>=', required.sort_order)
    .executeTakeFirst();
  return Boolean(row);
}

export async function sweepMembershipStatus(tx: Tx, orgId: string, now = new Date()) {
  const expired = await tx
    .updateTable('memberships')
    .set({ status: 'expired' })
    .where('org_id', '=', orgId)
    .where('status', '=', 'active')
    .where('auto_renew', '=', false)
    .where('expires_at', 'is not', null)
    .where('expires_at', '<=', now)
    .returning(['id'])
    .execute();
  const policy = await tx.selectFrom('org_membership_policies').select(['grace_period_days']).where('org_id', '=', orgId).executeTakeFirst();
  const graceDays = policy?.grace_period_days ?? 14;
  const lapsed = await tx
    .updateTable('memberships')
    .set({ status: 'lapsed' })
    .where('org_id', '=', orgId)
    .where('status', '=', 'expired')
    .where('expires_at', 'is not', null)
    .where(sql<boolean>`expires_at + (${graceDays} || ' days')::interval <= ${now}`)
    .returning(['id'])
    .execute();
  return { expired: expired.length, lapsed: lapsed.length };
}

export function defaultMembershipExpiry(start: Date, durationDays: number | null, interval: string): Date | null {
  if (interval === 'lifetime') return null;
  const days = durationDays ?? (interval === 'month' ? 30 : 365);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}
