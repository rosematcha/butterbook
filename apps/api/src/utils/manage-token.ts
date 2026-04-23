import crypto from 'node:crypto';
import { getConfig } from '../config.js';
import { hmacHex } from './ids.js';

// Signed, stateless manage-link tokens — no DB row, shape mirrors the kiosk
// nonce from routes/kiosk.ts. Token: `<visitId>.<expiresAt>.<hmac>`.
//
// `expiresAt` is ms-since-epoch. Visitors receive this embedded in their
// confirmation email; rotating MANAGE_TOKEN_SECRET invalidates every outstanding
// link.

export interface ManageTokenPayload {
  visitId: string;
  expiresAt: number;
}

export function makeManageToken(visitId: string, expiresAt: number): string {
  const payload = `${visitId}.${expiresAt}`;
  const mac = hmacHex(getConfig().MANAGE_TOKEN_SECRET, payload);
  return `${payload}.${mac}`;
}

export function verifyManageToken(token: string): ManageTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [visitId, expiresAtStr, mac] = parts;
  if (!visitId || !expiresAtStr || !mac) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;

  const expected = hmacHex(getConfig().MANAGE_TOKEN_SECRET, `${visitId}.${expiresAt}`);
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  if (Date.now() > expiresAt) return null;
  return { visitId, expiresAt };
}

// Default TTL helper: scheduled_at + 7 days so a visitor can still view the
// receipt briefly after their slot.
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export function defaultManageExpiry(scheduledAt: Date | string): number {
  const ts = scheduledAt instanceof Date ? scheduledAt.getTime() : new Date(scheduledAt).getTime();
  return ts + GRACE_MS;
}
