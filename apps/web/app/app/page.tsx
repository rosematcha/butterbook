'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiGet } from '../../lib/api';
import { useSession } from '../../lib/session';

interface VisitsMeta {
  meta: { total: number };
}

export default function Overview() {
  const { activeOrgId } = useSession();
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();

  const totalVisits = useQuery({
    queryKey: ['overview', 'visits', activeOrgId, from, to],
    queryFn: () => apiGet<VisitsMeta>(`/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=1`),
    enabled: !!activeOrgId,
  });

  const events = useQuery({
    queryKey: ['overview', 'events', activeOrgId, from, to],
    queryFn: () => apiGet<{ data: Array<{ id: string; title: string; startsAt: string; isPublished: boolean }> }>(`/api/v1/orgs/${activeOrgId}/events?from=${from}&to=${to}`),
    enabled: !!activeOrgId,
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card">
        <div className="text-sm text-slate-500">Visits this month</div>
        <div className="mt-2 text-3xl font-semibold">{totalVisits.data?.meta.total ?? '—'}</div>
        <Link href="/app/visits" className="mt-3 inline-block text-sm underline">View all</Link>
      </div>
      <div className="card md:col-span-2">
        <div className="text-sm text-slate-500">Upcoming events</div>
        <ul className="mt-2 divide-y divide-slate-200">
          {(events.data?.data ?? []).slice(0, 5).map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(e.startsAt).toLocaleString()} · {e.isPublished ? 'Published' : 'Draft'}
                  </div>
                </div>
                <Link href={`/app/events`} className="text-xs underline">Manage</Link>
              </div>
            </li>
          ))}
          {events.data && events.data.data.length === 0 ? <li className="py-4 text-sm text-slate-500">No events this month.</li> : null}
        </ul>
      </div>
    </div>
  );
}
