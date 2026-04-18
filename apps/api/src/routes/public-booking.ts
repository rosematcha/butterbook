import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { selfBookingSchema, type Permission } from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { handleIdempotent } from '../middleware/idempotency.js';

const bookParams = z.object({ orgSlug: z.string().min(1), locId: z.string().uuid() });

export function registerPublicBookingRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/public/:orgSlug/book/:locId/form',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);
      return { data: { fields: org.form_fields } };
    },
  );

  app.post(
    '/api/v1/public/:orgSlug/book/:locId',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { orgSlug, locId } = bookParams.parse(req.params);
      const body = selfBookingSchema.parse(req.body);
      const org = await resolveOrg(orgSlug);
      await resolveLocation(org.id, locId);
      const idemKey = (req.headers['idempotency-key'] as string | undefined) ?? null;

      return handleIdempotent(req, reply, 'visit.create.self', org.id, async () => {
        const actor = {
          userId: null,
          orgId: org.id,
          isSuperadmin: false,
          permissions: new Set<Permission>(),
          actorType: 'guest' as const,
          ip: req.ip ?? null,
          userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        };
        const result = await withOrgContext(org.id, actor, async ({ tx, audit }) => {
          const r = await createVisitInTx(tx, {
            orgId: org.id,
            locationId: locId,
            eventId: null,
            bookedBy: null,
            bookingMethod: 'self',
            scheduledAt: new Date(body.scheduledAt),
            formResponse: body.formResponse,
            idempotencyKey: idemKey,
          });
          await audit({
            action: 'visit.self_booked',
            targetType: 'visit',
            targetId: r.visitId ?? r.waitlistEntryId ?? '',
            diff: { after: body },
          });
          return r;
        });
        return { status: 201, body: { data: { id: result.visitId, kind: result.kind } } };
      }).then((r) => {
        reply.status(r.status);
        return r.body;
      });
    },
  );
}

async function resolveOrg(orgSlug: string): Promise<{
  id: string;
  form_fields: unknown;
  public_slug: string;
  slug_prefix: string;
  timezone: string;
}> {
  const org = await getDb()
    .selectFrom('orgs')
    .select(['id', 'form_fields', 'public_slug', 'slug_prefix', 'timezone'])
    .where('public_slug', '=', orgSlug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw new NotFoundError('Org not found.');
  return org;
}

async function resolveLocation(orgId: string, locId: string): Promise<void> {
  await withOrgRead(orgId, async (tx) => {
    const loc = await tx
      .selectFrom('locations')
      .select(['id'])
      .where('id', '=', locId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!loc) throw new NotFoundError('Location not found.');
  });
}
