import type { ActorContext, AuditEntryInput } from '@butterbook/shared';
import type { OutboxEventInput, Tx } from '../db/index.js';
import { AvailabilityError, ConflictError, ValidationError } from '../errors/index.js';
import { isTimeAvailable } from './availability.js';

export interface VisitRow {
  id: string;
  org_id: string;
  location_id: string;
  event_id: string | null;
  status: string;
  scheduled_at: Date | string;
  form_response: unknown;
  pii_redacted: boolean;
}

export interface CancelOptions {
  actor: ActorContext;
  reason?: 'admin' | 'self_cancel';
}

// Shared cancel logic used by both the admin route (apps/api/src/routes/visits.ts)
// and the visitor self-serve manage route (apps/api/src/routes/manage.ts).
// Writes the audit entry + outbox event, and if the visit belonged to an event
// with waitlist_auto_promote=true, promotes the next waitlist entry and emits
// the matching waitlist.auto_promoted event.
export async function cancelVisitInTx(
  tx: Tx,
  visit: VisitRow,
  audit: (entry: AuditEntryInput) => Promise<void>,
  emit: (input: OutboxEventInput) => Promise<void>,
  opts: CancelOptions,
): Promise<{ alreadyCancelled: boolean }> {
  if (visit.status === 'cancelled') return { alreadyCancelled: true };

  const cancelledBy = opts.actor.userId ?? null;
  await tx
    .updateTable('visits')
    .set({ status: 'cancelled', cancelled_at: new Date(), cancelled_by: cancelledBy })
    .where('id', '=', visit.id)
    .execute();

  await audit({
    action: 'visit.cancelled',
    targetType: 'visit',
    targetId: visit.id,
    ...(opts.reason ? { diff: { after: { reason: opts.reason } } } : {}),
  });

  const scheduledAtIso =
    visit.scheduled_at instanceof Date
      ? visit.scheduled_at.toISOString()
      : new Date(visit.scheduled_at).toISOString();

  await emit({
    eventType: 'visit.cancelled',
    aggregateType: 'visit',
    aggregateId: visit.id,
    payload: {
      version: 1,
      visitId: visit.id,
      eventId: visit.event_id,
      scheduledAt: scheduledAtIso,
      formResponse: visit.form_response,
      ...(opts.reason ? { reason: opts.reason } : {}),
    },
  });

  if (visit.event_id) {
    const event = await tx
      .selectFrom('events')
      .select(['id', 'waitlist_auto_promote', 'starts_at', 'location_id'])
      .where('id', '=', visit.event_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (event?.waitlist_auto_promote) {
      const next = await tx
        .selectFrom('waitlist_entries')
        .selectAll()
        .where('event_id', '=', event.id)
        .where('status', '=', 'waiting')
        .orderBy('sort_order', 'asc')
        .limit(1)
        .executeTakeFirst();
      if (next) {
        const newVisit = await tx
          .insertInto('visits')
          .values({
            org_id: visit.org_id,
            location_id: event.location_id,
            event_id: event.id,
            booked_by: null,
            booking_method: 'self',
            scheduled_at: event.starts_at,
            form_response: next.form_response,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();
        await tx
          .updateTable('waitlist_entries')
          .set({
            status: 'promoted',
            promoted_at: new Date(),
            promoted_by: cancelledBy,
            promoted_visit_id: newVisit.id,
          })
          .where('id', '=', next.id)
          .execute();
        await audit({
          action: 'waitlist.auto_promoted',
          targetType: 'waitlist_entry',
          targetId: next.id,
          diff: { after: { visitId: newVisit.id } },
        });
        await emit({
          eventType: 'waitlist.auto_promoted',
          aggregateType: 'waitlist_entry',
          aggregateId: next.id,
          payload: {
            version: 1,
            waitlistEntryId: next.id,
            visitId: newVisit.id,
            eventId: event.id,
            scheduledAt:
              event.starts_at instanceof Date
                ? event.starts_at.toISOString()
                : new Date(event.starts_at as unknown as string).toISOString(),
            formResponse: next.form_response,
          },
        });
      }
    }
  }

  return { alreadyCancelled: false };
}

export interface RescheduleInput {
  newScheduledAt: Date;
}

// Move a general (non-event) visit to a new time. Event registrations cannot
// be rescheduled — their time is dictated by the event. Capacity is not a
// concern for general visits. Validates the new slot against location hours
// via isTimeAvailable.
export async function rescheduleVisitInTx(
  tx: Tx,
  visit: VisitRow,
  input: RescheduleInput,
  audit: (entry: AuditEntryInput) => Promise<void>,
  emit: (input: OutboxEventInput) => Promise<void>,
): Promise<void> {
  if (visit.status !== 'confirmed') {
    throw new ConflictError('Only confirmed visits can be rescheduled.');
  }
  if (visit.event_id) {
    throw new ValidationError('Event registrations cannot be rescheduled; cancel and re-register instead.');
  }

  const org = await tx
    .selectFrom('orgs')
    .select(['timezone', 'slot_rounding'])
    .where('id', '=', visit.org_id)
    .executeTakeFirstOrThrow();

  const [hours, overrides, closed] = await Promise.all([
    tx
      .selectFrom('location_hours')
      .select(['day_of_week as dayOfWeek', 'open_time as openTime', 'close_time as closeTime', 'is_active as isActive'])
      .where('location_id', '=', visit.location_id)
      .execute(),
    tx
      .selectFrom('location_hour_overrides')
      .select(['date', 'open_time as openTime', 'close_time as closeTime', 'reason'])
      .where('location_id', '=', visit.location_id)
      .execute(),
    tx
      .selectFrom('closed_days')
      .select(['date', 'reason'])
      .where('location_id', '=', visit.location_id)
      .execute(),
  ]);

  const avail = isTimeAvailable({
    when: input.newScheduledAt,
    orgTimezone: org.timezone,
    hours: hours.map((h) => ({
      dayOfWeek: h.dayOfWeek as number,
      openTime: String(h.openTime),
      closeTime: String(h.closeTime),
      isActive: Boolean(h.isActive),
    })),
    overrides: overrides.map((o) => ({
      date: String(o.date),
      openTime: (o.openTime as string) ?? null,
      closeTime: (o.closeTime as string) ?? null,
      reason: o.reason,
    })),
    closedDays: closed.map((c) => ({ date: String(c.date), reason: c.reason })),
    slotRounding: org.slot_rounding as 'freeform' | '5' | '10' | '15' | '30',
  });
  if (!avail.available) {
    throw new AvailabilityError(`Time not available: ${avail.reason ?? 'outside_hours'}`);
  }

  const oldScheduledAt =
    visit.scheduled_at instanceof Date ? visit.scheduled_at : new Date(visit.scheduled_at);

  await tx
    .updateTable('visits')
    .set({ scheduled_at: input.newScheduledAt })
    .where('id', '=', visit.id)
    .execute();

  await audit({
    action: 'visit.rescheduled',
    targetType: 'visit',
    targetId: visit.id,
    diff: {
      before: { scheduledAt: oldScheduledAt.toISOString() },
      after: { scheduledAt: input.newScheduledAt.toISOString() },
    },
  });

  await emit({
    eventType: 'visit.rescheduled',
    aggregateType: 'visit',
    aggregateId: visit.id,
    payload: {
      version: 1,
      visitId: visit.id,
      scheduledAt: input.newScheduledAt.toISOString(),
      previousScheduledAt: oldScheduledAt.toISOString(),
      formResponse: visit.form_response,
    },
  });
}
