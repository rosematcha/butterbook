import { sql } from 'kysely';
import type { Tx } from '../db/index.js';

export interface ReportFilters {
  from?: Date;
  to?: Date;
  locationId?: string;
  eventId?: string;
  method?: 'self' | 'admin' | 'kiosk';
  type?: 'general' | 'event';
}

// ---- visits (row-level, filter-driven) ----

export interface VisitRow {
  id: string;
  scheduled_at: Date;
  status: string;
  booking_method: string;
  location_id: string;
  event_id: string | null;
  party_size: number | null;
  pii_redacted: boolean;
}

export async function reportVisits(tx: Tx, orgId: string, f: ReportFilters): Promise<VisitRow[]> {
  let q = tx
    .selectFrom('visits')
    .select([
      'id',
      'scheduled_at',
      'status',
      'booking_method',
      'location_id',
      'event_id',
      'pii_redacted',
      sql<number | null>`(form_response->>'party_size')::int`.as('party_size'),
    ])
    .where('org_id', '=', orgId);
  if (f.from) q = q.where('scheduled_at', '>=', f.from);
  if (f.to) q = q.where('scheduled_at', '<=', f.to);
  if (f.locationId) q = q.where('location_id', '=', f.locationId);
  if (f.eventId) q = q.where('event_id', '=', f.eventId);
  if (f.method) q = q.where('booking_method', '=', f.method);
  if (f.type === 'general') q = q.where('event_id', 'is', null);
  if (f.type === 'event') q = q.where('event_id', 'is not', null);
  const rows = await q.orderBy('scheduled_at', 'desc').execute();
  return rows.map((r) => ({
    id: r.id,
    scheduled_at: r.scheduled_at instanceof Date ? r.scheduled_at : new Date(r.scheduled_at as unknown as string),
    status: r.status,
    booking_method: r.booking_method,
    location_id: r.location_id,
    event_id: r.event_id,
    party_size: r.party_size,
    pii_redacted: r.pii_redacted,
  }));
}

// ---- headcount (buckets: day | week | month) ----

export type HeadcountBucket = 'day' | 'week' | 'month';

export interface HeadcountRow {
  bucket: string;
  headcount: number;
  visits: number;
}

export async function reportHeadcount(
  tx: Tx,
  orgId: string,
  groupBy: HeadcountBucket,
  f: Pick<ReportFilters, 'from' | 'to' | 'locationId'>,
): Promise<HeadcountRow[]> {
  const trunc = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : 'month';
  let q = tx
    .selectFrom('visits')
    .select([
      sql<string>`to_char(date_trunc(${trunc}, scheduled_at), 'YYYY-MM-DD')`.as('bucket'),
      sql<number>`coalesce(sum((form_response->>'party_size')::int), 0)`.as('headcount'),
      sql<number>`count(*)`.as('visits'),
    ])
    .where('org_id', '=', orgId)
    .where('status', '=', 'confirmed');
  if (f.from) q = q.where('scheduled_at', '>=', f.from);
  if (f.to) q = q.where('scheduled_at', '<=', f.to);
  if (f.locationId) q = q.where('location_id', '=', f.locationId);
  const rows = await q.groupBy('bucket').orderBy('bucket', 'asc').execute();
  return rows.map((r) => ({ bucket: r.bucket, headcount: Number(r.headcount), visits: Number(r.visits) }));
}

// ---- booking-sources (counts by booking_method) ----

export interface BookingSourceRow {
  booking_method: string;
  visits: number;
  headcount: number;
}

export async function reportBookingSources(
  tx: Tx,
  orgId: string,
  f: Pick<ReportFilters, 'from' | 'to' | 'locationId'>,
): Promise<BookingSourceRow[]> {
  let q = tx
    .selectFrom('visits')
    .select([
      'booking_method',
      sql<number>`count(*)`.as('visits'),
      sql<number>`coalesce(sum((form_response->>'party_size')::int), 0)`.as('headcount'),
    ])
    .where('org_id', '=', orgId)
    .where('status', '=', 'confirmed');
  if (f.from) q = q.where('scheduled_at', '>=', f.from);
  if (f.to) q = q.where('scheduled_at', '<=', f.to);
  if (f.locationId) q = q.where('location_id', '=', f.locationId);
  const rows = await q.groupBy('booking_method').execute();
  return rows.map((r) => ({
    booking_method: r.booking_method as string,
    visits: Number(r.visits),
    headcount: Number(r.headcount),
  }));
}

// ---- events (capacity utilization) ----

export interface EventReportRow {
  event_id: string;
  title: string;
  starts_at: Date;
  location_id: string;
  capacity: number | null;
  confirmed: number;
  cancelled: number;
  waitlisted: number;
}

export async function reportEvents(
  tx: Tx,
  orgId: string,
  f: Pick<ReportFilters, 'from' | 'to' | 'locationId'>,
): Promise<EventReportRow[]> {
  let q = tx
    .selectFrom('events')
    .leftJoin('visits', (jb) => jb.onRef('visits.event_id', '=', 'events.id'))
    .leftJoin('waitlist_entries', (jb) =>
      jb.onRef('waitlist_entries.event_id', '=', 'events.id').on('waitlist_entries.status', '=', 'waiting'),
    )
    .select([
      'events.id as event_id',
      'events.title',
      'events.starts_at',
      'events.location_id',
      'events.capacity',
      sql<number>`count(distinct visits.id) filter (where visits.status = 'confirmed')`.as('confirmed'),
      sql<number>`count(distinct visits.id) filter (where visits.status = 'cancelled')`.as('cancelled'),
      sql<number>`count(distinct waitlist_entries.id)`.as('waitlisted'),
    ])
    .where('events.org_id', '=', orgId)
    .where('events.deleted_at', 'is', null);
  if (f.from) q = q.where('events.starts_at', '>=', f.from);
  if (f.to) q = q.where('events.starts_at', '<=', f.to);
  if (f.locationId) q = q.where('events.location_id', '=', f.locationId);
  const rows = await q.groupBy(['events.id', 'events.title', 'events.starts_at', 'events.location_id', 'events.capacity']).orderBy('events.starts_at', 'asc').execute();
  return rows.map((r) => ({
    event_id: r.event_id,
    title: r.title,
    starts_at: r.starts_at instanceof Date ? r.starts_at : new Date(r.starts_at as unknown as string),
    location_id: r.location_id,
    capacity: r.capacity,
    confirmed: Number(r.confirmed),
    cancelled: Number(r.cancelled),
    waitlisted: Number(r.waitlisted),
  }));
}

// ---- intake (aggregated values of a given form field) ----

export interface IntakeBucket {
  value: string;
  count: number;
}

export async function reportIntake(
  tx: Tx,
  orgId: string,
  fieldKey: string,
  f: Pick<ReportFilters, 'from' | 'to'>,
): Promise<IntakeBucket[]> {
  // GIN index on form_response + (form_response->>fieldKey) is enough; cast value to text.
  let q = tx
    .selectFrom('visits')
    .select([
      sql<string>`coalesce(form_response->>${fieldKey}, '(empty)')`.as('value'),
      sql<number>`count(*)`.as('count'),
    ])
    .where('org_id', '=', orgId)
    .where('status', '=', 'confirmed')
    .where('pii_redacted', '=', false);
  if (f.from) q = q.where('scheduled_at', '>=', f.from);
  if (f.to) q = q.where('scheduled_at', '<=', f.to);
  const rows = await q.groupBy('value').orderBy('count', 'desc').limit(500).execute();
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}

// ---- CSV encoding ----

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return lines.join('\n');
}
