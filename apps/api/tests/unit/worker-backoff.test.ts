import { describe, expect, it } from 'vitest';
import { nextAvailableAt } from '../../src/worker/dispatcher.js';

describe('worker backoff', () => {
  const base = new Date('2026-04-22T00:00:00Z');

  it('base 30s on first retry', () => {
    // attempts=1 means one try has happened; backoff = 30s * 2^0 = 30s.
    const t = nextAvailableAt(1, base);
    expect(t.getTime() - base.getTime()).toBe(30_000);
  });

  it('doubles each attempt', () => {
    expect(nextAvailableAt(2, base).getTime() - base.getTime()).toBe(60_000);
    expect(nextAvailableAt(3, base).getTime() - base.getTime()).toBe(120_000);
    expect(nextAvailableAt(4, base).getTime() - base.getTime()).toBe(240_000);
  });

  it('caps at 1h', () => {
    expect(nextAvailableAt(20, base).getTime() - base.getTime()).toBe(3_600_000);
    expect(nextAvailableAt(99, base).getTime() - base.getTime()).toBe(3_600_000);
  });
});
