import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createEventSchema,
  isoDateTimeSchema,
  setSlugSchema,
  updateEventSchema,
  uuidSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { newPublicId } from '../utils/ids.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';
import { assertSafeFormFieldPatterns } from '../utils/safe-regex.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const eventParam = z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() });

export function registerEventRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/events', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = z
      .object({
        from: isoDateTimeSchema.optional(),
        to: isoDateTimeSchema.optional(),
        location_id: uuidSchema.optional(),
        published: z.enum(['true', 'false']).optional(),
        include_deleted: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    await req.requirePermission(orgId, 'events.view_registrations');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let query = tx.selectFrom('events').selectAll().where('org_id', '=', orgId);
      if (!includeDeleted) query = query.where('deleted_at', 'is', null);
      if (q.from) query = query.where('starts_at', '>=', new Date(q.from));
      if (q.to) query = query.where('starts_at', '<=', new Date(q.to));
      if (q.location_id) query = query.where('location_id', '=', q.location_id);
      if (q.published) query = query.where('is_published', '=', q.published === 'true');
      const rows = await query.orderBy('starts_at', 'asc').execute();
      return { data: rows.map(publicEvent) };
    });
  });

  app.post('/api/v1/orgs/:orgId/events', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createEventSchema.parse(req.body);
    if (body.formFields) assertSafeFormFieldPatterns(body.formFields);
    await req.requirePermission(orgId, 'events.create');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const loc = await tx.selectFrom('locations').select('id').where('id', '=', body.locationId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!loc) throw new NotFoundError('Location not found.');
      if (body.slug) {
        const conflict = await tx.selectFrom('events').select('id').where('org_id', '=', orgId).where('slug', '=', body.slug).where('deleted_at', 'is', null).executeTakeFirst();
        if (conflict) throw new ConflictError('slug already in use.');
      }
      const row = await tx
        .insertInto('events')
        .values({
          org_id: orgId,
          location_id: body.locationId,
          created_by: req.userId!,
          title: body.title,
          description: body.description ?? null,
          starts_at: new Date(body.startsAt),
          ends_at: new Date(body.endsAt),
          capacity: body.capacity ?? null,
          waitlist_enabled: body.waitlistEnabled ?? false,
          waitlist_auto_promote: body.waitlistAutoPromote ?? false,
          form_fields: body.formFields ? JSON.stringify(body.formFields) : null,
          slug: body.slug ?? null,
          public_id: newPublicId(),
        })
        .returning(['id', 'public_id'])
        .executeTakeFirstOrThrow();
      await audit({ action: 'event.created', targetType: 'event', targetId: row.id, diff: { after: body } });
      return { data: { id: row.id, publicId: row.public_id } };
    });
  });

  app.get('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    await req.requirePermission(orgId, 'events.view_registrations');
    return withOrgRead(orgId, async (tx) => {
      const ev = await tx.selectFrom('events').selectAll().where('id', '=', eventId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!ev) throw new NotFoundError();
      return { data: publicEvent(ev) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const body = updateEventSchema.parse(req.body);
    if (body.formFields) assertSafeFormFieldPatterns(body.formFields);
    await req.requirePermission(orgId, 'events.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.startsAt !== undefined) updates.starts_at = new Date(body.startsAt);
      if (body.endsAt !== undefined) updates.ends_at = new Date(body.endsAt);
      if (body.capacity !== undefined) updates.capacity = body.capacity;
      if (body.waitlistEnabled !== undefined) updates.waitlist_enabled = body.waitlistEnabled;
      if (body.waitlistAutoPromote !== undefined) updates.waitlist_auto_promote = body.waitlistAutoPromote;
      if (body.formFields !== undefined) updates.form_fields = body.formFields === null ? null : JSON.stringify(body.formFields);
      if (body.locationId !== undefined) updates.location_id = body.locationId;
      if (Object.keys(updates).length > 0) {
        const res = await tx.updateTable('events').set(updates).where('id', '=', eventId).where('org_id', '=', orgId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
        if (!res) throw new NotFoundError();
      }
      await audit({ action: 'event.updated', targetType: 'event', targetId: eventId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const q = z.object({ cascade: z.enum(['true', 'false']).optional() }).parse(req.query);
    await req.requirePermission(orgId, 'events.delete');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const event = await tx.selectFrom('events').select(['id']).where('id', '=', eventId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!event) throw new NotFoundError();
      const confirmedCount = await tx.selectFrom('visits').select((eb) => eb.fn.countAll<number>().as('c')).where('event_id', '=', eventId).where('status', '=', 'confirmed').executeTakeFirst();
      if (Number(confirmedCount?.c ?? 0) > 0) {
        if (q.cascade !== 'true' || !m.isSuperadmin) {
          throw new ConflictError('Event has confirmed visits. cascade=true + superadmin required.');
        }
        await tx.updateTable('visits').set({ status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.userId }).where('event_id', '=', eventId).where('status', '=', 'confirmed').execute();
      }
      await tx.updateTable('events').set({ deleted_at: new Date() }).where('id', '=', eventId).execute();
      await audit({ action: 'event.deleted', targetType: 'event', targetId: eventId });
      return { data: { ok: true } };
    });
  });

  for (const action of ['publish', 'unpublish'] as const) {
    app.post(`/api/v1/orgs/:orgId/events/:eventId/${action}`, async (req) => {
      const { orgId, eventId } = eventParam.parse(req.params);
      await req.requirePermission(orgId, 'events.publish');
      const m = await req.loadMembershipFor(orgId);
      return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
        const res = await tx.updateTable('events').set({ is_published: action === 'publish' }).where('id', '=', eventId).where('org_id', '=', orgId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
        if (!res) throw new NotFoundError();
        await audit({ action: `event.${action}ed`, targetType: 'event', targetId: eventId });
        return { data: { ok: true } };
      });
    });
  }

  app.patch('/api/v1/orgs/:orgId/events/:eventId/slug', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const body = setSlugSchema.parse(req.body);
    await req.requirePermission(orgId, 'events.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.slug) {
        const conflict = await tx.selectFrom('events').select('id').where('org_id', '=', orgId).where('slug', '=', body.slug).where('id', '!=', eventId).where('deleted_at', 'is', null).executeTakeFirst();
        if (conflict) throw new ConflictError('slug already in use.');
      }
      const res = await tx.updateTable('events').set({ slug: body.slug }).where('id', '=', eventId).where('org_id', '=', orgId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'event.slug_set', targetType: 'event', targetId: eventId, diff: { after: body } });
      return { data: { ok: true } };
    });
  });
}

function publicEvent(e: {
  id: string;
  org_id: string;
  location_id: string;
  title: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  capacity: number | null;
  waitlist_enabled: boolean;
  waitlist_auto_promote: boolean;
  form_fields: unknown;
  is_published: boolean;
}) {
  return {
    id: e.id,
    orgId: e.org_id,
    locationId: e.location_id,
    title: e.title,
    description: e.description,
    slug: e.slug,
    publicId: e.public_id,
    startsAt: e.starts_at instanceof Date ? e.starts_at.toISOString() : e.starts_at,
    endsAt: e.ends_at instanceof Date ? e.ends_at.toISOString() : e.ends_at,
    capacity: e.capacity,
    waitlistEnabled: e.waitlist_enabled,
    waitlistAutoPromote: e.waitlist_auto_promote,
    formFields: e.form_fields,
    isPublished: e.is_published,
  };
}
