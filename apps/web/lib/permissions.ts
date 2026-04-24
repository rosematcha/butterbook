'use client';
import { useMemo } from 'react';
import type { Permission } from '@butterbook/shared';
import { useSession } from './session';

// A "gate" is either a permission key (notifications.manage), the literal
// 'superadmin' for routes that only superadmins can reach (audit log), or
// omitted/null for routes anyone with a membership can see.
export type Gate = Permission | 'superadmin' | null | undefined;

export interface Permissions {
  isSuperadmin: boolean;
  has(perm: Permission): boolean;
  can(gate: Gate): boolean;
  // True while we don't yet know what the user can do — `/auth/me` hasn't
  // resolved. Pages should render a skeleton (or `null`) in this state, not
  // the denied state, so a slow /me doesn't flash "access denied" at a user
  // who actually has access.
  loading: boolean;
}

export function usePermissions(): Permissions {
  const membership = useSession((s) => s.membership);
  return useMemo(() => {
    if (!membership) {
      return {
        isSuperadmin: false,
        has: () => false,
        can: (gate) => !gate, // no gate → pass; any gate → deny-while-loading
        loading: true,
      };
    }
    const set = new Set<string>(membership.permissions);
    const isSuperadmin = membership.isSuperadmin;
    return {
      isSuperadmin,
      has: (perm) => isSuperadmin || set.has(perm),
      can: (gate) => {
        if (!gate) return true;
        if (gate === 'superadmin') return isSuperadmin;
        return isSuperadmin || set.has(gate);
      },
      loading: false,
    };
  }, [membership]);
}
