import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { kioskCheckinSchema, type Permission } from '@butterbook/shared';
import { getDb, withOrgContext } from '../db/index.js';
import { AuthenticationError, NotFoundError } from '../errors/index.js';
import { createVisitInTx } from '../services/booking.js';
import { recordAppointmentUsage } from '../services/billing-usage.js';
import { redeemGuestPassInTx } from '../services/memberships.js';
import { handleIdempotent } from '../middleware/idempotency.js';
import { getConfig } from '../config.js';
import { hmacHex } from '../utils/ids.js';

const qrParam = z.object({ qrToken: z.string().uuid() });

const NONCE_TTL_MS = 10 * 60 * 1000;

function makeNonce(qrToken: string, ip: string): { nonce: string; expiresAt: number } {
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const payload = `${qrToken}.${ip}.${expiresAt}`;
  const mac = hmacHex(getConfig().KIOSK_NONCE_SECRET, payload);
  return { nonce: `${expiresAt}.${mac}`, expiresAt };
}

function verifyNonce(nonce: string, qrToken: string, ip: string): boolean {
  const [expStr, mac] = nonce.split('.');
  if (!expStr || !mac) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = hmacHex(getConfig().KIOSK_NONCE_SECRET, `${qrToken}.${ip}.${exp}`);
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function registerKioskRoutes(app: FastifyInstance): void {
  app.get('/api/v1/kiosk/:qrToken/config', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { qrToken } = qrParam.parse(req.params);
    const loc = await getDb()
      .selectFrom('locations')
      .innerJoin('orgs', 'orgs.id', 'locations.org_id')
      .select([
        'locations.id as locationId',
        'locations.name as locationName',
        'locations.org_id as orgId',
        'orgs.name as orgName',
        'orgs.theme as theme',
        'orgs.kiosk_reset_seconds as resetSeconds',
        'orgs.deleted_at as orgDeletedAt',
        'locations.deleted_at as locDeletedAt',
      ])
      .where('locations.qr_token', '=', qrToken)
      .executeTakeFirst();
    if (!loc || loc.orgDeletedAt || loc.locDeletedAt) throw new NotFoundError();
    const { nonce } = makeNonce(qrToken, req.ip ?? '');
    return {
      data: {
        orgId: loc.orgId,
        locationId: loc.locationId,
        orgName: loc.orgName,
        locationName: loc.locationName,
        theme: loc.theme,
        resetSeconds: loc.resetSeconds,
        nonce,
      },
    };
  });

  app.get('/api/v1/kiosk/:qrToken/form', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { qrToken } = qrParam.parse(req.params);
    const row = await getDb()
      .selectFrom('locations')
      .innerJoin('orgs', 'orgs.id', 'locations.org_id')
      .select(['orgs.form_fields as formFields'])
      .where('locations.qr_token', '=', qrToken)
      .where('orgs.deleted_at', 'is', null)
      .where('locations.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw new NotFoundError();
    return { data: { fields: row.formFields } };
  });

  app.post(
    '/api/v1/kiosk/:qrToken/checkin',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { qrToken } = qrParam.parse(req.params);
      const body = kioskCheckinSchema.parse(req.body);
      const nonce = req.headers['x-kiosk-nonce'];
      if (typeof nonce !== 'string' || !verifyNonce(nonce, qrToken, req.ip ?? '')) {
        throw new AuthenticationError('Invalid or expired kiosk nonce.');
      }
      const loc = await getDb()
        .selectFrom('locations')
        .select(['id as locationId', 'org_id as orgId'])
        .where('qr_token', '=', qrToken)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!loc) throw new NotFoundError();

      const idemKey = (req.headers['idempotency-key'] as string | undefined) ?? null;

      const actor = {
        userId: null,
        orgId: loc.orgId,
        isSuperadmin: false,
        permissions: new Set<Permission>(),
        actorType: 'kiosk' as const,
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      };

      const result = await handleIdempotent(req, reply, 'visit.create.kiosk', loc.orgId, async () => {
        const r = await withOrgContext(loc.orgId, actor, async ({ tx, audit }) => {
          const res = await createVisitInTx(tx, {
            orgId: loc.orgId,
            locationId: loc.locationId,
            eventId: null,
            bookedBy: null,
            bookingMethod: 'kiosk',
            scheduledAt: new Date(),
            formResponse: body.formResponse,
            idempotencyKey: idemKey,
          });
          await audit({ action: 'visit.kiosk_checkin', targetType: 'visit', targetId: res.visitId ?? '' });
          if (res.kind === 'visit') await recordAppointmentUsage(tx, loc.orgId);
          const guestPassCode = body.guestPassCode ?? guestPassCodeFromFormResponse(body.formResponse);
          if (guestPassCode && res.visitId) {
            const redeemed = await redeemGuestPassInTx(tx, { orgId: loc.orgId, code: guestPassCode, visitId: res.visitId });
            await audit({
              action: 'guest_pass.redeemed',
              targetType: 'guest_pass',
              targetId: redeemed.id,
              diff: { after: { visitId: res.visitId, membershipId: redeemed.membershipId } },
            });
          }
          return res;
        });
        return { status: 201, body: { data: { id: r.visitId, kind: 'visit' } } };
      });
      reply.status(result.status);
      return result.body;
    },
  );
}

function guestPassCodeFromFormResponse(formResponse: Record<string, unknown>): string | null {
  for (const key of ['guestPassCode', 'guest_pass_code', 'passCode', 'pass_code']) {
    const value = formResponse[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}
