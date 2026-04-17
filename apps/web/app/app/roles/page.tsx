'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';

interface Role {
  id: string;
  name: string;
  description: string | null;
}

export default function RolesPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permsForRole, setPermsForRole] = useState<string | null>(null);
  const [availablePerms, setAvailablePerms] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const roles = useQuery({
    queryKey: ['roles', activeOrgId],
    queryFn: () => apiGet<{ data: Role[] }>(`/api/v1/orgs/${activeOrgId}/roles`),
    enabled: !!activeOrgId,
  });

  const permsRegistry = useQuery({
    queryKey: ['perms-registry'],
    queryFn: () => apiGet<{ data: string[] }>('/api/v1/permissions'),
  });

  const createRole = useMutation({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/roles`, { name, description }),
    onSuccess: () => {
      setName(''); setDescription('');
      qc.invalidateQueries({ queryKey: ['roles', activeOrgId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Create failed'),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', activeOrgId] }),
  });

  async function openPermissions(roleId: string) {
    setPermsForRole(roleId);
    const res = await apiGet<{ data: string[] }>(`/api/v1/orgs/${activeOrgId}/roles/${roleId}/permissions`);
    setSelected(new Set(res.data));
    setAvailablePerms(permsRegistry.data?.data ?? []);
  }

  async function savePermissions() {
    if (!permsForRole) return;
    await apiPut(`/api/v1/orgs/${activeOrgId}/roles/${permsForRole}/permissions`, {
      permissions: [...selected],
    });
    setPermsForRole(null);
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">New role</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createRole.mutate(); }} className="mt-2 grid gap-2 md:grid-cols-3">
          <input required className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button className="btn md:col-span-3 md:w-auto md:justify-self-start">Create role</button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
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
            {(roles.data?.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{r.name}</td>
                <td>{r.description ?? '—'}</td>
                <td className="text-right">
                  <button onClick={() => openPermissions(r.id)} className="text-xs underline mr-3">Permissions</button>
                  <button onClick={() => deleteRole.mutate(r.id)} className="text-xs text-red-600 underline">Delete</button>
                </td>
              </tr>
            ))}
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
            <button onClick={savePermissions} className="btn">Save</button>
            <button onClick={() => setPermsForRole(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
