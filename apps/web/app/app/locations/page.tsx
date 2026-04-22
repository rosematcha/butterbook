'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { SkeletonRows } from '../../components/skeleton-rows';

interface Location {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  isPrimary: boolean;
}

export default function LocationsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
  });

  const createLocation = useMutation({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/locations`, { name }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['locations', activeOrgId] });
    },
  });

  const setPrimary = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/set-primary`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', activeOrgId] }),
  });

  const deleteLocation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', activeOrgId] }),
  });

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">New location</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createLocation.mutate(); }} className="mt-2 flex gap-2">
          <input required className="input flex-1" placeholder="Gallery 2" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn">Add</button>
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
