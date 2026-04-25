import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

interface Seeded {
  orgId: string;
  userId: string;
  ownerToken: string;
  segmentId: string;
}

async function seedOrgWithSegment(app: FastifyInstance, ownerEmail: string): Promise<Seeded> {
  const owner = await createTestOrg(ownerEmail);

  // Three contacts: two with the "member" tag, one without. All three need a
  // unique email so the visitors unique-on-(org, email) index is happy.
  await getDb()
    .insertInto('visitors')
    .values([
      { org_id: owner.orgId, email: 'alice@example.com', first_name: 'Alice', last_name: 'A', tags: ['member'] },
      { org_id: owner.orgId, email: 'bob@example.com', first_name: 'Bob', last_name: 'B', tags: ['member'] },
      { org_id: owner.orgId, email: 'carol@example.com', first_name: 'Carol', last_name: 'C', tags: [] },
    ])
    .execute();

  const segment = await getDb()
    .insertInto('visitor_segments')
    .values({ org_id: owner.orgId, name: 'Members', filter: JSON.stringify({ tag: 'member' }) })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  return {
    orgId: owner.orgId,
    userId: owner.userId,
    ownerToken: await loginToken(app, ownerEmail),
    segmentId: segment.id,
  };
}

describe('broadcasts', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAll();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a draft, previews recipients, and sends one outbox row per contact in the segment', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-1@example.com');

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        segmentId: seeded.segmentId,
        subject: 'Members-only opening',
        bodyHtml: '<p>Hi {{visitorName}}, see you at {{orgName}}.</p>',
        bodyText: 'Hi {{visitorName}}, see you at {{orgName}}.',
      },
    });
    expect(created.statusCode).toBe(200);
    const draft = JSON.parse(created.body) as { data: { id: string; status: string } };
    expect(draft.data.status).toBe('draft');

    const previewed = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${draft.data.id}/preview`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });
    expect(previewed.statusCode).toBe(200);
    expect(JSON.parse(previewed.body)).toMatchObject({ meta: { count: 2 } });

    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${draft.data.id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });
    expect(sent.statusCode).toBe(200);
    const sentBody = JSON.parse(sent.body) as { data: { status: string; recipientCount: number } };
    expect(sentBody.data.status).toBe('sent');
    expect(sentBody.data.recipientCount).toBe(2);

    const outbox = await getDb()
      .selectFrom('notifications_outbox')
      .select(['to_address', 'rendered_subject', 'rendered_html', 'status'])
      .where('org_id', '=', seeded.orgId)
      .orderBy('to_address', 'asc')
      .execute();
    expect(outbox).toHaveLength(2);
    expect(outbox.map((o) => o.to_address).sort()).toEqual(['alice@example.com', 'bob@example.com']);
    expect(outbox[0]?.rendered_html).toContain('Hi Alice A');
    expect(outbox.every((o) => o.status === 'pending')).toBe(true);
  });

  it('rejects a second send and keeps the broadcast in sent status', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-2@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        subject: 'Hello {{visitorName}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    const id = (JSON.parse(created.body) as { data: { id: string } }).data.id;

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });
    expect(second.statusCode).toBe(409);

    const outboxCount = await getDb()
      .selectFrom('notifications_outbox')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('org_id', '=', seeded.orgId)
      .executeTakeFirst();
    expect(Number(outboxCount?.c ?? 0)).toBe(3); // 3 visitors, no segment filter
  });

  it('test-send queues exactly one outbox row regardless of segment size', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-3@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        segmentId: seeded.segmentId,
        subject: 'Test {{visitorName}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    const id = (JSON.parse(created.body) as { data: { id: string } }).data.id;

    const tested = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/test-send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: { toAddress: 'qa@example.com' },
    });
    expect(tested.statusCode).toBe(200);

    const rows = await getDb()
      .selectFrom('notifications_outbox')
      .selectAll()
      .where('org_id', '=', seeded.orgId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.to_address).toBe('qa@example.com');
    expect(rows[0]?.template_key).toBe('broadcast.generic');
  });

  it('demo orgs queue suppressed outbox rows', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-4@example.com');
    await getDb().updateTable('orgs').set({ is_demo: true }).where('id', '=', seeded.orgId).execute();

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        segmentId: seeded.segmentId,
        subject: 'Hello {{visitorName}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    const id = (JSON.parse(created.body) as { data: { id: string } }).data.id;

    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });
    expect(sent.statusCode).toBe(200);

    const rows = await getDb()
      .selectFrom('notifications_outbox')
      .select(['status'])
      .where('org_id', '=', seeded.orgId)
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'suppressed')).toBe(true);
  });

  it('skips suppressed addresses individually', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-5@example.com');
    await getDb()
      .insertInto('notification_suppressions')
      .values({ org_id: seeded.orgId, address: 'alice@example.com', reason: 'manual' })
      .execute();

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        segmentId: seeded.segmentId,
        subject: 'Hi {{visitorName}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    const id = (JSON.parse(created.body) as { data: { id: string } }).data.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });

    const rows = await getDb()
      .selectFrom('notifications_outbox')
      .select(['to_address', 'status'])
      .where('org_id', '=', seeded.orgId)
      .execute();
    const map = new Map(rows.map((r) => [r.to_address, r.status]));
    expect(map.get('alice@example.com')).toBe('suppressed');
    expect(map.get('bob@example.com')).toBe('pending');
  });

  it('rejects invalid Handlebars templates at create time', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-6@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        segmentId: seeded.segmentId,
        subject: 'Hi {{nonsenseVariable}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('blocks edits once a broadcast has been sent', async () => {
    const seeded = await seedOrgWithSegment(app, 'broadcast-owner-7@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: {
        subject: 'Hi {{visitorName}}',
        bodyHtml: '<p>Hi {{visitorName}}</p>',
        bodyText: 'Hi {{visitorName}}',
      },
    });
    const id = (JSON.parse(created.body) as { data: { id: string } }).data.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}/send`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
    });

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${seeded.orgId}/broadcasts/${id}`,
      headers: { authorization: `Bearer ${seeded.ownerToken}` },
      payload: { subject: 'Updated' },
    });
    expect(edited.statusCode).toBe(409);
  });
});
