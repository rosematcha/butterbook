import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { selfBookingSchema, isoDateSchema, type Permission } from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead, type Tx } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { recordAppointmentUsage } from '../services/billing-usage.js';
import { handleIdempotent } from '../middleware/idempotency.js';
import { redactAuditBody } from '../utils/audit.js';
import { slotsForDate, type SlotRounding } from '../services/availability.js';

const bookParams = z.object({ orgSlug: z.string().min(1), locId: z.string().uuid() });

interface AvailabilityCtx {
  orgTimezone: string;
  slotRounding: SlotRounding;
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isActive: boolean }>;
  overrides: Array<{ date: string; openTime: string | null; closeTime: string | null; reason: string | null }>;
  closed: Array<{ date: string; reason: string | null }>;
}

export function registerPublicBookingRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/public/:orgSlug/book/:locId/form',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);
      return { data: { fields: org.form_fields } };
    },
  );

  // Single-request bootstrap for the visitor /book page: org/location identity,
  // branding, booking-page content, policy-to-show, and form fields.
  app.get(
    '/api/v1/public/:orgSlug/book/:locId/config',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const org = await resolveOrg(orgSlug);
      const location = await resolveLocation(org.id, locId);

      const { page, policy } = await withOrgRead(org.id, async (tx) => {
        const [p, pol] = await Promise.all([
          tx.selectFrom('org_booking_page').selectAll().where('org_id', '=', org.id).executeTakeFirst(),
          tx
            .selectFrom('org_booking_policies')
            .select(['cancel_cutoff_hours', 'refund_policy_text'])
            .where('org_id', '=', org.id)
            .executeTakeFirst(),
        ]);
        return { page: p, policy: pol };
      });

      return {
        data: {
          org: {
            id: org.id,
            name: org.name,
            timezone: org.timezone,
            logoUrl: org.logo_url,
            theme: org.theme,
          },
          location: {
            id: location.id,
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            zip: location.zip,
          },
          page: {
            heroTitle: page?.hero_title ?? null,
            heroSubtitle: page?.hero_subtitle ?? null,
            heroImageUrl: page?.hero_image_url ?? null,
            introMarkdown: page?.intro_markdown ?? null,
            confirmationMarkdown: page?.confirmation_markdown ?? null,
            confirmationRedirectUrl: page?.confirmation_redirect_url ?? null,
            leadTimeMinHours: page?.lead_time_min_hours ?? 0,
            bookingWindowDays: page?.booking_window_days ?? 60,
            maxPartySize: page?.max_party_size ?? null,
            intakeSchedules: page?.intake_schedules ?? false,
          },
          policy:
            page?.show_policy_on_page && policy
              ? {
                  cancelCutoffHours: policy.cancel_cutoff_hours,
                  refundPolicyText: policy.refund_policy_text,
                }
              : null,
          fields: org.form_fields,
        },
      };
    },
  );

  app.get(
    '/api/v1/public/:orgSlug/book/:locId/availability',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const q = z.object({ date: isoDateSchema }).parse(req.query);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);

      const [page, ctx] = await Promise.all([loadPage(org.id), loadCtx(org.id, locId, org.timezone)]);
      const { leadHours, windowDays } = page;

      const now = Date.now();
      const earliest = now + leadHours * 3600 * 1000;
      const latest = now + windowDays * 24 * 3600 * 1000;

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

      const rawSlots = open
        ? slotsForDate({
            date: q.date,
            orgTimezone: ctx.orgTimezone,
            hours: ctx.hours,
            overrides: ctx.overrides,
            closedDays: ctx.closed,
            slotRounding: ctx.slotRounding,
          })
        : [];

      const slots = rawSlots.map((hhmm) => {
        const iso = localDateTimeToIsoInTz(q.date, hhmm, ctx.orgTimezone);
        const t = new Date(iso).getTime();
        const available = t >= earliest && t <= latest;
        return { start: iso, time: hhmm, available };
      });

      return { data: { open, ...(reason ? { reason } : {}), slots } };
    },
  );

  app.get(
    '/api/v1/public/:orgSlug/book/:locId/availability/month',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const q = z
        .object({
          year: z.coerce.number().int().min(1970).max(3000),
          month: z.coerce.number().int().min(1).max(12),
        })
        .parse(req.query);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);

      const [page, ctx] = await Promise.all([loadPage(org.id), loadCtx(org.id, locId, org.timezone)]);
      const now = new Date();
      const earliestDate = ymdInTz(new Date(now.getTime() + page.leadHours * 3600 * 1000), ctx.orgTimezone);
      const latestDate = ymdInTz(new Date(now.getTime() + page.windowDays * 24 * 3600 * 1000), ctx.orgTimezone);

      const daysInMonth = new Date(q.year, q.month, 0).getDate();
      const days: Array<{ date: string; open: boolean; closed: boolean; reason?: string; bookable: boolean }> = [];
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
        const withinWindow = date >= earliestDate && date <= latestDate;
        days.push({ date, open, closed, ...(reason ? { reason } : {}), bookable: open && withinWindow });
      }
      return { data: { days } };
    },
  );

  app.post(
    '/api/v1/public/:orgSlug/book/:locId',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const body = selfBookingSchema.parse(req.body);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);
      const idemKey = (req.headers['idempotency-key'] as string | undefined) ?? null;

      return handleIdempotent(req, reply, 'visit.create.self', org.id, async () => {
        const actor = {
          userId: null,
          orgId: org.id,
          isSuperadmin: false,
          permissions: new Set<Permission>(),
          actorType: 'guest' as const,
          ip: req.ip ?? null,
          userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        };
        const result = await withOrgContext(org.id, actor, async ({ tx, audit, emit }) => {
          const r = await createVisitInTx(tx, {
            orgId: org.id,
            locationId: locId,
            eventId: null,
            bookedBy: null,
            bookingMethod: 'self',
            scheduledAt: new Date(body.scheduledAt),
            formResponse: body.formResponse,
            idempotencyKey: idemKey,
          });
          await audit({
            action: 'visit.self_booked',
            targetType: 'visit',
            targetId: r.visitId ?? r.waitlistEntryId ?? '',
            diff: { after: redactAuditBody(body) },
          });
          if (r.kind === 'visit' && r.visitId) {
            await recordAppointmentUsage(tx, org.id);
            await emit({
              eventType: 'visit.self_booked',
              aggregateType: 'visit',
              aggregateId: r.visitId,
              payload: {
                version: 1,
                visitId: r.visitId,
                locationId: locId,
                eventId: null,
                scheduledAt: body.scheduledAt,
                formResponse: body.formResponse,
                bookingMethod: 'self',
              },
            });
          }
          return r;
        });
        return { status: 201, body: { data: { id: result.visitId, kind: result.kind } } };
      }).then((r) => {
        reply.status(r.status);
        return r.body;
      });
    },
  );
}

async function resolveOrg(orgSlug: string): Promise<{
  id: string;
  name: string;
  timezone: string;
  logo_url: string | null;
  theme: unknown;
  form_fields: unknown;
  public_slug: string;
  slug_prefix: string;
}> {
  const org = await getDb()
    .selectFrom('orgs')
    .select(['id', 'name', 'timezone', 'logo_url', 'theme', 'form_fields', 'public_slug', 'slug_prefix'])
    .where('public_slug', '=', orgSlug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw new NotFoundError('Org not found.');
  return org;
}

async function resolveLocation(
  orgId: string,
  locId: string,
): Promise<{ id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null }> {
  return withOrgRead(orgId, async (tx) => {
    const loc = await tx
      .selectFrom('locations')
      .select(['id', 'name', 'address', 'city', 'state', 'zip'])
      .where('id', '=', locId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!loc) throw new NotFoundError('Location not found.');
    return loc;
  });
}

async function loadPage(orgId: string): Promise<{ leadHours: number; windowDays: number }> {
  return withOrgRead(orgId, async (tx) => {
    const row = await tx
      .selectFrom('org_booking_page')
      .select(['lead_time_min_hours', 'booking_window_days'])
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    return {
      leadHours: row?.lead_time_min_hours ?? 0,
      windowDays: row?.booking_window_days ?? 60,
    };
  });
}

async function loadCtx(orgId: string, locId: string, orgTimezone: string): Promise<AvailabilityCtx> {
  return withOrgRead(orgId, async (tx: Tx) => {
    const org = await tx.selectFrom('locations').select(['id']).where('id', '=', locId).where('org_id', '=', orgId).executeTakeFirst();
    if (!org) throw new NotFoundError('Location not found.');
    const slot = await getDb().selectFrom('orgs').select(['slot_rounding']).where('id', '=', orgId).executeTakeFirst();
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
      tx.selectFrom('closed_days').select(['date', 'reason']).where('location_id', '=', locId).execute(),
    ]);
    return {
      orgTimezone,
      slotRounding: (slot?.slot_rounding as SlotRounding) ?? 'freeform',
      hours: hours.map((h) => ({ ...h, openTime: String(h.openTime), closeTime: String(h.closeTime) })),
      overrides: overrides.map((o) => ({
        date: String(o.date),
        openTime: o.openTime as string | null,
        closeTime: o.closeTime as string | null,
        reason: o.reason,
      })),
      closed: closed.map((c) => ({ date: String(c.date), reason: c.reason })),
    };
  });
}

// Convert a wall-clock date + HH:MM in the org's timezone into an ISO UTC
// timestamp. Does a timezone-offset round-trip via Intl.DateTimeFormat so the
// result is DST-correct.
function localDateTimeToIsoInTz(date: string, hhmm: string, tz: string): string {
  const [yy, mm, dd] = date.split('-').map((n) => Number(n));
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  // Start with the intended wall-clock as UTC, then adjust by the tz offset
  // we observe for that UTC instant.
  const guess = new Date(Date.UTC(yy!, (mm ?? 1) - 1, dd ?? 1, h ?? 0, m ?? 0));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guess);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asWall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offset = asWall - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

function ymdInTz(when: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
