import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reorderWaitlistSchema } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError, ConflictError } from '../errors/index.js';

const params = z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() });
const entryParams = params.extend({ entryId: z.string().uuid() });

export function registerWaitlistRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/events/:eventId/waitlist', async (req) => {
    const { orgId, eventId } = params.parse(req.params);
    await req.requirePermission(orgId, 'events.manage_waitlist');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('waitlist_entries')
        .selectAll()
        .where('event_id', '=', eventId)
        .where('org_id', '=', orgId)
        .orderBy('sort_order', 'asc')
        .execute();
      return { data: rows };
    });
  });

  app.post('/api/v1/orgs/:orgId/events/:eventId/waitlist/:entryId/promote', async (req) => {
    const { orgId, eventId, entryId } = entryParams.parse(req.params);
    await req.requirePermission(orgId, 'events.manage_waitlist');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
      const entry = await tx.selectFrom('waitlist_entries').selectAll().where('id', '=', entryId).where('event_id', '=', eventId).where('org_id', '=', orgId).executeTakeFirst();
      if (!entry) throw new NotFoundError();
      if (entry.status !== 'waiting') throw new ConflictError('Waitlist entry not in waiting state.');
      const ev = await tx.selectFrom('events').select(['starts_at', 'location_id']).where('id', '=', eventId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!ev) throw new NotFoundError();
      const visit = await tx
        .insertInto('visits')
        .values({
          org_id: orgId,
          location_id: ev.location_id,
          event_id: eventId,
          booked_by: req.userId,
          booking_method: 'self',
          scheduled_at: ev.starts_at,
          form_response: entry.form_response,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await tx.updateTable('waitlist_entries').set({ status: 'promoted', promoted_at: new Date(), promoted_by: req.userId, promoted_visit_id: visit.id }).where('id', '=', entryId).execute();
      await audit({ action: 'waitlist.promoted', targetType: 'waitlist_entry', targetId: entryId, diff: { after: { visitId: visit.id } } });
      await emit({
        eventType: 'waitlist.promoted',
        aggregateType: 'waitlist_entry',
        aggregateId: entryId,
        payload: {
          version: 1,
          waitlistEntryId: entryId,
          visitId: visit.id,
          eventId,
          scheduledAt: (ev.starts_at instanceof Date ? ev.starts_at : new Date(ev.starts_at as unknown as string)).toISOString(),
          formResponse: entry.form_response,
        },
      });
      return { data: { visitId: visit.id } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/events/:eventId/waitlist/:entryId', async (req) => {
    const { orgId, eventId, entryId } = entryParams.parse(req.params);
    await req.requirePermission(orgId, 'events.manage_waitlist');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx.updateTable('waitlist_entries').set({ status: 'removed' }).where('id', '=', entryId).where('event_id', '=', eventId).where('org_id', '=', orgId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'waitlist.removed', targetType: 'waitlist_entry', targetId: entryId });
      return { data: { ok: true } };
    });
  });

  app.patch('/api/v1/orgs/:orgId/events/:eventId/waitlist/:entryId/order', async (req) => {
    const { orgId, eventId, entryId } = entryParams.parse(req.params);
    const body = reorderWaitlistSchema.parse(req.body);
    await req.requirePermission(orgId, 'events.manage_waitlist');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const after = body.afterEntryId
        ? await tx.selectFrom('waitlist_entries').select(['sort_order']).where('id', '=', body.afterEntryId).where('event_id', '=', eventId).executeTakeFirst()
        : null;
      const before = body.beforeEntryId
        ? await tx.selectFrom('waitlist_entries').select(['sort_order']).where('id', '=', body.beforeEntryId).where('event_id', '=', eventId).executeTakeFirst()
        : null;
      let newOrder: number;
      if (after && before) newOrder = (Number(after.sort_order) + Number(before.sort_order)) / 2;
      else if (after) newOrder = Number(after.sort_order) + 1000;
      else if (before) newOrder = Number(before.sort_order) - 1000;
      else throw new ConflictError('Invalid reorder target.');
      const res = await tx.updateTable('waitlist_entries').set({ sort_order: newOrder }).where('id', '=', entryId).where('event_id', '=', eventId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'waitlist.reordered', targetType: 'waitlist_entry', targetId: entryId, diff: { after: { sort_order: newOrder } } });
      return { data: { ok: true, sortOrder: newOrder } };
    });
  });
}
