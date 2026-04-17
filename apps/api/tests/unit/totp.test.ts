import { describe, it, expect } from 'vitest';
import { newTotpSecret, totpFor, verifyTotp } from '../../src/utils/totp.js';
import { decryptSecret, encryptSecret } from '../../src/utils/crypto.js';

describe('totp + crypto', () => {
  it('encrypts + decrypts round-trip', () => {
    const secret = newTotpSecret();
    const enc = encryptSecret(secret);
    expect(enc.length).toBeGreaterThan(secret.length);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('verifies a fresh code', () => {
    const secret = newTotpSecret();
    const code = totpFor(secret, 'x').generate();
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
});
