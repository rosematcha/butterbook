import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isoDateTimeSchema, paginationSchema, uuidSchema } from '@butterbook/shared';
import { withOrgRead } from '../db/index.js';

const orgParam = z.object({ orgId: z.string().uuid() });

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/audit', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requireSuperadmin(orgId);
    const q = paginationSchema
      .extend({
        from: isoDateTimeSchema.optional(),
        to: isoDateTimeSchema.optional(),
        actor_id: uuidSchema.optional(),
        action: z.string().max(100).optional(),
        target_type: z.string().max(100).optional(),
      })
      .parse(req.query);

    return withOrgRead(orgId, async (tx) => {
      let query = tx.selectFrom('audit_log').selectAll().where('org_id', '=', orgId);
      if (q.from) query = query.where('created_at', '>=', new Date(q.from));
      if (q.to) query = query.where('created_at', '<=', new Date(q.to));
      if (q.actor_id) query = query.where('actor_id', '=', q.actor_id);
      if (q.action) query = query.where('action', '=', q.action);
      if (q.target_type) query = query.where('target_type', '=', q.target_type);
      const totalRow = await tx.selectFrom('audit_log').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId).executeTakeFirst();
      const rows = await query.orderBy('created_at', 'desc').limit(q.limit).offset((q.page - 1) * q.limit).execute();
      return {
        data: rows,
        meta: { page: q.page, limit: q.limit, total: Number(totalRow?.c ?? 0), pages: Math.ceil(Number(totalRow?.c ?? 0) / q.limit) },
      };
    });
  });
}
