import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminCreateVisitSchema,
  buildFormResponseSchema,
  DEFAULT_FORM_FIELDS,
  isoDateSchema,
  listVisitsQuerySchema,
  updateVisitSchema,
  type FormField,
} from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead, type Tx } from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { redactAuditBody } from '../utils/audit.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const visitParam = z.object({ orgId: z.string().uuid(), visitId: z.string().uuid() });

export function registerVisitRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/visits', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listVisitsQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'visits.view_all');

    return withOrgRead(orgId, async (tx) => {
      // Build data and count queries side-by-side so the count respects the
      // same from/to/location/event/method/status filters as the list — the
      // previous version counted every visit in the tenant, which scanned the
      // whole table on every today-page load.
      let rowsQuery = tx
        .selectFrom('visits')
        .select([
          'id', 'org_id', 'location_id', 'event_id', 'booking_method', 'scheduled_at',
          'status', 'pii_redacted', 'form_response', 'tags', 'created_at',
        ])
        .where('org_id', '=', orgId);
      let countQuery = tx
        .selectFrom('visits')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('org_id', '=', orgId);
      if (q.from) {
        const d = new Date(q.from);
        rowsQuery = rowsQuery.where('scheduled_at', '>=', d);
        countQuery = countQuery.where('scheduled_at', '>=', d);
      }
      if (q.to) {
        const d = new Date(q.to);
        rowsQuery = rowsQuery.where('scheduled_at', '<=', d);
        countQuery = countQuery.where('scheduled_at', '<=', d);
      }
      if (q.location_id) {
        rowsQuery = rowsQuery.where('location_id', '=', q.location_id);
        countQuery = countQuery.where('location_id', '=', q.location_id);
      }
      if (q.event_id) {
        rowsQuery = rowsQuery.where('event_id', '=', q.event_id);
        countQuery = countQuery.where('event_id', '=', q.event_id);
      }
      if (q.method) {
        rowsQuery = rowsQuery.where('booking_method', '=', q.method);
        countQuery = countQuery.where('booking_method', '=', q.method);
      }
      if (q.status) {
        rowsQuery = rowsQuery.where('status', '=', q.status);
        countQuery = countQuery.where('status', '=', q.status);
      }
      const [rows, totalRow] = await Promise.all([
        rowsQuery.orderBy('scheduled_at', 'desc').limit(q.limit).offset((q.page - 1) * q.limit).execute(),
        countQuery.executeTakeFirst(),
      ]);
      return {
        data: rows.map(publicVisit),
        meta: { page: q.page, limit: q.limit, total: Number(totalRow?.c ?? 0), pages: Math.ceil(Number(totalRow?.c ?? 0) / q.limit) },
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/visits', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = adminCreateVisitSchema.parse(req.body);
    await req.requirePermission(orgId, 'visits.create');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const result = await createVisitInTx(tx, {
        orgId,
        locationId: body.locationId,
        eventId: body.eventId ?? null,
        bookedBy: req.userId,
        bookingMethod: 'admin',
        scheduledAt: new Date(body.scheduledAt),
        formResponse: body.formResponse,
        idempotencyKey: null,
      });
      if (result.kind === 'visit') {
        await audit({ action: 'visit.created', targetType: 'visit', targetId: result.visitId!, diff: { after: redactAuditBody(body) } });
        return { data: { id: result.visitId, kind: 'visit' } };
      }
      await audit({ action: 'waitlist.joined', targetType: 'waitlist_entry', targetId: result.waitlistEntryId!, diff: { after: redactAuditBody(body) } });
      return { data: { id: result.waitlistEntryId, kind: 'waitlisted' } };
    });
  });

  app.get('/api/v1/orgs/:orgId/visits/:visitId', async (req) => {
    const { orgId, visitId } = visitParam.parse(req.params);
    await req.requirePermission(orgId, 'visits.view_all');
    return withOrgRead(orgId, async (tx) => {
      const visit = await tx.selectFrom('visits').selectAll().where('id', '=', visitId).where('org_id', '=', orgId).executeTakeFirst();
      if (!visit) throw new NotFoundError();
      return { data: publicVisit(visit) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/visits/:visitId', async (req) => {
    const { orgId, visitId } = visitParam.parse(req.params);
    const body = updateVisitSchema.parse(req.body);
    await req.requirePermission(orgId, 'visits.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const visit = await tx.selectFrom('visits').selectAll().where('id', '=', visitId).where('org_id', '=', orgId).executeTakeFirst();
      if (!visit) throw new NotFoundError();
      const updates: Record<string, unknown> = {};
      if (body.scheduledAt !== undefined) updates.scheduled_at = new Date(body.scheduledAt);
      if (body.status !== undefined) updates.status = body.status;
      if (body.tags !== undefined) {
        // Dedup case-insensitively so "vip" and "VIP" don't both land; keep the
        // first casing the user typed.
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const t of body.tags) {
          const key = t.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(t);
        }
        updates.tags = deduped;
      }
      if (body.formResponse !== undefined) {
        if (visit.pii_redacted) throw new ValidationError('Cannot edit form_response on redacted visit.');
        const fields = await formFieldsForTx(tx, visit.event_id, orgId);
        const parsed = buildFormResponseSchema(fields).safeParse(body.formResponse);
        if (!parsed.success) {
          throw new ValidationError(
            'Form response validation failed.',
            parsed.error.errors.map((e) => ({ path: `formResponse.${e.path.join('.')}`, message: e.message })),
          );
        }
        updates.form_response = parsed.data;
      }
      if (Object.keys(updates).length > 0) {
        await tx.updateTable('visits').set(updates).where('id', '=', visitId).execute();
      }
      await audit({ action: 'visit.updated', targetType: 'visit', targetId: visitId, diff: { after: redactAuditBody(updates) } });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/visits/:visitId/cancel', async (req) => {
    const { orgId, visitId } = visitParam.parse(req.params);
    await req.requirePermission(orgId, 'visits.cancel');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const visit = await tx.selectFrom('visits').selectAll().where('id', '=', visitId).where('org_id', '=', orgId).executeTakeFirst();
      if (!visit) throw new NotFoundError();
      if (visit.status === 'cancelled') return { data: { ok: true } };
      await tx.updateTable('visits').set({ status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.userId }).where('id', '=', visitId).execute();
      await audit({ action: 'visit.cancelled', targetType: 'visit', targetId: visitId });

      if (visit.event_id) {
        const event = await tx.selectFrom('events').select(['id', 'waitlist_auto_promote']).where('id', '=', visit.event_id).where('deleted_at', 'is', null).executeTakeFirst();
        if (event?.waitlist_auto_promote) {
          const next = await tx
            .selectFrom('waitlist_entries')
            .selectAll()
            .where('event_id', '=', event.id)
            .where('status', '=', 'waiting')
            .orderBy('sort_order', 'asc')
            .limit(1)
            .executeTakeFirst();
          if (next) {
            const ev = await tx.selectFrom('events').select(['starts_at', 'location_id']).where('id', '=', event.id).executeTakeFirstOrThrow();
            const newVisit = await tx
              .insertInto('visits')
              .values({
                org_id: orgId,
                location_id: ev.location_id,
                event_id: event.id,
                booked_by: null,
                booking_method: 'self',
                scheduled_at: ev.starts_at,
                form_response: next.form_response,
              })
              .returning(['id'])
              .executeTakeFirstOrThrow();
            await tx
              .updateTable('waitlist_entries')
              .set({ status: 'promoted', promoted_at: new Date(), promoted_by: req.userId, promoted_visit_id: newVisit.id })
              .where('id', '=', next.id)
              .execute();
            await audit({ action: 'waitlist.auto_promoted', targetType: 'waitlist_entry', targetId: next.id, diff: { after: { visitId: newVisit.id } } });
          }
        }
      }
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/visits/:visitId/no-show', async (req) => {
    const { orgId, visitId } = visitParam.parse(req.params);
    await req.requirePermission(orgId, 'visits.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx.updateTable('visits').set({ status: 'no_show' }).where('id', '=', visitId).where('org_id', '=', orgId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'visit.no_show', targetType: 'visit', targetId: visitId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/visits/:visitId/redact-pii', async (req) => {
    const { orgId, visitId } = visitParam.parse(req.params);
    await req.requireSuperadmin(orgId);
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const visit = await tx.selectFrom('visits').selectAll().where('id', '=', visitId).where('org_id', '=', orgId).executeTakeFirst();
      if (!visit) throw new NotFoundError();
      const form = visit.form_response as Record<string, unknown>;
      const redacted: Record<string, unknown> = {};
      if ('party_size' in form) redacted.party_size = form.party_size;
      await tx.updateTable('visits').set({ pii_redacted: true, form_response: redacted as never }).where('id', '=', visitId).execute();
      // Note: audit_log is append-only (enforced by the audit_log_no_update
      // trigger), so historical rows written before redactAuditBody was in
      // place may still carry formResponse. New writes no longer include it.
      await audit({ action: 'visit.pii_redacted', targetType: 'visit', targetId: visitId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/calendar/day', async (req) => {
    const params = z.object({ orgId: z.string().uuid(), locId: z.string().uuid() }).parse(req.params);
    const q = z.object({ date: isoDateSchema }).parse(req.query);
    await req.requirePermission(params.orgId, 'visits.view_all');
    return withOrgRead(params.orgId, async (tx) => {
      const start = new Date(`${q.date}T00:00:00Z`);
      const end = new Date(`${q.date}T23:59:59Z`);
      const visits = await tx.selectFrom('visits').selectAll().where('org_id', '=', params.orgId).where('location_id', '=', params.locId).where('scheduled_at', '>=', start).where('scheduled_at', '<=', end).execute();
      const events = await tx.selectFrom('events').selectAll().where('org_id', '=', params.orgId).where('location_id', '=', params.locId).where('starts_at', '>=', start).where('starts_at', '<=', end).where('deleted_at', 'is', null).execute();
      return { data: { visits: visits.map(publicVisit), events } };
    });
  });

  /**
   * Returns the tags used most often on visits in this org, newest 1000 visits
   * first. Powers the type-ahead on the timeline's "Add tag" popover so admins
   * re-use existing labels instead of re-typing slight variants ("Vip", "v.i.p.").
   */
  app.get('/api/v1/orgs/:orgId/visits/tag-suggestions', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'visits.view_all');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('visits')
        .select(['tags'])
        .where('org_id', '=', orgId)
        .orderBy('created_at', 'desc')
        .limit(1000)
        .execute();
      const counts = new Map<string, { tag: string; count: number }>();
      for (const r of rows) {
        for (const t of r.tags ?? []) {
          const key = t.toLowerCase();
          const existing = counts.get(key);
          if (existing) existing.count += 1;
          else counts.set(key, { tag: t, count: 1 });
        }
      }
      const suggestions = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 40);
      return { data: suggestions };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/calendar/month', async (req) => {
    const params = z.object({ orgId: z.string().uuid(), locId: z.string().uuid() }).parse(req.params);
    const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
    await req.requirePermission(params.orgId, 'visits.view_all');
    return withOrgRead(params.orgId, async (tx) => {
      const start = new Date(Date.UTC(q.year, q.month - 1, 1));
      const end = new Date(Date.UTC(q.year, q.month, 0, 23, 59, 59));
      const rows = await tx
        .selectFrom('visits')
        .select((eb) => [
          eb.fn('date_trunc', [eb.val('day'), eb.ref('scheduled_at')]).as('day'),
          eb.fn.countAll<number>().as('count'),
        ])
        .where('org_id', '=', params.orgId)
        .where('location_id', '=', params.locId)
        .where('scheduled_at', '>=', start)
        .where('scheduled_at', '<=', end)
        .groupBy('day')
        .execute();
      return { data: { counts: rows } };
    });
  });
}

async function formFieldsForTx(tx: Tx, eventId: string | null, orgId: string): Promise<FormField[]> {
  if (eventId) {
    const e = await tx.selectFrom('events').select(['form_fields']).where('id', '=', eventId).executeTakeFirst();
    if (e?.form_fields) return e.form_fields as FormField[];
  }
  const org = await getDb().selectFrom('orgs').select(['form_fields']).where('id', '=', orgId).executeTakeFirstOrThrow();
  return (org.form_fields as FormField[]) ?? DEFAULT_FORM_FIELDS;
}

function publicVisit(v: {
  id: string;
  org_id: string;
  location_id: string;
  event_id: string | null;
  booking_method?: string;
  scheduled_at: Date | string;
  status?: string;
  pii_redacted?: boolean;
  form_response?: unknown;
  tags?: string[] | null;
  created_at?: Date | string;
}) {
  return {
    id: v.id,
    orgId: v.org_id,
    locationId: v.location_id,
    eventId: v.event_id,
    ...(v.booking_method ? { bookingMethod: v.booking_method } : {}),
    scheduledAt: typeof v.scheduled_at === 'string' ? v.scheduled_at : v.scheduled_at.toISOString(),
    ...(v.status ? { status: v.status } : {}),
    piiRedacted: v.pii_redacted ?? false,
    formResponse: v.form_response,
    tags: v.tags ?? [],
    ...(v.created_at ? { createdAt: typeof v.created_at === 'string' ? v.created_at : v.created_at.toISOString() } : {}),
  };
}
