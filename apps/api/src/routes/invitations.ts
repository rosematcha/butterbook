import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createInvitationSchema, passwordSchema } from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { hashProvidedToken, randomTokenBase64Url } from '../utils/ids.js';
import { checkPasswordPolicy, hashPassword } from '../utils/passwords.js';
import { getConfig } from '../config.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = z.object({ orgId: z.string().uuid(), id: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(10).max(256) });

export function registerInvitationRoutes(app: FastifyInstance): void {
  app.post('/api/v1/orgs/:orgId/invitations', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createInvitationSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_users');
    await req.requireNotDemo(orgId);
    const m = await req.loadMembershipFor(orgId);
    // One-org-per-user: reject up-front if the invitee email already maps to a
    // user with an active membership anywhere.
    const inviteeAlreadyMember = await getDb()
      .selectFrom('users')
      .innerJoin('org_members', 'org_members.user_id', 'users.id')
      .select('users.id')
      .where('users.email', '=', body.email.toLowerCase())
      .where('org_members.deleted_at', 'is', null)
      .executeTakeFirst();
    if (inviteeAlreadyMember) throw new ConflictError('That user already belongs to an organization.');
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
      for (const roleId of body.roleIds) {
        const r = await tx.selectFrom('roles').select(['id']).where('id', '=', roleId).where('org_id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
        if (!r) throw new NotFoundError(`Role not found: ${roleId}`);
      }
      const { token, hash } = randomTokenBase64Url(32);
      const expiresAt = new Date(Date.now() + body.ttlHours * 60 * 60 * 1000);
      const row = await tx
        .insertInto('invitations')
        .values({
          org_id: orgId,
          email: body.email.toLowerCase(),
          token_hash: hash,
          invited_by: req.userId!,
          role_ids: body.roleIds,
          expires_at: expiresAt,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const acceptUrl = `${getConfig().APP_BASE_URL}/invitations/${token}/accept`;
      await audit({ action: 'invitation.created', targetType: 'invitation', targetId: row.id, diff: { after: { email: body.email } } });
      await emit({
        eventType: 'invitation.created',
        aggregateType: 'invitation',
        aggregateId: row.id,
        payload: {
          version: 1,
          invitationId: row.id,
          inviteeEmail: body.email.toLowerCase(),
          acceptUrl,
          expiresAt: expiresAt.toISOString(),
          inviterUserId: req.userId,
        },
      });
      return {
        data: {
          id: row.id,
          email: body.email,
          expiresAt: expiresAt.toISOString(),
          url: acceptUrl,
        },
      };
    });
  });

  app.get('/api/v1/orgs/:orgId/invitations', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_users');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('invitations')
        .select(['id', 'email', 'role_ids', 'expires_at', 'accepted_at', 'created_at'])
        .where('org_id', '=', orgId)
        .execute();
      return { data: rows };
    });
  });

  app.delete('/api/v1/orgs/:orgId/invitations/:id', async (req) => {
    const { orgId, id } = idParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_users');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const res = await tx.deleteFrom('invitations').where('id', '=', id).where('org_id', '=', orgId).returning('id').executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'invitation.deleted', targetType: 'invitation', targetId: id });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/invitations/:token/accept', async (req) => {
    const { token } = tokenParam.parse(req.params);
    const hash = hashProvidedToken(token);
    const db = getDb();
    // Invitation lookup: app.current_org_id is not yet set (we don't know which
    // org without the token), but RLS policy passes through on NULL context var,
    // so a direct lookup works. Token hash is high-entropy; this is not a leak.
    const invite = await db.selectFrom('invitations').selectAll().where('token_hash', '=', hash).executeTakeFirst();
    if (!invite) throw new NotFoundError('Invitation not found.');
    if (invite.accepted_at) throw new ConflictError('Invitation already accepted.');
    const expAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at as unknown as string);
    if (expAt.getTime() <= Date.now()) throw new ConflictError('Invitation expired.');

    let userId = req.userId;
    if (!userId) {
      const body = z
        .object({ email: z.string().email(), password: passwordSchema, displayName: z.string().min(1).max(200).optional() })
        .strict()
        .parse(req.body);
      if (body.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ValidationError('Email does not match invitation.');
      }
      try {
        checkPasswordPolicy(body.password);
      } catch (e) {
        throw new ValidationError((e as Error).message);
      }
      const existing = await db.selectFrom('users').select('id').where('email', '=', body.email).executeTakeFirst();
      if (existing) throw new ConflictError('Account with that email already exists.');
      const hashPw = await hashPassword(body.password);
      const u = await db.insertInto('users').values({ email: body.email, password_hash: hashPw, display_name: body.displayName ?? null }).returning(['id']).executeTakeFirstOrThrow();
      userId = u.id;
    }

    // Membership + role assignment under the invitation's org. Use withOrgContext
    // so RLS enforces isolation; the "actor" is the accepting user.
    const result = await withOrgContext(
      invite.org_id,
      {
        userId,
        orgId: invite.org_id,
        isSuperadmin: false,
        permissions: new Set(),
        actorType: 'user',
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      },
      async ({ tx, audit }) => {
        // One-org-per-user: refuse if the accepting user already has any
        // membership (active or soft-deleted — we don't reactivate).
        const anyExisting = await tx
          .selectFrom('org_members')
          .select('id')
          .where('user_id', '=', userId!)
          .executeTakeFirst();
        if (anyExisting) throw new ConflictError('User already belongs to an organization.');
        const row = await tx.insertInto('org_members').values({ org_id: invite.org_id, user_id: userId! }).returning(['id']).executeTakeFirstOrThrow();
        const memberId = row.id;
        for (const roleId of invite.role_ids) {
          await tx.insertInto('member_roles').values({ org_member_id: memberId, role_id: roleId }).onConflict((oc) => oc.doNothing()).execute();
        }
        await tx.updateTable('invitations').set({ accepted_at: new Date(), accepted_by: userId! }).where('id', '=', invite.id).execute();
        await audit({ action: 'invitation.accepted', targetType: 'invitation', targetId: invite.id });
        return { memberId };
      },
    );

    return { data: { ok: true, orgId: invite.org_id, memberId: result.memberId } };
  });
}
