'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { useConfirm } from '../../../lib/confirm';
import { CopyButton } from '../../components/copy-button';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

interface Member {
  memberId: string;
  userId: string;
  email: string;
  displayName: string | null;
  isSuperadmin: boolean;
  roles: Array<{ id: string; name: string }>;
}
interface Role {
  id: string;
  name: string;
  description: string | null;
}
interface Invitation {
  id: string;
  email: string;
  role_ids: string[];
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function MembersPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [inviteEmail, setInviteEmail] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['members', activeOrgId],
    queryFn: () => apiGet<{ data: Member[] }>(`/api/v1/orgs/${activeOrgId}/members`),
    enabled: !!activeOrgId,
  });
  const roles = useQuery({
    queryKey: ['roles', activeOrgId],
    queryFn: () => apiGet<{ data: Role[] }>(`/api/v1/orgs/${activeOrgId}/roles`),
    enabled: !!activeOrgId,
  });
  const invites = useQuery({
    queryKey: ['invites', activeOrgId],
    queryFn: () => apiGet<{ data: Invitation[] }>(`/api/v1/orgs/${activeOrgId}/invitations`),
    enabled: !!activeOrgId,
  });

  const invite = useMutation({
    mutationFn: (email: string) =>
      apiPost<{ data: { url: string } }>(`/api/v1/orgs/${activeOrgId}/invitations`, { email, roleIds: [] }),
    onSuccess: (res) => {
      setCreatedUrl(res.data.url);
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['invites', activeOrgId] });
      toast.push({ kind: 'success', message: 'Invitation created', description: 'Share the link with the new member.' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Invite failed') }),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/members/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', activeOrgId] });
      toast.push({ kind: 'success', message: 'Member removed' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Remove failed') }),
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/invitations/${inviteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', activeOrgId] });
      toast.push({ kind: 'success', message: 'Invitation revoked' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Revoke failed') }),
  });

  const toggleSuperadmin = useMutation({
    mutationFn: (v: { memberId: string; isSuperadmin: boolean }) =>
      apiPatch(`/api/v1/orgs/${activeOrgId}/members/${v.memberId}/superadmin`, {
        isSuperadmin: v.isSuperadmin,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', activeOrgId] }),
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Update failed') }),
  });

  async function onRemoveMember(m: Member) {
    const ok = await confirm({
      title: `Remove ${m.email}?`,
      description: "They'll lose access to this organization immediately. Their past activity stays in the audit log.",
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeMember.mutate(m.memberId);
  }

  const memberRows = members.data?.data ?? [];
  const pending = (invites.data?.data ?? []).filter((i) => !i.accepted_at);

  return (
    <div className="space-y-8">
      <div>
        <div className="h-eyebrow">Access</div>
        <h1 className="h-display mt-1">Members</h1>
      </div>

      <section className="panel p-5">
        <h2 className="font-display text-base font-medium text-ink">Invite a member</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); invite.mutate(inviteEmail); }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="input max-w-sm flex-1"
            placeholder="name@example.com"
          />
          <button className="btn" disabled={invite.isPending}>
            {invite.isPending ? 'Creating…' : 'Send invite'}
          </button>
        </form>
        {createdUrl ? (
          <div className="mt-4 rounded-md border border-paper-200 bg-paper-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Invitation link</div>
            <div className="mt-1 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-paper-700">{createdUrl}</code>
              <CopyButton value={createdUrl} className="btn-secondary text-xs" label="Copy link" />
            </div>
            <p className="mt-2 text-xs text-paper-500">
              Send this link to the person you invited. It expires in 7 days.
            </p>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="h-eyebrow">Current members</h2>
        {members.isSuccess && memberRows.length === 0 ? (
          <EmptyState title="Just you for now." description="Invite a colleague above to share the workload." />
        ) : (
          <div className="panel mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Roles</th>
                  <th className="px-4 py-2">Superadmin</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.isPending ? <SkeletonRows cols={4} rows={4} /> : memberRows.map((m) => (
                  <tr key={m.memberId} className="border-t border-paper-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{m.email}</div>
                      {m.displayName ? <div className="text-xs text-paper-500">{m.displayName}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-paper-700">{m.roles.map((r) => r.name).join(', ') || '—'}</td>
                    <td className="px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-paper-300 text-brand-accent focus:ring-brand-accent/40"
                          checked={m.isSuperadmin}
                          onChange={(e) =>
                            toggleSuperadmin.mutate({ memberId: m.memberId, isSuperadmin: e.target.checked })
                          }
                        />
                        <span className="text-xs text-paper-600">{m.isSuperadmin ? 'yes' : 'no'}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onRemoveMember(m)} className="btn-ghost text-xs text-red-700 hover:bg-red-50">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pending.length > 0 ? (
        <section>
          <h2 className="h-eyebrow">Pending invitations</h2>
          <ul className="panel mt-3 divide-y divide-paper-100">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{i.email}</div>
                  <div className="text-xs text-paper-500">
                    Expires <Timestamp value={i.expires_at} />
                  </div>
                </div>
                <button onClick={() => revokeInvite.mutate(i.id)} className="btn-ghost text-xs text-red-700 hover:bg-red-50">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="h-eyebrow">Roles</h2>
        <ul className="panel mt-3 divide-y divide-paper-100 text-sm">
          {(roles.data?.data ?? []).map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="font-medium text-ink">{r.name}</div>
              <div className="text-xs text-paper-500">{r.description ?? '—'}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
