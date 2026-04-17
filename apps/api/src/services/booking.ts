import { buildFormResponseSchema, type FormField } from '@butterbook/shared';
import type { Tx } from '../db/index.js';
import { AvailabilityError, CapacityError, NotFoundError, ValidationError } from '../errors/index.js';
import { isTimeAvailable } from './availability.js';
import { DEFAULT_FORM_FIELDS } from '@butterbook/shared';

export interface CreateVisitInput {
  orgId: string;
  locationId: string;
  eventId: string | null;
  bookedBy: string | null;
  bookingMethod: 'self' | 'admin' | 'kiosk';
  scheduledAt: Date;
  formResponse: Record<string, unknown>;
  idempotencyKey: string | null;
}

export interface CreateVisitResult {
  kind: 'visit' | 'waitlisted';
  visitId?: string;
  waitlistEntryId?: string;
}

export async function createVisitInTx(
  tx: Tx,
  input: CreateVisitInput,
): Promise<CreateVisitResult> {
  const org = await tx.selectFrom('orgs').select(['id', 'timezone', 'slot_rounding', 'form_fields']).where('id', '=', input.orgId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!org) throw new NotFoundError('Org not found.');

  const location = await tx.selectFrom('locations').select(['id']).where('id', '=', input.locationId).where('org_id', '=', input.orgId).where('deleted_at', 'is', null).executeTakeFirst();
  if (!location) throw new NotFoundError('Location not found.');

  let event: { id: string; form_fields: unknown; starts_at: Date | string; capacity: number | null; waitlist_enabled: boolean; is_published: boolean; location_id: string } | null = null;
  if (input.eventId) {
    const row = await tx
      .selectFrom('events')
      .select(['id', 'form_fields', 'starts_at', 'capacity', 'waitlist_enabled', 'is_published', 'location_id'])
      .where('id', '=', input.eventId)
      .where('org_id', '=', input.orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw new NotFoundError('Event not found.');
    if (row.location_id !== input.locationId) throw new ValidationError('Event does not belong to the specified location.');
    event = row as never;
  }

  const fields = (event?.form_fields as FormField[] | null | undefined) ?? ((org.form_fields as FormField[] | null) ?? DEFAULT_FORM_FIELDS);
  const parsed = buildFormResponseSchema(fields).safeParse(input.formResponse);
  if (!parsed.success) {
    throw new ValidationError(
      'Form response validation failed.',
      parsed.error.errors.map((e) => ({ path: `formResponse.${e.path.join('.')}`, message: e.message })),
    );
  }

  if (event) {
    const eventStart = event.starts_at instanceof Date ? event.starts_at : new Date(event.starts_at);
    if (Math.abs(eventStart.getTime() - input.scheduledAt.getTime()) > 60 * 1000) {
      throw new ValidationError('scheduledAt must match the event start time.');
    }
    if (event.capacity != null) {
      const countRow = await tx
        .selectFrom('visits')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('event_id', '=', event.id)
        .where('status', '=', 'confirmed')
        .executeTakeFirst();
      const confirmed = Number(countRow?.c ?? 0);
      if (confirmed >= event.capacity) {
        if (event.waitlist_enabled) {
          const maxRow = await tx
            .selectFrom('waitlist_entries')
            .select((eb) => eb.fn.max('sort_order').as('m'))
            .where('event_id', '=', event.id)
            .executeTakeFirst();
          const nextOrder = Number(maxRow?.m ?? 0) + 1000;
          const entry = await tx
            .insertInto('waitlist_entries')
            .values({
              org_id: input.orgId,
              event_id: event.id,
              form_response: parsed.data as never,
              sort_order: nextOrder,
              idempotency_key: input.idempotencyKey,
            })
            .returning(['id'])
            .executeTakeFirstOrThrow();
          return { kind: 'waitlisted', waitlistEntryId: entry.id };
        }
        throw new CapacityError('Event is at capacity.');
      }
    }
  } else {
    // General visit — availability check.
    const [hours, overrides, closed] = await Promise.all([
      tx.selectFrom('location_hours').select(['day_of_week as dayOfWeek', 'open_time as openTime', 'close_time as closeTime', 'is_active as isActive']).where('location_id', '=', input.locationId).execute(),
      tx.selectFrom('location_hour_overrides').select(['date', 'open_time as openTime', 'close_time as closeTime', 'reason']).where('location_id', '=', input.locationId).execute(),
      tx.selectFrom('closed_days').select(['date', 'reason']).where('location_id', '=', input.locationId).execute(),
    ]);
    const avail = isTimeAvailable({
      when: input.scheduledAt,
      orgTimezone: org.timezone,
      hours: hours.map((h) => ({ dayOfWeek: h.dayOfWeek as number, openTime: String(h.openTime), closeTime: String(h.closeTime), isActive: Boolean(h.isActive) })),
      overrides: overrides.map((o) => ({ date: String(o.date), openTime: (o.openTime as string) ?? null, closeTime: (o.closeTime as string) ?? null, reason: o.reason })),
      closedDays: closed.map((c) => ({ date: String(c.date), reason: c.reason })),
      slotRounding: org.slot_rounding as 'freeform' | '5' | '10' | '15' | '30',
    });
    if (!avail.available) throw new AvailabilityError(`Time not available: ${avail.reason ?? 'outside_hours'}`);

    if (input.bookingMethod === 'kiosk') {
      const delta = Math.abs(input.scheduledAt.getTime() - Date.now());
      if (delta > 60 * 1000) throw new ValidationError('kiosk scheduledAt must be within 60s of now.');
    }
  }

  const row = await tx
    .insertInto('visits')
    .values({
      org_id: input.orgId,
      location_id: input.locationId,
      event_id: input.eventId,
      booked_by: input.bookedBy,
      booking_method: input.bookingMethod,
      scheduled_at: input.scheduledAt,
      form_response: parsed.data as never,
      idempotency_key: input.idempotencyKey,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return { kind: 'visit', visitId: row.id };
}
