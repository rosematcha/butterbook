'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

interface Role {
  id: string;
  name: string;
  description: string | null;
}

export default function RolesPage() {
  const { activeOrgId } = useSession();
  const permsCheck = usePermissions();
  const canManage = permsCheck.has('admin.manage_roles');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permsForRole, setPermsForRole] = useState<string | null>(null);
  const [availablePerms, setAvailablePerms] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const listKey = ['roles', activeOrgId] as const;

  const roles = useQuery({
    queryKey: listKey,
    queryFn: () => apiGet<{ data: Role[] }>(`/api/v1/orgs/${activeOrgId}/roles`),
    enabled: !!activeOrgId && canManage,
  });

  const permsRegistry = useQuery({
    queryKey: ['perms-registry'],
    queryFn: () => apiGet<{ data: string[] }>('/api/v1/permissions'),
  });

  const createRole = useOptimisticMutation<void>({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/roles`, { name, description }),
    queryKeys: [listKey],
    apply: (current) => {
      const list = current as { data: Role[] } | undefined;
      if (!list) return undefined;
      const temp: Role = { id: `__temp-${Date.now()}`, name, description: description || null };
      return { data: [...list.data, temp] };
    },
    onSuccess: () => { setName(''); setDescription(''); },
    reconcile: () => qc.invalidateQueries({ queryKey: listKey }),
    successMessage: 'Role created',
    errorMessage: 'Create failed',
  });

  const deleteRole = useOptimisticMutation<string>({
    mutationFn: (id) => apiDelete(`/api/v1/orgs/${activeOrgId}/roles/${id}`),
    queryKeys: [listKey],
    apply: (current, id) => {
      const list = current as { data: Role[] } | undefined;
      if (!list) return undefined;
      return { data: list.data.filter((r) => r.id !== id) };
    },
    successMessage: 'Role deleted',
    errorMessage: 'Delete failed',
  });

  const savePerms = useOptimisticMutation<{ roleId: string; permissions: string[] }>({
    mutationFn: (v) => apiPut(`/api/v1/orgs/${activeOrgId}/roles/${v.roleId}/permissions`, { permissions: v.permissions }),
    queryKeys: [],
    apply: () => undefined,
    onSuccess: () => setPermsForRole(null),
    successMessage: 'Permissions saved',
    errorMessage: 'Save failed',
  });

  async function openPermissions(roleId: string) {
    setPermsForRole(roleId);
    const res = await apiGet<{ data: string[] }>(`/api/v1/orgs/${activeOrgId}/roles/${roleId}/permissions`);
    setSelected(new Set(res.data));
    setAvailablePerms(permsRegistry.data?.data ?? []);
  }

  if (!permsCheck.loading && !canManage) {
    return (
      <EmptyState
        title="Permission required."
        description="Managing roles requires the admin.manage_roles permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">New role</h2>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (createRole.isPending) return;
            createRole.mutate();
          }}
          className="mt-2 grid gap-2 md:grid-cols-3"
        >
          <input required className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button disabled={createRole.isPending} className="btn md:col-span-3 md:w-auto md:justify-self-start">Create role</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Roles</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Name</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.isPending ? (
              <SkeletonRows cols={3} rows={3} />
            ) : (roles.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-slate-500">No custom roles yet.</td></tr>
            ) : (
              (roles.data?.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2">{r.name}</td>
                  <td>{r.description ?? '—'}</td>
                  <td className="text-right">
                    <button onClick={() => openPermissions(r.id)} className="text-xs underline mr-3">Permissions</button>
                    <button onClick={() => deleteRole.mutate(r.id)} className="text-xs text-red-600 underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {permsForRole ? (
        <div className="card">
          <h2 className="text-lg font-semibold">Edit permissions</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {availablePerms.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(p);
                    else next.delete(p);
                    setSelected(next);
                  }}
                />
                <code>{p}</code>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => permsForRole && savePerms.mutate({ roleId: permsForRole, permissions: [...selected] })}
              disabled={savePerms.isPending}
              className="btn"
            >
              {savePerms.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setPermsForRole(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
