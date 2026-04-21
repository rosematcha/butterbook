'use client';
import { useState } from 'react';
import { z } from 'zod';

// Dominant IANA timezone for each US state/territory abbreviation.
// Multi-timezone states (e.g. TX, KY, IN) use the timezone that covers
// the vast majority of the population — users in edge zones can adjust.
const STATE_TIMEZONE: Record<string, string> = {
  AK: 'America/Anchorage',
  AL: 'America/Chicago',
  AR: 'America/Chicago',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DC: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  IA: 'America/Chicago',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MI: 'America/New_York',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MS: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  NE: 'America/Chicago',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  PR: 'America/Puerto_Rico',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VI: 'America/St_Thomas',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
};

export interface ZipLookup {
  city: string;
  state: string;
  timezone: string | null;
}

// Defensive schema for the zippopotam.us response. The upstream API uses
// space-separated keys; we validate that what we actually read is a string.
const zipResponseSchema = z.object({
  places: z
    .array(
      z.object({
        'place name': z.string().min(1),
        'state abbreviation': z.string().min(1),
      }).passthrough(),
    )
    .min(1),
}).passthrough();

export function useZipLookup(): {
  lookup: (zip: string, country: string) => Promise<ZipLookup | null>;
  loading: boolean;
  lastError: boolean;
} {
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(false);

  async function lookup(zip: string, country: string): Promise<ZipLookup | null> {
    if (country !== 'US') return null;
    const cleaned = zip.trim();
    if (!/^\d{5}$/.test(cleaned)) return null;
    setLoading(true);
    setLastError(false);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${cleaned}`);
      if (!res.ok) {
        // 404 means "ZIP not found" — not a lookup failure; leave lastError false.
        if (res.status !== 404) setLastError(true);
        return null;
      }
      const parsed = zipResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        setLastError(true);
        return null;
      }
      const place = parsed.data.places[0]!;
      const stateAbbr = place['state abbreviation'];
      return {
        city: place['place name'],
        state: stateAbbr,
        timezone: STATE_TIMEZONE[stateAbbr] ?? null,
      };
    } catch (e) {
      console.warn('[zip-lookup] failed', e);
      setLastError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { lookup, loading, lastError };
}
