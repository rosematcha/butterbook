'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { apiGet, getToken } from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/env';
import { useSession } from '../../../lib/session';
import { SkeletonRows } from '../../components/skeleton-rows';

type HeadcountBucket = 'day' | 'week' | 'month';

interface HeadcountRow { bucket: string; headcount: number; visits: number; }
interface BookingSourceRow { booking_method: string; visits: number; headcount: number; }
interface EventReportRow { event_id: string; title: string; starts_at: string; capacity: number | null; confirmed: number; cancelled: number; waitlisted: number; }

const SOURCE_COLORS: Record<string, string> = {
  admin: '#6366f1',
  self: '#10b981',
  kiosk: '#f59e0b',
};

function useReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ReportsPage() {
  const { activeOrgId } = useSession();
  const reducedMotion = useReducedMotion();
  const today = new Date();
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<HeadcountBucket>('day');

  const baseQs = `from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`;

  const headcount = useQuery({
    queryKey: ['report-headcount', activeOrgId, from, to, groupBy],
    queryFn: () => apiGet<{ data: HeadcountRow[] }>(`/api/v1/orgs/${activeOrgId}/reports/headcount?${baseQs}&group_by=${groupBy}`),
    enabled: !!activeOrgId,
  });
  const sources = useQuery({
    queryKey: ['report-sources', activeOrgId, from, to],
    queryFn: () => apiGet<{ data: BookingSourceRow[] }>(`/api/v1/orgs/${activeOrgId}/reports/booking-sources?${baseQs}`),
    enabled: !!activeOrgId,
  });
  const events = useQuery({
    queryKey: ['report-events', activeOrgId, from, to],
    queryFn: () => apiGet<{ data: EventReportRow[] }>(`/api/v1/orgs/${activeOrgId}/reports/events?${baseQs}`),
    enabled: !!activeOrgId,
  });

  const headcountData = useMemo(() =>
    (headcount.data?.data ?? []).map((r) => ({
      ...r,
      label: formatBucket(r.bucket, groupBy),
    })),
    [headcount.data, groupBy],
  );

  const eventsData = useMemo(() => {
    const rows = events.data?.data ?? [];
    return [...rows].sort((a, b) => b.confirmed - a.confirmed);
  }, [events.data]);

  const maxConfirmed = useMemo(
    () => Math.max(1, ...eventsData.map((r) => r.confirmed)),
    [eventsData],
  );

  async function downloadCsv(name: 'visits' | 'headcount' | 'booking-sources' | 'events' | 'intake', extra = '') {
    const url = `${API_BASE_URL}/api/v1/orgs/${activeOrgId}/reports/${name}/export?${baseQs}${extra}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs text-slate-500">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 w-44" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 w-44" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Group by</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as HeadcountBucket)} className="input mt-1 w-32">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>

      {/* Headcount */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Headcount</h2>
          <button onClick={() => downloadCsv('headcount', `&group_by=${groupBy}`)} className="btn-secondary">Export CSV</button>
        </div>

        {headcount.isPending ? (
          <div className="mt-3"><SkeletonRows cols={3} rows={4} /></div>
        ) : headcountData.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No data for this range.</p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={headcountData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e0db" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="headcount"
                  name="Headcount"
                  stroke="#b0573d"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={!reducedMotion}
                />
                <Line
                  type="monotone"
                  dataKey="visits"
                  name="Visits"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={!reducedMotion}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Show table</summary>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Bucket</th><th>Visits</th><th>Headcount</th></tr></thead>
            <tbody>
              {headcountData.map((r) => (
                <tr key={r.bucket} className="border-t border-slate-100"><td className="py-2">{r.label}</td><td>{r.visits}</td><td>{r.headcount}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      {/* Booking sources */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Booking sources</h2>
          <button onClick={() => downloadCsv('booking-sources')} className="btn-secondary">Export CSV</button>
        </div>

        {sources.isPending ? (
          <div className="mt-3"><SkeletonRows cols={3} rows={3} /></div>
        ) : (sources.data?.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No data for this range.</p>
        ) : (
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sources.data?.data ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e0db" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="booking_method" tick={{ fontSize: 11 }} width={60} />
                <Tooltip />
                <Bar dataKey="visits" name="Visits" isAnimationActive={!reducedMotion}>
                  {(sources.data?.data ?? []).map((entry) => (
                    <Cell key={entry.booking_method} fill={SOURCE_COLORS[entry.booking_method] ?? '#94a3b8'} />
                  ))}
                </Bar>
                <Bar dataKey="headcount" name="Headcount" fill="#b0573d" opacity={0.5} isAnimationActive={!reducedMotion} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Show table</summary>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Method</th><th>Visits</th><th>Headcount</th></tr></thead>
            <tbody>
              {(sources.data?.data ?? []).map((r) => (
                <tr key={r.booking_method} className="border-t border-slate-100"><td className="py-2">{r.booking_method}</td><td>{r.visits}</td><td>{r.headcount}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      {/* Events */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Events</h2>
          <button onClick={() => downloadCsv('events')} className="btn-secondary">Export CSV</button>
        </div>

        {events.isPending ? (
          <div className="mt-3"><SkeletonRows cols={6} rows={3} /></div>
        ) : eventsData.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No events in this range.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Event</th><th>Starts</th><th>Cap</th><th className="w-32">Attendance</th><th>Confirmed</th><th>Cancelled</th><th>Waitlisted</th></tr></thead>
            <tbody>
              {eventsData.map((r) => (
                <tr key={r.event_id} className="border-t border-slate-100">
                  <td className="py-2">{r.title}</td>
                  <td>{new Date(r.starts_at).toLocaleString()}</td>
                  <td>{r.capacity ?? '—'}</td>
                  <td>
                    <div className="flex h-3 items-center">
                      <div
                        className="h-full rounded-sm bg-brand-accent/70"
                        style={{ width: `${Math.max(4, (r.confirmed / maxConfirmed) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td>{r.confirmed}</td>
                  <td>{r.cancelled}</td>
                  <td>{r.waitlisted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function formatBucket(bucket: string, groupBy: HeadcountBucket): string {
  if (groupBy === 'month') {
    const d = new Date(bucket);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const d = new Date(bucket);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
