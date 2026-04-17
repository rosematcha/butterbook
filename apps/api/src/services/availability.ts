import { timeToMinutes } from '@butterbook/shared';

export interface HoursRow {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isActive: boolean;
}
export interface OverrideRow {
  date: string;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}
export interface ClosedRow {
  date: string;
  reason: string | null;
}

export type SlotRounding = 'freeform' | '5' | '10' | '15' | '30';

export interface AvailabilityInput {
  when: Date;
  orgTimezone: string;
  hours: HoursRow[];
  overrides: OverrideRow[];
  closedDays: ClosedRow[];
  slotRounding: SlotRounding;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: 'closed_day' | 'override_closed' | 'outside_hours' | 'slot_misaligned';
}

// Produce YYYY-MM-DD and minutes-since-midnight in the org timezone.
function projectInTz(when: Date, tz: string): { date: string; dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(when);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hours = Number(get('hour'));
  const minutes = Number(get('minute'));
  const dowName = get('weekday');
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date, dow: dowMap[dowName] ?? 0, minutes: hours * 60 + minutes };
}

export function isTimeAvailable(input: AvailabilityInput): AvailabilityResult {
  const { date, dow, minutes } = projectInTz(input.when, input.orgTimezone);

  if (input.closedDays.some((c) => c.date === date)) {
    return { available: false, reason: 'closed_day' };
  }

  const override = input.overrides.find((o) => o.date === date);
  if (override) {
    if (override.openTime == null || override.closeTime == null) {
      return { available: false, reason: 'override_closed' };
    }
    const open = timeToMinutes(override.openTime);
    const close = timeToMinutes(override.closeTime);
    if (minutes < open || minutes >= close) return { available: false, reason: 'outside_hours' };
  } else {
    const applicable = input.hours.filter((h) => h.dayOfWeek === dow && h.isActive);
    if (applicable.length === 0) return { available: false, reason: 'outside_hours' };
    const anyFit = applicable.some((h) => {
      const open = timeToMinutes(h.openTime);
      const close = timeToMinutes(h.closeTime);
      return minutes >= open && minutes < close;
    });
    if (!anyFit) return { available: false, reason: 'outside_hours' };
  }

  if (input.slotRounding !== 'freeform') {
    const step = Number(input.slotRounding);
    if (minutes % step !== 0) return { available: false, reason: 'slot_misaligned' };
  }

  return { available: true };
}

export function slotsForDate(input: Omit<AvailabilityInput, 'when'> & { date: string }): string[] {
  const override = input.overrides.find((o) => o.date === input.date);
  const [yy, mm, dd] = input.date.split('-').map((n) => Number(n));
  const tmp = new Date(Date.UTC(yy!, (mm ?? 1) - 1, dd ?? 1));
  const dow = tmp.getUTCDay();
  let windows: Array<{ open: number; close: number }> = [];
  if (override) {
    if (override.openTime != null && override.closeTime != null) {
      windows = [{ open: timeToMinutes(override.openTime), close: timeToMinutes(override.closeTime) }];
    }
  } else {
    windows = input.hours
      .filter((h) => h.dayOfWeek === dow && h.isActive)
      .map((h) => ({ open: timeToMinutes(h.openTime), close: timeToMinutes(h.closeTime) }));
  }
  if (input.slotRounding === 'freeform' || windows.length === 0) return [];
  const step = Number(input.slotRounding);
  const out: string[] = [];
  for (const w of windows) {
    const start = Math.ceil(w.open / step) * step;
    for (let m = start; m < w.close; m += step) {
      const h = Math.floor(m / 60);
      const mm2 = m % 60;
      out.push(`${String(h).padStart(2, '0')}:${String(mm2).padStart(2, '0')}`);
    }
  }
  return out;
}
