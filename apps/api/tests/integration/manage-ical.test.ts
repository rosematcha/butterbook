import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { defaultManageExpiry, makeManageToken } from '../../src/utils/manage-token.js';

describe('visitor manage ical feed', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('returns an .ics for a general visit', async () => {
    const { orgId, locationId } = await createTestOrg('mi1@example.com');
    const scheduledAt = new Date('2026-06-10T16:00:00Z');
    const v = await getDb()
      .insertInto('visits')
      .values({
        org_id: orgId,
        location_id: locationId,
        event_id: null,
        booked_by: null,
        booking_method: 'admin',
        scheduled_at: scheduledAt,
        form_response: { name: 'Alice' } as never,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const token = makeManageToken(v.id, defaultManageExpiry(scheduledAt));

    const res = await app.inject({ method: 'GET', url: `/api/v1/manage/${token}/calendar.ics` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).toContain('DTSTART:20260610T160000Z');
    expect(res.body).toContain('DTEND:20260610T170000Z');
    expect(res.body).toContain(`UID:visit-${v.id}@butterbook.app`);
    expect(res.body).toContain('LOCATION:');
  });

  it('uses event start/end when the visit is linked to an event', async () => {
    const { orgId, locationId, userId } = await createTestOrg('mi2@example.com');
    const ev = await getDb()
      .insertInto('events')
      .values({
        org_id: orgId,
        location_id: locationId,
        created_by: userId,
        title: 'Evening tour',
        starts_at: new Date('2026-07-01T22:00:00Z'),
        ends_at: new Date('2026-07-01T23:30:00Z'),
        public_id: 'p_' + Math.random().toString(36).slice(2, 10),
        is_published: true,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const v = await getDb()
      .insertInto('visits')
      .values({
        org_id: orgId,
        location_id: locationId,
        event_id: ev.id,
        booked_by: null,
        booking_method: 'self',
        scheduled_at: new Date('2026-07-01T22:00:00Z'),
        form_response: { name: 'Bob' } as never,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const token = makeManageToken(v.id, defaultManageExpiry(new Date('2026-07-01T22:00:00Z')));

    const res = await app.inject({ method: 'GET', url: `/api/v1/manage/${token}/calendar.ics` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('DTSTART:20260701T220000Z');
    expect(res.body).toContain('DTEND:20260701T233000Z');
    expect(res.body).toContain('SUMMARY:Evening tour');
  });

  it('returns 401 for an invalid token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/manage/not-a-token/calendar.ics' });
    expect(res.statusCode).toBe(401);
  });
});
