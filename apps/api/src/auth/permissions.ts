import { withOrgRead } from '../db/index.js';
import { type Permission, hasPermission as coreHas } from '@butterbook/shared';

export interface LoadedMembership {
  memberId: string;
  orgId: string;
  isSuperadmin: boolean;
  permissions: Set<Permission>;
  locationPermissions: Map<string, Set<Permission>>;
}

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

    const rows = await tx
      .selectFrom('member_roles')
      .innerJoin('roles', 'roles.id', 'member_roles.role_id')
      .innerJoin('role_permissions', 'role_permissions.role_id', 'roles.id')
      .select(['role_permissions.permission', 'member_roles.scope_location_id'])
      .where('member_roles.org_member_id', '=', member.id)
      .where('roles.deleted_at', 'is', null)
      .execute();

    const orgWide = new Set<Permission>();
    const locationPerms = new Map<string, Set<Permission>>();

    for (const row of rows) {
      const perm = row.permission as Permission;
      if (!row.scope_location_id) {
        orgWide.add(perm);
      } else {
        let set = locationPerms.get(row.scope_location_id);
        if (!set) {
          set = new Set();
          locationPerms.set(row.scope_location_id, set);
        }
        set.add(perm);
      }
    }

    return {
      memberId: member.id,
      orgId,
      isSuperadmin: member.is_superadmin,
      permissions: orgWide,
      locationPermissions: locationPerms,
    };
  });
}

export function hasPerm(m: LoadedMembership, perm: Permission): boolean {
  return coreHas(
    { userId: '', orgId: m.orgId, isSuperadmin: m.isSuperadmin, permissions: m.permissions },
    perm,
  );
}

export function hasPermAtLocation(m: LoadedMembership, perm: Permission, locationId: string): boolean {
  if (m.isSuperadmin) return true;
  if (m.permissions.has(perm)) return true;
  const locPerms = m.locationPermissions.get(locationId);
  return locPerms?.has(perm) ?? false;
}
