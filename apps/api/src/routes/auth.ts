import type { FastifyInstance } from 'fastify';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  totpConfirmSchema,
  totpDisableSchema,
} from '@butterbook/shared';
import { getDb } from '../db/index.js';
import { createSession, resolveSession, revokeAllForUser, revokeSession } from '../auth/session.js';
import {
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../utils/passwords.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { newTotpSecret, otpAuthUrl, verifyTotp } from '../utils/totp.js';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '../errors/index.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/v1/auth/register', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req) => {
    const body = registerSchema.parse(req.body);
    try {
      checkPasswordPolicy(body.password);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    const db = getDb();
    const existing = await db.selectFrom('users').select('id').where('email', '=', body.email).executeTakeFirst();
    if (existing) throw new ConflictError('An account with that email already exists.');
    const hash = await hashPassword(body.password);
    const inserted = await db
      .insertInto('users')
      .values({ email: body.email, password_hash: hash, display_name: body.displayName ?? null })
      .returning(['id', 'email', 'display_name'])
      .executeTakeFirstOrThrow();
    return { data: { id: inserted.id, email: inserted.email, displayName: inserted.display_name } };
  });

  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const body = loginSchema.parse(req.body);
    const db = getDb();
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', body.email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) throw new AuthenticationError('Invalid credentials.');
    const ok = await verifyPassword(user.password_hash, body.password);
    if (!ok) throw new AuthenticationError('Invalid credentials.');
    if (user.totp_enabled) {
      if (!body.totpCode) throw new AuthenticationError('TOTP code required.');
      const secret = decryptSecret(user.totp_secret_enc!);
      if (!verifyTotp(secret, body.totpCode)) throw new AuthenticationError('Invalid TOTP code.');
    }
    if (needsRehash(user.password_hash)) {
      const fresh = await hashPassword(body.password);
      await db.updateTable('users').set({ password_hash: fresh }).where('id', '=', user.id).execute();
    }
    const { token, expiresAt } = await createSession({
      userId: user.id,
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
    return {
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id, email: user.email, displayName: user.display_name, totpEnabled: user.totp_enabled },
      },
    };
  });

  app.post('/api/v1/auth/logout', async (req) => {
    req.requireAuth();
    if (req.sessionId) await revokeSession(req.sessionId);
    return { data: { ok: true } };
  });

  app.post('/api/v1/auth/sessions/revoke-all', async (req) => {
    req.requireAuth();
    await revokeAllForUser(req.userId!, req.sessionId ?? undefined);
    return { data: { ok: true } };
  });

  app.get('/api/v1/auth/me', async (req) => {
    req.requireAuth();
    const db = getDb();
    const memberships = await db
      .selectFrom('org_members')
      .innerJoin('orgs', 'orgs.id', 'org_members.org_id')
      .select([
        'org_members.org_id as orgId',
        'org_members.is_superadmin as isSuperadmin',
        'orgs.name as orgName',
        'orgs.public_slug as publicSlug',
      ])
      .where('org_members.user_id', '=', req.userId!)
      .where('org_members.deleted_at', 'is', null)
      .where('orgs.deleted_at', 'is', null)
      .execute();
    return { data: { user: req.authUser, memberships } };
  });

  app.post('/api/v1/auth/totp/enable', async (req) => {
    req.requireAuth();
    const db = getDb();
    const user = await db.selectFrom('users').selectAll().where('id', '=', req.userId!).executeTakeFirstOrThrow();
    if (user.totp_enabled) throw new ConflictError('TOTP already enabled.');
    const secret = newTotpSecret();
    const enc = encryptSecret(secret);
    await db.updateTable('users').set({ totp_secret_enc: enc, totp_enabled: false }).where('id', '=', user.id).execute();
    return { data: { secret, qrCodeUrl: otpAuthUrl(secret, user.email) } };
  });

  app.post('/api/v1/auth/totp/confirm', async (req) => {
    req.requireAuth();
    const body = totpConfirmSchema.parse(req.body);
    const db = getDb();
    const user = await db.selectFrom('users').selectAll().where('id', '=', req.userId!).executeTakeFirstOrThrow();
    if (!user.totp_secret_enc) throw new ConflictError('TOTP not initialized.');
    const secret = decryptSecret(user.totp_secret_enc);
    if (!verifyTotp(secret, body.code)) throw new AuthenticationError('Invalid TOTP code.');
    await db.updateTable('users').set({ totp_enabled: true }).where('id', '=', user.id).execute();
    return { data: { ok: true } };
  });

  app.post('/api/v1/auth/totp/disable', async (req) => {
    req.requireAuth();
    const body = totpDisableSchema.parse(req.body);
    const db = getDb();
    const user = await db.selectFrom('users').selectAll().where('id', '=', req.userId!).executeTakeFirstOrThrow();
    const pwOk = await verifyPassword(user.password_hash, body.password);
    if (!pwOk) throw new AuthenticationError('Invalid password.');
    if (!user.totp_enabled || !user.totp_secret_enc) throw new ConflictError('TOTP not enabled.');
    const secret = decryptSecret(user.totp_secret_enc);
    if (!verifyTotp(secret, body.code)) throw new AuthenticationError('Invalid TOTP code.');
    await db.updateTable('users').set({ totp_enabled: false, totp_secret_enc: null }).where('id', '=', user.id).execute();
    return { data: { ok: true } };
  });

  app.post(
    '/api/v1/auth/password/change',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (req) => {
      req.requireAuth();
      const body = changePasswordSchema.parse(req.body);
      try {
        checkPasswordPolicy(body.newPassword);
      } catch (e) {
        throw new ValidationError((e as Error).message);
      }
      const db = getDb();
      const user = await db.selectFrom('users').selectAll().where('id', '=', req.userId!).executeTakeFirstOrThrow();
      if (!(await verifyPassword(user.password_hash, body.currentPassword))) {
        throw new AuthenticationError('Invalid password.');
      }
      const hash = await hashPassword(body.newPassword);
      await db.updateTable('users').set({ password_hash: hash }).where('id', '=', user.id).execute();
      await revokeAllForUser(user.id, req.sessionId ?? undefined);
      return { data: { ok: true } };
    },
  );

  // Silence unused-var warning for resolveSession in tree-shaking.
  void resolveSession;
}
