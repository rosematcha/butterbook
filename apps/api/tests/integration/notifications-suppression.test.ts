import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { registerAllHandlers } from '../../src/worker/handlers/index.js';
import { clearHandlersForTests } from '../../src/worker/dispatcher.js';
import { runEventTick } from '../../src/worker/poll.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { __resetEmailProviderForTests } from '../../src/services/notifications/providers/index.js';

describe('notifications suppression', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    __resetConfigForTests();
    __resetEmailProviderForTests();
    loadConfig();
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.NOTIFICATIONS_ENABLED;
    __resetConfigForTests();
    __resetEmailProviderForTests();
  });
  beforeEach(async () => {
    await truncateAll();
    clearHandlersForTests();
    registerAllHandlers();
  });

  it('marks outbox rows suppressed when address is on the suppression list', async () => {
    const { orgId, locationId } = await createTestOrg('sup@example.com');
    const token = await loginToken(app, 'sup@example.com');

    // Pre-seed suppression for the visitor's email.
    await getDb()
      .insertInto('notification_suppressions')
      .values({ org_id: orgId, address: 'blocked@example.com', reason: 'manual' })
      .execute();

    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/form`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fields: [
          { fieldKey: 'name', label: 'Name', fieldType: 'text', required: true, isSystem: true, displayOrder: 0 },
          { fieldKey: 'zip', label: 'ZIP', fieldType: 'text', required: true, isSystem: true, displayOrder: 1 },
          { fieldKey: 'party_size', label: 'Party size', fieldType: 'number', required: true, isSystem: true, displayOrder: 2 },
          { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, isSystem: false, displayOrder: 3 },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        scheduledAt: '2026-04-13T14:00:00-04:00',
        formResponse: { name: 'Blocked', email: 'blocked@example.com', zip: '10001', party_size: 1 },
      },
    });

    await runEventTick('test-worker');
    const rows = await getDb()
      .selectFrom('notifications_outbox')
      .selectAll()
      .where('org_id', '=', orgId)
      .execute();
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('suppressed');
  });
});
