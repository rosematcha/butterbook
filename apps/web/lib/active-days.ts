'use client';
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { apiGet } from './api';

interface Location { id: string; name: string; isPrimary: boolean }
interface MonthDay { date: string; open: boolean; closed: boolean; reason?: string }
interface EventRow { id: string; startsAt: string }
interface DayAvailability { open: boolean; openTime: string | null; closeTime: string | null }

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse "HH:MM" or "HH:MM:SS" into a fractional hour. Returns null on invalid. */
function parseHour(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h + mi / 60;
}

export interface ActiveDays {
  /** YYYY-MM-DD → reason code: 'open' | 'event' | 'both' */
  map: Map<string, 'open' | 'event' | 'both'>;
  isOpen: (dateKey: string) => boolean;
  reasonFor: (dateKey: string) => 'open' | 'event' | 'both' | null;
  isLoading: boolean;
}

/**
 * Returns the set of "active" day keys for a given month — days where at least
 * one location has hours, or an event is scheduled. Used to gate the date picker
 * and the Today-timeline view.
 */
export function useActiveDays(orgId: string | null, year: number, month: number): ActiveDays {
  const locations = useQuery({
    queryKey: ['locations', orgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${orgId}/locations`),
    enabled: !!orgId,
  });

  const locIds = useMemo(() => (locations.data?.data ?? []).map((l) => l.id), [locations.data]);

  const avail = useQueries({
    queries: locIds.map((id) => ({
      queryKey: ['avail-month', orgId, id, year, month] as const,
      queryFn: () =>
        apiGet<{ data: { days: MonthDay[] } }>(
          `/api/v1/orgs/${orgId}/locations/${id}/availability/month?year=${year}&month=${month}`,
        ),
      enabled: !!orgId,
    })),
  });

  const monthStart = useMemo(() => new Date(year, month - 1, 1).toISOString(), [year, month]);
  const monthEnd = useMemo(() => new Date(year, month, 0, 23, 59, 59).toISOString(), [year, month]);

  const events = useQuery({
    queryKey: ['events', orgId, year, month],
    queryFn: () => apiGet<{ data: EventRow[] }>(`/api/v1/orgs/${orgId}/events?from=${monthStart}&to=${monthEnd}`),
    enabled: !!orgId,
  });

  const availLoading = avail.some((q) => q.isLoading);
  const availData = avail.map((q) => q.data);

  const map = useMemo(() => {
    const m = new Map<string, 'open' | 'event' | 'both'>();
    for (const q of availData) {
      for (const d of q?.data.days ?? []) {
        if (d.open) m.set(d.date, 'open');
      }
    }
    for (const e of events.data?.data ?? []) {
      const key = e.startsAt.slice(0, 10);
      const prev = m.get(key);
      m.set(key, prev === 'open' ? 'both' : prev ?? 'event');
    }
    return m;
    // availData identity changes each render; depending on events.data and length hash is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.data, availLoading, locIds.length, year, month]);

  return {
    map,
    isOpen: (k) => map.has(k),
    reasonFor: (k) => map.get(k) ?? null,
    isLoading: locations.isLoading || availLoading || events.isLoading,
  };
}

export interface DayWindow {
  /** Earliest hour to show on the timeline, integer floor (e.g. 10). */
  startHour: number;
  /** Latest hour to show, integer ceil (e.g. 18). Exclusive in grid terms. */
  endHour: number;
  /** True when at least one location has real hours for this date. */
  hasHours: boolean;
  isLoading: boolean;
}

const DEFAULT_WINDOW: Pick<DayWindow, 'startHour' | 'endHour'> = { startHour: 9, endHour: 18 };

/**
 * Compute the time window the timeline should display for `date`, taken from
 * real location availability (base hours + overrides) across every location in
 * the org. Falls back to a sensible default if no location is open.
 *
 * The window is padded by one hour on each side so early-arriving / late-leaving
 * visitors still appear on the grid.
 */
export function useDayWindow(orgId: string | null, date: Date, enabled = true): DayWindow {
  const dayKey = toLocalDateKey(date);

  const locations = useQuery({
    queryKey: ['locations', orgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${orgId}/locations`),
    enabled: !!orgId,
  });

  const locs = locations.data?.data ?? [];

  const avail = useQueries({
    queries: locs.map((l) => ({
      queryKey: ['avail-day', orgId, l.id, dayKey] as const,
      queryFn: () =>
        apiGet<{ data: DayAvailability }>(
          `/api/v1/orgs/${orgId}/locations/${l.id}/availability?date=${dayKey}`,
        ),
      enabled: enabled && !!orgId,
    })),
  });

  const availLoading = avail.some((q) => q.isLoading);

  return useMemo<DayWindow>(() => {
    let minOpen: number | null = null;
    let maxClose: number | null = null;
    for (const q of avail) {
      const d = q.data?.data;
      if (!d?.open) continue;
      const o = parseHour(d.openTime);
      const c = parseHour(d.closeTime);
      if (o != null && (minOpen == null || o < minOpen)) minOpen = o;
      if (c != null && (maxClose == null || c > maxClose)) maxClose = c;
    }
    if (minOpen == null || maxClose == null) {
      return { ...DEFAULT_WINDOW, hasHours: false, isLoading: locations.isLoading || availLoading };
    }
    // Snap to the containing hour boundaries — no padding. Clamp to [0, 24].
    const startHour = Math.max(0, Math.floor(minOpen));
    const endHour = Math.min(24, Math.ceil(maxClose));
    return { startHour, endHour, hasHours: true, isLoading: locations.isLoading || availLoading };
    // avail identity changes each render; a length+key signature is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, locs.length, availLoading, locations.isLoading]);
}
