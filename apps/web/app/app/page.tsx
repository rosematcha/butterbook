'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@butterbook/shared';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useActiveDays, useDayWindow } from '../../lib/active-days';
import { useToast } from '../../lib/toast';
import { Timeline, type TimelineVisit } from '../components/timeline';
import { AddVisitorModal } from '../components/add-visitor-modal';
import { EditVisitorModal } from '../components/edit-visitor-modal';
import { MonthPicker } from '../components/month-picker';
import { ScaleControl } from '../components/scale-control';
import { SkeletonBlock } from '../components/skeleton-rows';
import { useTodayZoom } from '../../lib/use-today-zoom';

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateHeading(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Wrap the real page in Suspense so `useSearchParams` below doesn't trip
// Next's CSR-bailout error during the static export build. Fallback is
// null because the TodayPage itself renders skeleton states while data
// loads — a second layer of loading UI would just flicker.
export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <TodayPageInner />
    </Suspense>
  );
}

function TodayPageInner() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [date, setDate] = useState<Date>(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TimelineVisit | null>(null);
  const [zoom, setZoom] = useTodayZoom();

  // Honor `?add=1` from the command palette so "Add visitor on Today" deep-links here.
  useEffect(() => {
    if (params.get('add') === '1') {
      setAddOpen(true);
      const sp = new URLSearchParams(params.toString());
      sp.delete('add');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const active = useActiveDays(activeOrgId, date.getFullYear(), date.getMonth() + 1);
  const dateKey = toLocalDateKey(date);
  const dayReason = active.reasonFor(dateKey);
  const dayIsActive = active.isOpen(dateKey);
  const window_ = useDayWindow(activeOrgId, date, dayIsActive);

  const from = useMemo(() => startOfDay(date).toISOString(), [date]);
  const to = useMemo(() => endOfDay(date).toISOString(), [date]);

  const visits = useQuery({
    queryKey: ['visits', activeOrgId, dateKey],
    queryFn: () => apiGet<{ data: TimelineVisit[] }>(`/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=200`),
    enabled: !!activeOrgId && dayIsActive,
    refetchInterval: 30_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const fieldsQ = useQuery({
    queryKey: ['form-fields', activeOrgId],
    queryFn: () => apiGet<{ data: { fields: FormField[] } }>(`/api/v1/orgs/${activeOrgId}/form`),
    enabled: !!activeOrgId,
    // Form fields change rarely; no reason to refetch on every remount.
    staleTime: 5 * 60_000,
  });
  const formFields = fieldsQ.data?.data.fields ?? [];

  // Reverses a cancel / no-show by PATCHing the status back to confirmed.
  const reconfirm = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/orgs/${activeOrgId}/visits/${id}`, { status: 'confirmed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits', activeOrgId] });
      toast.push({ kind: 'success', message: 'Visit reconfirmed' });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Reconfirm failed';
      toast.push({ kind: 'error', message: msg });
    },
  });

  // Replaces the full tag list for one visit. Optimistically updates the list
  // cache so the pill appears/disappears instantly; rolls back on failure.
  const tagsMut = useMutation({
    mutationFn: (v: { id: string; tags: string[] }) =>
      apiPatch(`/api/v1/orgs/${activeOrgId}/visits/${v.id}`, { tags: v.tags }),
    onMutate: async (v) => {
      const key = ['visits', activeOrgId, dateKey];
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<{ data: TimelineVisit[] }>(key);
      if (snapshot) {
        qc.setQueryData<{ data: TimelineVisit[] }>(key, {
          ...snapshot,
          data: snapshot.data.map((x) => (x.id === v.id ? { ...x, tags: v.tags } : x)),
        });
      }
      return { snapshot, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(ctx.key, ctx.snapshot);
      toast.push({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not save tags',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-tag-suggestions', activeOrgId] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/cancel`, {}),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['visits', activeOrgId] });
      toast.push({
        kind: 'info',
        message: 'Visit cancelled',
        action: {
          label: 'Undo',
          onClick: () => {
            reconfirm.mutate(id, {
              onError: () =>
                toast.push({ kind: 'error', message: "Couldn't undo — reconfirm manually from the visit." }),
            });
          },
        },
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Cancel failed';
      toast.push({ kind: 'error', message: msg });
    },
  });
  const noShow = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/no-show`, {}),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['visits', activeOrgId] });
      toast.push({
        kind: 'info',
        message: 'Marked as no-show',
        action: {
          label: 'Undo',
          onClick: () => {
            reconfirm.mutate(id, {
              onError: () =>
                toast.push({ kind: 'error', message: "Couldn't undo — reconfirm manually from the visit." }),
            });
          },
        },
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Mark failed';
      toast.push({ kind: 'error', message: msg });
    },
  });

  const list = visits.data?.data ?? [];
  const confirmed = list.filter((v) => v.status === 'confirmed').length;
  const cancelled = list.filter((v) => v.status === 'cancelled').length;
  const noShows = list.filter((v) => v.status === 'no_show').length;

  const today = new Date();
  const showingToday = isSameDay(date, today);

  // Keyboard shortcuts scoped to the Today page: n = add visitor,
  // t = jump to today, ← / → = step to prev/next open day.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      if (addOpen) return;
      if (e.key === 'n' || e.key === 'N') {
        if (dayIsActive) {
          e.preventDefault();
          setAddOpen(true);
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setDate(new Date());
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        shiftToActive(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        shiftToActive(1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, dayIsActive, date]);

  // Step to the next active day in either direction.
  const shiftToActive = (dir: 1 | -1) => {
    const next = new Date(date);
    for (let i = 0; i < 120; i++) {
      next.setDate(next.getDate() + dir);
      if (active.isOpen(toLocalDateKey(next))) {
        setDate(new Date(next));
        return;
      }
      // If we cross a month boundary, useActiveDays will refetch for the new month
      // on the next render; but during this click we only know this month. We still
      // advance by one day as a best effort — the user can click again.
      if (next.getMonth() !== date.getMonth()) {
        setDate(new Date(next));
        return;
      }
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">{showingToday ? 'Today' : 'Visits on'}</div>
          <h1 className="h-display mt-1">{formatDateHeading(date)}</h1>
          <div className="mt-2 text-sm text-paper-600">
            {dayIsActive ? (
              <>
                <span className="tabular-nums">{confirmed}</span> confirmed
                {cancelled ? <> · <span className="tabular-nums">{cancelled}</span> cancelled</> : null}
                {noShows ? <> · <span className="tabular-nums">{noShows}</span> no-show</> : null}
                {list.length === 0 && !visits.isLoading ? ' · none yet' : null}
                {dayReason === 'event' ? ' · event day' : dayReason === 'both' ? ' · event scheduled' : null}
              </>
            ) : active.isLoading ? (
              <span className="text-paper-400">Checking hours…</span>
            ) : (
              <span className="text-paper-500">Closed — no hours or events scheduled.</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-paper-200 bg-white">
            <button onClick={() => shiftToActive(-1)} className="px-2.5 py-1.5 text-sm text-paper-600 hover:text-ink" aria-label="Previous open day">‹</button>
            <button onClick={() => setDate(new Date())} className="border-x border-paper-200 px-3 py-1.5 text-sm text-paper-700 hover:text-ink">Today</button>
            <button onClick={() => shiftToActive(1)} className="px-2.5 py-1.5 text-sm text-paper-600 hover:text-ink" aria-label="Next open day">›</button>
          </div>
          <MonthPicker value={date} onChange={setDate} />
          <ScaleControl value={zoom} onChange={setZoom} />
          <button className="btn" onClick={() => setAddOpen(true)} disabled={!dayIsActive && !active.isLoading}>
            + Add visitor
          </button>
        </div>
      </div>

      {!dayIsActive ? (
        active.isLoading ? (
          <TimelineSkeleton />
        ) : (
          <div className="mt-16 max-w-md">
            <h2 className="font-display text-2xl font-medium tracking-tight-er text-ink">Closed.</h2>
            <p className="mt-2 text-paper-600">
              No location has hours on this day, and no events are scheduled. Pick another day from the calendar, or adjust hours in
              {' '}
              <span className="text-ink">Settings → Locations</span>.
            </p>
            <button className="btn-secondary mt-5" onClick={() => shiftToActive(1)}>Jump to next open day</button>
          </div>
        )
      ) : visits.isPending ? (
        <TimelineSkeleton />
      ) : list.length === 0 ? (
        <div className="mt-16 max-w-md">
          <h2 className="font-display text-2xl font-medium tracking-tight-er text-ink">A quiet day.</h2>
          <p className="mt-2 text-paper-600">No visitors scheduled. When someone checks in at the kiosk or you add them here, they’ll appear on the timeline.</p>
          <button className="btn mt-5" onClick={() => setAddOpen(true)}>+ Add visitor</button>
        </div>
      ) : (
        <Timeline
          date={date}
          visits={list}
          fields={formFields}
          startHour={window_.startHour}
          endHour={window_.endHour}
          onCancel={(id) => cancel.mutate(id)}
          onNoShow={(id) => noShow.mutate(id)}
          onReconfirm={(id) => reconfirm.mutate(id)}
          onEdit={(v) => setEditing(v)}
          onTagsChange={(id, tags) => tagsMut.mutate({ id, tags })}
          zoom={zoom}
        />
      )}

      <AddVisitorModal open={addOpen} onClose={() => setAddOpen(false)} defaultDate={date} />
      <EditVisitorModal visit={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      <SkeletonBlock className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="h-4 w-14" />
          <SkeletonBlock className="h-10 flex-1" />
        </div>
      ))}
    </div>
  );
}
