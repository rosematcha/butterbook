'use client';
import { create } from 'zustand';

export interface Membership {
  orgId: string;
  orgName: string;
  publicSlug: string;
  isSuperadmin: boolean;
}

export interface User {
  id: string;
  email: string;
  totpEnabled: boolean;
}

interface SessionState {
  user: User | null;
  memberships: Membership[];
  activeOrgId: string | null;
  setSession(user: User, memberships: Membership[]): void;
  setActiveOrgId(orgId: string | null): void;
  clear(): void;
}

const ACTIVE_ORG_KEY = 'butterbook.activeOrgId';

export const useSession = create<SessionState>((set) => ({
  user: null,
  memberships: [],
  activeOrgId: typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_ORG_KEY) : null,
  setSession: (user, memberships) =>
    set((s) => {
      // Ensure activeOrgId still points to a membership; otherwise use the first.
      let active = s.activeOrgId;
      if (!active || !memberships.find((m) => m.orgId === active)) {
        active = memberships[0]?.orgId ?? null;
        if (typeof window !== 'undefined') {
          if (active) window.localStorage.setItem(ACTIVE_ORG_KEY, active);
          else window.localStorage.removeItem(ACTIVE_ORG_KEY);
        }
      }
      return { user, memberships, activeOrgId: active };
    }),
  setActiveOrgId: (orgId) => {
    if (typeof window !== 'undefined') {
      if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      else window.localStorage.removeItem(ACTIVE_ORG_KEY);
    }
    set({ activeOrgId: orgId });
  },
  clear: () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(ACTIVE_ORG_KEY);
    set({ user: null, memberships: [], activeOrgId: null });
  },
}));
