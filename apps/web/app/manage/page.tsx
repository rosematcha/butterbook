'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '../../lib/env';
import { applyThemeVars, type ThemeTokens } from '../../lib/branding';

interface ManageData {
  visit: {
    id: string;
    scheduledAt: string;
    status: string;
    locationId: string;
    eventId: string | null;
    formResponse: Record<string, unknown> | null;
  };
  org: { id: string; name: string; timezone: string; logoUrl: string | null; theme?: ThemeTokens };
  location: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null } | null;
  event: { id: string; title: string; startsAt: string; endsAt: string } | null;
  policy: {
    cancelCutoffHours: number;
    rescheduleCutoffHours: number;
    selfCancelEnabled: boolean;
    selfRescheduleEnabled: boolean;
    refundPolicyText: string | null;
  };
}

interface ManagedMembership {
  id: string;
  status: 'pending' | 'active' | 'expired' | 'lapsed' | 'cancelled' | 'refunded';
  startedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  tier: {
    name: string;
    priceCents: number;
    billingInterval: string;
  };
}

interface Slot {
  start: string;
  end: string;
  available: boolean;
  remaining: number | null;
}

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...opts, headers: { Accept: 'application/json', ...(opts?.headers ?? {}) } });
}

function ManageInner() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [data, setData] = useState<ManageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<ManagedMembership[]>([]);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [showRedact, setShowRedact] = useState(false);
  const [redactConfirmed, setRedactConfirmed] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing manage token.');
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}`);
      if (res.status === 401) throw new Error('This link is invalid or has expired.');
      if (!res.ok) throw new Error('Unable to load booking.');
      const body = (await res.json()) as { data: ManageData };
      setData(body.data);
      const memberRes = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/memberships`);
      if (memberRes.ok) {
        const memberBody = (await memberRes.json()) as { data: ManagedMembership[] };
        setMemberships(memberBody.data);
      } else {
        setMemberships([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load booking.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (data?.org.theme) {
      applyThemeVars(data.org.theme);
      document.documentElement.classList.add('branded');
    }
    return () => { document.documentElement.classList.remove('branded'); };
  }, [data]);

  async function onCancel() {
    if (!data) return;
    if (!confirm('Cancel this booking? This cannot be undone.')) return;
    setWorking(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(p?.detail ?? p?.title ?? 'Cancel failed.');
      }
      setNotice('Your booking has been cancelled.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed.');
    } finally {
      setWorking(false);
    }
  }

  async function onCancelMembership(membership: ManagedMembership) {
    if (!confirm(`Cancel your ${membership.tier.name} membership?`)) return;
    setWorking(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/memberships/${membership.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'visitor self-cancelled' }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(p?.detail ?? p?.title ?? 'Membership cancellation failed.');
      }
      setNotice('Your membership has been cancelled.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Membership cancellation failed.');
    } finally {
      setWorking(false);
    }
  }

  async function onManageBilling(membership: ManagedMembership) {
    setWorking(true);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/memberships/${membership.id}/billing-portal-session`, {
        method: 'POST',
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(p?.detail ?? p?.title ?? 'Could not open billing portal.');
      }
      const body = (await res.json()) as { data: { url: string } };
      window.open(body.data.url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal.');
    } finally {
      setWorking(false);
    }
  }

  async function onRedact() {
    setWorking(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/redact`, {
        method: 'POST',
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(p?.detail ?? p?.title ?? 'Data deletion failed.');
      }
      setNotice('Your personal data has been deleted.');
      setShowRedact(false);
      setRedactConfirmed(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data deletion failed.');
    } finally {
      setWorking(false);
    }
  }

  async function loadSlots(date: string) {
    setSlotsLoading(true);
    setSlots(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/availability?date=${date}`);
      if (!res.ok) throw new Error('Unable to load availability.');
      const body = (await res.json()) as { data: { open: boolean; slots: Slot[] } };
      setSlots(body.data.slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load availability.');
    } finally {
      setSlotsLoading(false);
    }
  }

  async function onReschedule(slot: Slot) {
    if (!confirm(`Move your booking to ${new Date(slot.start).toLocaleString()}?`)) return;
    setWorking(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/v1/manage/${encodeURIComponent(token)}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: slot.start }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(p?.detail ?? p?.title ?? 'Reschedule failed.');
      }
      setNotice('Your booking has been rescheduled.');
      setShowReschedule(false);
      setSlots(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reschedule failed.');
    } finally {
      setWorking(false);
    }
  }

  const scheduledLocal = useMemo(() => {
    if (!data) return '';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: data.org.timezone,
    }).format(new Date(data.visit.scheduledAt));
  }, [data]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-paper-500">Loading…</main>;
  }

  if (error && !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-8 text-center">
        <div className="text-lg text-red-700">{error}</div>
        <p className="mt-2 text-sm text-paper-500">If you need to make a change, please contact the venue directly.</p>
      </main>
    );
  }
  if (!data) return null;

  const isCancelled = data.visit.status === 'cancelled';
  const hoursUntil = (new Date(data.visit.scheduledAt).getTime() - Date.now()) / 3600000;
  const cancelAllowed = data.policy.selfCancelEnabled && hoursUntil >= data.policy.cancelCutoffHours && !isCancelled;
  const rescheduleAllowed = data.policy.selfRescheduleEnabled && hoursUntil >= data.policy.rescheduleCutoffHours && !isCancelled;
  const canCancelMembership = (membership: ManagedMembership) => ['pending', 'active', 'expired', 'lapsed'].includes(membership.status);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <div className="h-eyebrow">{data.org.name}</div>
      <h1 className="h-display mt-1">Your booking</h1>

      {notice ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="panel mt-6 p-6">
        <div className="h-eyebrow">When</div>
        <div className="mt-1 text-lg">{scheduledLocal}</div>
        {data.location ? (
          <>
            <div className="h-eyebrow mt-4">Where</div>
            <div className="mt-1 text-lg">{data.location.name}</div>
            {data.location.address ? (
              <div className="text-sm text-paper-600">
                {data.location.address}
                {data.location.city ? `, ${data.location.city}` : ''}
                {data.location.state ? `, ${data.location.state}` : ''}
                {data.location.zip ? ` ${data.location.zip}` : ''}
              </div>
            ) : null}
          </>
        ) : null}
        {data.event ? (
          <>
            <div className="h-eyebrow mt-4">Event</div>
            <div className="mt-1 text-lg">{data.event.title}</div>
          </>
        ) : null}
        <div className="h-eyebrow mt-4">Status</div>
        <div className="mt-1 text-lg capitalize">{data.visit.status}</div>
      </div>

      {isCancelled ? (
        <p className="mt-6 text-sm text-paper-600">This booking has been cancelled.</p>
      ) : (
        <div className="mt-6 space-y-3">
          <a
            className="btn-ghost block w-full text-center"
            href={`${API_BASE_URL}/api/v1/manage/${encodeURIComponent(token)}/calendar.ics`}
          >
            Add to calendar
          </a>
          {rescheduleAllowed ? (
            <div>
              <button className="btn w-full" disabled={working} onClick={() => setShowReschedule((v) => !v)}>
                {showReschedule ? 'Hide reschedule' : 'Reschedule'}
              </button>
              {showReschedule ? (
                <div className="panel mt-3 p-4">
                  <label className="block text-sm">
                    Pick a date
                    <input
                      type="date"
                      className="input mt-1"
                      value={rescheduleDate}
                      onChange={(e) => {
                        setRescheduleDate(e.target.value);
                        if (e.target.value) void loadSlots(e.target.value);
                      }}
                    />
                  </label>
                  {slotsLoading ? <div className="mt-3 text-sm text-paper-500">Loading slots…</div> : null}
                  {slots && slots.length === 0 ? <div className="mt-3 text-sm text-paper-500">No slots available that day.</div> : null}
                  {slots && slots.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {slots.map((s) => (
                        <button
                          key={s.start}
                          disabled={!s.available || working}
                          className="btn-ghost py-2 text-sm disabled:opacity-40"
                          onClick={() => onReschedule(s)}
                        >
                          {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: data.org.timezone }).format(new Date(s.start))}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {cancelAllowed ? (
            <button className="btn-ghost w-full text-red-700" disabled={working} onClick={onCancel}>
              Cancel booking
            </button>
          ) : null}

          {!cancelAllowed && !rescheduleAllowed ? (
            <p className="text-sm text-paper-500">
              This booking can no longer be changed online. Please contact the venue if you need to make a change.
            </p>
          ) : null}
        </div>
      )}

      {data.policy.refundPolicyText ? (
        <div className="mt-6 rounded-md border border-paper-200 bg-paper-50 p-4 text-sm text-paper-700">
          <div className="h-eyebrow mb-1">Refund policy</div>
          {data.policy.refundPolicyText}
        </div>
      ) : null}

      {memberships.length > 0 ? (
        <div className="panel mt-6 p-6">
          <div className="h-eyebrow">Membership</div>
          <div className="mt-4 space-y-4">
            {memberships.map((membership) => (
              <div key={membership.id} className="rounded-md border border-paper-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{membership.tier.name}</div>
                    <div className="mt-1 text-sm capitalize text-paper-600">{membership.status}</div>
                  </div>
                  {membership.expiresAt ? (
                    <div className="text-right text-xs text-paper-500">
                      Expires<br />
                      {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: data.org.timezone }).format(new Date(membership.expiresAt))}
                    </div>
                  ) : (
                    <div className="text-xs text-paper-500">No expiry</div>
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    className="btn-ghost w-full"
                    disabled={working}
                    onClick={() => onManageBilling(membership)}
                  >
                    Manage billing
                  </button>
                  {canCancelMembership(membership) ? (
                    <button
                      className="btn-ghost w-full text-red-700"
                      disabled={working}
                      onClick={() => onCancelMembership(membership)}
                    >
                      Cancel membership
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* GDPR self-serve data deletion */}
      <div className="mt-8 border-t border-paper-200 pt-6">
        {!showRedact ? (
          <button
            className="text-sm text-paper-500 underline underline-offset-4 hover:text-red-700"
            onClick={() => setShowRedact(true)}
          >
            Delete my personal data
          </button>
        ) : (
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-800">Delete your personal data</h3>
            <p className="mt-1 text-sm text-red-700">
              This will permanently erase your name, email, phone number, and other personal information
              from our records. Visit history will be retained in anonymized form. This action cannot be undone.
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={redactConfirmed}
                onChange={(e) => setRedactConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-red-700">I understand this is permanent and want to proceed.</span>
            </label>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-danger text-sm"
                disabled={!redactConfirmed || working}
                onClick={onRedact}
              >
                Delete my data
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={() => { setShowRedact(false); setRedactConfirmed(false); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-8 text-paper-500">Loading…</main>}>
      <ManageInner />
    </Suspense>
  );
}
