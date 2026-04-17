'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPost, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';

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
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ['events', activeOrgId],
    queryFn: () => apiGet<{ data: EventRow[] }>(`/api/v1/orgs/${activeOrgId}/events`),
    enabled: !!activeOrgId,
  });
  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
  });

  const publish = useMutation({
    mutationFn: (v: { id: string; next: boolean }) =>
      apiPost(`/api/v1/orgs/${activeOrgId}/events/${v.id}/${v.next ? 'publish' : 'unpublish'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', activeOrgId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', activeOrgId] }),
    onError: (e) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Delete failed'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Events</h2>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New event'}</button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showCreate ? (
        <CreateEventForm
          locations={locations.data?.data ?? []}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['events', activeOrgId] });
          }}
        />
      ) : null}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Title</th>
              <th>Starts</th>
              <th>Capacity</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(events.data?.data ?? []).map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="py-2">
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-slate-500">/{e.slug ?? e.publicId}</div>
                </td>
                <td>{new Date(e.startsAt).toLocaleString()}</td>
                <td>{e.capacity ?? '—'}</td>
                <td>{e.isPublished ? '✓' : '—'}</td>
                <td className="space-x-3 text-right">
                  <button onClick={() => publish.mutate({ id: e.id, next: !e.isPublished })} className="text-xs underline">
                    {e.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <Link href={`/app/events/${e.id}/waitlist`} className="text-xs underline">Waitlist</Link>
                  <button onClick={() => del.mutate(e.id)} className="text-xs text-red-600 underline">Delete</button>
                </td>
              </tr>
            ))}
            {events.data && events.data.data.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-slate-500">No events yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
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
    <form onSubmit={onSubmit} className="card space-y-3">
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
