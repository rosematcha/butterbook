'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { useConfirm } from '../../../../lib/confirm';
import { CopyButton } from '../../../components/copy-button';
import { Timestamp } from '../../../components/timestamp';
import { SkeletonRows } from '../../../components/skeleton-rows';
import { EmptyState } from '../../../components/empty-state';
import { SettingsBackLink } from '../_components/back-link';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const COMMON_PERMISSIONS = [
  { key: 'visits.view_all', label: 'View visits' },
  { key: 'visits.create', label: 'Create visits' },
  { key: 'visits.edit', label: 'Edit visits' },
  { key: 'visits.cancel', label: 'Cancel visits' },
  { key: 'events.create', label: 'Create events' },
  { key: 'events.edit', label: 'Edit events' },
  { key: 'contacts.view_all', label: 'View contacts' },
  { key: 'contacts.manage', label: 'Manage contacts' },
  { key: 'reports.view', label: 'View reports' },
  { key: 'reports.export', label: 'Export reports' },
  { key: 'memberships.view_all', label: 'View memberships' },
  { key: 'memberships.manage', label: 'Manage memberships' },
];

export default function ApiKeysPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys', activeOrgId],
    queryFn: () => apiGet<{ data: ApiKey[] }>(`/api/v1/orgs/${activeOrgId}/api-keys`),
    enabled: !!activeOrgId,
  });

  async function handleCreate() {
    if (!name.trim() || selectedPerms.size === 0) return;
    try {
      const res = await apiPost<{ data: { id: string; key: string } }>(
        `/api/v1/orgs/${activeOrgId}/api-keys`,
        { name: name.trim(), permissions: Array.from(selectedPerms) },
      );
      setNewKey(res.data.key);
      setCreating(false);
      setName('');
      setSelectedPerms(new Set());
      qc.invalidateQueries({ queryKey: ['api-keys', activeOrgId] });
      toast.push({ kind: 'success', message: 'API key created' });
    } catch {
      toast.push({ kind: 'error', message: 'Failed to create API key' });
    }
  }

  async function handleRevoke(id: string, keyName: string) {
    const yes = await confirm({ title: `Revoke "${keyName}"?`, description: 'Any integration using this key will stop working immediately.', danger: true });
    if (!yes) return;
    try {
      await apiDelete(`/api/v1/orgs/${activeOrgId}/api-keys/${id}`);
      qc.invalidateQueries({ queryKey: ['api-keys', activeOrgId] });
      toast.push({ kind: 'success', message: 'Key revoked' });
    } catch {
      toast.push({ kind: 'error', message: 'Failed to revoke key' });
    }
  }

  function togglePerm(perm: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <SettingsBackLink />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">API Keys</h1>
        {!creating && (
          <button onClick={() => { setCreating(true); setNewKey(null); }} className="btn-accent">
            Create key
          </button>
        )}
      </div>

      {newKey && (
        <div className="panel border-green-300 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Copy this key now. You will not see it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-2 text-sm font-mono">{newKey}</code>
            <CopyButton value={newKey} />
          </div>
        </div>
      )}

      {creating && (
        <div className="panel p-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. POS integration"
              className="input mt-1"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Permissions</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COMMON_PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPerms.has(p.key)}
                    onChange={() => togglePerm(p.key)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || selectedPerms.size === 0}
              className="btn-accent disabled:opacity-50"
            >
              Create
            </button>
            <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Name</th>
              <th>Prefix</th>
              <th>Permissions</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.isPending ? (
              <SkeletonRows cols={6} rows={3} />
            ) : (keys.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center">
                <EmptyState
                  title="No API keys yet."
                  description="Create a key to let external systems access your org's data."
                  className="mx-auto mt-0 text-left"
                />
              </td></tr>
            ) : (
              (keys.data?.data ?? []).map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{k.name}</td>
                  <td><code className="text-xs">{k.prefix}...</code></td>
                  <td className="text-xs text-slate-600">{k.permissions.length} permission{k.permissions.length !== 1 ? 's' : ''}</td>
                  <td>{k.lastUsedAt ? <Timestamp value={k.lastUsedAt} /> : <span className="text-slate-400">Never</span>}</td>
                  <td><Timestamp value={k.createdAt} /></td>
                  <td className="text-right">
                    <button
                      onClick={() => handleRevoke(k.id, k.name)}
                      className="text-xs text-red-600 underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
