import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestOrg, truncateAll } from '../helpers/factories.js';
import { withOrgContext, getDb } from '../../src/db/index.js';
import { sweepMembershipStatus } from '../../src/services/memberships.js';
import { registerAllHandlers } from '../../src/worker/handlers/index.js';
import { clearHandlersForTests } from '../../src/worker/dispatcher.js';
import { runEventTick } from '../../src/worker/poll.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import type { ActorContext, Permission } from '@butterbook/shared';

const now = new Date('2026-04-24T12:00:00.000Z');

describe('membership sweep', () => {
  beforeEach(async () => {
    await truncateAll();
    process.env.NOTIFICATIONS_ENABLED = 'true';
    __resetConfigForTests();
    loadConfig();
    clearHandlersForTests();
    registerAllHandlers();
  });

  afterEach(() => {
    delete process.env.NOTIFICATIONS_ENABLED;
    __resetConfigForTests();
    loadConfig();
  });

  it('queues renewal reminders once for configured reminder days', async () => {
    const { orgId } = await createTestOrg('owner-membership-reminder@example.com');
    await getDb().updateTable('org_membership_policies').set({ enabled: true, renewal_reminder_days: [7] }).where('org_id', '=', orgId).execute();
    const { membershipId } = await seedMembership(orgId, {
      email: 'renewal@example.com',
      status: 'active',
      expiresAt: new Date('2026-05-01T09:00:00.000Z'),
    });

    const first = await withOrgContext(orgId, systemActor(orgId), ({ tx, emit }) => sweepMembershipStatus(tx, orgId, now, emit));
    expect(first).toEqual({ expired: 0, lapsed: 0, reminders: 1 });

    const duplicate = await withOrgContext(orgId, systemActor(orgId), ({ tx, emit }) => sweepMembershipStatus(tx, orgId, now, emit));
    expect(duplicate).toEqual({ expired: 0, lapsed: 0, reminders: 0 });

    const events = await getDb()
      .selectFrom('event_outbox')
      .select(['event_type', 'aggregate_id', 'payload'])
      .where('org_id', '=', orgId)
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'membership.renewal_reminder', aggregate_id: membershipId });
    expect(events[0]!.payload).toMatchObject({ to: 'renewal@example.com', daysOut: 7 });

    await runEventTick('membership-sweep-test');
    const notifications = await getDb()
      .selectFrom('notifications_outbox')
      .select(['template_key', 'to_address', 'rendered_text'])
      .where('org_id', '=', orgId)
      .execute();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      template_key: 'membership.renewal_reminder',
      to_address: 'renewal@example.com',
    });
    expect(notifications[0]!.rendered_text).toContain('expires in 7 days');
  });

  it('emits expired and lapsed membership events when statuses transition', async () => {
    const { orgId } = await createTestOrg('owner-membership-status-sweep@example.com');
    await getDb().updateTable('org_membership_policies').set({ enabled: true, grace_period_days: 14 }).where('org_id', '=', orgId).execute();
    const expired = await seedMembership(orgId, {
      email: 'expired@example.com',
      status: 'active',
      expiresAt: new Date('2026-04-23T09:00:00.000Z'),
    });
    const lapsed = await seedMembership(orgId, {
      email: 'lapsed@example.com',
      status: 'expired',
      expiresAt: new Date('2026-04-01T09:00:00.000Z'),
    });

    const result = await withOrgContext(orgId, systemActor(orgId), ({ tx, emit }) => sweepMembershipStatus(tx, orgId, now, emit));
    expect(result).toEqual({ expired: 1, lapsed: 1, reminders: 0 });

    const rows = await getDb()
      .selectFrom('memberships')
      .select(['id', 'status'])
      .where('org_id', '=', orgId)
      .orderBy('id')
      .execute();
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: expired.membershipId, status: 'expired' },
        { id: lapsed.membershipId, status: 'lapsed' },
      ]),
    );

    const events = await getDb()
      .selectFrom('event_outbox')
      .select(['event_type', 'aggregate_id', 'payload'])
      .where('org_id', '=', orgId)
      .orderBy('event_type')
      .execute();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'membership.expired', aggregate_id: expired.membershipId }),
        expect.objectContaining({ event_type: 'membership.lapsed', aggregate_id: lapsed.membershipId }),
      ]),
    );
  });
});

async function seedMembership(
  orgId: string,
  input: {
    email: string;
    status: 'active' | 'expired';
    expiresAt: Date;
  },
): Promise<{ membershipId: string }> {
  const visitor = await getDb()
    .insertInto('visitors')
    .values({ org_id: orgId, email: input.email, first_name: 'Test', last_name: 'Member' })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const tier = await getDb()
    .insertInto('membership_tiers')
    .values({
      org_id: orgId,
      slug: `tier-${Math.floor(Math.random() * 1_000_000)}`,
      name: 'Friend',
      price_cents: 5000,
      billing_interval: 'year',
      duration_days: 365,
      active: true,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const membership = await getDb()
    .insertInto('memberships')
    .values({
      org_id: orgId,
      visitor_id: visitor.id,
      tier_id: tier.id,
      status: input.status,
      started_at: new Date('2025-05-01T09:00:00.000Z'),
      expires_at: input.expiresAt,
      auto_renew: false,
      metadata: JSON.stringify({}),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return { membershipId: membership.id };
}

function systemActor(orgId: string): ActorContext {
  return {
    userId: null,
    orgId,
    isSuperadmin: false,
    permissions: new Set<Permission>(),
    actorType: 'system' as const,
    ip: null,
    userAgent: 'membership-sweep-test',
  };
}
