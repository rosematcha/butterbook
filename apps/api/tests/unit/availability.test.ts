import { describe, it, expect } from 'vitest';
import { isTimeAvailable, slotsForDate } from '../../src/services/availability.js';

const tz = 'America/New_York';

describe('availability service', () => {
  const hours = [
    { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true },
    { dayOfWeek: 2, openTime: '09:00', closeTime: '12:00', isActive: true },
    { dayOfWeek: 2, openTime: '13:00', closeTime: '17:00', isActive: true },
  ];

  it('returns closed on explicit closed_days', () => {
    // Monday 2026-04-13 in NY.
    const when = new Date('2026-04-13T14:00:00-04:00');
    const r = isTimeAvailable({
      when,
      orgTimezone: tz,
      hours,
      overrides: [],
      closedDays: [{ date: '2026-04-13', reason: null }],
      slotRounding: 'freeform',
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('closed_day');
  });

  it('respects override closed (both nulls)', () => {
    const when = new Date('2026-04-13T14:00:00-04:00');
    const r = isTimeAvailable({
      when,
      orgTimezone: tz,
      hours,
      overrides: [{ date: '2026-04-13', openTime: null, closeTime: null, reason: null }],
      closedDays: [],
      slotRounding: 'freeform',
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('override_closed');
  });

  it('allows time within split hours', () => {
    const within = new Date('2026-04-14T10:00:00-04:00'); // Tuesday
    expect(isTimeAvailable({ when: within, orgTimezone: tz, hours, overrides: [], closedDays: [], slotRounding: 'freeform' }).available).toBe(true);

    const gap = new Date('2026-04-14T12:30:00-04:00');
    expect(isTimeAvailable({ when: gap, orgTimezone: tz, hours, overrides: [], closedDays: [], slotRounding: 'freeform' }).available).toBe(false);
  });

  it('enforces slot rounding', () => {
    const misaligned = new Date('2026-04-13T10:07:00-04:00');
    const r = isTimeAvailable({ when: misaligned, orgTimezone: tz, hours, overrides: [], closedDays: [], slotRounding: '15' });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('slot_misaligned');
  });

  it('generates slots for rounding=30', () => {
    const slots = slotsForDate({
      date: '2026-04-13',
      orgTimezone: tz,
      hours,
      overrides: [],
      closedDays: [],
      slotRounding: '30',
    });
    expect(slots[0]).toBe('09:00');
    expect(slots[slots.length - 1]).toBe('16:30');
  });
});
