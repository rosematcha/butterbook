import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withOrgRead } from '../db/index.js';
import { getUsageSnapshot } from '../services/billing-usage.js';
import { getOrgPlan } from '../services/plan.js';

const orgIdParam = z.object({ orgId: z.string().uuid() });

export function registerUsageRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/usage', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_org');
    return withOrgRead(orgId, async (tx) => {
      const snapshot = await getUsageSnapshot(tx, orgId);
      const { plan, effectivePlan, status } = await getOrgPlan(tx, orgId);
      return {
        data: {
          plan,
          effectivePlan,
          status,
          periodYyyymm: snapshot.periodYyyymm,
          appointments: snapshot.appointments,
          events: snapshot.events,
        },
      };
    });
  });
}
