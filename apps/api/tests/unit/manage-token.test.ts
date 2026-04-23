import { describe, expect, it } from 'vitest';
import { makeManageToken, verifyManageToken, defaultManageExpiry } from '../../src/utils/manage-token.js';

describe('manage-token', () => {
  const visitId = '00000000-0000-0000-0000-000000000001';

  it('roundtrips a fresh token', () => {
    const exp = Date.now() + 60_000;
    const token = makeManageToken(visitId, exp);
    const decoded = verifyManageToken(token);
    expect(decoded).toEqual({ visitId, expiresAt: exp });
  });

  it('rejects a tampered visitId', () => {
    const exp = Date.now() + 60_000;
    const token = makeManageToken(visitId, exp);
    const [, expStr, mac] = token.split('.');
    const tampered = `00000000-0000-0000-0000-000000000002.${expStr}.${mac}`;
    expect(verifyManageToken(tampered)).toBeNull();
  });

  it('rejects a tampered expiry', () => {
    const exp = Date.now() + 60_000;
    const token = makeManageToken(visitId, exp);
    const [vid, , mac] = token.split('.');
    const tampered = `${vid}.${exp + 1}.${mac}`;
    expect(verifyManageToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = makeManageToken(visitId, Date.now() - 1);
    expect(verifyManageToken(token)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyManageToken('')).toBeNull();
    expect(verifyManageToken('a.b')).toBeNull();
    expect(verifyManageToken('a.b.c.d')).toBeNull();
    expect(verifyManageToken(`${visitId}.notanumber.deadbeef`)).toBeNull();
  });

  it('defaultManageExpiry adds ~7 days', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const exp = defaultManageExpiry(base);
    expect(exp - base.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
