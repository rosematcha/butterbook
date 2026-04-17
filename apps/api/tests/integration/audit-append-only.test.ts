import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
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
});
