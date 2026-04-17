import { describe, it, expect } from 'vitest';
import { hasPermission } from '@butterbook/shared';

describe('permissions', () => {
  it('superadmin bypass returns true for any permission', () => {
    const ctx = { userId: 'u', orgId: 'o', isSuperadmin: true, permissions: new Set<never>() };
    expect(hasPermission(ctx, 'visits.cancel')).toBe(true);
    expect(hasPermission(ctx, 'admin.manage_org')).toBe(true);
  });

  it('non-superadmin requires exact permission', () => {
    const ctx = {
      userId: 'u',
      orgId: 'o',
      isSuperadmin: false,
      permissions: new Set(['visits.view_all'] as const),
    };
    expect(hasPermission(ctx, 'visits.view_all')).toBe(true);
    expect(hasPermission(ctx, 'visits.cancel')).toBe(false);
  });
});
