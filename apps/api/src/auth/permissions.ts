import { withOrgRead } from '../db/index.js';
import { type Permission, hasPermission as coreHas } from '@butterbook/shared';

export interface LoadedMembership {
  memberId: string;
  orgId: string;
  isSuperadmin: boolean;
  permissions: Set<Permission>;
}

// Runs inside withOrgRead so RLS enforces org isolation on the membership + permission
// lookup, not just our WHERE clauses. If the caller is not a member of `orgId`, RLS
// returns zero rows and we return null.
export async function loadMembership(userId: string, orgId: string): Promise<LoadedMembership | null> {
  return withOrgRead(orgId, async (tx) => {
    const member = await tx
      .selectFrom('org_members')
      .select(['id', 'is_superadmin'])
      .where('user_id', '=', userId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!member) return null;

    const perms = await tx
      .selectFrom('member_roles')
      .innerJoin('roles', 'roles.id', 'member_roles.role_id')
      .innerJoin('role_permissions', 'role_permissions.role_id', 'roles.id')
      .select(['role_permissions.permission'])
      .where('member_roles.org_member_id', '=', member.id)
      .where('roles.deleted_at', 'is', null)
      .execute();

    return {
      memberId: member.id,
      orgId,
      isSuperadmin: member.is_superadmin,
      permissions: new Set(perms.map((p) => p.permission as Permission)),
    };
  });
}

export function hasPerm(m: LoadedMembership, perm: Permission): boolean {
  return coreHas(
    { userId: '', orgId: m.orgId, isSuperadmin: m.isSuperadmin, permissions: m.permissions },
    perm,
  );
}
