import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError, ValidationError, AuthenticationError, ConflictError } from '../errors/index.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { getConfig } from '../config.js';
import { createSession } from '../auth/session.js';
import { hashPassword } from '../utils/passwords.js';
import {
  buildSsoRedirectUrl,
  exchangeSsoCode,
  makeSsoState,
  verifySsoState,
  type SsoProvider,
} from '../services/sso.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const providerIdParam = z.object({ orgId: z.string().uuid(), providerId: z.string().uuid() });

const createSsoProviderSchema = z
  .object({
    provider: z.enum(['google', 'microsoft']),
    clientId: z.string().trim().min(1).max(500),
    clientSecret: z.string().trim().min(1).max(500),
    allowedDomains: z.array(z.string().trim().min(1).max(255)).max(20).default([]),
    defaultRoleId: z.string().uuid().nullable().optional(),
    ssoRequired: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const updateSsoProviderSchema = z
  .object({
    clientId: z.string().trim().min(1).max(500).optional(),
    clientSecret: z.string().trim().min(1).max(500).optional(),
    allowedDomains: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
    defaultRoleId: z.string().uuid().nullable().optional(),
    ssoRequired: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

function publicProvider(row: {
  id: string;
  org_id: string;
  provider: string;
  client_id: string;
  allowed_domains: string[];
  default_role_id: string | null;
  sso_required: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    clientId: row.client_id,
    allowedDomains: row.allowed_domains,
    defaultRoleId: row.default_role_id,
    ssoRequired: row.sso_required,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function registerSsoRoutes(app: FastifyInstance): void {
  // --- Admin CRUD ---

  app.get('/api/v1/orgs/:orgId/sso-providers', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_org');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('org_sso_providers')
        .selectAll()
        .where('org_id', '=', orgId)
        .orderBy('provider')
        .execute();
      return { data: rows.map(publicProvider) };
    });
  });

  app.post('/api/v1/orgs/:orgId/sso-providers', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createSsoProviderSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const existing = await tx
        .selectFrom('org_sso_providers')
        .select(['id'])
        .where('org_id', '=', orgId)
        .where('provider', '=', body.provider)
        .executeTakeFirst();
      if (existing) throw new ConflictError(`An SSO provider for ${body.provider} already exists.`);

      const row = await tx
        .insertInto('org_sso_providers')
        .values({
          org_id: orgId,
          provider: body.provider,
          client_id: body.clientId,
          client_secret: encryptSecret(body.clientSecret),
          allowed_domains: body.allowedDomains,
          default_role_id: body.defaultRoleId ?? null,
          sso_required: body.ssoRequired ?? false,
          enabled: body.enabled ?? false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({
        action: 'sso_provider.created',
        targetType: 'org_sso_provider',
        targetId: row.id,
        diff: { after: { provider: body.provider, clientId: body.clientId, allowedDomains: body.allowedDomains } },
      });
      return { data: publicProvider(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/sso-providers/:providerId', async (req) => {
    const { orgId, providerId } = providerIdParam.parse(req.params);
    const body = updateSsoProviderSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.clientId !== undefined) updates.client_id = body.clientId;
      if (body.clientSecret !== undefined) updates.client_secret = encryptSecret(body.clientSecret);
      if (body.allowedDomains !== undefined) updates.allowed_domains = body.allowedDomains;
      if (body.defaultRoleId !== undefined) updates.default_role_id = body.defaultRoleId;
      if (body.ssoRequired !== undefined) updates.sso_required = body.ssoRequired;
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      updates.updated_at = new Date();
      const row = await tx
        .updateTable('org_sso_providers')
        .set(updates)
        .where('org_id', '=', orgId)
        .where('id', '=', providerId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({
        action: 'sso_provider.updated',
        targetType: 'org_sso_provider',
        targetId: providerId,
        diff: { after: { ...body, clientSecret: body.clientSecret ? '***' : undefined } },
      });
      return { data: publicProvider(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/sso-providers/:providerId', async (req) => {
    const { orgId, providerId } = providerIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .deleteFrom('org_sso_providers')
        .where('org_id', '=', orgId)
        .where('id', '=', providerId)
        .returning(['id'])
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'sso_provider.deleted', targetType: 'org_sso_provider', targetId: providerId });
      return { data: { ok: true } };
    });
  });

  // --- Public SSO flow ---

  const ssoRl = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/api/v1/sso/redirect', ssoRl, async (req, reply) => {
    const q = z.object({ org: z.string().trim().min(1), provider: z.enum(['google', 'microsoft']).optional() }).parse(req.query);
    const org = await getDb()
      .selectFrom('orgs')
      .select(['id', 'public_slug'])
      .where('public_slug', '=', q.org)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw new NotFoundError('Organization not found.');

    const ssoRow = await getDb()
      .selectFrom('org_sso_providers')
      .selectAll()
      .where('org_id', '=', org.id)
      .where('enabled', '=', true)
      .where('provider', '=', q.provider ?? 'google')
      .executeTakeFirst();
    if (!ssoRow) throw new NotFoundError('SSO is not configured for this organization.');

    const provider: SsoProvider = {
      id: ssoRow.id,
      orgId: ssoRow.org_id,
      provider: ssoRow.provider,
      clientId: ssoRow.client_id,
      allowedDomains: ssoRow.allowed_domains,
      defaultRoleId: ssoRow.default_role_id,
      ssoRequired: ssoRow.sso_required,
      enabled: ssoRow.enabled,
    };

    const callbackUrl = `${getConfig().APP_BASE_URL}/api/v1/sso/callback`;
    const state = makeSsoState(org.id, ssoRow.id);
    const secret = decryptSecret(ssoRow.client_secret);
    const redirectUrl = buildSsoRedirectUrl(provider, secret, callbackUrl, state);

    return reply.status(302).redirect(redirectUrl);
  });

  app.get('/api/v1/sso/callback', ssoRl, async (req, reply) => {
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    const verified = verifySsoState(q.state);
    if (!verified) throw new AuthenticationError('Invalid or expired SSO state.');

    const ssoRow = await getDb()
      .selectFrom('org_sso_providers')
      .selectAll()
      .where('id', '=', verified.providerId)
      .where('org_id', '=', verified.orgId)
      .where('enabled', '=', true)
      .executeTakeFirst();
    if (!ssoRow) throw new AuthenticationError('SSO provider not found or disabled.');

    const provider: SsoProvider = {
      id: ssoRow.id,
      orgId: ssoRow.org_id,
      provider: ssoRow.provider,
      clientId: ssoRow.client_id,
      allowedDomains: ssoRow.allowed_domains,
      defaultRoleId: ssoRow.default_role_id,
      ssoRequired: ssoRow.sso_required,
      enabled: ssoRow.enabled,
    };

    const callbackUrl = `${getConfig().APP_BASE_URL}/api/v1/sso/callback`;
    const userInfo = await exchangeSsoCode(provider, q.code, callbackUrl);

    if (provider.allowedDomains.length > 0) {
      const domain = userInfo.email.split('@')[1];
      if (!domain || !provider.allowedDomains.includes(domain)) {
        throw new AuthenticationError(`Email domain "${domain}" is not allowed for this organization.`);
      }
    }

    const db = getDb();
    let user = await db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('email', '=', userInfo.email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!user) {
      const randomPass = crypto.randomBytes(32).toString('base64url');
      const hash = await hashPassword(randomPass);
      user = await db
        .insertInto('users')
        .values({
          email: userInfo.email,
          password_hash: hash,
          display_name: userInfo.name ?? userInfo.givenName ?? null,
        })
        .returning(['id', 'email'])
        .executeTakeFirstOrThrow();
    }

    let member = await db
      .selectFrom('org_members')
      .select(['id'])
      .where('org_id', '=', verified.orgId)
      .where('user_id', '=', user.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!member) {
      member = await db
        .insertInto('org_members')
        .values({
          org_id: verified.orgId,
          user_id: user.id,
          is_superadmin: false,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      if (provider.defaultRoleId) {
        await db
          .insertInto('member_roles')
          .values({ org_member_id: member.id, role_id: provider.defaultRoleId })
          .onConflict((oc) => oc.columns(['org_member_id', 'role_id']).doNothing())
          .execute();
      }
    }

    const { token } = await createSession({
      userId: user.id,
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });

    const cfg = getConfig();
    const webOrigin = cfg.CORS_ALLOWED_ORIGINS[0] ?? cfg.APP_BASE_URL;
    return reply.status(302).redirect(`${webOrigin}/login?sso_token=${encodeURIComponent(token)}`);
  });
}
