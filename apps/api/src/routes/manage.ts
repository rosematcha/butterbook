import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isoDateSchema, type ActorContext } from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { AuthenticationError, ConflictError, NotFoundError, PermissionError } from '../errors/index.js';
import { verifyManageToken } from '../utils/manage-token.js';
import { slotsForDate, type SlotRounding } from '../services/availability.js';
import { cancelMembershipInTx, publicMembership, selectMembership } from '../services/memberships.js';
import { cancelStripeSubscription } from '../services/stripe.js';
import { redactVisitorInTx } from '../services/contacts.js';
import { cancelVisitInTx, rescheduleVisitInTx } from '../services/visits.js';
import { buildCalendar } from '../services/ical.js';

const tokenParam = z.object({ token: z.string().min(10) });
const membershipTokenParam = tokenParam.extend({ membershipId: z.string().uuid() });

const rescheduleBody = z.object({ scheduledAt: z.string().datetime() });
const cancelMembershipBody = z
  .object({
    reason: z.string().max(1000).nullable().optional(),
  })
  .strict();

function selfServeActor(orgId: string, ip: string | null, userAgent: string | null): ActorContext {
  return {
    userId: null,
    orgId,
    isSuperadmin: false,
    permissions: new Set(),
    actorType: 'guest',
    ip,
    userAgent,
  };
}

// Resolve a token → visit row. The token lookup itself is the bootstrap path
// (similar to the kiosk qr_token lookup in routes/kiosk.ts), so it goes
// through `getDb()` directly with no org context set. Once we have the visit
// + orgId, every downstream read/mutation uses withOrgRead / withOrgContext.
async function resolveToken(token: string): Promise<{
  visit: {
    id: string;
    org_id: string;
    location_id: string;
    event_id: string | null;
    visitor_id: string | null;
    status: string;
    scheduled_at: Date;
    form_response: unknown;
    pii_redacted: boolean;
  };
}> {
  const decoded = verifyManageToken(token);
  if (!decoded) throw new AuthenticationError('Invalid or expired manage token.');
  const visit = await getDb()
    .selectFrom('visits')
    .selectAll()
    .where('id', '=', decoded.visitId)
    .executeTakeFirst();
  if (!visit) throw new NotFoundError('Visit not found.');
  return { visit: visit as never };
}

async function loadMembershipPolicy(tx: import('../db/index.js').Tx, orgId: string): Promise<{
  self_cancel_enabled: boolean;
}> {
  const row = await tx
    .selectFrom('org_membership_policies')
    .select(['self_cancel_enabled'])
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return { self_cancel_enabled: row?.self_cancel_enabled ?? true };
}

async function loadPolicy(tx: import('../db/index.js').Tx, orgId: string): Promise<{
  cancel_cutoff_hours: number;
  reschedule_cutoff_hours: number;
  self_cancel_enabled: boolean;
  self_reschedule_enabled: boolean;
  refund_policy_text: string | null;
}> {
  const row = await tx
    .selectFrom('org_booking_policies')
    .selectAll()
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  // Defaults mirror the migration, in case an org predates the backfill.
  if (!row) {
    return {
      cancel_cutoff_hours: 2,
      reschedule_cutoff_hours: 2,
      self_cancel_enabled: true,
      self_reschedule_enabled: false,
      refund_policy_text: null,
    };
  }
  return row;
}

function hoursUntil(target: Date | string): number {
  const t = target instanceof Date ? target.getTime() : new Date(target).getTime();
  return (t - Date.now()) / (60 * 60 * 1000);
}

export function registerManageRoutes(app: FastifyInstance): void {
  // Token lookups are unauthenticated but rate-limited to blunt brute-force
  // attempts against the HMAC. 30/min per-IP is generous for a visitor
  // clicking a link a few times.
  const rl = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/api/v1/manage/:token', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const { visit } = await resolveToken(token);
    return withOrgRead(visit.org_id, async (tx) => {
      const [org, location, event, policy] = await Promise.all([
        getDb()
          .selectFrom('orgs')
          .select(['id', 'name', 'public_slug', 'logo_url', 'theme', 'timezone', 'terminology'])
          .where('id', '=', visit.org_id)
          .executeTakeFirstOrThrow(),
        tx
          .selectFrom('locations')
          .select(['id', 'name', 'address', 'city', 'state', 'zip'])
          .where('id', '=', visit.location_id)
          .executeTakeFirst(),
        visit.event_id
          ? tx
              .selectFrom('events')
              .select(['id', 'title', 'starts_at', 'ends_at'])
              .where('id', '=', visit.event_id)
              .executeTakeFirst()
          : Promise.resolve(null),
        loadPolicy(tx, visit.org_id),
      ]);
      return {
        data: {
          visit: {
            id: visit.id,
            scheduledAt: visit.scheduled_at instanceof Date
              ? visit.scheduled_at.toISOString()
              : new Date(visit.scheduled_at).toISOString(),
            status: visit.status,
            locationId: visit.location_id,
            eventId: visit.event_id,
            formResponse: visit.pii_redacted ? null : visit.form_response,
          },
          org: {
            id: org.id,
            name: org.name,
            publicSlug: org.public_slug,
            logoUrl: org.logo_url,
            theme: org.theme,
            timezone: org.timezone,
            terminology: org.terminology,
          },
          location: location
            ? {
                id: location.id,
                name: location.name,
                address: location.address,
                city: location.city,
                state: location.state,
                zip: location.zip,
              }
            : null,
          event: event
            ? {
                id: event.id,
                title: event.title,
                startsAt:
                  event.starts_at instanceof Date
                    ? event.starts_at.toISOString()
                    : new Date(event.starts_at as unknown as string).toISOString(),
                endsAt:
                  event.ends_at instanceof Date
                    ? event.ends_at.toISOString()
                    : new Date(event.ends_at as unknown as string).toISOString(),
              }
            : null,
          policy: {
            cancelCutoffHours: policy.cancel_cutoff_hours,
            rescheduleCutoffHours: policy.reschedule_cutoff_hours,
            selfCancelEnabled: policy.self_cancel_enabled,
            selfRescheduleEnabled: policy.self_reschedule_enabled,
            refundPolicyText: policy.refund_policy_text,
          },
        },
      };
    });
  });

  app.get('/api/v1/manage/:token/calendar.ics', rl, async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const { visit } = await resolveToken(token);
    return withOrgRead(visit.org_id, async (tx) => {
      const [org, location, event] = await Promise.all([
        getDb()
          .selectFrom('orgs')
          .select(['name', 'terminology'])
          .where('id', '=', visit.org_id)
          .executeTakeFirstOrThrow(),
        tx
          .selectFrom('locations')
          .select(['name', 'address', 'city', 'state', 'zip'])
          .where('id', '=', visit.location_id)
          .executeTakeFirst(),
        visit.event_id
          ? tx
              .selectFrom('events')
              .select(['title', 'starts_at', 'ends_at'])
              .where('id', '=', visit.event_id)
              .executeTakeFirst()
          : Promise.resolve(null),
      ]);
      const start =
        event?.starts_at instanceof Date
          ? event.starts_at
          : event?.starts_at
            ? new Date(event.starts_at as unknown as string)
            : visit.scheduled_at instanceof Date
              ? visit.scheduled_at
              : new Date(visit.scheduled_at);
      const end =
        event?.ends_at instanceof Date
          ? event.ends_at
          : event?.ends_at
            ? new Date(event.ends_at as unknown as string)
            : new Date(start.getTime() + 60 * 60 * 1000);
      const locationText = location
        ? [location.name, location.address, [location.city, location.state].filter(Boolean).join(', '), location.zip]
            .filter((x) => x && String(x).trim())
            .join(', ')
        : null;
      const summary = event?.title ?? `${org.terminology === 'appointment' ? 'Appointment' : 'Visit'} — ${org.name}`;
      const ics = buildCalendar([
        {
          uid: `visit-${visit.id}@butterbook.app`,
          dtstamp: new Date(),
          start,
          end,
          summary,
          location: locationText,
        },
      ]);
      return reply
        .type('text/calendar; charset=utf-8')
        .header('content-disposition', `attachment; filename="booking-${visit.id}.ics"`)
        .header('cache-control', 'private, no-store')
        .send(ics);
    });
  });

  app.get('/api/v1/manage/:token/memberships', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const { visit } = await resolveToken(token);
    return withOrgRead(visit.org_id, async (tx) => {
      if (!visit.visitor_id) return { data: [] };
      const rows = await tx
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
        .where('memberships.org_id', '=', visit.org_id)
        .where('memberships.visitor_id', '=', visit.visitor_id)
        .where('memberships.status', 'in', ['pending', 'active', 'expired', 'lapsed'])
        .orderBy('memberships.created_at', 'desc')
        .execute();
      return { data: rows.map((row) => publicMembership(row)) };
    });
  });

  app.post('/api/v1/manage/:token/memberships/:membershipId/cancel', rl, async (req) => {
    const { token, membershipId } = membershipTokenParam.parse(req.params);
    const body = cancelMembershipBody.parse(req.body ?? {});
    const { visit } = await resolveToken(token);
    if (!visit.visitor_id) throw new NotFoundError('Membership not found.');
    const actor = selfServeActor(
      visit.org_id,
      req.ip ?? null,
      (req.headers['user-agent'] as string | undefined) ?? null,
    );
    return withOrgContext(visit.org_id, actor, async ({ tx, audit, emit }) => {
      const policy = await loadMembershipPolicy(tx, visit.org_id);
      if (!policy.self_cancel_enabled) {
        throw new PermissionError('Visitor self-cancel is disabled for memberships in this org.');
      }
      const current = await tx
        .selectFrom('memberships')
        .select(['id', 'stripe_subscription_id', 'auto_renew'])
        .where('org_id', '=', visit.org_id)
        .where('visitor_id', '=', visit.visitor_id)
        .where('id', '=', membershipId)
        .where('status', 'in', ['pending', 'active', 'expired', 'lapsed'])
        .executeTakeFirst();
      if (!current) throw new NotFoundError('Membership not found.');

      if (current.stripe_subscription_id && current.auto_renew) {
        const stripeAccount = await tx
          .selectFrom('org_stripe_accounts')
          .select(['stripe_account_id'])
          .where('org_id', '=', visit.org_id)
          .where('disconnected_at', 'is', null)
          .executeTakeFirst();
        if (stripeAccount) {
          await cancelStripeSubscription(stripeAccount.stripe_account_id, current.stripe_subscription_id);
        }
      }
      await cancelMembershipInTx(tx, visit.org_id, membershipId, body.reason ?? 'self_cancel');
      const row = await selectMembership(tx, visit.org_id, membershipId);
      await audit({
        action: 'membership.cancelled',
        targetType: 'membership',
        targetId: membershipId,
        diff: { after: { reason: body.reason ?? 'self_cancel', source: 'manage_link' } },
      });
      if (row) {
        await emit({
          eventType: 'membership.cancelled',
          aggregateType: 'membership',
          aggregateId: membershipId,
          payload: { to: row.visitor_email, tierName: row.tier_name, membershipId },
        });
      }
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/manage/:token/cancel', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const { visit } = await resolveToken(token);
    const actor = selfServeActor(
      visit.org_id,
      req.ip ?? null,
      (req.headers['user-agent'] as string | undefined) ?? null,
    );
    return withOrgContext(visit.org_id, actor, async ({ tx, audit, emit }) => {
      const policy = await loadPolicy(tx, visit.org_id);
      if (!policy.self_cancel_enabled) {
        throw new PermissionError('Visitor self-cancel is disabled for this org.');
      }
      if (hoursUntil(visit.scheduled_at) < policy.cancel_cutoff_hours) {
        throw new ConflictError(`Cancellation cutoff is ${policy.cancel_cutoff_hours}h before the scheduled time.`);
      }
      const current = await tx
        .selectFrom('visits')
        .selectAll()
        .where('id', '=', visit.id)
        .executeTakeFirstOrThrow();
      await cancelVisitInTx(tx, current, audit, emit, { actor, reason: 'self_cancel' });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/manage/:token/reschedule', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const body = rescheduleBody.parse(req.body);
    const { visit } = await resolveToken(token);
    const actor = selfServeActor(
      visit.org_id,
      req.ip ?? null,
      (req.headers['user-agent'] as string | undefined) ?? null,
    );
    return withOrgContext(visit.org_id, actor, async ({ tx, audit, emit }) => {
      const policy = await loadPolicy(tx, visit.org_id);
      if (!policy.self_reschedule_enabled) {
        throw new PermissionError('Visitor self-reschedule is disabled for this org.');
      }
      if (hoursUntil(visit.scheduled_at) < policy.reschedule_cutoff_hours) {
        throw new ConflictError(`Reschedule cutoff is ${policy.reschedule_cutoff_hours}h before the scheduled time.`);
      }
      const current = await tx
        .selectFrom('visits')
        .selectAll()
        .where('id', '=', visit.id)
        .executeTakeFirstOrThrow();
      await rescheduleVisitInTx(
        tx,
        current,
        { newScheduledAt: new Date(body.scheduledAt) },
        audit,
        emit,
      );
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/manage/:token/redact', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const { visit } = await resolveToken(token);
    if (!visit.visitor_id) throw new NotFoundError('No visitor linked to this visit.');
    const visitor = await getDb()
      .selectFrom('visitors')
      .select(['pii_redacted'])
      .where('id', '=', visit.visitor_id)
      .executeTakeFirst();
    if (visitor?.pii_redacted) return { data: { ok: true, alreadyRedacted: true } };
    const actor = selfServeActor(
      visit.org_id,
      req.ip ?? null,
      (req.headers['user-agent'] as string | undefined) ?? null,
    );
    return withOrgContext(visit.org_id, actor, async ({ tx, audit }) => {
      const ok = await redactVisitorInTx(tx, visit.org_id, visit.visitor_id!);
      if (!ok) throw new NotFoundError('Visitor not found.');
      await audit({
        action: 'contact.pii_redacted',
        targetType: 'visitor',
        targetId: visit.visitor_id!,
        diff: { after: { source: 'self_serve_manage' } },
      });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/manage/:token/availability', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const q = z.object({ date: isoDateSchema }).parse(req.query);
    const { visit } = await resolveToken(token);
    return withOrgRead(visit.org_id, async (tx) => {
      const ctx = await loadAvailabilityCtx(tx, visit.org_id, visit.location_id);
      const dayClosed = ctx.closed.some((c) => c.date === q.date);
      const override = ctx.overrides.find((o) => o.date === q.date);
      let open = !dayClosed;
      let reason: string | undefined;
      if (dayClosed) reason = 'closed_day';
      if (!dayClosed && override && (override.openTime == null || override.closeTime == null)) {
        open = false;
        reason = 'override_closed';
      }
      if (!dayClosed && !override) {
        const parts = q.date.split('-').map((n) => Number(n));
        const tmp = new Date(Date.UTC(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1));
        const dow = tmp.getUTCDay();
        const hh = ctx.hours.filter((h) => h.dayOfWeek === dow && h.isActive);
        if (hh.length === 0) {
          open = false;
          reason = 'closed_day';
        }
      }
      const slots = open
        ? slotsForDate({
            date: q.date,
            orgTimezone: ctx.orgTimezone,
            hours: ctx.hours,
            overrides: ctx.overrides,
            closedDays: ctx.closed,
            slotRounding: ctx.slotRounding,
          })
        : [];
      return { data: { open, ...(reason ? { reason } : {}), slots } };
    });
  });

  app.get('/api/v1/manage/:token/availability/month', rl, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const q = z
      .object({
        year: z.coerce.number().int().min(1970).max(3000),
        month: z.coerce.number().int().min(1).max(12),
      })
      .parse(req.query);
    const { visit } = await resolveToken(token);
    return withOrgRead(visit.org_id, async (tx) => {
      const ctx = await loadAvailabilityCtx(tx, visit.org_id, visit.location_id);
      const daysInMonth = new Date(q.year, q.month, 0).getDate();
      const days: Array<{ date: string; open: boolean; closed: boolean; reason?: string }> = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${q.year}-${String(q.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const closed = ctx.closed.some((c) => c.date === date);
        const override = ctx.overrides.find((o) => o.date === date);
        let open = true;
        let reason: string | undefined;
        if (closed) {
          open = false;
          reason = 'closed_day';
        } else if (override && (override.openTime == null || override.closeTime == null)) {
          open = false;
          reason = 'override_closed';
        } else if (!override) {
          const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
          const hh = ctx.hours.filter((h) => h.dayOfWeek === dow && h.isActive);
          if (hh.length === 0) {
            open = false;
            reason = 'closed_day';
          }
        }
        days.push({ date, open, closed, ...(reason ? { reason } : {}) });
      }
      return { data: { days } };
    });
  });
}

async function loadAvailabilityCtx(
  tx: import('../db/index.js').Tx,
  orgId: string,
  locId: string,
): Promise<{
  orgTimezone: string;
  slotRounding: SlotRounding;
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isActive: boolean }>;
  overrides: Array<{ date: string; openTime: string | null; closeTime: string | null; reason: string | null }>;
  closed: Array<{ date: string; reason: string | null }>;
}> {
  const org = await getDb()
    .selectFrom('orgs')
    .select(['timezone', 'slot_rounding'])
    .where('id', '=', orgId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  const [hours, overrides, closed] = await Promise.all([
    tx
      .selectFrom('location_hours')
      .select(['day_of_week as dayOfWeek', 'open_time as openTime', 'close_time as closeTime', 'is_active as isActive'])
      .where('location_id', '=', locId)
      .execute(),
    tx
      .selectFrom('location_hour_overrides')
      .select(['date', 'open_time as openTime', 'close_time as closeTime', 'reason'])
      .where('location_id', '=', locId)
      .execute(),
    tx
      .selectFrom('closed_days')
      .select(['date', 'reason'])
      .where('location_id', '=', locId)
      .execute(),
  ]);
  return {
    orgTimezone: org.timezone,
    slotRounding: org.slot_rounding as SlotRounding,
    hours: hours.map((h) => ({
      dayOfWeek: h.dayOfWeek as number,
      openTime: String(h.openTime),
      closeTime: String(h.closeTime),
      isActive: Boolean(h.isActive),
    })),
    overrides: overrides.map((o) => ({
      date: String(o.date),
      openTime: (o.openTime as string) ?? null,
      closeTime: (o.closeTime as string) ?? null,
      reason: o.reason,
    })),
    closed: closed.map((c) => ({ date: String(c.date), reason: c.reason })),
  };
}
