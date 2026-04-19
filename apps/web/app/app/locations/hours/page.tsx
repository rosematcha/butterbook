'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';

interface HoursRow { id: string; dayOfWeek: number; openTime: string; closeTime: string; isActive: boolean; }
interface ClosedDay { id: string; date: string; reason: string | null; }
interface Override { id: string; date: string; open_time: string | null; close_time: string | null; reason: string | null; }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function HoursInner() {
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { activeOrgId } = useSession();
  const qc = useQueryClient();

  const hoursQ = useQuery({
    queryKey: ['hours', activeOrgId, id],
    queryFn: () => apiGet<{ data: HoursRow[] }>(`/api/v1/orgs/${activeOrgId}/locations/${id}/hours`),
    enabled: !!activeOrgId && !!id,
  });
  const overridesQ = useQuery({
    queryKey: ['overrides', activeOrgId, id],
    queryFn: () => apiGet<{ data: Override[] }>(`/api/v1/orgs/${activeOrgId}/locations/${id}/hours/overrides`),
    enabled: !!activeOrgId && !!id,
  });
  const closedQ = useQuery({
    queryKey: ['closed', activeOrgId, id],
    queryFn: () => apiGet<{ data: ClosedDay[] }>(`/api/v1/orgs/${activeOrgId}/locations/${id}/closed`),
    enabled: !!activeOrgId && !!id,
  });

  // editable hours grid
  const [grid, setGrid] = useState<HoursRow[]>([]);
  useEffect(() => {
    if (hoursQ.data) setGrid(hoursQ.data.data);
  }, [hoursQ.data]);

  const saveHours = useMutation({
    mutationFn: () =>
      apiPut(`/api/v1/orgs/${activeOrgId}/locations/${id}/hours`, {
        hours: grid.map((r) => ({ dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime, isActive: r.isActive })),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hours', activeOrgId, id] }),
  });

  function addRow(dow: number) {
    setGrid((prev) => [...prev, { id: `tmp-${Date.now()}`, dayOfWeek: dow, openTime: '09:00', closeTime: '17:00', isActive: true }]);
  }

  const [cDate, setCDate] = useState('');
  const [cReason, setCReason] = useState('');
  const addClosed = useMutation({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/closed`, { date: cDate, reason: cReason || undefined }),
    onSuccess: () => { setCDate(''); setCReason(''); qc.invalidateQueries({ queryKey: ['closed', activeOrgId, id] }); },
  });
  const removeClosed = useMutation({
    mutationFn: (cid: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/locations/${id}/closed/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closed', activeOrgId, id] }),
  });

  const [oDate, setODate] = useState('');
  const [oOpen, setOOpen] = useState('');
  const [oClose, setOClose] = useState('');
  const [oReason, setOReason] = useState('');
  const addOverride = useMutation({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/hours/overrides`, {
      date: oDate,
      openTime: oOpen || null,
      closeTime: oClose || null,
      reason: oReason || undefined,
    }),
    onSuccess: () => { setODate(''); setOOpen(''); setOClose(''); setOReason(''); qc.invalidateQueries({ queryKey: ['overrides', activeOrgId, id] }); },
  });
  const removeOverride = useMutation({
    mutationFn: (oid: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/locations/${id}/hours/overrides/${oid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overrides', activeOrgId, id] }),
  });

  if (!id) return <p className="text-sm text-red-600">Missing location id.</p>;

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">Weekly hours</h2>
        {DAY_NAMES.map((dName, dow) => {
          const rows = grid.filter((r) => r.dayOfWeek === dow);
          return (
            <div key={dow} className="mt-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{dName}</h3>
                <button onClick={() => addRow(dow)} className="text-xs underline">+ add window</button>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-slate-500">Closed</p>
              ) : (
                <div className="mt-1 space-y-1">
                  {rows.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        value={r.openTime}
                        onChange={(e) =>
                          setGrid((prev) => prev.map((x) => (x === r ? { ...x, openTime: e.target.value } : x)))
                        }
                        className="input w-32"
                      />
                      <span>–</span>
                      <input
                        type="time"
                        value={r.closeTime}
                        onChange={(e) =>
                          setGrid((prev) => prev.map((x) => (x === r ? { ...x, closeTime: e.target.value } : x)))
                        }
                        className="input w-32"
                      />
                      <button
                        type="button"
                        onClick={() => setGrid((prev) => prev.filter((x) => x !== r))}
                        className="text-xs text-red-600 underline"
                      >
                        Remove
                      </button>
                      <span className="text-xs text-slate-400">#{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-4">
          <button onClick={() => saveHours.mutate()} className="btn">Save hours</button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Closed days</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); addClosed.mutate(); }} className="mt-2 flex gap-2">
          <input required type="date" className="input" value={cDate} onChange={(e) => setCDate(e.target.value)} />
          <input className="input flex-1" placeholder="Reason (optional)" value={cReason} onChange={(e) => setCReason(e.target.value)} />
          <button className="btn">Add</button>
        </form>
        <ul className="mt-3 divide-y divide-slate-200 text-sm">
          {(closedQ.data?.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <div>{c.date} <span className="text-slate-500">{c.reason ?? ''}</span></div>
              <button onClick={() => removeClosed.mutate(c.id)} className="text-xs text-red-600 underline">Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Date overrides</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); addOverride.mutate(); }} className="mt-2 grid gap-2 md:grid-cols-5">
          <input required type="date" className="input" value={oDate} onChange={(e) => setODate(e.target.value)} />
          <input type="time" className="input" placeholder="Open" value={oOpen} onChange={(e) => setOOpen(e.target.value)} />
          <input type="time" className="input" placeholder="Close" value={oClose} onChange={(e) => setOClose(e.target.value)} />
          <input className="input" placeholder="Reason" value={oReason} onChange={(e) => setOReason(e.target.value)} />
          <button className="btn">Add</button>
        </form>
        <p className="mt-1 text-xs text-slate-500">Leave both times blank for a full-day closure.</p>
        <ul className="mt-3 divide-y divide-slate-200 text-sm">
          {(overridesQ.data?.data ?? []).map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <div>
                {o.date} · {o.open_time && o.close_time ? `${o.open_time}–${o.close_time}` : 'Closed'}
                {o.reason ? <span className="ml-2 text-slate-500">{o.reason}</span> : null}
              </div>
              <button onClick={() => removeOverride.mutate(o.id)} className="text-xs text-red-600 underline">Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function HoursPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <HoursInner />
    </Suspense>
  );
}
