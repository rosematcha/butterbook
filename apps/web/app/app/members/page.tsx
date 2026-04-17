'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';

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

export default function MembersPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
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
    mutationFn: (email: string) => apiPost<{ data: { url: string } }>(`/api/v1/orgs/${activeOrgId}/invitations`, { email, roleIds: [] }),
    onSuccess: (res) => {
      setCreatedUrl(res.data.url);
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['invites', activeOrgId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Invite failed'),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', activeOrgId] }),
    onError: (e) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Remove failed'),
  });

  const toggleSuperadmin = useMutation({
    mutationFn: (v: { memberId: string; isSuperadmin: boolean }) =>
      apiPatch(`/api/v1/orgs/${activeOrgId}/members/${v.memberId}/superadmin`, { isSuperadmin: v.isSuperadmin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', activeOrgId] }),
    onError: (e) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Update failed'),
  });

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">Invite a member</h2>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            invite.mutate(inviteEmail);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="input flex-1"
            placeholder="name@example.com"
          />
          <button className="btn">Invite</button>
        </form>
        {createdUrl ? (
          <p className="mt-3 break-all text-sm text-slate-600">
            Invite link: <a href={createdUrl} className="underline">{createdUrl}</a>
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Members</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Email</th>
              <th>Roles</th>
              <th>Superadmin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(members.data?.data ?? []).map((m) => (
              <tr key={m.memberId} className="border-t border-slate-100">
                <td className="py-2">{m.email}</td>
                <td>{m.roles.map((r) => r.name).join(', ') || '—'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={m.isSuperadmin}
                    onChange={(e) => toggleSuperadmin.mutate({ memberId: m.memberId, isSuperadmin: e.target.checked })}
                  />
                </td>
                <td className="text-right">
                  <button onClick={() => removeMember.mutate(m.memberId)} className="text-xs text-red-600 underline">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        <ul className="mt-2 divide-y divide-slate-200 text-sm">
          {(invites.data?.data ?? [])
            .filter((i) => !i.accepted_at)
            .map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <div>
                  <div>{i.email}</div>
                  <div className="text-xs text-slate-500">Expires {new Date(i.expires_at).toLocaleString()}</div>
                </div>
              </li>
            ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Roles</h2>
        <ul className="mt-2 divide-y divide-slate-200 text-sm">
          {(roles.data?.data ?? []).map((r) => (
            <li key={r.id} className="py-2">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-500">{r.description ?? '—'}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
