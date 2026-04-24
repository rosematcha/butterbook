'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { SkeletonRows } from '../../components/skeleton-rows';
import { EmptyState } from '../../components/empty-state';

interface Location {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  isPrimary: boolean;
}

type LocationsResponse = { data: Location[] };

export default function LocationsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('admin.manage_locations');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const listKey = ['locations', activeOrgId] as const;

  const locations = useQuery({
    queryKey: listKey,
    queryFn: () => apiGet<LocationsResponse>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId && canManage,
  });

  // Create needs a follow-up refetch — we optimistically append a placeholder
  // row with a temp id (so the new name shows up immediately in the table),
  // then invalidate to pick up the real row once the server returns.
  const createLocation = useOptimisticMutation<string, { data: { id: string } }>({
    mutationFn: (n) => apiPost<{ data: { id: string } }>(`/api/v1/orgs/${activeOrgId}/locations`, { name: n }),
    queryKeys: [listKey],
    apply: (current, n) => {
      const list = current as LocationsResponse | undefined;
      if (!list) return undefined;
      const temp: Location = { id: `__temp-${Date.now()}`, name: n, address: null, zip: null, isPrimary: false };
      return { data: [...list.data, temp] };
    },
    onSuccess: () => setName(''),
    reconcile: () => qc.invalidateQueries({ queryKey: listKey }),
    successMessage: 'Location added',
    errorMessage: 'Could not add location',
  });

  const setPrimary = useOptimisticMutation<string>({
    mutationFn: (id) => apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/set-primary`),
    queryKeys: [listKey],
    apply: (current, id) => {
      const list = current as LocationsResponse | undefined;
      if (!list) return undefined;
      return { data: list.data.map((l) => ({ ...l, isPrimary: l.id === id })) };
    },
    successMessage: 'Primary location updated',
    errorMessage: 'Could not set primary location',
  });

  const deleteLocation = useOptimisticMutation<string>({
    mutationFn: (id) => apiDelete(`/api/v1/orgs/${activeOrgId}/locations/${id}`),
    queryKeys: [listKey],
    apply: (current, id) => {
      const list = current as LocationsResponse | undefined;
      if (!list) return undefined;
      return { data: list.data.filter((l) => l.id !== id) };
    },
    successMessage: 'Location deleted',
    errorMessage: 'Could not delete location',
  });

  if (!perms.loading && !canManage) {
    return (
      <EmptyState
        title="Permission required."
        description="Managing locations requires the admin.manage_locations permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">New location</h2>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (createLocation.isPending) return;
            createLocation.mutate(name);
          }}
          className="mt-2 flex gap-2"
        >
          <input required className="input flex-1" placeholder="Gallery 2" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={createLocation.isPending}>Add</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Locations</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Name</th>
              <th>Address</th>
              <th>Primary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.isPending ? (
              <SkeletonRows cols={4} rows={3} />
            ) : (locations.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-slate-500">No locations yet. Add one above.</td></tr>
            ) : (
              (locations.data?.data ?? []).map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-2">{l.name}</td>
                  <td>{l.address ?? '—'}</td>
                  <td>
                    {l.isPrimary ? (
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">Primary</span>
                    ) : (
                      <button onClick={() => setPrimary.mutate(l.id)} className="text-xs underline">Make primary</button>
                    )}
                  </td>
                  <td className="space-x-3 text-right">
                    <Link href={`/app/locations/hours?id=${l.id}`} className="text-xs underline">Hours</Link>
                    <Link href={`/app/locations/share?id=${l.id}`} className="text-xs underline">Share</Link>
                    {!l.isPrimary ? (
                      <button onClick={() => deleteLocation.mutate(l.id)} className="text-xs text-red-600 underline">Delete</button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
