import crypto from 'node:crypto';
import { sql, type OutboxEventInput, type Tx } from '../db/index.js';
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

  await issueGuestPassesForMembershipInTx(tx, input.orgId, membership.id);

  return { membershipId: membership.id, visitorEmail: visitor.email, tierName: tier.name, expiresAt };
}

export async function issueGuestPassesForMembershipInTx(tx: Tx, orgId: string, membershipId: string): Promise<number> {
  const membership = await tx
    .selectFrom('memberships')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select(['memberships.id', 'memberships.expires_at', 'membership_tiers.guest_passes_included'])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.id', '=', membershipId)
    .executeTakeFirst();
  if (!membership) throw new NotFoundError();

  const included = membership.guest_passes_included;
  if (included <= 0) return 0;

  const existing = await tx
    .selectFrom('guest_passes')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('org_id', '=', orgId)
    .where('membership_id', '=', membershipId)
    .executeTakeFirst();
  const missing = included - Number(existing?.c ?? 0);
  if (missing <= 0) return 0;

  for (let i = 0; i < missing; i += 1) {
    await tx
      .insertInto('guest_passes')
      .values({
        org_id: orgId,
        membership_id: membershipId,
        code: await uniqueGuestPassCode(tx),
        expires_at: membership.expires_at,
      })
      .execute();
  }
  return missing;
}

export async function redeemGuestPassInTx(
  tx: Tx,
  input: { orgId: string; code: string; visitId: string; now?: Date },
): Promise<{ id: string; membershipId: string }> {
  const now = input.now ?? new Date();
  const normalizedCode = normalizeGuestPassCode(input.code);
  const row = await tx
    .selectFrom('guest_passes')
    .select(['id', 'membership_id', 'expires_at', 'redeemed_at'])
    .where('org_id', '=', input.orgId)
    .where('code', '=', normalizedCode)
    .executeTakeFirst();
  if (!row) throw new NotFoundError('Guest pass not found.');
  if (row.redeemed_at) throw new ConflictError('Guest pass has already been redeemed.');
  if (row.expires_at && row.expires_at <= now) throw new ConflictError('Guest pass has expired.');

  const redeemed = await tx
    .updateTable('guest_passes')
    .set({ redeemed_at: now, redeemed_by_visit_id: input.visitId })
    .where('org_id', '=', input.orgId)
    .where('id', '=', row.id)
    .where('redeemed_at', 'is', null)
    .returning(['id'])
    .executeTakeFirst();
  if (!redeemed) throw new ConflictError('Guest pass has already been redeemed.');
  return { id: redeemed.id, membershipId: row.membership_id };
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

type MembershipStatusEvent = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tierName: string;
  expiresAt: Date | null;
};

type EmitMembershipEvent = (input: OutboxEventInput) => Promise<void>;

export async function sweepMembershipStatus(tx: Tx, orgId: string, now = new Date(), emit?: EmitMembershipEvent) {
  const expired = await tx
    .updateTable('memberships')
    .set({ status: 'expired' })
    .where('org_id', '=', orgId)
    .where('status', '=', 'active')
    .where('auto_renew', '=', false)
    .where('expires_at', 'is not', null)
    .where('expires_at', '<=', now)
    .returning(['id', 'visitor_id', 'tier_id', 'expires_at'])
    .execute();
  const policy = await tx.selectFrom('org_membership_policies').select(['grace_period_days', 'renewal_reminder_days']).where('org_id', '=', orgId).executeTakeFirst();
  const graceDays = policy?.grace_period_days ?? 14;
  const lapsed = await tx
    .updateTable('memberships')
    .set({ status: 'lapsed' })
    .where('org_id', '=', orgId)
    .where('status', '=', 'expired')
    .where('expires_at', 'is not', null)
    .where(sql<boolean>`expires_at + (${graceDays} || ' days')::interval <= ${now}`)
    .returning(['id', 'visitor_id', 'tier_id', 'expires_at'])
    .execute();

  const reminders = await queueRenewalReminders(tx, orgId, policy?.renewal_reminder_days ?? [30, 7], now, emit);

  if (emit) {
    await emitMembershipStatusEvents(tx, orgId, 'membership.expired', expired, emit);
    await emitMembershipStatusEvents(tx, orgId, 'membership.lapsed', lapsed, emit);
  }

  return { expired: expired.length, lapsed: lapsed.length, reminders };
}

export function defaultMembershipExpiry(start: Date, durationDays: number | null, interval: string): Date | null {
  if (interval === 'lifetime') return null;
  const days = durationDays ?? (interval === 'month' ? 30 : 365);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeGuestPassCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

async function uniqueGuestPassCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `GP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const existing = await tx.selectFrom('guest_passes').select(['id']).where('code', '=', code).executeTakeFirst();
    if (!existing) return code;
  }
  throw new ConflictError('Could not allocate a unique guest pass code.');
}

async function emitMembershipStatusEvents(
  tx: Tx,
  orgId: string,
  eventType: 'membership.expired' | 'membership.lapsed',
  rows: Array<{ id: string; visitor_id: string; tier_id: string; expires_at: Date | null }>,
  emit: EmitMembershipEvent,
): Promise<void> {
  if (rows.length === 0) return;
  const details = await membershipEventDetails(tx, orgId, rows.map((r) => r.id));
  for (const row of details) {
    await emit({
      eventType,
      aggregateType: 'membership',
      aggregateId: row.id,
      payload: membershipPayload(row),
    });
  }
}

async function queueRenewalReminders(
  tx: Tx,
  orgId: string,
  rawDays: number[],
  now: Date,
  emit?: EmitMembershipEvent,
): Promise<number> {
  if (!emit) return 0;
  const days = [...new Set(rawDays.filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => b - a);
  if (days.length === 0) return 0;
  const maxDays = Math.max(...days);
  const horizon = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
  const candidates = await tx
    .selectFrom('memberships')
    .innerJoin('visitors', 'visitors.id', 'memberships.visitor_id')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select([
      'memberships.id',
      'memberships.expires_at as expiresAt',
      'visitors.email',
      'visitors.first_name as firstName',
      'visitors.last_name as lastName',
      'membership_tiers.name as tierName',
    ])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.status', '=', 'active')
    .where('memberships.auto_renew', '=', false)
    .where('memberships.expires_at', 'is not', null)
    .where('memberships.expires_at', '>', now)
    .where('memberships.expires_at', '<=', horizon)
    .execute();

  let queued = 0;
  for (const row of candidates) {
    if (!row.expiresAt) continue;
    for (const daysOut of days) {
      if (utcDateKey(addDays(now, daysOut)) !== utcDateKey(row.expiresAt)) continue;
      const inserted = await tx
        .insertInto('idempotency_keys')
        .values({
          key: `membership-renewal-reminder:${row.id}:${daysOut}:${utcDateKey(row.expiresAt)}`,
          scope: 'membership-sweep',
          org_id: orgId,
          request_hash: 'membership-renewal-reminder',
          response_status: 202,
          response_body: { membershipId: row.id, daysOut, expiresAt: row.expiresAt.toISOString() },
          expires_at: addDays(row.expiresAt, 45),
        })
        .onConflict((oc) => oc.columns(['key', 'scope']).doNothing())
        .returning(['id'])
        .executeTakeFirst();
      if (!inserted) continue;
      queued += 1;
      await emit({
        eventType: 'membership.renewal_reminder',
        aggregateType: 'membership',
        aggregateId: row.id,
        payload: membershipPayload({
          id: row.id,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          tierName: row.tierName,
          expiresAt: row.expiresAt,
        }, { daysOut }),
      });
    }
  }
  return queued;
}

async function membershipEventDetails(tx: Tx, orgId: string, membershipIds: string[]): Promise<MembershipStatusEvent[]> {
  if (membershipIds.length === 0) return [];
  return tx
    .selectFrom('memberships')
    .innerJoin('visitors', 'visitors.id', 'memberships.visitor_id')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select([
      'memberships.id',
      'memberships.expires_at as expiresAt',
      'visitors.email',
      'visitors.first_name as firstName',
      'visitors.last_name as lastName',
      'membership_tiers.name as tierName',
    ])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.id', 'in', membershipIds)
    .execute();
}

function membershipPayload(row: MembershipStatusEvent, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const visitorName = [row.firstName, row.lastName].filter(Boolean).join(' ');
  return {
    to: row.email,
    visitorName,
    tierName: row.tierName,
    membershipId: row.id,
    expiresAt: row.expiresAt?.toISOString() ?? '',
    ...extra,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
