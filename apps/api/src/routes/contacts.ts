import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  contactIdParamSchema,
  createContactSchema,
  createSegmentSchema,
  listContactsQuerySchema,
  mergeContactsSchema,
  segmentIdParamSchema,
  updateContactSchema,
  updateSegmentSchema,
} from '@butterbook/shared';
import { sql, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';
import { publicContact } from '../services/contacts.js';
import { countSegmentVisitors, segmentPredicate } from '../services/segments.js';

const orgParam = z.object({ orgId: z.string().uuid() });

export function registerContactRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/contacts', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listContactsQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'contacts.view_all');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    const tags = q.tag ? (Array.isArray(q.tag) ? q.tag : [q.tag]) : [];

    return withOrgRead(orgId, async (tx) => {
      let rowsQuery = tx.selectFrom('visitors').selectAll().where('org_id', '=', orgId);
      let countQuery = tx.selectFrom('visitors').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId);
      if (!includeDeleted) {
        rowsQuery = rowsQuery.where('deleted_at', 'is', null);
        countQuery = countQuery.where('deleted_at', 'is', null);
      }
      if (q.q) {
        const like = `%${q.q.toLowerCase()}%`;
        const pred = sql<boolean>`(
          lower(email::text) LIKE ${like}
          OR lower(coalesce(first_name, '')) LIKE ${like}
          OR lower(coalesce(last_name, '')) LIKE ${like}
          OR lower(coalesce(phone, '')) LIKE ${like}
        )`;
        rowsQuery = rowsQuery.where(pred);
        countQuery = countQuery.where(pred);
      }
      for (const tag of tags) {
        const pred = sql<boolean>`${tag} = ANY(tags)`;
        rowsQuery = rowsQuery.where(pred);
        countQuery = countQuery.where(pred);
      }
      const [rows, count] = await Promise.all([
        rowsQuery.orderBy('created_at', 'desc').limit(q.limit).offset((q.page - 1) * q.limit).execute(),
        countQuery.executeTakeFirst(),
      ]);
      const total = Number(count?.c ?? 0);
      return {
        data: rows.map(publicContact),
        meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/contacts', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createContactSchema.parse(req.body);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .insertInto('visitors')
        .values({
          org_id: orgId,
          email: body.email,
          first_name: body.firstName ?? null,
          last_name: body.lastName ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
          tags: body.tags ?? [],
          notes: body.notes ?? null,
        })
        .onConflict((oc) => oc.columns(['org_id', 'email']).where('deleted_at', 'is', null).doNothing())
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new ConflictError('A contact with that email already exists.');
      await audit({ action: 'contact.created', targetType: 'visitor', targetId: row.id, diff: { after: body } });
      return { data: publicContact(row) };
    });
  });

  app.get('/api/v1/orgs/:orgId/contacts/:id', async (req) => {
    const { orgId, id } = contactIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.view_all');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx.selectFrom('visitors').selectAll().where('org_id', '=', orgId).where('id', '=', id).executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: publicContact(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/contacts/:id', async (req) => {
    const { orgId, id } = contactIdParamSchema.parse(req.params);
    const body = updateContactSchema.parse(req.body);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.email !== undefined) updates.email = body.email;
      if (body.firstName !== undefined) updates.first_name = body.firstName;
      if (body.lastName !== undefined) updates.last_name = body.lastName;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.address !== undefined) updates.address = body.address;
      if (body.tags !== undefined) updates.tags = body.tags;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      updates.updated_at = new Date();
      const row = await tx
        .updateTable('visitors')
        .set(updates)
        .where('org_id', '=', orgId)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'contact.updated', targetType: 'visitor', targetId: id, diff: { after: body } });
      return { data: publicContact(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/contacts/:id', async (req) => {
    const { orgId, id } = contactIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .updateTable('visitors')
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where('org_id', '=', orgId)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'contact.deleted', targetType: 'visitor', targetId: id });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/contacts/:id/timeline', async (req) => {
    const { orgId, id } = contactIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.view_all');
    return withOrgRead(orgId, async (tx) => {
      const contact = await tx.selectFrom('visitors').select(['id', 'email']).where('org_id', '=', orgId).where('id', '=', id).executeTakeFirst();
      if (!contact) throw new NotFoundError();
      const [visits, waitlist, notifications] = await Promise.all([
        tx.selectFrom('visits').select(['id', 'scheduled_at', 'status', 'booking_method', 'event_id', 'created_at']).where('org_id', '=', orgId).where('visitor_id', '=', id).orderBy('scheduled_at', 'desc').limit(100).execute(),
        tx.selectFrom('waitlist_entries').select(['id', 'event_id', 'status', 'created_at', 'promoted_at']).where('org_id', '=', orgId).where('visitor_id', '=', id).orderBy('created_at', 'desc').limit(100).execute(),
        tx.selectFrom('notifications_outbox').select(['id', 'template_key', 'status', 'scheduled_at', 'sent_at', 'created_at']).where('org_id', '=', orgId).where('to_address', '=', contact.email).orderBy('created_at', 'desc').limit(100).execute(),
      ]);
      return {
        data: [
          ...visits.map((v) => ({ type: 'visit', id: v.id, at: v.scheduled_at.toISOString(), status: v.status, bookingMethod: v.booking_method, eventId: v.event_id })),
          ...waitlist.map((w) => ({ type: 'waitlist', id: w.id, at: w.created_at.toISOString(), status: w.status, eventId: w.event_id, promotedAt: w.promoted_at?.toISOString() ?? null })),
          ...notifications.map((n) => ({ type: 'notification', id: n.id, at: n.created_at.toISOString(), templateKey: n.template_key, status: n.status, scheduledAt: n.scheduled_at.toISOString(), sentAt: n.sent_at?.toISOString() ?? null })),
        ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/contacts/merge', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = mergeContactsSchema.parse(req.body);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const contacts = await tx
        .selectFrom('visitors')
        .selectAll()
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .where('id', 'in', [body.keepId, ...body.mergeIds])
        .execute();
      if (contacts.length !== 1 + body.mergeIds.length) throw new NotFoundError('One or more contacts were not found.');
      const mergedTags = Array.from(new Set(contacts.flatMap((c) => c.tags)));
      await tx.updateTable('visits').set({ visitor_id: body.keepId }).where('org_id', '=', orgId).where('visitor_id', 'in', body.mergeIds).execute();
      await tx.updateTable('waitlist_entries').set({ visitor_id: body.keepId }).where('org_id', '=', orgId).where('visitor_id', 'in', body.mergeIds).execute();
      await tx
        .updateTable('visitors')
        .set({
          tags: mergedTags,
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('id', '=', body.keepId)
        .execute();
      await tx.updateTable('visitors').set({ deleted_at: new Date(), updated_at: new Date() }).where('org_id', '=', orgId).where('id', 'in', body.mergeIds).execute();
      await audit({ action: 'contact.merged', targetType: 'visitor', targetId: body.keepId, diff: { after: body } });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/contacts/:id/redact', async (req) => {
    const { orgId, id } = contactIdParamSchema.parse(req.params);
    await req.requireSuperadmin(orgId);
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .updateTable('visitors')
        .set({
          email: `redacted-${id}@redacted.invalid`,
          first_name: null,
          last_name: null,
          phone: null,
          address: null,
          notes: null,
          tags: [],
          stripe_customer_id: null,
          pii_redacted: true,
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('id', '=', id)
        .returning(['id'])
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'contact.pii_redacted', targetType: 'visitor', targetId: id });
      return { data: { ok: true } };
    });
  });

  registerSegmentRoutes(app);
}

function registerSegmentRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/segments', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'contacts.view_all');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx.selectFrom('visitor_segments').selectAll().where('org_id', '=', orgId).where('deleted_at', 'is', null).orderBy('name').execute();
      return { data: rows.map(publicSegment) };
    });
  });

  app.post('/api/v1/orgs/:orgId/segments', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createSegmentSchema.parse(req.body);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const visitorCount = await countSegmentVisitors(tx, orgId, body.filter);
      const row = await tx.insertInto('visitor_segments').values({ org_id: orgId, name: body.name, filter: JSON.stringify(body.filter), visitor_count: visitorCount, last_computed_at: new Date() }).returningAll().executeTakeFirstOrThrow();
      await audit({ action: 'segment.created', targetType: 'visitor_segment', targetId: row.id, diff: { after: body } });
      return { data: publicSegment(row) };
    });
  });

  app.get('/api/v1/orgs/:orgId/segments/:id', async (req) => {
    const { orgId, id } = segmentIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.view_all');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx.selectFrom('visitor_segments').selectAll().where('org_id', '=', orgId).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: publicSegment(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/segments/:id', async (req) => {
    const { orgId, id } = segmentIdParamSchema.parse(req.params);
    const body = updateSegmentSchema.parse(req.body);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const current = await tx.selectFrom('visitor_segments').selectAll().where('org_id', '=', orgId).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
      if (!current) throw new NotFoundError();
      const filter = body.filter ?? current.filter;
      const visitorCount = await countSegmentVisitors(tx, orgId, filter);
      const row = await tx
        .updateTable('visitor_segments')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.filter !== undefined ? { filter: JSON.stringify(body.filter) } : {}),
          visitor_count: visitorCount,
          last_computed_at: new Date(),
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({ action: 'segment.updated', targetType: 'visitor_segment', targetId: id, diff: { after: body } });
      return { data: publicSegment(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/segments/:id', async (req) => {
    const { orgId, id } = segmentIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx.updateTable('visitor_segments').set({ deleted_at: new Date(), updated_at: new Date() }).where('org_id', '=', orgId).where('id', '=', id).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'segment.deleted', targetType: 'visitor_segment', targetId: id });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/segments/:id/preview', async (req) => {
    const { orgId, id } = segmentIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'contacts.view_all');
    return withOrgRead(orgId, async (tx) => {
      const segment = await tx.selectFrom('visitor_segments').selectAll().where('org_id', '=', orgId).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
      if (!segment) throw new NotFoundError();
      const rows = await tx.selectFrom('visitors').selectAll().where('org_id', '=', orgId).where('deleted_at', 'is', null).where(segmentPredicate(segment.filter)).orderBy('created_at', 'desc').limit(50).execute();
      return { data: rows.map(publicContact), meta: { previewLimit: 50, count: await countSegmentVisitors(tx, orgId, segment.filter) } };
    });
  });
}

function publicSegment(row: {
  id: string;
  org_id: string;
  name: string;
  filter: unknown;
  visitor_count: number | null;
  last_computed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  const filter = typeof row.filter === 'string' ? JSON.parse(row.filter) : row.filter;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    filter,
    visitorCount: row.visitor_count,
    lastComputedAt: row.last_computed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
