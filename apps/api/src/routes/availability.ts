import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb, withOrgRead, type Tx } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { slotsForDate, type SlotRounding } from '../services/availability.js';
import { isoDateSchema } from '@butterbook/shared';

const locParam = z.object({ orgId: z.string().uuid(), locId: z.string().uuid() });

export function registerAvailabilityRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/locations/:locId/availability', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const q = z.object({ date: isoDateSchema }).parse(req.query);
    req.requireAuth();
    await req.loadMembershipFor(orgId);
    return withOrgRead(orgId, async (tx) => {
      const ctx = await loadCtx(tx, orgId, locId);
      const dayClosed = ctx.closed.some((c) => c.date === q.date);
      const override = ctx.overrides.find((o) => o.date === q.date);
      let openTime: string | null = null;
      let closeTime: string | null = null;
      let open = !dayClosed;
      let reason: string | undefined;
      if (dayClosed) reason = 'closed_day';
      if (!dayClosed && override) {
        if (override.openTime == null || override.closeTime == null) {
          open = false;
          reason = 'override_closed';
        } else {
          openTime = override.openTime;
          closeTime = override.closeTime;
        }
      }
      if (!dayClosed && !override) {
        const parts = q.date.split('-').map((n) => Number(n));
        const tmp = new Date(Date.UTC(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1));
        const dow = tmp.getUTCDay();
        const hh = ctx.hours.filter((h) => h.dayOfWeek === dow && h.isActive);
        if (hh.length === 0) {
          open = false;
          reason = 'closed_day';
        } else {
          openTime = hh[0]!.openTime;
          closeTime = hh[hh.length - 1]!.closeTime;
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
      return { data: { open, ...(reason ? { reason } : {}), openTime, closeTime, slots } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/availability/month', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const q = z
      .object({ year: z.coerce.number().int().min(1970).max(3000), month: z.coerce.number().int().min(1).max(12) })
      .parse(req.query);
    req.requireAuth();
    await req.loadMembershipFor(orgId);
    return withOrgRead(orgId, async (tx) => {
      const ctx = await loadCtx(tx, orgId, locId);
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

async function loadCtx(tx: Tx, orgId: string, locId: string): Promise<{
  orgTimezone: string;
  slotRounding: SlotRounding;
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isActive: boolean }>;
  overrides: Array<{ date: string; openTime: string | null; closeTime: string | null; reason: string | null }>;
  closed: Array<{ date: string; reason: string | null }>;
}> {
  // orgs is not RLS-enabled, so getDb() is fine here.
  const org = await getDb()
    .selectFrom('orgs')
    .select(['timezone', 'slot_rounding'])
    .where('id', '=', orgId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw new NotFoundError('Org not found.');
  const loc = await tx.selectFrom('locations').select(['id']).where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!loc) throw new NotFoundError('Location not found.');
  const [hours, overrides, closed] = await Promise.all([
    tx.selectFrom('location_hours').select(['day_of_week as dayOfWeek', 'open_time as openTime', 'close_time as closeTime', 'is_active as isActive']).where('location_id', '=', locId).execute(),
    tx.selectFrom('location_hour_overrides').select(['date', 'open_time as openTime', 'close_time as closeTime', 'reason']).where('location_id', '=', locId).execute(),
    tx.selectFrom('closed_days').select(['date', 'reason']).where('location_id', '=', locId).execute(),
  ]);
  return {
    orgTimezone: org.timezone,
    slotRounding: org.slot_rounding as SlotRounding,
    hours: hours.map((h) => ({ ...h, openTime: String(h.openTime), closeTime: String(h.closeTime) })),
    overrides: overrides.map((o) => ({ date: String(o.date), openTime: o.openTime as string | null, closeTime: o.closeTime as string | null, reason: o.reason })),
    closed: closed.map((c) => ({ date: String(c.date), reason: c.reason })),
  };
}
