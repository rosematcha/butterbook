import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createClosedDaySchema,
  createOverrideSchema,
  isoDateSchema,
  putHoursSchema,
  updateOverrideSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead, type Tx } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

const locParam = z.object({ orgId: z.string().uuid(), locId: z.string().uuid() });
const idParam = z.object({ orgId: z.string().uuid(), locId: z.string().uuid(), id: z.string().uuid() });

export function registerHoursRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/locations/:locId/hours', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    return withOrgRead(orgId, async (tx) => {
      await assertOwned(tx, orgId, locId);
      const rows = await tx
        .selectFrom('location_hours')
        .select(['id', 'day_of_week as dayOfWeek', 'open_time as openTime', 'close_time as closeTime', 'is_active as isActive'])
        .where('location_id', '=', locId)
        .execute();
      return { data: rows };
    });
  });

  app.put('/api/v1/orgs/:orgId/locations/:locId/hours', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const body = putHoursSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_hours');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await assertOwned(tx, orgId, locId);
      await tx.deleteFrom('location_hours').where('location_id', '=', locId).execute();
      if (body.hours.length > 0) {
        await tx
          .insertInto('location_hours')
          .values(
            body.hours.map((h) => ({
              location_id: locId,
              day_of_week: h.dayOfWeek,
              open_time: h.openTime,
              close_time: h.closeTime,
              is_active: h.isActive,
            })),
          )
          .execute();
      }
      await audit({ action: 'location.hours_replaced', targetType: 'location', targetId: locId, diff: { after: body.hours } });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/hours/overrides', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const q = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).parse(req.query);
    return withOrgRead(orgId, async (tx) => {
      await assertOwned(tx, orgId, locId);
      let query = tx.selectFrom('location_hour_overrides').selectAll().where('location_id', '=', locId);
      if (q.from) query = query.where('date', '>=', q.from);
      if (q.to) query = query.where('date', '<=', q.to);
      const rows = await query.execute();
      return { data: rows };
    });
  });

  app.post('/api/v1/orgs/:orgId/locations/:locId/hours/overrides', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const body = createOverrideSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_hours');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await assertOwned(tx, orgId, locId);
      const row = await tx
        .insertInto('location_hour_overrides')
        .values({
          location_id: locId,
          date: body.date,
          open_time: body.openTime,
          close_time: body.closeTime,
          reason: body.reason ?? null,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await audit({ action: 'location.override_created', targetType: 'location', targetId: locId, diff: { after: body } });
      return { data: { id: row.id } };
    });
  });

  app.patch('/api/v1/orgs/:orgId/locations/:locId/hours/overrides/:id', async (req) => {
    const { orgId, locId, id } = idParam.parse(req.params);
    const body = updateOverrideSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_hours');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.openTime !== undefined) updates.open_time = body.openTime;
      if (body.closeTime !== undefined) updates.close_time = body.closeTime;
      if (body.reason !== undefined) updates.reason = body.reason;
      const res = await tx.updateTable('location_hour_overrides').set(updates).where('id', '=', id).where('location_id', '=', locId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'location.override_updated', targetType: 'location', targetId: locId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/locations/:locId/hours/overrides/:id', async (req) => {
    const { orgId, locId, id } = idParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_hours');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx.deleteFrom('location_hour_overrides').where('id', '=', id).where('location_id', '=', locId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'location.override_deleted', targetType: 'location', targetId: locId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/closed', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const q = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).parse(req.query);
    return withOrgRead(orgId, async (tx) => {
      await assertOwned(tx, orgId, locId);
      let query = tx.selectFrom('closed_days').selectAll().where('location_id', '=', locId);
      if (q.from) query = query.where('date', '>=', q.from);
      if (q.to) query = query.where('date', '<=', q.to);
      const rows = await query.execute();
      return { data: rows };
    });
  });

  app.post('/api/v1/orgs/:orgId/locations/:locId/closed', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const body = createClosedDaySchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_closed_days');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await assertOwned(tx, orgId, locId);
      const row = await tx
        .insertInto('closed_days')
        .values({ location_id: locId, date: body.date, reason: body.reason ?? null })
        .onConflict((oc) => oc.columns(['location_id', 'date']).doUpdateSet({ reason: body.reason ?? null }))
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await audit({ action: 'location.closed_day_added', targetType: 'location', targetId: locId, diff: { after: body } });
      return { data: { id: row.id } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/locations/:locId/closed/:id', async (req) => {
    const { orgId, locId, id } = idParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_closed_days');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx.deleteFrom('closed_days').where('id', '=', id).where('location_id', '=', locId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'location.closed_day_deleted', targetType: 'location', targetId: locId });
      return { data: { ok: true } };
    });
  });
}

async function assertOwned(tx: Tx, orgId: string, locId: string): Promise<void> {
  const loc = await tx.selectFrom('locations').select('id').where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!loc) throw new NotFoundError('Location not found.');
}
