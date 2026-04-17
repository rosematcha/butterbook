import { Secret, TOTP } from 'otpauth';
import crypto from 'node:crypto';

export function newTotpSecret(): string {
  return new Secret({ buffer: crypto.randomBytes(20) }).base32;
}

export function totpFor(secret: string, label: string, issuer = 'Museum Scheduler'): TOTP {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    label,
    issuer,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
}

export function verifyTotp(secret: string, code: string): boolean {
  const t = totpFor(secret, 'verify');
  const delta = t.validate({ token: code, window: 1 });
  return delta !== null;
}

export function otpAuthUrl(secret: string, label: string, issuer = 'Museum Scheduler'): string {
  return totpFor(secret, label, issuer).toString();
}
