'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiDelete, apiGet, apiPost, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useConfirm } from '../../../lib/confirm';
import { useToast } from '../../../lib/toast';
import { CopyButton } from '../../components/copy-button';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

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
}
interface Location { id: string; name: string; }

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);

  // Honor `?new=1` from the command palette's "Create event".
  useEffect(() => {
    if (params.get('new') === '1') {
      setShowCreate(true);
      const sp = new URLSearchParams(params.toString());
      sp.delete('new');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const events = useQuery({
    queryKey: ['events', activeOrgId],
    queryFn: () => apiGet<{ data: EventRow[] }>(`/api/v1/orgs/${activeOrgId}/events`),
    enabled: !!activeOrgId,
    staleTime: 2 * 60_000,
  });
  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
    staleTime: 5 * 60_000,
  });

  const publish = useMutation({
    mutationFn: (v: { id: string; next: boolean }) =>
      apiPost(`/api/v1/orgs/${activeOrgId}/events/${v.id}/${v.next ? 'publish' : 'unpublish'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', activeOrgId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', activeOrgId] });
      toast.push({ kind: 'success', message: 'Event deleted' });
    },
    onError: (e) =>
      toast.push({
        kind: 'error',
        message: e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Delete failed',
      }),
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
      <div className="flex items-center justify-between">
        <div>
          <div className="h-eyebrow">Programs</div>
          <h1 className="h-display mt-1">Events</h1>
        </div>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New event'}</button>
      </div>

      {showCreate ? (
        <CreateEventForm
          locations={locations.data?.data ?? []}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['events', activeOrgId] });
            toast.push({ kind: 'success', message: 'Event created' });
          }}
        />
      ) : null}

      {events.isSuccess && rows.length === 0 ? (
        <EmptyState
          title="No events yet."
          description="Create one to publish a public booking page and start taking registrations."
          action={<button className="btn" onClick={() => setShowCreate(true)}>+ New event</button>}
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
              {events.isPending ? <SkeletonRows cols={5} rows={4} /> : rows.map((e) => {
                const publicUrl = `${origin}/events/${e.slug ?? e.publicId}`;
                return (
                  <tr key={e.id} className="border-t border-paper-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{e.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-paper-500">
                        <span className="truncate">/{e.slug ?? e.publicId}</span>
                        {e.isPublished ? <CopyButton value={publicUrl} label="Copy link" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-paper-700">
                      <Timestamp value={e.startsAt} absolute />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{e.capacity ?? '—'}</td>
                    <td className="px-4 py-3">
                      {e.isPublished ? <span className="badge-accent">Live</span> : <span className="badge">Draft</span>}
                    </td>
                    <td className="space-x-2 px-4 py-3 text-right">
                      <button
                        onClick={() => publish.mutate({ id: e.id, next: !e.isPublished })}
                        className="btn-ghost text-xs"
                      >
                        {e.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <Link href={`/app/events/waitlist?id=${e.id}`} className="btn-ghost text-xs">Waitlist</Link>
                      <button
                        onClick={() => onDelete(e.id, e.title)}
                        className="btn-ghost text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ locations, onCreated }: { locations: Location[]; onCreated: () => void }) {
  const { activeOrgId } = useSession();
  const [title, setTitle] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [slug, setSlug] = useState('');
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        locationId,
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        waitlistEnabled,
      };
      if (capacity) body.capacity = Number(capacity);
      if (slug) body.slug = slug;
      await apiPost(`/api/v1/orgs/${activeOrgId}/events`, body);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Create failed');
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input className="input mt-1" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Location</span>
          <select className="input mt-1" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Starts at</span>
          <input className="input mt-1" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Ends at</span>
          <input className="input mt-1" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Capacity</span>
          <input className="input mt-1" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Slug (optional)</span>
          <input className="input mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="morning-tour" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={waitlistEnabled} onChange={(e) => setWaitlistEnabled(e.target.checked)} />
        Enable waitlist when full
      </label>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <button className="btn">Create event</button>
    </form>
  );
}
