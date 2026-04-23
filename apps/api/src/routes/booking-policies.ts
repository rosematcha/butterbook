import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

const orgIdParam = z.object({ orgId: z.string().uuid() });

const updatePolicySchema = z
  .object({
    cancelCutoffHours: z.number().int().min(0).max(720).optional(),
    rescheduleCutoffHours: z.number().int().min(0).max(720).optional(),
    selfCancelEnabled: z.boolean().optional(),
    selfRescheduleEnabled: z.boolean().optional(),
    refundPolicyText: z.string().max(2000).nullable().optional(),
  })
  .strict();

export function registerBookingPolicyRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/booking-policies', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_org');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('org_booking_policies')
        .selectAll()
        .where('org_id', '=', orgId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      return {
        data: {
          cancelCutoffHours: row.cancel_cutoff_hours,
          rescheduleCutoffHours: row.reschedule_cutoff_hours,
          selfCancelEnabled: row.self_cancel_enabled,
          selfRescheduleEnabled: row.self_reschedule_enabled,
          refundPolicyText: row.refund_policy_text,
        },
      };
    });
  });

  app.patch('/api/v1/orgs/:orgId/booking-policies', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const body = updatePolicySchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.cancelCutoffHours !== undefined) updates.cancel_cutoff_hours = body.cancelCutoffHours;
      if (body.rescheduleCutoffHours !== undefined) updates.reschedule_cutoff_hours = body.rescheduleCutoffHours;
      if (body.selfCancelEnabled !== undefined) updates.self_cancel_enabled = body.selfCancelEnabled;
      if (body.selfRescheduleEnabled !== undefined) updates.self_reschedule_enabled = body.selfRescheduleEnabled;
      if (body.refundPolicyText !== undefined) updates.refund_policy_text = body.refundPolicyText;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      updates.updated_at = new Date();

      const res = await tx
        .updateTable('org_booking_policies')
        .set(updates)
        .where('org_id', '=', orgId)
        .returning(['org_id'])
        .executeTakeFirst();
      if (!res) {
        // Row might be missing for orgs created before the backfill ran; insert
        // with the provided updates merged over defaults.
        await tx
          .insertInto('org_booking_policies')
          .values({ org_id: orgId, ...updates } as never)
          .execute();
      }
      await audit({
        action: 'org.booking_policies_updated',
        targetType: 'org',
        targetId: orgId,
        diff: { after: body },
      });
      return { data: { ok: true } };
    });
  });
}
