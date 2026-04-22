import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Permission, ActorContext } from '@butterbook/shared';
import { getDb } from '../db/index.js';
import { resolveSession } from '../auth/session.js';
import { loadMembership } from '../auth/permissions.js';
import { AuthenticationError, NotFoundError, PermissionError } from '../errors/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string | null;
    userId: string | null;
    authUser: { id: string; email: string; totpEnabled: boolean } | null;
    // Lazily loaded per-orgId.
    loadMembershipFor(orgId: string): Promise<{
      memberId: string;
      orgId: string;
      isSuperadmin: boolean;
      permissions: Set<Permission>;
    }>;
    requireAuth(): void;
    requirePermission(orgId: string, perm: Permission): Promise<void>;
    requireSuperadmin(orgId: string): Promise<void>;
    // Refuses requests targeting a demo org. Wired onto mutations we don't
    // want exposed in the demo sandbox (invitation create, org delete, …).
    // Harmless in production: non-demo orgs always pass through.
    requireNotDemo(orgId: string): Promise<void>;
    actor(): ActorContext;
    actorForOrg(orgId: string, m: { isSuperadmin: boolean; permissions: Set<Permission> }): ActorContext;
  }
}

export function registerAuthContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.sessionId = null;
    req.userId = null;
    req.authUser = null;

    const auth = req.headers['authorization'];
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();
      const session = await resolveSession(token);
      if (session) {
        const user = await getDb()
          .selectFrom('users')
          .select(['id', 'email', 'totp_enabled'])
          .where('id', '=', session.userId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (user) {
          req.sessionId = session.sessionId;
          req.userId = user.id;
          req.authUser = { id: user.id, email: user.email, totpEnabled: user.totp_enabled };
        }
      }
    }

    const membershipCache = new Map<
      string,
      { memberId: string; orgId: string; isSuperadmin: boolean; permissions: Set<Permission> }
    >();

    req.loadMembershipFor = async (orgId: string) => {
      if (!req.userId) throw new AuthenticationError('Authentication required.');
      const cached = membershipCache.get(orgId);
      if (cached) return cached;
      const m = await loadMembership(req.userId, orgId);
      if (!m) throw new NotFoundError('Org not found or not accessible.');
      membershipCache.set(orgId, m);
      return m;
    };

    req.requireAuth = () => {
      if (!req.userId) throw new AuthenticationError('Authentication required.');
    };

    req.requirePermission = async (orgId: string, perm: Permission) => {
      req.requireAuth();
      const m = await req.loadMembershipFor(orgId);
      if (m.isSuperadmin) return;
      if (!m.permissions.has(perm)) {
        throw new PermissionError(`Missing permission: ${perm}`);
      }
    };

    req.requireSuperadmin = async (orgId: string) => {
      req.requireAuth();
      const m = await req.loadMembershipFor(orgId);
      if (!m.isSuperadmin) {
        throw new PermissionError('Superadmin required.');
      }
    };

    const demoCache = new Map<string, boolean>();
    req.requireNotDemo = async (orgId: string) => {
      let isDemo = demoCache.get(orgId);
      if (isDemo === undefined) {
        const row = await getDb()
          .selectFrom('orgs')
          .select('is_demo')
          .where('id', '=', orgId)
          .executeTakeFirst();
        isDemo = row?.is_demo ?? false;
        demoCache.set(orgId, isDemo);
      }
      if (isDemo) {
        throw new PermissionError('This action is disabled in the demo.');
      }
    };

    req.actor = () => ({
      userId: req.userId,
      orgId: null,
      isSuperadmin: false,
      permissions: new Set<Permission>(),
      actorType: req.userId ? 'user' : 'guest',
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    req.actorForOrg = (orgId, m) => ({
      userId: req.userId,
      orgId,
      isSuperadmin: m.isSuperadmin,
      permissions: m.permissions,
      actorType: req.userId ? 'user' : 'guest',
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
  });
}
