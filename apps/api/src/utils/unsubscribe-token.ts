import crypto from 'node:crypto';
import { getConfig } from '../config.js';
import { hmacHex } from './ids.js';

// Signed, stateless unsubscribe tokens. Shape: `<email_b64>.<orgId>.<expiresAt>.<hmac>`.
// email is base64url-encoded to avoid dots inside the email leaking into the
// segment count. expiresAt is ms-since-epoch. Rotating MANAGE_TOKEN_SECRET
// invalidates all outstanding links (same secret, different domain prefix).

const DOMAIN = 'unsub'; // prevents cross-use with manage tokens

export interface UnsubscribeTokenPayload {
  email: string;
  orgId: string;
  expiresAt: number;
}

export function makeUnsubscribeToken(email: string, orgId: string, expiresAt: number): string {
  const emailB64 = Buffer.from(email.toLowerCase()).toString('base64url');
  const payload = `${DOMAIN}.${emailB64}.${orgId}.${expiresAt}`;
  const mac = hmacHex(getConfig().MANAGE_TOKEN_SECRET, payload);
  return `${emailB64}.${orgId}.${expiresAt}.${mac}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [emailB64, orgId, expiresAtStr, mac] = parts;
  if (!emailB64 || !orgId || !expiresAtStr || !mac) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;

  const payload = `${DOMAIN}.${emailB64}.${orgId}.${expiresAt}`;
  const expected = hmacHex(getConfig().MANAGE_TOKEN_SECRET, payload);
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  if (Date.now() > expiresAt) return null;

  let email: string;
  try {
    email = Buffer.from(emailB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return { email, orgId, expiresAt };
}

// Unsubscribe links expire 1 year from issuance.
const UNSUB_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export function defaultUnsubscribeExpiry(): number {
  return Date.now() + UNSUB_TTL_MS;
}
