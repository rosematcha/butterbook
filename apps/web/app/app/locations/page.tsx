'use client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { SkeletonRows } from '../../components/skeleton-rows';
import { EmptyState } from '../../components/empty-state';
import { Timestamp } from '../../components/timestamp';
import { SettingsBackLink } from '../settings/_components/back-link';

interface Location {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  isPrimary: boolean;
  deletedAt?: string | null;
}

type LocationsResponse = { data: Location[] };

export default function LocationsPage() {
  return (
    <Suspense fallback={null}>
      <LocationsPageInner />
    </Suspense>
  );
}

function LocationsPageInner() {
  const { activeOrgId, membership } = useSession();
  const isSuperadmin = membership?.isSuperadmin ?? false;
  const perms = usePermissions();
  const canManage = perms.has('admin.manage_locations');
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [name, setName] = useState('');

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

  const listKey = ['locations', activeOrgId, showDeleted ? 'with-deleted' : 'active'] as const;

  const locations = useQuery({
    queryKey: listKey,
    queryFn: () =>
      apiGet<LocationsResponse>(
        `/api/v1/orgs/${activeOrgId}/locations${showDeleted ? '?include_deleted=true' : ''}`,
      ),
    enabled: !!activeOrgId && canManage,
  });

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

  const restoreLocation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      toast.push({ kind: 'success', message: 'Location restored' });
    },
    onError: () => toast.push({ kind: 'error', message: 'Could not restore location' }),
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
      <SettingsBackLink />
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Locations</h2>
          {isSuperadmin ? (
            <label className="flex items-center gap-2 text-xs text-paper-600">
              <input type="checkbox" checked={showDeleted} onChange={toggleShowDeleted} />
              Show deleted
            </label>
          ) : null}
        </div>
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
              <tr><td colSpan={4} className="py-2"><EmptyState title="No locations yet." description="Add your first location above to start managing hours and availability." /></td></tr>
            ) : (
              (locations.data?.data ?? []).map((l) => {
                const isDeleted = !!l.deletedAt;
                return (
                  <tr key={l.id} className={`border-t border-slate-100 ${isDeleted ? 'opacity-50' : ''}`}>
                    <td className="py-2">
                      {l.name}
                      {isDeleted ? (
                        <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                          Deleted <Timestamp value={l.deletedAt!} />
                        </span>
                      ) : null}
                    </td>
                    <td>{l.address ?? '—'}</td>
                    <td>
                      {isDeleted ? (
                        '—'
                      ) : l.isPrimary ? (
                        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">Primary</span>
                      ) : (
                        <button onClick={() => setPrimary.mutate(l.id)} className="text-xs underline">Make primary</button>
                      )}
                    </td>
                    <td className="space-x-3 text-right">
                      {isDeleted ? (
                        <button
                          onClick={() => restoreLocation.mutate(l.id)}
                          disabled={restoreLocation.isPending}
                          className="text-xs font-medium text-emerald-700 underline"
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <Link href={`/app/locations/hours?id=${l.id}`} className="text-xs underline">Hours</Link>
                          <Link href={`/app/locations/share?id=${l.id}`} className="text-xs underline">Share</Link>
                          {!l.isPrimary ? (
                            <button onClick={() => deleteLocation.mutate(l.id)} className="text-xs text-red-600 underline">Delete</button>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
