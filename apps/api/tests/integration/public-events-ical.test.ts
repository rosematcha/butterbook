import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

async function seedEvent(orgId: string, locationId: string, userId: string, opts: { published: boolean; title?: string }): Promise<{ publicId: string }> {
  const publicId = 'p_' + Math.random().toString(36).slice(2, 10);
  await getDb()
    .insertInto('events')
    .values({
      org_id: orgId,
      location_id: locationId,
      created_by: userId,
      title: opts.title ?? 'Guided tour, with semicolons; and commas,',
      description: 'Line one\nLine two',
      starts_at: new Date('2026-05-01T14:00:00Z'),
      ends_at: new Date('2026-05-01T15:30:00Z'),
      public_id: publicId,
      is_published: opts.published,
    })
    .execute();
  return { publicId };
}

async function getOrgSlug(orgId: string): Promise<string> {
  const row = await getDb().selectFrom('orgs').select(['public_slug']).where('id', '=', orgId).executeTakeFirstOrThrow();
  return row.public_slug;
}

describe('public event ical feed', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('returns a valid .ics for a published event', async () => {
    const { orgId, userId, locationId } = await createTestOrg('ical@example.com');
    const { publicId } = await seedEvent(orgId, locationId, userId, { published: true });
    const slug = await getOrgSlug(orgId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/${slug}/e/${publicId}/calendar.ics`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    const body = res.body;
    expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(body).toMatch(/\r\nEND:VCALENDAR\r\n$/);
    expect(body).toContain('VERSION:2.0');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('END:VEVENT');
    expect(body).toContain('DTSTART:20260501T140000Z');
    expect(body).toContain('DTEND:20260501T153000Z');
    expect(body).toContain(`UID:event-`);
    expect(body).toContain('SUMMARY:Guided tour\\, with semicolons\\; and commas\\,');
    expect(body).toContain('DESCRIPTION:Line one\\nLine two');
    expect(body).toContain('LOCATION:');
  });

  it('returns 404 for an unpublished event', async () => {
    const { orgId, userId, locationId } = await createTestOrg('ical2@example.com');
    const { publicId } = await seedEvent(orgId, locationId, userId, { published: false });
    const slug = await getOrgSlug(orgId);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/${slug}/e/${publicId}/calendar.ics`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an unknown event', async () => {
    const { orgId } = await createTestOrg('ical3@example.com');
    const slug = await getOrgSlug(orgId);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/public/${slug}/e/does-not-exist/calendar.ics`,
    });
    expect(res.statusCode).toBe(404);
  });
});
