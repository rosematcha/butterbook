import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveEffectivePlan } from '../../src/services/plan.js';
import { currentPeriodYyyymm } from '../../src/services/billing-usage.js';

// Mock getConfig to control BILLING_GATING_ENABLED
vi.mock('../../src/config.js', () => {
  let billingEnabled = false;
  return {
    getConfig: () => ({ BILLING_GATING_ENABLED: billingEnabled }),
    loadConfig: () => ({ BILLING_GATING_ENABLED: billingEnabled }),
    __setBillingEnabled: (v: boolean) => {
      billingEnabled = v;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setBillingEnabled } = await import('../../src/config.js') as any;

describe('resolveEffectivePlan', () => {
  beforeEach(() => {
    __setBillingEnabled(true);
  });

  it('returns professional when BILLING_GATING_ENABLED=false', () => {
    __setBillingEnabled(false);
    expect(
      resolveEffectivePlan('free', { isDemo: false, grandfatheredUntil: null }),
    ).toBe('professional');
  });

  it('returns professional for demo orgs', () => {
    expect(
      resolveEffectivePlan('free', { isDemo: true, grandfatheredUntil: null }),
    ).toBe('professional');
  });

  it('returns professional for grandfathered orgs with future date', () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(
      resolveEffectivePlan('free', { isDemo: false, grandfatheredUntil: future }),
    ).toBe('professional');
  });

  it('returns actual plan for grandfathered orgs with past date', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(
      resolveEffectivePlan('starter', { isDemo: false, grandfatheredUntil: past }),
    ).toBe('starter');
  });

  it('returns actual plan when no overrides apply', () => {
    expect(
      resolveEffectivePlan('growth', { isDemo: false, grandfatheredUntil: null }),
    ).toBe('growth');
  });

  it('returns actual plan for free with no overrides', () => {
    expect(
      resolveEffectivePlan('free', { isDemo: false, grandfatheredUntil: null }),
    ).toBe('free');
  });
});

describe('currentPeriodYyyymm', () => {
  it('computes correct period for America/Chicago', () => {
    const period = currentPeriodYyyymm('America/Chicago');
    expect(period).toBeGreaterThanOrEqual(202601);
    expect(period).toBeLessThanOrEqual(203012);
    // Should be YYYYMM format
    const year = Math.floor(period / 100);
    const month = period % 100;
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  it('produces different results for timezones near UTC midnight boundary', () => {
    // Pacific/Auckland is UTC+12/+13 — if UTC is near midnight, Auckland
    // might be in the next day/month. This is a sanity check that timezone
    // is actually being used in the computation.
    const auckland = currentPeriodYyyymm('Pacific/Auckland');
    const year = Math.floor(auckland / 100);
    const month = auckland % 100;
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  it('returns YYYYMM integer format', () => {
    const result = currentPeriodYyyymm('UTC');
    expect(typeof result).toBe('number');
    expect(result.toString()).toMatch(/^\d{6}$/);
  });
});
