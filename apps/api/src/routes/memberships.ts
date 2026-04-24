import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cancelMembershipSchema,
  createMembershipSchema,
  createMembershipTierSchema,
  listMembershipsQuerySchema,
  listMembershipTiersQuerySchema,
  membershipIdParamSchema,
  membershipTierIdParamSchema,
  refundMembershipSchema,
  renewMembershipSchema,
  updateMembershipPolicySchema,
  updateMembershipSchema,
  updateMembershipTierSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';
import {
  cancelMembershipInTx,
  createMembershipInTx,
  publicMembership,
  publicTier,
  renewMembershipInTx,
  selectMembership,
} from '../services/memberships.js';

const orgParam = z.object({ orgId: z.string().uuid() });

export function registerMembershipRoutes(app: FastifyInstance): void {
  registerPolicyRoutes(app);
  registerTierRoutes(app);
  registerMembershipRecordRoutes(app);
}

function registerPolicyRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/membership-policies', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'memberships.manage');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx.selectFrom('org_membership_policies').selectAll().where('org_id', '=', orgId).executeTakeFirst();
      if (!row) throw new NotFoundError();
      return {
        data: {
          enabled: row.enabled,
          gracePeriodDays: row.grace_period_days,
          renewalReminderDays: row.renewal_reminder_days,
          selfCancelEnabled: row.self_cancel_enabled,
          selfUpdateEnabled: row.self_update_enabled,
          publicPageEnabled: row.public_page_enabled,
        },
      };
    });
  });

  app.patch('/api/v1/orgs/:orgId/membership-policies', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = updateMembershipPolicySchema.parse(req.body);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.gracePeriodDays !== undefined) updates.grace_period_days = body.gracePeriodDays;
      if (body.renewalReminderDays !== undefined) updates.renewal_reminder_days = body.renewalReminderDays;
      if (body.selfCancelEnabled !== undefined) updates.self_cancel_enabled = body.selfCancelEnabled;
      if (body.selfUpdateEnabled !== undefined) updates.self_update_enabled = body.selfUpdateEnabled;
      if (body.publicPageEnabled !== undefined) updates.public_page_enabled = body.publicPageEnabled;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      updates.updated_at = new Date();
      const row = await tx.updateTable('org_membership_policies').set(updates).where('org_id', '=', orgId).returning(['org_id']).executeTakeFirst();
      if (!row) await tx.insertInto('org_membership_policies').values({ org_id: orgId, ...updates } as never).execute();
      await audit({ action: 'membership_policy.updated', targetType: 'org', targetId: orgId, diff: { after: body } });
      return { data: { ok: true } };
    });
  });
}

function registerTierRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/membership-tiers', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listMembershipTiersQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'memberships.view_all');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let query = tx.selectFrom('membership_tiers').selectAll().where('org_id', '=', orgId);
      if (!includeDeleted) query = query.where('deleted_at', 'is', null);
      const rows = await query.orderBy('sort_order').orderBy('name').execute();
      return { data: rows.map(publicTier) };
    });
  });

  app.post('/api/v1/orgs/:orgId/membership-tiers', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createMembershipTierSchema.parse(req.body);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .insertInto('membership_tiers')
        .values({
          org_id: orgId,
          slug: body.slug,
          name: body.name,
          description: body.description ?? null,
          price_cents: body.priceCents,
          billing_interval: body.billingInterval,
          duration_days: body.durationDays ?? null,
          guest_passes_included: body.guestPassesIncluded ?? 0,
          member_only_event_access: body.memberOnlyEventAccess ?? true,
          max_active: body.maxActive ?? null,
          sort_order: body.sortOrder ?? 0,
          active: body.active ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({ action: 'membership_tier.created', targetType: 'membership_tier', targetId: row.id, diff: { after: body } });
      return { data: publicTier(row) };
    });
  });

  app.get('/api/v1/orgs/:orgId/membership-tiers/:tierId', async (req) => {
    const { orgId, tierId } = membershipTierIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'memberships.view_all');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx.selectFrom('membership_tiers').selectAll().where('org_id', '=', orgId).where('id', '=', tierId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: publicTier(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/membership-tiers/:tierId', async (req) => {
    const { orgId, tierId } = membershipTierIdParamSchema.parse(req.params);
    const body = updateMembershipTierSchema.parse(req.body);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.slug !== undefined) updates.slug = body.slug;
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.priceCents !== undefined) updates.price_cents = body.priceCents;
      if (body.billingInterval !== undefined) updates.billing_interval = body.billingInterval;
      if (body.durationDays !== undefined) updates.duration_days = body.durationDays;
      if (body.guestPassesIncluded !== undefined) updates.guest_passes_included = body.guestPassesIncluded;
      if (body.memberOnlyEventAccess !== undefined) updates.member_only_event_access = body.memberOnlyEventAccess;
      if (body.maxActive !== undefined) updates.max_active = body.maxActive;
      if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
      if (body.active !== undefined) updates.active = body.active;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      const row = await tx.updateTable('membership_tiers').set(updates).where('org_id', '=', orgId).where('id', '=', tierId).where('deleted_at', 'is', null).returningAll().executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'membership_tier.updated', targetType: 'membership_tier', targetId: tierId, diff: { after: body } });
      return { data: publicTier(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/membership-tiers/:tierId', async (req) => {
    const { orgId, tierId } = membershipTierIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx.updateTable('membership_tiers').set({ deleted_at: new Date(), active: false }).where('org_id', '=', orgId).where('id', '=', tierId).where('deleted_at', 'is', null).returning(['id']).executeTakeFirst();
      if (!row) throw new NotFoundError();
      await audit({ action: 'membership_tier.deleted', targetType: 'membership_tier', targetId: tierId });
      return { data: { ok: true } };
    });
  });
}

function registerMembershipRecordRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/memberships', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listMembershipsQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'memberships.view_all');
    return withOrgRead(orgId, async (tx) => {
      let rowsQuery = tx
        .selectFrom('memberships')
        .innerJoin('visitors', 'visitors.id', 'memberships.visitor_id')
        .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
        .selectAll('memberships')
        .select([
          'visitors.email as visitor_email',
          'visitors.first_name as visitor_first_name',
          'visitors.last_name as visitor_last_name',
          'membership_tiers.slug as tier_slug',
          'membership_tiers.name as tier_name',
          'membership_tiers.price_cents as tier_price_cents',
          'membership_tiers.billing_interval as tier_billing_interval',
        ])
        .where('memberships.org_id', '=', orgId);
      let countQuery = tx.selectFrom('memberships').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId);
      if (q.status) {
        rowsQuery = rowsQuery.where('memberships.status', '=', q.status);
        countQuery = countQuery.where('status', '=', q.status);
      }
      if (q.tier_id) {
        rowsQuery = rowsQuery.where('memberships.tier_id', '=', q.tier_id);
        countQuery = countQuery.where('tier_id', '=', q.tier_id);
      }
      if (q.visitor_id) {
        rowsQuery = rowsQuery.where('memberships.visitor_id', '=', q.visitor_id);
        countQuery = countQuery.where('visitor_id', '=', q.visitor_id);
      }
      if (q.expiring_before) {
        rowsQuery = rowsQuery.where('memberships.expires_at', '<=', new Date(q.expiring_before));
        countQuery = countQuery.where('expires_at', '<=', new Date(q.expiring_before));
      }
      const [rows, count] = await Promise.all([
        rowsQuery.orderBy('memberships.created_at', 'desc').limit(q.limit).offset((q.page - 1) * q.limit).execute(),
        countQuery.executeTakeFirst(),
      ]);
      const total = Number(count?.c ?? 0);
      return { data: rows.map(publicMembership), meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } };
    });
  });

  app.post('/api/v1/orgs/:orgId/memberships', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createMembershipSchema.parse(req.body);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
      const createInput: Parameters<typeof createMembershipInTx>[1] = {
        orgId,
        visitorId: body.visitorId,
        tierId: body.tierId,
      };
      if (body.startsAt !== undefined) createInput.startsAt = new Date(body.startsAt);
      if (body.expiresAt !== undefined) createInput.expiresAt = body.expiresAt === null ? null : new Date(body.expiresAt);
      if (body.autoRenew !== undefined) createInput.autoRenew = body.autoRenew;
      if (body.amountCents !== undefined) createInput.amountCents = body.amountCents;
      if (body.currency !== undefined) createInput.currency = body.currency;
      if (body.notes !== undefined) createInput.notes = body.notes;
      if (body.metadata !== undefined) createInput.metadata = body.metadata;
      const created = await createMembershipInTx(tx, createInput);
      await audit({ action: 'membership.created', targetType: 'membership', targetId: created.membershipId, diff: { after: body } });
      await emit({ eventType: 'membership.created', aggregateType: 'membership', aggregateId: created.membershipId, payload: { to: created.visitorEmail, tierName: created.tierName, membershipId: created.membershipId, expiresAt: created.expiresAt?.toISOString() ?? '' } });
      const row = await selectMembership(tx, orgId, created.membershipId);
      return { data: publicMembership(row!) };
    });
  });

  app.get('/api/v1/orgs/:orgId/memberships/:membershipId', async (req) => {
    const { orgId, membershipId } = membershipIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'memberships.view_all');
    return withOrgRead(orgId, async (tx) => {
      const row = await selectMembership(tx, orgId, membershipId);
      if (!row) throw new NotFoundError();
      return { data: publicMembership(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/memberships/:membershipId', async (req) => {
    const { orgId, membershipId } = membershipIdParamSchema.parse(req.params);
    const body = updateMembershipSchema.parse(req.body);
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.status !== undefined) updates.status = body.status;
      if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt === null ? null : new Date(body.expiresAt);
      if (body.autoRenew !== undefined) updates.auto_renew = body.autoRenew;
      if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      const updated = await tx.updateTable('memberships').set(updates).where('org_id', '=', orgId).where('id', '=', membershipId).returning(['id']).executeTakeFirst();
      if (!updated) throw new NotFoundError();
      await audit({ action: 'membership.updated', targetType: 'membership', targetId: membershipId, diff: { after: body } });
      const row = await selectMembership(tx, orgId, membershipId);
      return { data: publicMembership(row!) };
    });
  });

  app.post('/api/v1/orgs/:orgId/memberships/:membershipId/cancel', async (req) => {
    const { orgId, membershipId } = membershipIdParamSchema.parse(req.params);
    const body = cancelMembershipSchema.parse(req.body ?? {});
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
      await cancelMembershipInTx(tx, orgId, membershipId, body.reason);
      const row = await selectMembership(tx, orgId, membershipId);
      await audit({ action: 'membership.cancelled', targetType: 'membership', targetId: membershipId, diff: { after: body } });
      await emit({ eventType: 'membership.cancelled', aggregateType: 'membership', aggregateId: membershipId, payload: { to: row!.visitor_email, tierName: row!.tier_name, membershipId } });
      return { data: publicMembership(row!) };
    });
  });

  app.post('/api/v1/orgs/:orgId/memberships/:membershipId/renew', async (req) => {
    const { orgId, membershipId } = membershipIdParamSchema.parse(req.params);
    const body = renewMembershipSchema.parse(req.body ?? {});
    await req.requirePermission(orgId, 'memberships.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
      const renewInput: Parameters<typeof renewMembershipInTx>[3] = {};
      if (body.expiresAt !== undefined) renewInput.expiresAt = body.expiresAt === null ? null : new Date(body.expiresAt);
      if (body.amountCents !== undefined) renewInput.amountCents = body.amountCents;
      if (body.currency !== undefined) renewInput.currency = body.currency;
      if (body.notes !== undefined) renewInput.notes = body.notes;
      const renewed = await renewMembershipInTx(tx, orgId, membershipId, renewInput);
      const row = await selectMembership(tx, orgId, membershipId);
      await audit({ action: 'membership.renewed', targetType: 'membership', targetId: membershipId, diff: { after: body } });
      await emit({ eventType: 'membership.renewed', aggregateType: 'membership', aggregateId: membershipId, payload: { to: row!.visitor_email, tierName: row!.tier_name, membershipId, expiresAt: renewed.expiresAt?.toISOString() ?? '' } });
      return { data: publicMembership(row!) };
    });
  });

  app.post('/api/v1/orgs/:orgId/memberships/:membershipId/refund', async (req) => {
    const { orgId, membershipId } = membershipIdParamSchema.parse(req.params);
    const body = refundMembershipSchema.parse(req.body ?? {});
    await req.requirePermission(orgId, 'memberships.refund');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const payment = await tx.selectFrom('membership_payments').select(['id', 'amount_cents']).where('org_id', '=', orgId).where('membership_id', '=', membershipId).orderBy('created_at', 'desc').executeTakeFirst();
      if (!payment) throw new NotFoundError();
      await tx.updateTable('membership_payments').set({ refunded_at: new Date(), refunded_amount_cents: body.amountCents ?? payment.amount_cents, notes: body.notes ?? null }).where('id', '=', payment.id).execute();
      const updated = await tx.updateTable('memberships').set({ status: 'refunded', auto_renew: false }).where('org_id', '=', orgId).where('id', '=', membershipId).returning(['id']).executeTakeFirst();
      if (!updated) throw new NotFoundError();
      await audit({ action: 'membership.refunded', targetType: 'membership', targetId: membershipId, diff: { after: body } });
      const row = await selectMembership(tx, orgId, membershipId);
      return { data: publicMembership(row!) };
    });
  });
}
