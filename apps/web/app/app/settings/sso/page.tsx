'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { useConfirm } from '../../../../lib/confirm';
import { SkeletonRows } from '../../../components/skeleton-rows';
import { EmptyState } from '../../../components/empty-state';
import { SettingsBackLink } from '../_components/back-link';

interface SsoProvider {
  id: string;
  provider: 'google' | 'microsoft';
  clientId: string;
  allowedDomains: string[];
  defaultRoleId: string | null;
  ssoRequired: boolean;
  enabled: boolean;
  createdAt: string;
}

export default function SsoSettingsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<'google' | 'microsoft'>('google');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [domains, setDomains] = useState('');

  const providers = useQuery({
    queryKey: ['sso-providers', activeOrgId],
    queryFn: () => apiGet<{ data: SsoProvider[] }>(`/api/v1/orgs/${activeOrgId}/sso-providers`),
    enabled: !!activeOrgId,
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) return;
    try {
      await apiPost(`/api/v1/orgs/${activeOrgId}/sso-providers`, {
        provider,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        allowedDomains: domains.split(',').map((d) => d.trim()).filter(Boolean),
      });
      setCreating(false);
      setClientId('');
      setClientSecret('');
      setDomains('');
      qc.invalidateQueries({ queryKey: ['sso-providers', activeOrgId] });
      toast.push({ kind: 'success', message: 'SSO provider created' });
    } catch {
      toast.push({ kind: 'error', message: 'Failed to create SSO provider' });
    }
  }

  async function handleToggle(p: SsoProvider) {
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/sso-providers/${p.id}`, { enabled: !p.enabled });
      qc.invalidateQueries({ queryKey: ['sso-providers', activeOrgId] });
      toast.push({ kind: 'success', message: p.enabled ? 'SSO disabled' : 'SSO enabled' });
    } catch {
      toast.push({ kind: 'error', message: 'Failed to update provider' });
    }
  }

  async function handleDelete(p: SsoProvider) {
    const yes = await confirm({
      title: `Remove ${p.provider} SSO?`,
      description: 'Staff using this provider will need to log in with a password.',
      danger: true,
    });
    if (!yes) return;
    try {
      await apiDelete(`/api/v1/orgs/${activeOrgId}/sso-providers/${p.id}`);
      qc.invalidateQueries({ queryKey: ['sso-providers', activeOrgId] });
      toast.push({ kind: 'success', message: 'SSO provider removed' });
    } catch {
      toast.push({ kind: 'error', message: 'Failed to remove provider' });
    }
  }

  return (
    <div className="space-y-6">
      <SettingsBackLink />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Single Sign-On</h1>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-accent">
            Add provider
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="panel p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Provider</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value as 'google' | 'microsoft')} className="input mt-1">
                <option value="google">Google</option>
                <option value="microsoft">Microsoft</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Allowed email domains</span>
              <input
                type="text"
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="example.com, museum.org"
                className="input mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">Comma-separated. Leave blank to allow all domains.</p>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Client ID</span>
            <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input mt-1" required />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Client Secret</span>
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="input mt-1" required />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-accent">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Provider</th>
              <th>Client ID</th>
              <th>Domains</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {providers.isPending ? (
              <SkeletonRows cols={5} rows={2} />
            ) : (providers.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center">
                <EmptyState
                  title="No SSO providers configured."
                  description="Add a Google or Microsoft provider so staff can log in with their work accounts."
                  className="mx-auto mt-0 text-left"
                />
              </td></tr>
            ) : (
              (providers.data?.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium capitalize">{p.provider}</td>
                  <td><code className="text-xs">{p.clientId.slice(0, 20)}...</code></td>
                  <td className="text-xs">{p.allowedDomains.length > 0 ? p.allowedDomains.join(', ') : 'Any'}</td>
                  <td>
                    <button onClick={() => handleToggle(p)} className={`text-xs font-medium ${p.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="text-right">
                    <button onClick={() => handleDelete(p)} className="text-xs text-red-600 underline">Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-paper-200 bg-paper-50 p-4 text-sm text-paper-600">
        <h3 className="font-medium text-ink">How it works</h3>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Create an OAuth 2.0 client in your provider&apos;s console (Google Cloud Console or Azure AD).</li>
          <li>Set the authorized redirect URI to: <code className="rounded bg-white px-1 py-0.5 text-xs">{'<your-api-url>'}/api/v1/sso/callback</code></li>
          <li>Paste the client ID and secret above, then enable the provider.</li>
          <li>Staff can log in at: <code className="rounded bg-white px-1 py-0.5 text-xs">/login?sso={'<org-slug>'}</code></li>
        </ol>
      </div>
    </div>
  );
}
