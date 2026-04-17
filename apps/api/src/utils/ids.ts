import { createId } from '@paralleldrive/cuid2';
import crypto from 'node:crypto';

export function newPublicId(): string {
  return createId();
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string, input: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

export function randomTokenBase64Url(bytes = 32): { token: string; hash: string } {
  const raw = crypto.randomBytes(bytes);
  const token = raw.toString('base64url');
  const hash = sha256Hex(raw);
  return { token, hash };
}

export function hashProvidedToken(token: string): string {
  try {
    const raw = Buffer.from(token, 'base64url');
    return sha256Hex(raw);
  } catch {
    return sha256Hex(token);
  }
}
