'use client';
import { terminologyCopy, type Terminology, type TerminologyCopy } from '@butterbook/shared';
import { useSession } from './session';

// Resolves the active org's booking terminology (appointment vs visit) and
// returns the copy bundle. Falls back to 'visit' when no membership is loaded
// yet so SSR/hydration renders don't flash a different label.
export function useTerminology(): TerminologyCopy {
  const { activeOrgId, memberships } = useSession();
  const active = memberships.find((m) => m.orgId === activeOrgId);
  const t: Terminology = active?.terminology ?? 'visit';
  return terminologyCopy(t);
}
