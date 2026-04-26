import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { isPermission, type Permission } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { sha256Hex } from '../utils/ids.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const keyParam = z.object({ orgId: z.string().uuid(), keyId: z.string().uuid() });

const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    permissions: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
  })
  .strict();

const listApiKeysQuerySchema = z.object({
  include_revoked: z.enum(['true', 'false']).optional(),
});

export function registerApiKeyRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/api-keys', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listApiKeysQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'api_keys.manage');
    return withOrgRead(orgId, async (tx) => {
      let query = tx
        .selectFrom('org_api_keys')
        .select(['id', 'org_id', 'prefix', 'name', 'permissions', 'created_by', 'created_at', 'last_used_at', 'revoked_at'])
        .where('org_id', '=', orgId);
      if (q.include_revoked !== 'true') {
        query = query.where('revoked_at', 'is', null);
      }
      const rows = await query.orderBy('created_at', 'desc').execute();
      return {
        data: rows.map((r) => ({
          id: r.id,
          orgId: r.org_id,
          prefix: r.prefix,
          name: r.name,
          permissions: r.permissions,
          createdBy: r.created_by,
          createdAt: r.created_at.toISOString(),
          lastUsedAt: r.last_used_at?.toISOString() ?? null,
          revokedAt: r.revoked_at?.toISOString() ?? null,
        })),
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/api-keys', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createApiKeySchema.parse(req.body);
    await req.requirePermission(orgId, 'api_keys.manage');

    const invalidPerms = body.permissions.filter((p) => !isPermission(p));
    if (invalidPerms.length > 0) {
      throw new ValidationError(`Unknown permissions: ${invalidPerms.join(', ')}`);
    }
    const permissions = body.permissions as Permission[];

    const rawKey = crypto.randomBytes(24).toString('base64url');
    const fullKey = `bb_live_${rawKey}`;
    const prefix = fullKey.slice(0, 12);
    const keyHash = sha256Hex(fullKey);

    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .insertInto('org_api_keys')
        .values({
          org_id: orgId,
          prefix,
          key_hash: keyHash,
          name: body.name,
          permissions,
          created_by: req.userId,
        })
        .returning(['id', 'created_at'])
        .executeTakeFirstOrThrow();

      await audit({
        action: 'api_key.created',
        targetType: 'org_api_key',
        targetId: row.id,
        diff: { after: { name: body.name, permissions, prefix } },
      });

      return {
        data: {
          id: row.id,
          key: fullKey,
          prefix,
          name: body.name,
          permissions,
          createdAt: row.created_at.toISOString(),
        },
      };
    });
  });

  app.delete('/api/v1/orgs/:orgId/api-keys/:keyId', async (req) => {
    const { orgId, keyId } = keyParam.parse(req.params);
    await req.requirePermission(orgId, 'api_keys.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .updateTable('org_api_keys')
        .set({ revoked_at: new Date() })
        .where('id', '=', keyId)
        .where('org_id', '=', orgId)
        .where('revoked_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (!row) throw new NotFoundError();

      await audit({
        action: 'api_key.revoked',
        targetType: 'org_api_key',
        targetId: keyId,
      });

      return { data: { ok: true } };
    });
  });
}
