import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRoleSchema, putPermissionsSchema, updateRoleSchema } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const roleParam = z.object({ orgId: z.string().uuid(), roleId: z.string().uuid() });

export function registerRoleRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/roles', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_roles');
    return withOrgRead(orgId, async (tx) => {
      const roles = await tx
        .selectFrom('roles')
        .selectAll()
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .execute();
      return { data: roles.map(publicRole) };
    });
  });

  app.post('/api/v1/orgs/:orgId/roles', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createRoleSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_roles');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const conflict = await tx.selectFrom('roles').select('id').where('org_id', '=', orgId).where('name', '=', body.name).where('deleted_at', 'is', null).executeTakeFirst();
      if (conflict) throw new ConflictError('Role with that name already exists.');
      const role = await tx
        .insertInto('roles')
        .values({ org_id: orgId, name: body.name, description: body.description ?? null })
        .returning(['id', 'name', 'description'])
        .executeTakeFirstOrThrow();
      if (body.permissions && body.permissions.length > 0) {
        await tx
          .insertInto('role_permissions')
          .values(body.permissions.map((p) => ({ role_id: role.id, permission: p, scope_type: null, scope_id: null })))
          .execute();
      }
      await audit({ action: 'role.created', targetType: 'role', targetId: role.id, diff: { after: body } });
      return { data: { id: role.id, name: role.name, description: role.description } };
    });
  });

  app.get('/api/v1/orgs/:orgId/roles/:roleId', async (req) => {
    const { orgId, roleId } = roleParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_roles');
    return withOrgRead(orgId, async (tx) => {
      const role = await tx.selectFrom('roles').selectAll().where('id', '=', roleId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!role) throw new NotFoundError();
      return { data: publicRole(role) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/roles/:roleId', async (req) => {
    const { orgId, roleId } = roleParam.parse(req.params);
    const body = updateRoleSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_roles');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (Object.keys(updates).length > 0) {
        const res = await tx.updateTable('roles').set(updates).where('id', '=', roleId).where('org_id', '=', orgId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
        if (!res) throw new NotFoundError();
      }
      await audit({ action: 'role.updated', targetType: 'role', targetId: roleId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/roles/:roleId', async (req) => {
    const { orgId, roleId } = roleParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_roles');
    const mm = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, mm), async ({ tx, audit }) => {
      await tx.deleteFrom('member_roles').where('role_id', '=', roleId).execute();
      const res = await tx.updateTable('roles').set({ deleted_at: new Date() }).where('id', '=', roleId).where('org_id', '=', orgId).returning(['id']).executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'role.deleted', targetType: 'role', targetId: roleId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/roles/:roleId/permissions', async (req) => {
    const { orgId, roleId } = roleParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_roles');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx.selectFrom('role_permissions').innerJoin('roles', 'roles.id', 'role_permissions.role_id').select(['role_permissions.permission']).where('roles.id', '=', roleId).where('roles.org_id', '=', orgId).execute();
      return { data: rows.map((r) => r.permission) };
    });
  });

  app.put('/api/v1/orgs/:orgId/roles/:roleId/permissions', async (req) => {
    const { orgId, roleId } = roleParam.parse(req.params);
    const body = putPermissionsSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_roles');
    const mm = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, mm), async ({ tx, audit }) => {
      const role = await tx.selectFrom('roles').select(['id']).where('id', '=', roleId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!role) throw new NotFoundError();
      await tx.deleteFrom('role_permissions').where('role_id', '=', roleId).execute();
      if (body.permissions.length > 0) {
        await tx
          .insertInto('role_permissions')
          .values(body.permissions.map((p) => ({ role_id: roleId, permission: p, scope_type: null, scope_id: null })))
          .execute();
      }
      await audit({ action: 'role.permissions_replaced', targetType: 'role', targetId: roleId, diff: { after: body.permissions } });
      return { data: body.permissions };
    });
  });
}

function publicRole(r: { id: string; name: string; description: string | null }) {
  return { id: r.id, name: r.name, description: r.description };
}
