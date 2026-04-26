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

interface Location {
  id: string;
  name: string;
}

function PrintContent() {
  const params = useSearchParams();
  const date = params.get('date') ?? new Date().toISOString().slice(0, 10);
  const locationId = params.get('locationId');
  const { activeOrgId, membership } = useSession();

  const from = new Date(`${date}T00:00:00Z`).toISOString();
  const to = new Date(`${date}T23:59:59Z`).toISOString();

  const locationFilter = locationId ? `&location_id=${locationId}` : '';
  const visits = useQuery({
    queryKey: ['visits-print', activeOrgId, date, locationId],
    queryFn: () =>
      apiGet<{ data: Visit[] }>(
        `/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=200${locationFilter}`,
      ),
    enabled: !!activeOrgId,
  });

  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
  });

  const locationName = locationId
    ? locations.data?.data.find((l) => l.id === locationId)?.name ?? ''
    : 'All locations';

  useEffect(() => {
    if (visits.data && !visits.isPending) {
      const timeout = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timeout);
    }
  }, [visits.data, visits.isPending]);

  if (visits.isPending) return <p className="p-8 text-sm text-slate-500">Loading...</p>;

  const rows = visits.data?.data ?? [];
  const displayDate = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="print-page mx-auto max-w-4xl p-8">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-xl font-semibold">{membership?.orgName ?? 'Visit Roster'}</h1>
        <p className="text-sm text-slate-600">
          {displayDate} &middot; {locationName} &middot; {rows.length} visitor{rows.length !== 1 ? 's' : ''}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Generated {new Date().toLocaleString()}
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-xs font-semibold uppercase text-slate-600">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Time</th>
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
              <td className="py-1.5 pr-3 tabular-nums">
                {new Date(v.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
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
              <td colSpan={7} className="py-6 text-center text-slate-400">
                No visits on this date.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function VisitsPrintPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading...</p>}>
      <PrintContent />
    </Suspense>
  );
}
