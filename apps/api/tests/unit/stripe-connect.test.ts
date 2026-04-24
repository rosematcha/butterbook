import { describe, expect, it } from 'vitest';
import { makeStripeConnectState, verifyStripeConnectState } from '../../src/services/stripe.js';

describe('Stripe Connect state', () => {
  it('round-trips a valid org id', () => {
    const orgId = '00000000-0000-0000-0000-000000000123';
    const state = makeStripeConnectState(orgId, new Date('2026-04-24T12:00:00Z'));
    expect(verifyStripeConnectState(state, new Date('2026-04-24T12:05:00Z'))).toEqual({ orgId });
  });

  it('rejects tampered state', () => {
    const state = makeStripeConnectState('00000000-0000-0000-0000-000000000123');
    expect(() => verifyStripeConnectState(`${state}abc`)).toThrow(/Invalid Stripe Connect state/);
  });

  it('rejects expired state', () => {
    const state = makeStripeConnectState('00000000-0000-0000-0000-000000000123', new Date('2026-04-24T12:00:00Z'));
    expect(() => verifyStripeConnectState(state, new Date('2026-04-24T12:11:00Z'))).toThrow(/Expired Stripe Connect state/);
  });
});
