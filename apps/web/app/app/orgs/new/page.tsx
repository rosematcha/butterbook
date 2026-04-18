'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, ApiError } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';

// A short list covers the common cases; the input still accepts any IANA zone
// so users outside these aren't locked out.
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

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

export default function NewOrg() {
  const router = useRouter();
  const qc = useQueryClient();
  const { setActiveOrgId, memberships } = useSession();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimezone(guessTimezone());
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiPost<{ data: { id: string } }>('/api/v1/orgs', {
        name: name.trim(),
        address: address.trim(),
        zip: zip.trim(),
        timezone,
      });
      // Pre-select the new org so the layout can render as soon as /me refetches.
      setActiveOrgId(res.data.id);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push('/app');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.problem.detail ?? err.problem.title
          : 'Failed to create organization.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="panel p-8">
      <div className="h-eyebrow">New organization</div>
      <h1 className="h-display mt-2">Set up your museum</h1>
      <p className="mt-3 text-paper-600">
        These details go on your public booking page and shape the default location record.
        You can change any of them later from Settings.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-ink">Organization name</span>
          <input
            className="input mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rosemary Art Museum"
            autoFocus
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Street address</span>
          <input
            className="input mt-1.5"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Elm St"
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_2fr]">
          <label className="block">
            <span className="text-sm font-medium text-ink">ZIP / Postal code</span>
            <input
              className="input mt-1.5"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="10001"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Timezone</span>
            <select
              className="input mt-1.5"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
            >
              {/* Keep a detected zone visible even if it's not in our shortlist. */}
              {COMMON_TIMEZONES.includes(timezone) ? null : (
                <option value={timezone}>{timezone} (detected)</option>
              )}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-paper-500">IANA zone — used for all booking windows.</span>
          </label>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          {memberships.length > 0 ? (
            <Link href="/app" className="btn-ghost">Cancel</Link>
          ) : (
            <span className="text-xs text-paper-500">You’ll be the first superadmin.</span>
          )}
          <button type="submit" className="btn-accent" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </form>
    </div>
  );
}
