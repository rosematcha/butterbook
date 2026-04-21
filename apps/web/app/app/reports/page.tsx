'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, getToken } from '../../../lib/api';
import { API_BASE_URL } from '../../../lib/env';
import { useSession } from '../../../lib/session';
import { SkeletonRows } from '../../components/skeleton-rows';

type HeadcountBucket = 'day' | 'week' | 'month';

interface HeadcountRow { bucket: string; headcount: number; visits: number; }
interface BookingSourceRow { booking_method: string; visits: number; headcount: number; }
interface EventReportRow { event_id: string; title: string; starts_at: string; capacity: number | null; confirmed: number; cancelled: number; waitlisted: number; }

export default function ReportsPage() {
  const { activeOrgId } = useSession();
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

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Headcount</h2>
          <button onClick={() => downloadCsv('headcount', `&group_by=${groupBy}`)} className="btn-secondary">Export CSV</button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Bucket</th><th>Visits</th><th>Headcount</th></tr></thead>
          <tbody>
            {headcount.isPending ? (
              <SkeletonRows cols={3} rows={4} />
            ) : (headcount.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-slate-500">No data for this range.</td></tr>
            ) : (
              (headcount.data?.data ?? []).map((r) => (
                <tr key={r.bucket} className="border-t border-slate-100"><td className="py-2">{r.bucket}</td><td>{r.visits}</td><td>{r.headcount}</td></tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Booking sources</h2>
          <button onClick={() => downloadCsv('booking-sources')} className="btn-secondary">Export CSV</button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Method</th><th>Visits</th><th>Headcount</th></tr></thead>
          <tbody>
            {sources.isPending ? (
              <SkeletonRows cols={3} rows={3} />
            ) : (sources.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-slate-500">No data for this range.</td></tr>
            ) : (
              (sources.data?.data ?? []).map((r) => (
                <tr key={r.booking_method} className="border-t border-slate-100"><td className="py-2">{r.booking_method}</td><td>{r.visits}</td><td>{r.headcount}</td></tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Events</h2>
          <button onClick={() => downloadCsv('events')} className="btn-secondary">Export CSV</button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Event</th><th>Starts</th><th>Cap</th><th>Confirmed</th><th>Cancelled</th><th>Waitlisted</th></tr></thead>
          <tbody>
            {events.isPending ? (
              <SkeletonRows cols={6} rows={3} />
            ) : (events.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-slate-500">No events in this range.</td></tr>
            ) : (
              (events.data?.data ?? []).map((r) => (
                <tr key={r.event_id} className="border-t border-slate-100">
                  <td className="py-2">{r.title}</td>
                  <td>{new Date(r.starts_at).toLocaleString()}</td>
                  <td>{r.capacity ?? '—'}</td>
                  <td>{r.confirmed}</td>
                  <td>{r.cancelled}</td>
                  <td>{r.waitlisted}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
