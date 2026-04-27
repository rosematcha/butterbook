'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiDelete, apiGet, apiPost, ApiError } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { useSession } from '../../../lib/session';
import { useConfirm } from '../../../lib/confirm';
import { useToast } from '../../../lib/toast';
import { CopyButton } from '../../components/copy-button';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

interface EventSeriesMeta {
  id: string;
  title: string;
  slugBase: string | null;
  frequency: 'weekly';
  weekday: number;
  untilDate: string | null;
  occurrenceCount: number | null;
  occurrenceNumber: number | null;
}

interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  isPublished: boolean;
  slug: string | null;
  publicId: string;
  locationId: string;
  waitlistEnabled: boolean;
  membershipRequiredTierId: string | null;
  series: EventSeriesMeta | null;
  deletedAt?: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface MembershipTier {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

type ComposerState =
  | { kind: 'create' }
  | { kind: 'duplicate'; source: EventRow };

type DraftMode = 'one-off' | 'recurring';
type RecurrenceEndMode = 'until_date' | 'after_occurrences';

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const { activeOrgId, membership } = useSession();
  const isSuperadmin = membership?.isSuperadmin ?? false;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [composer, setComposer] = useState<ComposerState | null>(null);

  const showDeleted = isSuperadmin && params.get('include_deleted') === '1';

  function toggleShowDeleted() {
    const sp = new URLSearchParams(params.toString());
    if (showDeleted) {
      sp.delete('include_deleted');
    } else {
      sp.set('include_deleted', '1');
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (params.get('new') === '1') {
      setComposer({ kind: 'create' });
      const sp = new URLSearchParams(params.toString());
      sp.delete('new');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const listKey = ['events', activeOrgId, showDeleted ? 'with-deleted' : 'active'] as const;

  const events = useQuery({
    queryKey: listKey,
    queryFn: () =>
      apiGet<{ data: EventRow[] }>(
        `/api/v1/orgs/${activeOrgId}/events${showDeleted ? '?include_deleted=true' : ''}`,
      ),
    enabled: !!activeOrgId,
    staleTime: 2 * 60_000,
  });
  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
    staleTime: 5 * 60_000,
  });
  const membershipTiers = useQuery({
    queryKey: ['membership-tiers', activeOrgId],
    queryFn: () => apiGet<{ data: MembershipTier[] }>(`/api/v1/orgs/${activeOrgId}/membership-tiers`),
    enabled: !!activeOrgId,
    staleTime: 5 * 60_000,
  });

  const publish = useOptimisticMutation<{ id: string; next: boolean }>({
    mutationFn: (value) =>
      apiPost(`/api/v1/orgs/${activeOrgId}/events/${value.id}/${value.next ? 'publish' : 'unpublish'}`),
    queryKeys: [listKey],
    apply: (current, vars) => {
      const list = current as { data: EventRow[] } | undefined;
      if (!list) return undefined;
      return { data: list.data.map((e) => (e.id === vars.id ? { ...e, isPublished: vars.next } : e)) };
    },
    successMessage: (_d, v) => (v.next ? 'Event published' : 'Event unpublished'),
    errorMessage: 'Could not update publish state',
  });

  const del = useOptimisticMutation<string>({
    mutationFn: (id) => apiDelete(`/api/v1/orgs/${activeOrgId}/events/${id}`),
    queryKeys: [listKey],
    apply: (current, id) => {
      const list = current as { data: EventRow[] } | undefined;
      if (!list) return undefined;
      return { data: list.data.filter((e) => e.id !== id) };
    },
    successMessage: 'Event deleted',
    errorMessage: 'Delete failed',
  });

  const restoreEvent = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/events/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      toast.push({ kind: 'success', message: 'Event restored' });
    },
    onError: () => toast.push({ kind: 'error', message: 'Could not restore event' }),
  });

  async function onDelete(id: string, title: string) {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      description:
        'Registered visitors will keep their records, but the event page and any upcoming registrations will be removed.',
      confirmLabel: 'Delete event',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  const rows = events.data?.data ?? [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="h-eyebrow">Programs</div>
          <h1 className="h-display mt-1">Events</h1>
        </div>
        <div className="flex items-center gap-3">
          {isSuperadmin ? (
            <label className="flex items-center gap-2 text-xs text-paper-600">
              <input type="checkbox" checked={showDeleted} onChange={toggleShowDeleted} />
              Show deleted
            </label>
          ) : null}
          <button className="btn" onClick={() => setComposer((current) => (current?.kind === 'create' ? null : { kind: 'create' }))}>
            {composer ? 'Close composer' : 'New event'}
          </button>
        </div>
      </div>

      {composer ? (
        <EventComposer
          key={composer.kind === 'duplicate' ? `duplicate-${composer.source.id}` : 'create'}
          locations={locations.data?.data ?? []}
          membershipTiers={membershipTiers.data?.data ?? []}
          sourceEvent={composer.kind === 'duplicate' ? composer.source : null}
          onCancel={() => setComposer(null)}
          onCreated={(message) => {
            setComposer(null);
            qc.invalidateQueries({ queryKey: ['events', activeOrgId] });
            toast.push({ kind: 'success', message });
          }}
        />
      ) : null}

      {events.isSuccess && rows.length === 0 ? (
        <EmptyState
          title="No events yet."
          description="Create a one-off program or a weekly series to start taking registrations."
          action={<button className="btn" onClick={() => setComposer({ kind: 'create' })}>+ New event</button>}
        />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Starts</th>
                <th className="px-4 py-2">Capacity</th>
                <th className="px-4 py-2">Published</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {events.isPending ? (
                <SkeletonRows cols={5} rows={4} />
              ) : (
                rows.map((event) => {
                  const publicUrl = `${origin}/events/${event.slug ?? event.publicId}`;
                  const isDeleted = !!event.deletedAt;
                  return (
                    <tr key={event.id} className={`border-t border-paper-100 align-top ${isDeleted ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">
                          {event.title}
                          {isDeleted ? (
                            <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              Deleted <Timestamp value={event.deletedAt!} />
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-paper-500">
                          {event.series ? <span className="badge-accent">Series</span> : null}
                          {event.membershipRequiredTierId ? <span className="badge">Members only</span> : null}
                          {event.series?.occurrenceNumber ? (
                            <span className="badge">
                              Occurrence {event.series.occurrenceNumber}
                              {event.series.occurrenceCount ? ` of ${event.series.occurrenceCount}` : ''}
                            </span>
                          ) : null}
                          {event.series ? <span>{weekdayLabel(event.series.weekday)} weekly</span> : null}
                        </div>
                        {!isDeleted ? (
                          <div className="mt-1 flex items-center gap-2 text-xs text-paper-500">
                            <span className="truncate">/{event.slug ?? event.publicId}</span>
                            {event.isPublished ? <CopyButton value={publicUrl} label="Copy link" /> : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-paper-700">
                        <Timestamp value={event.startsAt} absolute />
                      </td>
                      <td className="px-4 py-3 tabular-nums">{event.capacity ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isDeleted ? (
                          '—'
                        ) : event.isPublished ? (
                          <span className="badge-accent">Live</span>
                        ) : (
                          <span className="badge">Draft</span>
                        )}
                      </td>
                      <td className="space-x-2 px-4 py-3 text-right">
                        {isDeleted ? (
                          <button
                            onClick={() => restoreEvent.mutate(event.id)}
                            disabled={restoreEvent.isPending}
                            className="btn-ghost text-xs font-medium text-emerald-700"
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => publish.mutate({ id: event.id, next: !event.isPublished })}
                              disabled={publish.isPending}
                              className="btn-ghost text-xs disabled:opacity-50"
                            >
                              {event.isPublished ? 'Unpublish' : 'Publish'}
                            </button>
                            <button onClick={() => setComposer({ kind: 'duplicate', source: event })} className="btn-ghost text-xs">
                              Duplicate
                            </button>
                            <Link href={`/app/events/waitlist?id=${event.id}`} className="btn-ghost text-xs">
                              Waitlist
                            </Link>
                            <button
                              onClick={() => onDelete(event.id, event.title)}
                              className="btn-ghost text-xs text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventComposer({
  locations,
  membershipTiers,
  sourceEvent,
  onCancel,
  onCreated,
}: {
  locations: Location[];
  membershipTiers: MembershipTier[];
  sourceEvent: EventRow | null;
  onCancel: () => void;
  onCreated: (message: string) => void;
}) {
  const { activeOrgId } = useSession();
  const isDuplicate = sourceEvent != null;
  const [mode, setMode] = useState<DraftMode>('one-off');
  const [title, setTitle] = useState(sourceEvent?.title ?? '');
  const [locationId, setLocationId] = useState(sourceEvent?.locationId ?? locations[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState(sourceEvent ? shiftLocalInputDays(toLocalInput(sourceEvent.startsAt), 7) : '');
  const [endsAt, setEndsAt] = useState(sourceEvent ? shiftLocalInputDays(toLocalInput(sourceEvent.endsAt), 7) : '');
  const [capacity, setCapacity] = useState(sourceEvent?.capacity != null ? String(sourceEvent.capacity) : '');
  const [slug, setSlug] = useState('');
  const [waitlistEnabled, setWaitlistEnabled] = useState(sourceEvent?.waitlistEnabled ?? false);
  const [membershipRequiredTierId, setMembershipRequiredTierId] = useState(sourceEvent?.membershipRequiredTierId ?? '');
  const [weekday, setWeekday] = useState(weekdayFromInput(sourceEvent ? shiftLocalInputDays(toLocalInput(sourceEvent.startsAt), 7) : '') ?? 1);
  const [endMode, setEndMode] = useState<RecurrenceEndMode>('until_date');
  const [untilDate, setUntilDate] = useState(sourceEvent ? shiftLocalInputDays(toLocalInput(sourceEvent.startsAt), 35).slice(0, 10) : '');
  const [occurrenceCount, setOccurrenceCount] = useState('8');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId && locations[0]?.id) setLocationId(locations[0].id);
  }, [locationId, locations]);

  useEffect(() => {
    const nextWeekday = weekdayFromInput(startsAt);
    if (nextWeekday != null) setWeekday(nextWeekday);
  }, [startsAt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setErr(null);
    setSubmitting(true);
    try {
      const baseBody: Record<string, unknown> = {
        locationId,
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        waitlistEnabled,
        membershipRequiredTierId: membershipRequiredTierId || null,
      };
      baseBody.capacity = capacity.trim() === '' ? null : Number(capacity);

      if (isDuplicate) {
        baseBody.slug = slug.trim() === '' ? null : slug.trim();
        await apiPost(`/api/v1/orgs/${activeOrgId}/events/${sourceEvent.id}/duplicate`, baseBody);
        onCreated('Event duplicated');
        return;
      }

      if (mode === 'recurring') {
        const recurrenceEnds =
          endMode === 'until_date'
            ? { mode: 'until_date', untilDate }
            : { mode: 'after_occurrences', occurrenceCount: Number(occurrenceCount) };
        const body = {
          ...baseBody,
          slugBase: slug.trim() === '' ? null : slug.trim(),
          recurrence: {
            frequency: 'weekly' as const,
            weekday,
            ends: recurrenceEnds,
          },
        };
        const res = await apiPost<{ data: { occurrenceCount: number } }>(`/api/v1/orgs/${activeOrgId}/events/series`, body);
        onCreated(`Created ${res.data.occurrenceCount} recurring events`);
        return;
      }

      const body = {
        ...baseBody,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      };
      await apiPost(`/api/v1/orgs/${activeOrgId}/events`, body);
      onCreated('Event created');
    } catch (error) {
      setErr(error instanceof ApiError ? error.problem.detail ?? error.problem.title : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  const heading = isDuplicate ? `Duplicate "${sourceEvent.title}"` : 'Create event';

  return (
    <form onSubmit={onSubmit} className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-eyebrow">{isDuplicate ? 'Duplicate' : 'Composer'}</div>
          <h2 className="h-display mt-1 text-2xl">{heading}</h2>
          <p className="mt-2 max-w-2xl text-sm text-paper-600">
            {isDuplicate
              ? 'Keeps the source event’s description, form fields, and waitlist settings. Adjust the visible basics here.'
              : 'Pick a one-off program or generate a weekly series. Recurring occurrences are created as normal draft events. Publish, waitlist, and registration still happen per occurrence.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDuplicate ? (
            <div className="rounded-md border border-paper-200 bg-paper-50 p-1">
              <button
                type="button"
                className={mode === 'one-off' ? 'btn' : 'btn-ghost'}
                onClick={() => setMode('one-off')}
              >
                One-off
              </button>
              <button
                type="button"
                className={mode === 'recurring' ? 'btn' : 'btn-ghost'}
                onClick={() => setMode('recurring')}
              >
                Recurring
              </button>
            </div>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={submitting}>
            {submitting ? 'Saving…' : isDuplicate ? 'Create duplicate' : mode === 'recurring' ? 'Create series' : 'Create event'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input className="input mt-1" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Location</span>
          <select className="input mt-1" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Starts at</span>
          <input
            className="input mt-1"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Ends at</span>
          <input
            className="input mt-1"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Capacity</span>
          <input
            className="input mt-1"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Unlimited"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{mode === 'recurring' ? 'Slug base (optional)' : 'Slug (optional)'}</span>
          <input
            className="input mt-1"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={mode === 'recurring' ? 'morning-tour' : 'morning-tour'}
          />
          {mode === 'recurring' ? (
            <span className="mt-1 block text-xs text-paper-500">Occurrences become `slug-base-YYYYMMDD`.</span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Member-only tier</span>
          <select
            className="input mt-1"
            value={membershipRequiredTierId}
            onChange={(e) => setMembershipRequiredTierId(e.target.value)}
          >
            <option value="">Open to everyone</option>
            {membershipTiers.filter((tier) => tier.active).map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-paper-700">
        <input type="checkbox" checked={waitlistEnabled} onChange={(e) => setWaitlistEnabled(e.target.checked)} />
        Enable waitlist when full
      </label>

      {!isDuplicate && mode === 'recurring' ? (
        <div className="rounded-lg border border-paper-200 bg-paper-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-accent">Weekly</span>
            <span className="text-sm text-paper-600">Each occurrence is created as its own draft event row.</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">Weekday</span>
              <select
                className="input mt-1"
                value={weekday}
                onChange={(e) => {
                  const nextWeekday = Number(e.target.value);
                  setWeekday(nextWeekday);
                  setStartsAt(moveLocalInputToWeekday(startsAt, nextWeekday));
                  setEndsAt(moveLocalInputToWeekday(endsAt, nextWeekday));
                }}
              >
                {WEEKDAYS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ends</span>
              <select className="input mt-1" value={endMode} onChange={(e) => setEndMode(e.target.value as RecurrenceEndMode)}>
                <option value="until_date">On a date</option>
                <option value="after_occurrences">After N occurrences</option>
              </select>
            </label>
            {endMode === 'until_date' ? (
              <label className="block">
                <span className="text-sm font-medium">Until date</span>
                <input className="input mt-1" type="date" required value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
              </label>
            ) : (
              <label className="block">
                <span className="text-sm font-medium">Occurrences</span>
                <input
                  className="input mt-1"
                  type="number"
                  min={1}
                  max={366}
                  required
                  value={occurrenceCount}
                  onChange={(e) => setOccurrenceCount(e.target.value)}
                />
              </label>
            )}
          </div>
        </div>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </form>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function weekdayLabel(index: number): string {
  return WEEKDAYS[index] ?? 'Weekly';
}

function weekdayFromInput(value: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatLocalInput(date);
}

function shiftLocalInputDays(value: string, days: number): string {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return formatLocalInput(date);
}

function moveLocalInputToWeekday(value: string, weekday: number): string {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + (weekday - date.getDay()));
  return formatLocalInput(date);
}

function formatLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
