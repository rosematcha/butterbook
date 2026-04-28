import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createEventSchema,
  createEventSeriesSchema,
  duplicateEventSchema,
  isoDateTimeSchema,
  setSlugSchema,
  updateEventSchema,
  uuidSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead, type Tx } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import { requireFeature } from '../services/plan.js';
import { planWeeklySeriesOccurrences } from '../services/event-series.js';
import { newPublicId } from '../utils/ids.js';
import { allowIncludeDeleted } from '../utils/soft-delete.js';
import { assertSafeFormFieldPatterns } from '../utils/safe-regex.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const eventParam = z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() });

const eventListQuery = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    location_id: uuidSchema.optional(),
    published: z.enum(['true', 'false']).optional(),
    include_deleted: z.enum(['true', 'false']).optional(),
  })
  .strict();

export function registerEventRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/events', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = eventListQuery.parse(req.query);
    await req.requirePermission(orgId, 'events.view_registrations');
    const includeDeleted = await allowIncludeDeleted(req, orgId, q.include_deleted);
    return withOrgRead(orgId, async (tx) => {
      let query = tx
        .selectFrom('events')
        .leftJoin('event_series', 'event_series.id', 'events.series_id')
        .selectAll('events')
        .select([
          'event_series.id as joined_series_id',
          'event_series.title as series_title',
          'event_series.slug_base as series_slug_base',
          'event_series.frequency as series_frequency',
          'event_series.weekday as series_weekday',
          'event_series.until_date as series_until_date',
          'event_series.occurrence_count as series_occurrence_count',
        ])
        .where('events.org_id', '=', orgId);
      if (!includeDeleted) query = query.where('events.deleted_at', 'is', null);
      if (q.from) query = query.where('events.starts_at', '>=', new Date(q.from));
      if (q.to) query = query.where('events.starts_at', '<=', new Date(q.to));
      if (q.location_id) query = query.where('events.location_id', '=', q.location_id);
      if (q.published) query = query.where('events.is_published', '=', q.published === 'true');
      const rows = await query.orderBy('events.starts_at', 'asc').execute();
      return { data: rows.map(publicEvent) };
    });
  });

  app.post('/api/v1/orgs/:orgId/events', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createEventSchema.parse(req.body);
    if (body.formFields) assertSafeFormFieldPatterns(body.formFields);
    await req.requirePermission(orgId, 'events.create');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.membershipRequiredTierId) await requireFeature(tx, orgId, 'member_only_events');
      await assertLocationExists(tx, orgId, body.locationId);
      if (body.slug) await assertEventSlugAvailable(tx, orgId, body.slug);
      const row = await insertEvent(tx, {
        orgId,
        locationId: body.locationId,
        createdBy: req.userId!,
        title: body.title,
        description: body.description ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        capacity: body.capacity ?? null,
        waitlistEnabled: body.waitlistEnabled ?? false,
        waitlistAutoPromote: body.waitlistAutoPromote ?? false,
        membershipRequiredTierId: body.membershipRequiredTierId ?? null,
        formFields: body.formFields,
        slug: body.slug ?? null,
        isPublished: false,
      });
      await audit({ action: 'event.created', targetType: 'event', targetId: row.id, diff: { after: body } });
      return { data: { id: row.id, publicId: row.publicId } };
    });
  });

  app.post('/api/v1/orgs/:orgId/events/series', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createEventSeriesSchema.parse(req.body);
    if (body.formFields) assertSafeFormFieldPatterns(body.formFields);
    await req.requirePermission(orgId, 'events.create');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.membershipRequiredTierId) await requireFeature(tx, orgId, 'member_only_events');
      const org = await tx
        .selectFrom('orgs')
        .select(['timezone'])
        .where('id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!org) throw new NotFoundError('Org not found.');

      await assertLocationExists(tx, orgId, body.locationId);

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      const planned = planSeriesOrThrow({
        startsAt,
        endsAt,
        orgTimezone: org.timezone,
        weekday: body.recurrence.weekday,
        slugBase: body.slugBase ?? null,
        ...(body.recurrence.ends.mode === 'until_date'
          ? { untilDate: body.recurrence.ends.untilDate }
          : { occurrenceCount: body.recurrence.ends.occurrenceCount }),
      });

      await assertEventSlugsAvailable(
        tx,
        orgId,
        planned.flatMap((occurrence) => (occurrence.slug ? [occurrence.slug] : [])),
      );

      const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
      const seriesRow = await tx
        .insertInto('event_series')
        .values({
          org_id: orgId,
          created_by: req.userId!,
          title: body.title,
          slug_base: body.slugBase ?? null,
          frequency: body.recurrence.frequency,
          weekday: body.recurrence.weekday,
          first_starts_at: startsAt,
          duration_minutes: durationMinutes,
          until_date: body.recurrence.ends.mode === 'until_date' ? body.recurrence.ends.untilDate : null,
          occurrence_count:
            body.recurrence.ends.mode === 'after_occurrences'
              ? body.recurrence.ends.occurrenceCount
              : null,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const inserted = await tx
        .insertInto('events')
        .values(
          planned.map((occurrence) => ({
            org_id: orgId,
            location_id: body.locationId,
            created_by: req.userId!,
            series_id: seriesRow.id,
            series_ordinal: occurrence.ordinal,
            title: body.title,
            description: body.description ?? null,
            slug: occurrence.slug,
            public_id: newPublicId(),
            starts_at: occurrence.startsAt,
            ends_at: occurrence.endsAt,
            capacity: body.capacity ?? null,
            waitlist_enabled: body.waitlistEnabled ?? false,
            waitlist_auto_promote: body.waitlistAutoPromote ?? false,
            membership_required_tier_id: body.membershipRequiredTierId ?? null,
            form_fields: serializeFormFields(body.formFields) ?? null,
            is_published: false,
          })),
        )
        .returning(['id', 'public_id', 'series_ordinal'])
        .execute();

      await audit({
        action: 'event_series.created',
        targetType: 'event_series',
        targetId: seriesRow.id,
        diff: {
          after: {
            ...body,
            generatedOccurrences: inserted.length,
          },
        },
      });

      return {
        data: {
          id: seriesRow.id,
          occurrenceCount: inserted.length,
          eventIds: inserted.map((row) => row.id),
        },
      };
    });
  });

  app.get('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    await req.requirePermission(orgId, 'events.view_registrations');
    return withOrgRead(orgId, async (tx) => {
      const ev = await tx
        .selectFrom('events')
        .leftJoin('event_series', 'event_series.id', 'events.series_id')
        .selectAll('events')
        .select([
          'event_series.id as joined_series_id',
          'event_series.title as series_title',
          'event_series.slug_base as series_slug_base',
          'event_series.frequency as series_frequency',
          'event_series.weekday as series_weekday',
          'event_series.until_date as series_until_date',
          'event_series.occurrence_count as series_occurrence_count',
        ])
        .where('events.id', '=', eventId)
        .where('events.org_id', '=', orgId)
        .where('events.deleted_at', 'is', null)
        .executeTakeFirst();
      if (!ev) throw new NotFoundError();
      return { data: publicEvent(ev) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const body = updateEventSchema.parse(req.body);
    if (body.formFields) assertSafeFormFieldPatterns(body.formFields);
    await req.requirePermission(orgId, 'events.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.membershipRequiredTierId) await requireFeature(tx, orgId, 'member_only_events');
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.startsAt !== undefined) updates.starts_at = new Date(body.startsAt);
      if (body.endsAt !== undefined) updates.ends_at = new Date(body.endsAt);
      if (body.capacity !== undefined) updates.capacity = body.capacity;
      if (body.waitlistEnabled !== undefined) updates.waitlist_enabled = body.waitlistEnabled;
      if (body.waitlistAutoPromote !== undefined) updates.waitlist_auto_promote = body.waitlistAutoPromote;
      if (body.membershipRequiredTierId !== undefined) updates.membership_required_tier_id = body.membershipRequiredTierId;
      if (body.formFields !== undefined) updates.form_fields = serializeFormFields(body.formFields);
      if (body.locationId !== undefined) {
        await assertLocationExists(tx, orgId, body.locationId);
        updates.location_id = body.locationId;
      }
      if (Object.keys(updates).length > 0) {
        const res = await tx
          .updateTable('events')
          .set(updates)
          .where('id', '=', eventId)
          .where('org_id', '=', orgId)
          .where('deleted_at', 'is', null)
          .returning(['id'])
          .executeTakeFirst();
        if (!res) throw new NotFoundError();
      }
      await audit({ action: 'event.updated', targetType: 'event', targetId: eventId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.delete('/api/v1/orgs/:orgId/events/:eventId', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const q = z.object({ cascade: z.enum(['true', 'false']).optional() }).parse(req.query);
    await req.requirePermission(orgId, 'events.delete');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const event = await tx
        .selectFrom('events')
        .select(['id'])
        .where('id', '=', eventId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!event) throw new NotFoundError();
      const confirmedCount = await tx
        .selectFrom('visits')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('event_id', '=', eventId)
        .where('status', '=', 'confirmed')
        .executeTakeFirst();
      if (Number(confirmedCount?.c ?? 0) > 0) {
        if (q.cascade !== 'true' || !m.isSuperadmin) {
          throw new ConflictError('Event has confirmed visits. cascade=true + superadmin required.');
        }
        await tx
          .updateTable('visits')
          .set({ status: 'cancelled', cancelled_at: new Date(), cancelled_by: req.userId })
          .where('event_id', '=', eventId)
          .where('status', '=', 'confirmed')
          .execute();
      }
      await tx.updateTable('events').set({ deleted_at: new Date() }).where('id', '=', eventId).execute();
      await audit({ action: 'event.deleted', targetType: 'event', targetId: eventId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/events/:eventId/restore', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    await req.requireSuperadmin(orgId);
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const ev = await tx
        .selectFrom('events')
        .select(['id', 'slug'])
        .where('id', '=', eventId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is not', null)
        .executeTakeFirst();
      if (!ev) throw new NotFoundError();
      if (ev.slug) {
        const conflict = await tx
          .selectFrom('events')
          .select(['id'])
          .where('org_id', '=', orgId)
          .where('slug', '=', ev.slug)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (conflict) throw new ConflictError(`An active event with slug "${ev.slug}" already exists.`);
      }
      await tx.updateTable('events').set({ deleted_at: null }).where('id', '=', eventId).execute();
      await audit({ action: 'event.restored', targetType: 'event', targetId: eventId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/events/:eventId/duplicate', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const body = duplicateEventSchema.parse(req.body ?? {});
    await req.requirePermission(orgId, 'events.create');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const source = await tx
        .selectFrom('events')
        .select([
          'location_id',
          'title',
          'description',
          'starts_at',
          'ends_at',
          'capacity',
          'waitlist_enabled',
          'waitlist_auto_promote',
          'membership_required_tier_id',
          'form_fields',
        ])
        .where('id', '=', eventId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!source) throw new NotFoundError();

      const locationId = body.locationId ?? source.location_id;
      await assertLocationExists(tx, orgId, locationId);
      if (body.slug) await assertEventSlugAvailable(tx, orgId, body.slug);

      const row = await insertEvent(tx, {
        orgId,
        locationId,
        createdBy: req.userId!,
        title: body.title ?? source.title,
        description: source.description,
        startsAt: body.startsAt ? new Date(body.startsAt) : coerceDate(source.starts_at),
        endsAt: body.endsAt ? new Date(body.endsAt) : coerceDate(source.ends_at),
        capacity: body.capacity === undefined ? source.capacity : body.capacity,
        waitlistEnabled: body.waitlistEnabled ?? source.waitlist_enabled,
        waitlistAutoPromote: body.waitlistAutoPromote ?? source.waitlist_auto_promote,
        membershipRequiredTierId: body.membershipRequiredTierId === undefined ? source.membership_required_tier_id : body.membershipRequiredTierId,
        formFields: (source.form_fields as unknown) ?? null,
        slug: body.slug ?? null,
        isPublished: false,
      });

      await audit({
        action: 'event.duplicated',
        targetType: 'event',
        targetId: row.id,
        diff: {
          after: {
            sourceEventId: eventId,
            ...body,
          },
        },
      });

      return { data: { id: row.id, publicId: row.publicId } };
    });
  });

  for (const action of ['publish', 'unpublish'] as const) {
    app.post(`/api/v1/orgs/:orgId/events/:eventId/${action}`, async (req) => {
      const { orgId, eventId } = eventParam.parse(req.params);
      await req.requirePermission(orgId, 'events.publish');
      const m = await req.loadMembershipFor(orgId);
      return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit, emit }) => {
        const res = await tx
          .updateTable('events')
          .set({ is_published: action === 'publish' })
          .where('id', '=', eventId)
          .where('org_id', '=', orgId)
          .where('deleted_at', 'is', null)
          .returning(['id', 'title', 'public_id', 'slug', 'starts_at'])
          .executeTakeFirst();
        if (!res) throw new NotFoundError();
        await audit({ action: `event.${action}ed`, targetType: 'event', targetId: eventId });
        if (action === 'publish') {
          await emit({
            eventType: 'event.published',
            aggregateType: 'event',
            aggregateId: eventId,
            payload: {
              version: 1,
              eventId,
              title: res.title,
              publicId: res.public_id,
              slug: res.slug,
              startsAt: coerceDate(res.starts_at).toISOString(),
            },
          });
        }
        return { data: { ok: true } };
      });
    });
  }

  app.patch('/api/v1/orgs/:orgId/events/:eventId/slug', async (req) => {
    const { orgId, eventId } = eventParam.parse(req.params);
    const body = setSlugSchema.parse(req.body);
    await req.requirePermission(orgId, 'events.edit');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.slug) {
        const conflict = await tx
          .selectFrom('events')
          .select('id')
          .where('org_id', '=', orgId)
          .where('slug', '=', body.slug)
          .where('id', '!=', eventId)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (conflict) throw new ConflictError('slug already in use.');
      }
      const res = await tx
        .updateTable('events')
        .set({ slug: body.slug })
        .where('id', '=', eventId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (!res) throw new NotFoundError();
      await audit({ action: 'event.slug_set', targetType: 'event', targetId: eventId, diff: { after: body } });
      return { data: { ok: true } };
    });
  });
}

interface EventInsertInput {
  orgId: string;
  locationId: string;
  createdBy: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number | null;
  waitlistEnabled: boolean;
  waitlistAutoPromote: boolean;
  membershipRequiredTierId: string | null;
  formFields: unknown;
  slug: string | null;
  isPublished: boolean;
}

async function insertEvent(tx: Tx, input: EventInsertInput): Promise<{ id: string; publicId: string }> {
  const row = await tx
    .insertInto('events')
    .values({
      org_id: input.orgId,
      location_id: input.locationId,
      created_by: input.createdBy,
      title: input.title,
      description: input.description,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      capacity: input.capacity,
      waitlist_enabled: input.waitlistEnabled,
      waitlist_auto_promote: input.waitlistAutoPromote,
      membership_required_tier_id: input.membershipRequiredTierId,
      form_fields: serializeFormFields(input.formFields) ?? null,
      slug: input.slug,
      public_id: newPublicId(),
      is_published: input.isPublished,
    })
    .returning(['id', 'public_id'])
    .executeTakeFirstOrThrow();
  return { id: row.id, publicId: row.public_id };
}

async function assertLocationExists(tx: Tx, orgId: string, locationId: string): Promise<void> {
  const loc = await tx
    .selectFrom('locations')
    .select('id')
    .where('id', '=', locationId)
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!loc) throw new NotFoundError('Location not found.');
}

async function assertEventSlugAvailable(tx: Tx, orgId: string, slug: string): Promise<void> {
  const conflict = await tx
    .selectFrom('events')
    .select('id')
    .where('org_id', '=', orgId)
    .where('slug', '=', slug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (conflict) throw new ConflictError('slug already in use.');
}

async function assertEventSlugsAvailable(tx: Tx, orgId: string, slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  const uniqueSlugs = [...new Set(slugs)];
  const conflicts = await tx
    .selectFrom('events')
    .select(['slug'])
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where('slug', 'in', uniqueSlugs)
    .execute();
  if (conflicts.length > 0) throw new ConflictError('slug already in use.');
}

function planSeriesOrThrow(input: Parameters<typeof planWeeklySeriesOccurrences>[0]) {
  try {
    return planWeeklySeriesOccurrences(input);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : 'Invalid recurrence settings.');
  }
}

function serializeFormFields(formFields: unknown): string | null | undefined {
  if (formFields === undefined) return undefined;
  return formFields === null ? null : JSON.stringify(formFields);
}

function coerceDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function publicEvent(e: {
  id: string;
  org_id: string;
  location_id: string;
  title: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  capacity: number | null;
  waitlist_enabled: boolean;
  waitlist_auto_promote: boolean;
  membership_required_tier_id: string | null;
  form_fields: unknown;
  is_published: boolean;
  series_id: string | null;
  series_ordinal: number | null;
  joined_series_id?: string | null;
  series_title?: string | null;
  series_slug_base?: string | null;
  series_frequency?: string | null;
  series_weekday?: number | null;
  series_until_date?: Date | string | null;
  series_occurrence_count?: number | null;
}) {
  const seriesId = e.joined_series_id ?? e.series_id;
  return {
    id: e.id,
    orgId: e.org_id,
    locationId: e.location_id,
    title: e.title,
    description: e.description,
    slug: e.slug,
    publicId: e.public_id,
    startsAt: coerceDate(e.starts_at).toISOString(),
    endsAt: coerceDate(e.ends_at).toISOString(),
    capacity: e.capacity,
    waitlistEnabled: e.waitlist_enabled,
    waitlistAutoPromote: e.waitlist_auto_promote,
    membershipRequiredTierId: e.membership_required_tier_id,
    formFields: e.form_fields,
    isPublished: e.is_published,
    series: seriesId
      ? {
          id: seriesId,
          title: e.series_title ?? e.title,
          slugBase: e.series_slug_base ?? null,
          frequency: e.series_frequency ?? 'weekly',
          weekday: e.series_weekday ?? 0,
          untilDate: formatDateOnly(e.series_until_date ?? null),
          occurrenceCount: e.series_occurrence_count ?? null,
          occurrenceNumber: e.series_ordinal ?? null,
        }
      : null,
  };
}

function formatDateOnly(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
