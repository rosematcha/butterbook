import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerForEventSchema, type Permission } from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { recordAppointmentUsage } from '../services/billing-usage.js';
import { upsertVisitorFromFormResponse } from '../services/contacts.js';
import { activeMembershipSatisfiesTier } from '../services/memberships.js';
import { handleIdempotent } from '../middleware/idempotency.js';
import { buildCalendar } from '../services/ical.js';

const params = z.object({
  orgSlug: z.string().min(1),
  slugPrefix: z.string().min(1),
  slugOrPublicId: z.string().min(1).max(200),
});

export function registerPublicEventRoutes(app: FastifyInstance): void {
  app.get('/api/v1/public/:orgSlug/:slugPrefix/:slugOrPublicId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const p = params.parse(req.params);
    const ev = await resolveEvent(p);
    return { data: publicEvent(ev) };
  });

  app.get('/api/v1/public/:orgSlug/:slugPrefix/:slugOrPublicId/form', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const p = params.parse(req.params);
    const ev = await resolveEvent(p);
    const fields = ev.form_fields ?? (await getDb().selectFrom('orgs').select(['form_fields']).where('id', '=', ev.org_id).executeTakeFirstOrThrow()).form_fields;
    return { data: { fields } };
  });

  app.get(
    '/api/v1/public/:orgSlug/:slugPrefix/:slugOrPublicId/calendar.ics',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = params.parse(req.params);
      const ev = await resolveEvent(p);
      if (!ev.is_published) throw new NotFoundError();
      const loc = await getDb()
        .selectFrom('locations')
        .select(['name', 'address', 'city', 'state', 'zip'])
        .where('id', '=', ev.location_id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      const locationText = loc
        ? [loc.name, loc.address, [loc.city, loc.state].filter(Boolean).join(', '), loc.zip]
            .filter((x) => x && String(x).trim())
            .join(', ')
        : null;
      const ics = buildCalendar([
        {
          uid: `event-${ev.id}@butterbook.app`,
          dtstamp: new Date(),
          start: ev.starts_at instanceof Date ? ev.starts_at : new Date(ev.starts_at),
          end: ev.ends_at instanceof Date ? ev.ends_at : new Date(ev.ends_at),
          summary: ev.title,
          description: ev.description,
          location: locationText,
        },
      ]);
      return reply
        .type('text/calendar; charset=utf-8')
        .header('content-disposition', `inline; filename="${ev.public_id}.ics"`)
        .header('cache-control', 'public, max-age=300')
        .send(ics);
    },
  );

  app.post(
    '/api/v1/public/:orgSlug/:slugPrefix/:slugOrPublicId/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = params.parse(req.params);
      const body = registerForEventSchema.parse(req.body);
      const ev = await resolveEvent(p);
      if (!ev.is_published) throw new NotFoundError();
      const idemKey = (req.headers['idempotency-key'] as string | undefined) ?? null;

      const actor = {
        userId: null,
        orgId: ev.org_id,
        isSuperadmin: false,
        permissions: new Set<Permission>(),
        actorType: 'guest' as const,
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      };

      const result = await handleIdempotent(req, reply, 'event.register', ev.org_id, async () => {
        const r = await withOrgContext(ev.org_id, actor, async ({ tx, audit }) => {
          if (ev.membership_required_tier_id) {
            const visitorId = await upsertVisitorFromFormResponse(tx, ev.org_id, body.formResponse);
            const eligible = visitorId ? await activeMembershipSatisfiesTier(tx, ev.org_id, visitorId, ev.membership_required_tier_id) : false;
            if (!eligible) throw new NotFoundError('Event registration is only available to eligible members.');
          }
          const res = await createVisitInTx(tx, {
            orgId: ev.org_id,
            locationId: ev.location_id,
            eventId: ev.id,
            bookedBy: null,
            bookingMethod: 'self',
            scheduledAt: ev.starts_at instanceof Date ? ev.starts_at : new Date(ev.starts_at),
            formResponse: body.formResponse,
            idempotencyKey: idemKey,
          });
          await audit({
            action: res.kind === 'visit' ? 'event.registered' : 'waitlist.joined',
            targetType: res.kind === 'visit' ? 'visit' : 'waitlist_entry',
            targetId: (res.visitId ?? res.waitlistEntryId)!,
          });
          if (res.kind === 'visit') await recordAppointmentUsage(tx, ev.org_id);
          return res;
        });
        return {
          status: 201,
          body: { data: { id: r.visitId ?? r.waitlistEntryId, kind: r.kind } },
        };
      });
      reply.status(result.status);
      return result.body;
    },
  );
}

interface ResolvedEvent {
  id: string;
  org_id: string;
  location_id: string;
  title: string;
  description: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  capacity: number | null;
  form_fields: unknown;
  is_published: boolean;
  slug: string | null;
  public_id: string;
  membership_required_tier_id: string | null;
}

async function resolveEvent(p: { orgSlug: string; slugPrefix: string; slugOrPublicId: string }): Promise<ResolvedEvent> {
  const org = await getDb()
    .selectFrom('orgs')
    .select(['id', 'slug_prefix', 'form_fields'])
    .where('public_slug', '=', p.orgSlug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw new NotFoundError();
  if (org.slug_prefix !== p.slugPrefix) throw new NotFoundError();
  return withOrgRead(org.id, async (tx) => {
    const ev = await tx
      .selectFrom('events')
      .selectAll()
      .where('org_id', '=', org.id)
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('slug', '=', p.slugOrPublicId), eb('public_id', '=', p.slugOrPublicId)]))
      .executeTakeFirst();
    if (!ev) throw new NotFoundError();
    return ev as ResolvedEvent;
  });
}

function publicEvent(e: ResolvedEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.starts_at instanceof Date ? e.starts_at.toISOString() : e.starts_at,
    endsAt: e.ends_at instanceof Date ? e.ends_at.toISOString() : e.ends_at,
    capacity: e.capacity,
    slug: e.slug,
    publicId: e.public_id,
    isPublished: e.is_published,
    membershipRequiredTierId: e.membership_required_tier_id,
  };
}
