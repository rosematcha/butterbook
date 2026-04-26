'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';

interface Visit {
  id: string;
  scheduledAt: string;
  status: string;
  bookingMethod: string;
  piiRedacted: boolean;
  formResponse: Record<string, unknown>;
}

interface EventDetail {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  locationId: string;
}

interface Location {
  id: string;
  name: string;
}

function PrintContent() {
  const params = useSearchParams();
  const eventId = params.get('id');
  const { activeOrgId, membership } = useSession();

  const event = useQuery({
    queryKey: ['event-print', activeOrgId, eventId],
    queryFn: () => apiGet<{ data: EventDetail }>(`/api/v1/orgs/${activeOrgId}/events/${eventId}`),
    enabled: !!activeOrgId && !!eventId,
  });

  const visits = useQuery({
    queryKey: ['event-visits-print', activeOrgId, eventId],
    queryFn: () =>
      apiGet<{ data: Visit[] }>(
        `/api/v1/orgs/${activeOrgId}/visits?event_id=${eventId}&limit=200`,
      ),
    enabled: !!activeOrgId && !!eventId,
  });

  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
  });

  const ev = event.data?.data;
  const locationName = ev
    ? locations.data?.data.find((l) => l.id === ev.locationId)?.name ?? ''
    : '';

  useEffect(() => {
    if (visits.data && event.data && !visits.isPending && !event.isPending) {
      const timeout = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timeout);
    }
  }, [visits.data, event.data, visits.isPending, event.isPending]);

  if (!eventId) return <p className="p-8 text-sm text-red-600">Missing event ID.</p>;
  if (visits.isPending || event.isPending) return <p className="p-8 text-sm text-slate-500">Loading...</p>;

  const rows = visits.data?.data ?? [];
  const eventDate = ev
    ? new Date(ev.startsAt).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const eventTime = ev
    ? `${new Date(ev.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(ev.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <div className="print-page mx-auto max-w-4xl p-8">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-xl font-semibold">{ev?.title ?? 'Event Roster'}</h1>
        <p className="text-sm text-slate-600">
          {eventDate} &middot; {eventTime} &middot; {locationName}
        </p>
        <p className="text-sm text-slate-600">
          {rows.length} registered{ev?.capacity ? ` / ${ev.capacity} capacity` : ''}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {membership?.orgName} &middot; Generated {new Date().toLocaleString()}
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-xs font-semibold uppercase text-slate-600">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Party</th>
            <th className="py-2 pr-3">Method</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => (
            <tr key={v.id} className="border-b border-slate-200">
              <td className="py-1.5 pr-3 tabular-nums text-slate-400">{i + 1}</td>
              <td className="py-1.5 pr-3">
                {v.piiRedacted ? <em className="text-slate-400">[redacted]</em> : String(v.formResponse.name ?? '—')}
              </td>
              <td className="py-1.5 pr-3">
                {v.piiRedacted ? '—' : String(v.formResponse.email ?? '—')}
              </td>
              <td className="py-1.5 pr-3 tabular-nums">{String(v.formResponse.party_size ?? '—')}</td>
              <td className="py-1.5 pr-3">{v.bookingMethod}</td>
              <td className="py-1.5">{v.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-400">
                No registrations for this event.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function EventPrintPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading...</p>}>
      <PrintContent />
    </Suspense>
  );
}
