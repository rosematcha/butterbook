import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('event series and duplication', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('creates a weekly series and keeps local wall-clock time across DST', async () => {
    const { orgId, locationId } = await createTestOrg('series@example.com');
    const token = await loginToken(app, 'series@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/series`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        title: 'Sunday studio',
        startsAt: '2026-03-01T15:00:00Z',
        endsAt: '2026-03-01T16:30:00Z',
        slugBase: 'sunday-studio',
        recurrence: {
          frequency: 'weekly',
          weekday: 0,
          ends: { mode: 'until_date', untilDate: '2026-03-22' },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { id: string; occurrenceCount: number; eventIds: string[] } };
    expect(body.data.occurrenceCount).toBe(4);
    expect(body.data.eventIds).toHaveLength(4);

    const series = await getDb()
      .selectFrom('event_series')
      .select(['id', 'slug_base', 'occurrence_count', 'until_date'])
      .where('id', '=', body.data.id)
      .executeTakeFirstOrThrow();
    expect(series.slug_base).toBe('sunday-studio');
    expect(series.occurrence_count).toBeNull();
    expect((series.until_date as Date).toISOString().slice(0, 10)).toBe('2026-03-22');

    const rows = await getDb()
      .selectFrom('events')
      .select(['series_id', 'series_ordinal', 'starts_at', 'slug'])
      .where('org_id', '=', orgId)
      .where('series_id', '=', body.data.id)
      .orderBy('series_ordinal', 'asc')
      .execute();

    expect(rows.map((row) => row.series_ordinal)).toEqual([1, 2, 3, 4]);
    expect(rows[0]?.slug).toBe('sunday-studio-20260301');
    expect((rows[0]?.starts_at as Date).toISOString()).toBe('2026-03-01T15:00:00.000Z');
    expect((rows[1]?.starts_at as Date).toISOString()).toBe('2026-03-08T14:00:00.000Z');

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/events`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      data: Array<{ id: string; series: null | { id: string; occurrenceCount: number | null; occurrenceNumber: number | null } }>;
    };
    const second = listBody.data.find((row) => row.id === body.data.eventIds[1]);
    expect(second?.series).toMatchObject({
      id: body.data.id,
      occurrenceCount: null,
      occurrenceNumber: 2,
    });
  });

  it('duplicates an event into a draft one-off copy', async () => {
    const { orgId, userId, locationId } = await createTestOrg('duplicate@example.com');
    const token = await loginToken(app, 'duplicate@example.com');

    const source = await getDb()
      .insertInto('events')
      .values({
        org_id: orgId,
        location_id: locationId,
        created_by: userId,
        title: 'Morning tour',
        description: 'Original description',
        slug: 'morning-tour',
        public_id: 'p_' + Math.random().toString(36).slice(2, 10),
        starts_at: new Date('2026-05-01T14:00:00Z'),
        ends_at: new Date('2026-05-01T15:00:00Z'),
        capacity: 12,
        waitlist_enabled: true,
        waitlist_auto_promote: true,
        form_fields: JSON.stringify([
          {
            fieldKey: 'nickname',
            label: 'Nickname',
            fieldType: 'text',
            required: false,
            isSystem: false,
            displayOrder: 9,
          },
        ]) as never,
        is_published: true,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/${source.id}/duplicate`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Morning tour copy',
        startsAt: '2026-05-08T14:00:00Z',
        endsAt: '2026-05-08T15:00:00Z',
        slug: 'morning-tour-copy',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { id: string } };

    const duplicated = await getDb()
      .selectFrom('events')
      .select([
        'title',
        'description',
        'slug',
        'starts_at',
        'ends_at',
        'waitlist_enabled',
        'waitlist_auto_promote',
        'form_fields',
        'is_published',
        'series_id',
      ])
      .where('id', '=', body.data.id)
      .executeTakeFirstOrThrow();

    expect(duplicated.title).toBe('Morning tour copy');
    expect(duplicated.description).toBe('Original description');
    expect(duplicated.slug).toBe('morning-tour-copy');
    expect((duplicated.starts_at as Date).toISOString()).toBe('2026-05-08T14:00:00.000Z');
    expect((duplicated.ends_at as Date).toISOString()).toBe('2026-05-08T15:00:00.000Z');
    expect(duplicated.waitlist_enabled).toBe(true);
    expect(duplicated.waitlist_auto_promote).toBe(true);
    expect(duplicated.form_fields).toEqual([
      { fieldKey: 'nickname', label: 'Nickname', fieldType: 'text', required: false, isSystem: false, displayOrder: 9 },
    ]);
    expect(duplicated.is_published).toBe(false);
    expect(duplicated.series_id).toBeNull();
  });

  it('allows public registration against a generated occurrence', async () => {
    const { orgId, locationId } = await createTestOrg('public-series@example.com');
    const token = await loginToken(app, 'public-series@example.com');

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/series`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        locationId,
        title: 'Family workshop',
        startsAt: '2026-06-07T15:00:00Z',
        endsAt: '2026-06-07T16:00:00Z',
        recurrence: {
          frequency: 'weekly',
          weekday: 0,
          ends: { mode: 'after_occurrences', occurrenceCount: 2 },
        },
      },
    });

    expect(createRes.statusCode).toBe(200);
    const created = JSON.parse(createRes.body) as { data: { eventIds: string[] } };
    const secondOccurrenceId = created.data.eventIds[1]!;

    const publishRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/events/${secondOccurrenceId}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(publishRes.statusCode).toBe(200);

    const event = await getDb()
      .selectFrom('events')
      .select(['public_id'])
      .where('id', '=', secondOccurrenceId)
      .executeTakeFirstOrThrow();
    const org = await getDb()
      .selectFrom('orgs')
      .select(['public_slug', 'slug_prefix'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();

    const registerRes = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${org.public_slug}/${org.slug_prefix}/${event.public_id}/register`,
      headers: { 'idempotency-key': 'series-public-registration' },
      payload: {
        formResponse: { name: 'Alice Example', zip: '10001', party_size: 2 },
      },
    });

    expect(registerRes.statusCode).toBe(201);
    const visit = await getDb()
      .selectFrom('visits')
      .select(['event_id'])
      .where('event_id', '=', secondOccurrenceId)
      .executeTakeFirstOrThrow();
    expect(visit.event_id).toBe(secondOccurrenceId);
  });
});
