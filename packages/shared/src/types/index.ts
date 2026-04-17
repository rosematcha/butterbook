import type { Permission } from '../permissions/registry.js';

export interface ActorContext {
  userId: string | null;
  orgId: string | null;
  isSuperadmin: boolean;
  permissions: Set<Permission>;
  actorType: 'user' | 'guest' | 'kiosk' | 'system';
  ip: string | null;
  userAgent: string | null;
}

export interface AuditEntryInput {
  action: string;
  targetType: string;
  targetId: string;
  diff?: { before?: unknown; after?: unknown } | null;
}
