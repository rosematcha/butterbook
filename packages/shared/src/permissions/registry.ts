export const PERMISSIONS = [
  'visits.create',
  'visits.edit',
  'visits.cancel',
  'visits.view_all',

  'events.create',
  'events.edit',
  'events.delete',
  'events.publish',
  'events.manage_waitlist',
  'events.view_registrations',

  'admin.manage_roles',
  'admin.manage_users',
  'admin.manage_locations',
  'admin.manage_hours',
  'admin.manage_closed_days',
  'admin.manage_org',
  'admin.manage_forms',

  'reports.view',
  'reports.export',

  'kiosk.access',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SET: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isPermission(x: unknown): x is Permission {
  return typeof x === 'string' && PERMISSION_SET.has(x as Permission);
}

export interface PermissionCtx {
  userId: string;
  orgId: string;
  isSuperadmin: boolean;
  permissions: Set<Permission>;
}

export function hasPermission(ctx: PermissionCtx, permission: Permission): boolean {
  if (ctx.isSuperadmin) return true;
  return ctx.permissions.has(permission);
}
