'use client';
import type { StepProps } from '../types';
import { useZipLookup } from '../use-zip-lookup';

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'IE', label: 'Ireland' },
];

export function StepLocation({ state, patch }: StepProps) {
  const { lookup, loading, lastError } = useZipLookup();

  async function handleZipBlur() {
    if (state.country !== 'US') return;
    if (!state.zip.trim()) return;
    const res = await lookup(state.zip, state.country);
    if (!res) return;
    // Don't overwrite user-typed city/state — only fill blanks.
    // Timezone is always updated from ZIP since it's more accurate than browser detection.
    const next: { city?: string; state?: string; timezone?: string } = {};
    if (!state.city.trim()) next.city = res.city;
    if (!state.state.trim()) next.state = res.state;
    if (res.timezone) next.timezone = res.timezone;
    if (Object.keys(next).length) patch(next);
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
        <label className="block">
          <span className="text-sm font-medium text-ink">Country</span>
          <select
            className="input mt-1.5"
            value={state.country}
            onChange={(e) => patch({ country: e.target.value })}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Street address</span>
          <input
            className="input mt-1.5"
            value={state.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder="123 Elm St"
            required
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_2fr_1fr]">
        <label className="block">
          <span className="text-sm font-medium text-ink">ZIP / Postal</span>
          <input
            className="input mt-1.5"
            value={state.zip}
            onChange={(e) => patch({ zip: e.target.value })}
            onBlur={handleZipBlur}
            placeholder="10001"
            required
          />
          {state.country === 'US' ? (
            <span className={`mt-1 block text-xs ${lastError ? 'text-red-700' : 'text-paper-500'}`}>
              {loading
                ? 'Looking up…'
                : lastError
                ? "Couldn't reach the lookup service. Fill city and state manually."
                : "Enter your ZIP and we'll fill in city and state."}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">City</span>
          <input
            className="input mt-1.5"
            value={state.city}
            onChange={(e) => patch({ city: e.target.value })}
            placeholder="New York"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">State / Region</span>
          <input
            className="input mt-1.5"
            value={state.state}
            onChange={(e) => patch({ state: e.target.value })}
            placeholder="NY"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">Timezone</span>
        <select
          className="input mt-1.5"
          value={state.timezone}
          onChange={(e) => patch({ timezone: e.target.value })}
          required
        >
          {COMMON_TIMEZONES.includes(state.timezone) ? null : (
            <option value={state.timezone}>{state.timezone} (detected)</option>
          )}
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-paper-500">Used for all booking windows.</span>
      </label>
    </div>
  );
}

export function stepLocationCanContinue(state: { address: string; zip: string; city: string; state: string; timezone: string }): boolean {
  return (
    state.address.trim().length > 0 &&
    state.zip.trim().length > 0 &&
    state.city.trim().length > 0 &&
    state.state.trim().length > 0 &&
    state.timezone.trim().length > 0
  );
}
