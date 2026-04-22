import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb, withOrgContext } from '../../src/db/index.js';

describe('event_outbox atomicity', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('writes one event_outbox row alongside audit_log on visit create', async () => {
    const { orgId, locationId } = await createTestOrg('atom@example.com');
    const token = await loginToken(app, 'atom@example.com');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    const visitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        scheduledAt: '2026-04-13T14:00:00-04:00',
        formResponse: { name: 'A', zip: '10001', party_size: 1 },
      },
    });
    expect(visitRes.statusCode).toBe(200);
    const events = await getDb().selectFrom('event_outbox').selectAll().where('org_id', '=', orgId).execute();
    expect(events.length).toBe(1);
    expect(events[0]!.event_type).toBe('visit.created');
    expect(events[0]!.status).toBe('pending');
  });

  it('rolls back both audit and outbox on mid-tx failure', async () => {
    const { orgId, userId } = await createTestOrg('rollback@example.com');
    const auditBefore = await getDb().selectFrom('audit_log').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId).executeTakeFirst();
    const outboxBefore = await getDb().selectFrom('event_outbox').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId).executeTakeFirst();
    await expect(
      withOrgContext(
        orgId,
        { userId, orgId, isSuperadmin: true, permissions: new Set(), actorType: 'user', ip: null, userAgent: null },
        async ({ audit, emit }) => {
          await audit({ action: 'x.created', targetType: 'x', targetId: '00000000-0000-0000-0000-000000000000' });
          await emit({ eventType: 'x.created', aggregateType: 'x', aggregateId: '00000000-0000-0000-0000-000000000000', payload: { version: 1 } });
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow(/boom/);
    const auditAfter = await getDb().selectFrom('audit_log').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId).executeTakeFirst();
    const outboxAfter = await getDb().selectFrom('event_outbox').select((eb) => eb.fn.countAll<number>().as('c')).where('org_id', '=', orgId).executeTakeFirst();
    expect(Number(auditAfter?.c ?? 0)).toBe(Number(auditBefore?.c ?? 0));
    expect(Number(outboxAfter?.c ?? 0)).toBe(Number(outboxBefore?.c ?? 0));
  });
});
