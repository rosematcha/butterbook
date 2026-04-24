'use client';
import { create } from 'zustand';

export interface Membership {
  orgId: string;
  orgName: string;
  publicSlug: string;
  isSuperadmin: boolean;
  terminology?: 'appointment' | 'visit';
  // Permission keys the user has in this org. For superadmins the API returns
  // the full registry so the client can do a flat Set lookup without branching
  // on isSuperadmin on every render.
  permissions: string[];
}

export interface User {
  id: string;
  email: string;
  totpEnabled: boolean;
}

interface SessionState {
  user: User | null;
  membership: Membership | null;
  // Convenience mirror of membership?.orgId — every API call key is scoped by
  // orgId, and most call sites just need the id, not the full membership.
  activeOrgId: string | null;
  setSession(user: User, membership: Membership | null): void;
  clear(): void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  membership: null,
  activeOrgId: null,
  setSession: (user, membership) =>
    set({ user, membership, activeOrgId: membership?.orgId ?? null }),
  clear: () => set({ user: null, membership: null, activeOrgId: null }),
}));
