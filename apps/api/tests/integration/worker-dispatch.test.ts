import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { registerAllHandlers } from '../../src/worker/handlers/index.js';
import { clearHandlersForTests } from '../../src/worker/dispatcher.js';
import { runEventTick } from '../../src/worker/poll.js';
import { runNotificationsTick } from '../../src/worker/notifications-loop.js';
import { __resetConfigForTests, loadConfig } from '../../src/config.js';
import { __resetEmailProviderForTests } from '../../src/services/notifications/providers/index.js';

describe('worker dispatch', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    delete process.env.RESEND_API_KEY;
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

  async function seedVisit() {
    const email = `d${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
    const { orgId, locationId } = await createTestOrg(email);
    const token = await loginToken(app, email);
    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/locations/${locationId}/hours`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] },
    });
    // Extend the org's form with an email field so the visit POST accepts it —
    // the default form only has name/zip/party_size.
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
        formResponse: { name: 'Ada', email: 'ada@example.com', zip: '10001', party_size: 1 },
      },
    });
    return { orgId };
  }

  it('runEventTick dispatches pending row and enqueues a notification', async () => {
    const { orgId } = await seedVisit();
    const n = await runEventTick('test-worker');
    expect(n).toBeGreaterThan(0);
    const evRows = await getDb().selectFrom('event_outbox').selectAll().where('org_id', '=', orgId).execute();
    expect(evRows.every((r) => r.status === 'dispatched')).toBe(true);
    const notifRows = await getDb().selectFrom('notifications_outbox').selectAll().where('org_id', '=', orgId).execute();
    expect(notifRows.length).toBe(1);
    expect(notifRows[0]!.template_key).toBe('visit.confirmation');
    expect(notifRows[0]!.to_address).toBe('ada@example.com');
    expect(notifRows[0]!.status).toBe('pending');
  });

  it('runNotificationsTick sends via noop provider and flips status to sent', async () => {
    const { orgId } = await seedVisit();
    await runEventTick('test-worker');
    const n = await runNotificationsTick('test-worker');
    expect(n).toBeGreaterThan(0);
    const rows = await getDb().selectFrom('notifications_outbox').selectAll().where('org_id', '=', orgId).execute();
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('sent');
    expect(rows[0]!.provider_message_id).toMatch(/^noop-/);
    expect(rows[0]!.sent_at).toBeTruthy();
  });
});
