import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from '@butterbook/shared';
import { withOrgRead } from '../db/index.js';
import {
  reportBookingSources,
  reportEvents,
  reportHeadcount,
  reportIntake,
  reportVisits,
  toCsv,
  type HeadcountBucket,
  type ReportFilters,
} from '../services/reports.js';

const orgParam = z.object({ orgId: z.string().uuid() });

const baseFilters = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  location_id: uuidSchema.optional(),
});

const visitsFilters = baseFilters.extend({
  event_id: uuidSchema.optional(),
  method: z.enum(['self', 'admin', 'kiosk']).optional(),
  type: z.enum(['general', 'event']).optional(),
});

const headcountFilters = baseFilters.extend({
  group_by: z.enum(['day', 'week', 'month']).default('day'),
});

const intakeFilters = z.object({
  field_key: z.string().min(1).max(64),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

function filtersFromQuery(f: z.infer<typeof visitsFilters>): ReportFilters {
  return {
    ...(f.from ? { from: new Date(f.from) } : {}),
    ...(f.to ? { to: new Date(f.to) } : {}),
    ...(f.location_id ? { locationId: f.location_id } : {}),
    ...(f.event_id ? { eventId: f.event_id } : {}),
    ...(f.method ? { method: f.method } : {}),
    ...(f.type ? { type: f.type } : {}),
  };
}

export function registerReportRoutes(app: FastifyInstance): void {
  // ---- visits ----
  app.get('/api/v1/orgs/:orgId/reports/visits', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const f = visitsFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.view');
    return withOrgRead(orgId, async (tx) => {
      const rows = await reportVisits(tx, orgId, filtersFromQuery(f));
      return { data: rows };
    });
  });
  app.get('/api/v1/orgs/:orgId/reports/visits/export', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    const f = visitsFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.export');
    const rows = await withOrgRead(orgId, (tx) => reportVisits(tx, orgId, filtersFromQuery(f)));
    return sendCsv(
      reply,
      'visits',
      ['id', 'scheduled_at', 'status', 'booking_method', 'location_id', 'event_id', 'party_size', 'pii_redacted'],
      rows.map((r) => [r.id, r.scheduled_at.toISOString(), r.status, r.booking_method, r.location_id, r.event_id, r.party_size, String(r.pii_redacted)]),
    );
  });

  // ---- headcount ----
  app.get('/api/v1/orgs/:orgId/reports/headcount', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const f = headcountFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.view');
    return withOrgRead(orgId, async (tx) => {
      const rows = await reportHeadcount(tx, orgId, f.group_by as HeadcountBucket, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      });
      return { data: rows };
    });
  });
  app.get('/api/v1/orgs/:orgId/reports/headcount/export', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    const f = headcountFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.export');
    const rows = await withOrgRead(orgId, (tx) =>
      reportHeadcount(tx, orgId, f.group_by as HeadcountBucket, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      }),
    );
    return sendCsv(reply, `headcount-${f.group_by}`, ['bucket', 'headcount', 'visits'], rows.map((r) => [r.bucket, r.headcount, r.visits]));
  });

  // ---- booking-sources ----
  app.get('/api/v1/orgs/:orgId/reports/booking-sources', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const f = baseFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.view');
    return withOrgRead(orgId, async (tx) => {
      const rows = await reportBookingSources(tx, orgId, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      });
      return { data: rows };
    });
  });
  app.get('/api/v1/orgs/:orgId/reports/booking-sources/export', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    const f = baseFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.export');
    const rows = await withOrgRead(orgId, (tx) =>
      reportBookingSources(tx, orgId, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      }),
    );
    return sendCsv(reply, 'booking-sources', ['booking_method', 'visits', 'headcount'], rows.map((r) => [r.booking_method, r.visits, r.headcount]));
  });

  // ---- events ----
  app.get('/api/v1/orgs/:orgId/reports/events', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const f = baseFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.view');
    return withOrgRead(orgId, async (tx) => {
      const rows = await reportEvents(tx, orgId, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      });
      return { data: rows };
    });
  });
  app.get('/api/v1/orgs/:orgId/reports/events/export', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    const f = baseFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.export');
    const rows = await withOrgRead(orgId, (tx) =>
      reportEvents(tx, orgId, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
        ...(f.location_id ? { locationId: f.location_id } : {}),
      }),
    );
    return sendCsv(
      reply,
      'events',
      ['event_id', 'title', 'starts_at', 'location_id', 'capacity', 'confirmed', 'cancelled', 'waitlisted'],
      rows.map((r) => [r.event_id, r.title, r.starts_at.toISOString(), r.location_id, r.capacity, r.confirmed, r.cancelled, r.waitlisted]),
    );
  });

  // ---- intake ----
  app.get('/api/v1/orgs/:orgId/reports/intake', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const f = intakeFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.view');
    return withOrgRead(orgId, async (tx) => {
      const rows = await reportIntake(tx, orgId, f.field_key, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
      });
      return { data: rows };
    });
  });
  app.get('/api/v1/orgs/:orgId/reports/intake/export', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    const f = intakeFilters.parse(req.query);
    await req.requirePermission(orgId, 'reports.export');
    const rows = await withOrgRead(orgId, (tx) =>
      reportIntake(tx, orgId, f.field_key, {
        ...(f.from ? { from: new Date(f.from) } : {}),
        ...(f.to ? { to: new Date(f.to) } : {}),
      }),
    );
    return sendCsv(reply, `intake-${f.field_key}`, ['value', 'count'], rows.map((r) => [r.value, r.count]));
  });
}

function sendCsv(reply: FastifyReply, name: string, headers: string[], rows: Array<Array<string | number | null>>): FastifyReply {
  const body = toCsv(headers, rows);
  return reply
    .type('text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${name}.csv"`)
    .send(body);
}

// Silence unused warning if only CSV export is hit in tests.
void ((_r: FastifyRequest) => void 0);
