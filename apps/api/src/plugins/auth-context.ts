import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Permission, ActorContext, PlanSlug } from '@butterbook/shared';
import { PERMISSION_SET } from '@butterbook/shared';
import { getDb } from '../db/index.js';
import { resolveSession } from '../auth/session.js';
import { loadMembership } from '../auth/permissions.js';
import { AuthenticationError, NotFoundError, PermissionError } from '../errors/index.js';
import { sha256Hex } from '../utils/ids.js';
import { resolveEffectivePlan } from '../services/plan.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string | null;
    userId: string | null;
    authUser: { id: string; email: string; totpEnabled: boolean } | null;
    apiKeyId: string | null;
    apiKeyOrgId: string | null;
    apiKeyPermissions: Set<Permission> | null;
    // Lazily loaded per-orgId.
    loadMembershipFor(orgId: string): Promise<{
      memberId: string;
      orgId: string;
      isSuperadmin: boolean;
      permissions: Set<Permission>;
      locationPermissions: Map<string, Set<Permission>>;
    }>;
    requireAuth(): void;
    requirePermission(orgId: string, perm: Permission, locationId?: string): Promise<void>;
    requireSuperadmin(orgId: string): Promise<void>;
    // Refuses requests targeting a demo org. Wired onto mutations we don't
    // want exposed in the demo sandbox (invitation create, org delete, …).
    // Harmless in production: non-demo orgs always pass through.
    requireNotDemo(orgId: string): Promise<void>;
    actor(): ActorContext;
    actorForOrg(orgId: string, m: { isSuperadmin: boolean; permissions: Set<Permission> }): ActorContext;
    getEffectivePlan(orgId: string): Promise<PlanSlug>;
  }
}

export function registerAuthContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.sessionId = null;
    req.userId = null;
    req.authUser = null;
    req.apiKeyId = null;
    req.apiKeyOrgId = null;
    req.apiKeyPermissions = null;

    const auth = req.headers['authorization'];
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();

      if (token.startsWith('bb_live_')) {
        const keyHash = sha256Hex(token);
        const row = await getDb()
          .selectFrom('org_api_keys')
          .select(['id', 'org_id', 'permissions'])
          .where('key_hash', '=', keyHash)
          .where('revoked_at', 'is', null)
          .executeTakeFirst();
        if (row) {
          req.apiKeyId = row.id;
          req.apiKeyOrgId = row.org_id;
          const perms = new Set<Permission>();
          for (const p of row.permissions) {
            if (PERMISSION_SET.has(p as Permission)) perms.add(p as Permission);
          }
          req.apiKeyPermissions = perms;
          // Touch last_used_at (fire-and-forget, no await needed for request path)
          getDb()
            .updateTable('org_api_keys')
            .set({ last_used_at: new Date() })
            .where('id', '=', row.id)
            .execute()
            .catch(() => {});
        }
      } else {
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
    }

    const membershipCache = new Map<
      string,
      { memberId: string; orgId: string; isSuperadmin: boolean; permissions: Set<Permission>; locationPermissions: Map<string, Set<Permission>> }
    >();

    req.loadMembershipFor = async (orgId: string) => {
      // API key auth: synthesize a membership-like object from the key's org + perms.
      if (req.apiKeyId && req.apiKeyOrgId === orgId) {
        const cached = membershipCache.get(orgId);
        if (cached) return cached;
        const m = {
          memberId: `apikey:${req.apiKeyId}`,
          orgId,
          isSuperadmin: false,
          permissions: req.apiKeyPermissions ?? new Set<Permission>(),
          locationPermissions: new Map<string, Set<Permission>>(),
        };
        membershipCache.set(orgId, m);
        return m;
      }
      if (!req.userId) throw new AuthenticationError('Authentication required.');
      const cached = membershipCache.get(orgId);
      if (cached) return cached;
      const m = await loadMembership(req.userId, orgId);
      if (!m) throw new NotFoundError('Org not found or not accessible.');
      membershipCache.set(orgId, m);
      return m;
    };

    req.requireAuth = () => {
      if (!req.userId && !req.apiKeyId) throw new AuthenticationError('Authentication required.');
    };

    req.requirePermission = async (orgId: string, perm: Permission, locationId?: string) => {
      req.requireAuth();
      const m = await req.loadMembershipFor(orgId);
      if (m.isSuperadmin) return;
      if (m.permissions.has(perm)) return;
      if (locationId) {
        const locPerms = m.locationPermissions.get(locationId);
        if (locPerms?.has(perm)) return;
      }
      throw new PermissionError(`Missing permission: ${perm}`);
    };

    req.requireSuperadmin = async (orgId: string) => {
      req.requireAuth();
      // API keys can never be superadmin.
      if (req.apiKeyId) throw new PermissionError('Superadmin required.');
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

    const planCache = new Map<string, PlanSlug>();
    req.getEffectivePlan = async (orgId: string): Promise<PlanSlug> => {
      const cached = planCache.get(orgId);
      if (cached !== undefined) return cached;
      const row = await getDb()
        .selectFrom('orgs')
        .select(['plan', 'is_demo', 'plan_grandfathered_until'])
        .where('id', '=', orgId)
        .executeTakeFirst();
      if (!row) return 'free';
      const effective = resolveEffectivePlan(row.plan as PlanSlug, {
        isDemo: row.is_demo,
        grandfatheredUntil: row.plan_grandfathered_until ?? null,
      });
      planCache.set(orgId, effective);
      return effective;
    };

    req.actor = () => ({
      userId: req.userId,
      orgId: req.apiKeyOrgId,
      isSuperadmin: false,
      permissions: req.apiKeyPermissions ?? new Set<Permission>(),
      actorType: req.apiKeyId ? 'api_key' : req.userId ? 'user' : 'guest',
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    req.actorForOrg = (orgId, m) => ({
      userId: req.userId,
      orgId,
      isSuperadmin: m.isSuperadmin,
      permissions: m.permissions,
      actorType: req.apiKeyId ? 'api_key' : req.userId ? 'user' : 'guest',
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
  });
}
