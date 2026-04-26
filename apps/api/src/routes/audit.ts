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
      let countQuery = tx.selectFrom('audit_log').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId);
      if (q.from) {
        const d = new Date(q.from);
        query = query.where('created_at', '>=', d);
        countQuery = countQuery.where('created_at', '>=', d);
      }
      if (q.to) {
        const d = new Date(q.to);
        query = query.where('created_at', '<=', d);
        countQuery = countQuery.where('created_at', '<=', d);
      }
      if (q.actor_id) {
        query = query.where('actor_id', '=', q.actor_id);
        countQuery = countQuery.where('actor_id', '=', q.actor_id);
      }
      if (q.action) {
        query = query.where('action', '=', q.action);
        countQuery = countQuery.where('action', '=', q.action);
      }
      if (q.target_type) {
        query = query.where('target_type', '=', q.target_type);
        countQuery = countQuery.where('target_type', '=', q.target_type);
      }
      const [rows, totalRow] = await Promise.all([
        query.orderBy('created_at', 'desc').limit(q.limit).offset((q.page - 1) * q.limit).execute(),
        countQuery.executeTakeFirst(),
      ]);
      const total = Number(totalRow?.c ?? 0);
      return {
        data: rows,
        meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      };
    });
  });
}
