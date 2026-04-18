import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import { createLocationSchema, updateLocationSchema } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { getConfig } from '../config.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const locParam = z.object({ orgId: z.string().uuid(), locId: z.string().uuid() });

export function registerLocationRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/locations', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = z.object({ include_deleted: z.enum(['true', 'false']).optional() }).parse(req.query);
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let query = tx
        .selectFrom('locations')
        .select(['id', 'name', 'address', 'zip', 'is_primary as isPrimary', 'deleted_at as deletedAt'])
        .where('org_id', '=', orgId);
      if (!includeDeleted) query = query.where('deleted_at', 'is', null);
      const rows = await query.execute();
      return { data: rows };
    });
  });

  app.post('/api/v1/orgs/:orgId/locations', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createLocationSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_locations');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.isPrimary) {
        await tx.updateTable('locations').set({ is_primary: false }).where('org_id', '=', orgId).where('deleted_at', 'is', null).execute();
      }
      const row = await tx
        .insertInto('locations')
        .values({
          org_id: orgId,
          name: body.name,
          address: body.address ?? null,
          zip: body.zip ?? null,
          is_primary: body.isPrimary ?? false,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await audit({ action: 'location.created', targetType: 'location', targetId: row.id, diff: { after: body } });
      return { data: { id: row.id } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    return withOrgRead(orgId, async (tx) => {
      const loc = await tx
        .selectFrom('locations')
        .select(['id', 'name', 'address', 'zip', 'is_primary as isPrimary'])
        .where('id', '=', locId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!loc) throw new NotFoundError();
      return { data: loc };
    });
  });

  app.patch('/api/v1/orgs/:orgId/locations/:locId', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    const body = updateLocationSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_locations');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.address !== undefined) updates.address = body.address;
      if (body.zip !== undefined) updates.zip = body.zip;
      if (body.isPrimary !== undefined) updates.is_primary = body.isPrimary;
      if (body.isPrimary) {
        await tx.updateTable('locations').set({ is_primary: false }).where('org_id', '=', orgId).where('id', '!=', locId).where('deleted_at', 'is', null).execute();
      }
      if (Object.keys(updates).length > 0) {
        const res = await tx.updateTable('locations').set(updates).where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
        if (!res) throw new NotFoundError();
      }
      await audit({ action: 'location.updated', targetType: 'location', targetId: locId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/locations/:locId', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_locations');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const loc = await tx.selectFrom('locations').selectAll().where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!loc) throw new NotFoundError();
      if (loc.is_primary) throw new ConflictError('Cannot delete primary location. Designate another primary first.');
      await tx.updateTable('locations').set({ deleted_at: new Date() }).where('id', '=', locId).execute();
      await audit({ action: 'location.deleted', targetType: 'location', targetId: locId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/locations/:locId/set-primary', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_locations');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const loc = await tx.selectFrom('locations').select(['id']).where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!loc) throw new NotFoundError();
      await tx.updateTable('locations').set({ is_primary: false }).where('org_id', '=', orgId).where('deleted_at', 'is', null).execute();
      await tx.updateTable('locations').set({ is_primary: true }).where('id', '=', locId).execute();
      await audit({ action: 'location.set_primary', targetType: 'location', targetId: locId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/locations/:locId/qr', async (req, reply) => {
    const { orgId, locId } = locParam.parse(req.params);
    req.requireAuth();
    await req.loadMembershipFor(orgId);
    const result = await withOrgRead(orgId, async (tx) => {
      const loc = await tx.selectFrom('locations').select(['qr_token']).where('id', '=', locId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!loc) throw new NotFoundError();
      return loc.qr_token;
    });
    const url = `${getConfig().APP_BASE_URL}/kiosk/${result}?kiosk=true`;
    const png = await QRCode.toBuffer(url, { type: 'png', margin: 1, width: 512 });
    return reply.type('image/png').send(png);
  });

  app.post('/api/v1/orgs/:orgId/locations/:locId/qr/rotate', async (req) => {
    const { orgId, locId } = locParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_locations');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx
        .updateTable('locations')
        .set({ qr_token: crypto.randomUUID() })
        .where('id', '=', locId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .returning(['qr_token'])
        .executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'location.qr_rotated', targetType: 'location', targetId: locId });
      return { data: { qrToken: res.qr_token } };
    });
  });
}
