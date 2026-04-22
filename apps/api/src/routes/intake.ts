import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { kioskCheckinSchema, slugSchema, type Permission } from '@butterbook/shared';
import { getDb, withOrgContext } from '../db/index.js';
import { AuthenticationError, NotFoundError, PermissionError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { handleIdempotent } from '../middleware/idempotency.js';
import { getConfig } from '../config.js';
import { hmacHex } from '../utils/ids.js';

// Public slug-scoped intake routes. Mirror the token-scoped kiosk endpoints in
// apps/api/src/routes/kiosk.ts but resolve by orgs.public_slug → primary
// location. Direct getDb() reads on orgs/locations are the same documented
// cross-tenant bootstrap exception used by kiosk.ts (ESLint allowlist).

const slugParam = z.object({ slug: slugSchema });

const NONCE_TTL_MS = 10 * 60 * 1000;

function makeNonce(slug: string, ip: string): { nonce: string; expiresAt: number } {
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const payload = `intake.${slug}.${ip}.${expiresAt}`;
  const mac = hmacHex(getConfig().KIOSK_NONCE_SECRET, payload);
  return { nonce: `${expiresAt}.${mac}`, expiresAt };
}

function verifyNonce(nonce: string, slug: string, ip: string): boolean {
  const [expStr, mac] = nonce.split('.');
  if (!expStr || !mac) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = hmacHex(getConfig().KIOSK_NONCE_SECRET, `intake.${slug}.${ip}.${exp}`);
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function resolveSlug(slug: string): Promise<{ orgId: string; locationId: string; isDemo: boolean } | null> {
  const row = await getDb()
    .selectFrom('orgs')
    .innerJoin('locations', 'locations.org_id', 'orgs.id')
    .select([
      'orgs.id as orgId',
      'orgs.is_demo as isDemo',
      'locations.id as locationId',
      'locations.is_primary as isPrimary',
      'orgs.deleted_at as orgDeletedAt',
      'locations.deleted_at as locDeletedAt',
    ])
    .where('orgs.public_slug', '=', slug)
    .where('orgs.deleted_at', 'is', null)
    .where('locations.deleted_at', 'is', null)
    .orderBy('locations.is_primary', 'desc')
    .orderBy('locations.created_at', 'asc')
    .executeTakeFirst();
  if (!row) return null;
  return { orgId: row.orgId, locationId: row.locationId, isDemo: row.isDemo ?? false };
}

export function registerIntakeRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/public/intake/:slug/config',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const { slug } = slugParam.parse(req.params);
      const resolved = await resolveSlug(slug);
      if (!resolved) throw new NotFoundError();
      if (resolved.isDemo) throw new PermissionError('Intake disabled for demo organizations.');

      const [org, loc] = await Promise.all([
        getDb()
          .selectFrom('orgs')
          .select(['name as orgName', 'theme', 'kiosk_reset_seconds as resetSeconds'])
          .where('id', '=', resolved.orgId)
          .executeTakeFirst(),
        getDb()
          .selectFrom('locations')
          .select(['name as locationName'])
          .where('id', '=', resolved.locationId)
          .executeTakeFirst(),
      ]);
      if (!org || !loc) throw new NotFoundError();

      const { nonce } = makeNonce(slug, req.ip ?? '');
      return {
        data: {
          orgId: resolved.orgId,
          locationId: resolved.locationId,
          orgName: org.orgName,
          locationName: loc.locationName,
          theme: org.theme,
          resetSeconds: org.resetSeconds,
          nonce,
        },
      };
    },
  );

  app.get(
    '/api/v1/public/intake/:slug/form',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const { slug } = slugParam.parse(req.params);
      const resolved = await resolveSlug(slug);
      if (!resolved) throw new NotFoundError();
      if (resolved.isDemo) throw new PermissionError('Intake disabled for demo organizations.');
      const row = await getDb()
        .selectFrom('orgs')
        .select(['form_fields as formFields'])
        .where('id', '=', resolved.orgId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: { fields: row.formFields } };
    },
  );

  app.post(
    '/api/v1/public/intake/:slug/checkin',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { slug } = slugParam.parse(req.params);
      const body = kioskCheckinSchema.parse(req.body);
      const nonce = req.headers['x-kiosk-nonce'];
      if (typeof nonce !== 'string' || !verifyNonce(nonce, slug, req.ip ?? '')) {
        throw new AuthenticationError('Invalid or expired intake nonce.');
      }
      const resolved = await resolveSlug(slug);
      if (!resolved) throw new NotFoundError();
      if (resolved.isDemo) throw new PermissionError('Intake disabled for demo organizations.');

      const idemKey = (req.headers['idempotency-key'] as string | undefined) ?? null;

      const actor = {
        userId: null,
        orgId: resolved.orgId,
        isSuperadmin: false,
        permissions: new Set<Permission>(),
        actorType: 'kiosk' as const,
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      };

      const result = await handleIdempotent(req, reply, 'visit.create.intake', resolved.orgId, async () => {
        const r = await withOrgContext(resolved.orgId, actor, async ({ tx, audit }) => {
          const res = await createVisitInTx(tx, {
            orgId: resolved.orgId,
            locationId: resolved.locationId,
            eventId: null,
            bookedBy: null,
            bookingMethod: 'kiosk',
            scheduledAt: new Date(),
            formResponse: body.formResponse,
            idempotencyKey: idemKey,
          });
          await audit({ action: 'visit.intake_checkin', targetType: 'visit', targetId: res.visitId ?? '' });
          return res;
        });
        return { status: 201, body: { data: { id: r.visitId, kind: 'visit' } } };
      });
      reply.status(result.status);
      return result.body;
    },
  );
}
