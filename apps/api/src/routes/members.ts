import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assignRoleSchema, setSuperadminSchema } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError, SuperadminInvariantError } from '../errors/index.js';
import { countSuperadminsForOrg } from '../services/orgs.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const memberParam = z.object({ orgId: z.string().uuid(), memberId: z.string().uuid() });
const roleIdParam = z.object({ orgId: z.string().uuid(), memberId: z.string().uuid(), roleId: z.string().uuid() });

export function registerMemberRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/members', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = z.object({ include_deleted: z.enum(['true', 'false']).optional() }).parse(req.query);
    await req.requirePermission(orgId, 'admin.manage_users');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let mq = tx
        .selectFrom('org_members')
        .innerJoin('users', 'users.id', 'org_members.user_id')
        .select([
          'org_members.id as memberId',
          'users.id as userId',
          'users.email',
          'users.display_name as displayName',
          'org_members.is_superadmin as isSuperadmin',
          'org_members.deleted_at as deletedAt',
        ])
        .where('org_members.org_id', '=', orgId);
      if (!includeDeleted) mq = mq.where('org_members.deleted_at', 'is', null);
      const members = await mq.execute();
      const roles = await tx
        .selectFrom('member_roles')
        .innerJoin('roles', 'roles.id', 'member_roles.role_id')
        .select([
          'member_roles.org_member_id as memberId',
          'roles.id as roleId',
          'roles.name',
        ])
        .where('roles.org_id', '=', orgId)
        .where('roles.deleted_at', 'is', null)
        .execute();
      const byMember = new Map<string, Array<{ id: string; name: string }>>();
      for (const r of roles) {
        const arr = byMember.get(r.memberId) ?? [];
        arr.push({ id: r.roleId, name: r.name });
        byMember.set(r.memberId, arr);
      }
      return {
        data: members.map((mm) => ({ ...mm, roles: byMember.get(mm.memberId) ?? [] })),
      };
    });
  });

  app.delete('/api/v1/orgs/:orgId/members/:memberId', async (req) => {
    const { orgId, memberId } = memberParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_users');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const target = await tx
        .selectFrom('org_members')
        .selectAll()
        .where('id', '=', memberId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!target) throw new NotFoundError();
      if (target.is_superadmin && (await countSuperadminsForOrg(tx, orgId)) <= 1) {
        throw new SuperadminInvariantError('Cannot remove the last superadmin.');
      }
      await tx.updateTable('org_members').set({ deleted_at: new Date() }).where('id', '=', memberId).execute();
      await audit({ action: 'member.removed', targetType: 'member', targetId: memberId });
      return { data: { ok: true } };
    });
  });

  app.patch('/api/v1/orgs/:orgId/members/:memberId/superadmin', async (req) => {
    const { orgId, memberId } = memberParam.parse(req.params);
    const body = setSuperadminSchema.parse(req.body);
    await req.requireSuperadmin(orgId);
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const target = await tx
        .selectFrom('org_members')
        .selectAll()
        .where('id', '=', memberId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!target) throw new NotFoundError();
      if (target.is_superadmin && !body.isSuperadmin && (await countSuperadminsForOrg(tx, orgId)) <= 1) {
        throw new SuperadminInvariantError('Cannot demote the last superadmin.');
      }
      await tx
        .updateTable('org_members')
        .set({ is_superadmin: body.isSuperadmin })
        .where('id', '=', memberId)
        .execute();
      await audit({
        action: body.isSuperadmin ? 'member.promoted_superadmin' : 'member.demoted_superadmin',
        targetType: 'member',
        targetId: memberId,
      });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/members/:memberId/roles', async (req) => {
    const { orgId, memberId } = memberParam.parse(req.params);
    const body = assignRoleSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_users');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const role = await tx
        .selectFrom('roles')
        .select(['id'])
        .where('id', '=', body.roleId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!role) throw new NotFoundError('Role not found.');
      const member = await tx
        .selectFrom('org_members')
        .select(['id'])
        .where('id', '=', memberId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!member) throw new NotFoundError('Member not found.');
      await tx
        .insertInto('member_roles')
        .values({ org_member_id: memberId, role_id: body.roleId })
        .onConflict((oc) => oc.doNothing())
        .execute();
      await audit({ action: 'member.role_assigned', targetType: 'member', targetId: memberId, diff: { after: { roleId: body.roleId } } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/members/:memberId/roles/:roleId', async (req) => {
    const { orgId, memberId, roleId } = roleIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_users');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await tx.deleteFrom('member_roles').where('org_member_id', '=', memberId).where('role_id', '=', roleId).execute();
      await audit({ action: 'member.role_removed', targetType: 'member', targetId: memberId, diff: { after: { roleId } } });
      return { data: { ok: true } };
    });
  });
}
