import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb, withOrgContext } from '../../src/db/index.js';

describe('audit log', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('is append-only (update/delete rejected by trigger)', async () => {
    const { orgId, userId } = await createTestOrg('audit@example.com');
    await withOrgContext(orgId, {
      userId, orgId, isSuperadmin: true, permissions: new Set(), actorType: 'user', ip: null, userAgent: null,
    }, async ({ audit }) => {
      await audit({ action: 'test.action', targetType: 'test', targetId: '00000000-0000-0000-0000-000000000000' });
    });
    const rows = await getDb().selectFrom('audit_log').selectAll().where('org_id', '=', orgId).execute();
    expect(rows.length).toBe(2); // org.created + test.action
    await expect(getDb().updateTable('audit_log').set({ action: 'tampered' }).where('org_id', '=', orgId).execute()).rejects.toThrow(/append-only/);
    await expect(getDb().deleteFrom('audit_log').where('org_id', '=', orgId).execute()).rejects.toThrow(/append-only/);
  });

  it('does not persist formResponse PII in visit/waitlist audit diffs', async () => {
    const { orgId, locationId } = await createTestOrg('pii-audit@example.com');
    const token = await loginToken(app, 'pii-audit@example.com');
    // Hours so visit creation works on Monday.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        scheduledAt: '2026-04-13T14:00:00-04:00',
        formResponse: { name: 'Jane Doe', zip: '10001', party_size: 2 },
      },
    });
    expect(res.statusCode).toBe(200);
    const rows = await getDb()
      .selectFrom('audit_log')
      .select(['action', 'diff'])
      .where('org_id', '=', orgId)
      .where('action', '=', 'visit.created')
      .execute();
    expect(rows.length).toBe(1);
    const diff = rows[0]!.diff as { after?: Record<string, unknown> } | null;
    expect(diff?.after).toBeDefined();
    // The route body still leaks locationId, scheduledAt — those are fine.
    // The PII-bearing formResponse must be gone.
    expect(diff?.after).not.toHaveProperty('formResponse');
    expect(diff?.after).not.toHaveProperty('form_response');
    expect(JSON.stringify(diff)).not.toContain('Jane Doe');
  });
});
