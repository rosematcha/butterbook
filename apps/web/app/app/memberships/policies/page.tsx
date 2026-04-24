'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, ApiError } from '../../../../lib/api';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { EmptyState } from '../../../components/empty-state';
import type { MembershipPolicy } from '../types';

export default function MembershipPoliciesPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('memberships.manage');
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['membership-policies', activeOrgId],
    queryFn: () => apiGet<{ data: MembershipPolicy }>(`/api/v1/orgs/${activeOrgId}/membership-policies`),
    enabled: !!activeOrgId && canManage,
  });

  const [enabled, setEnabled] = useState(false);
  const [gracePeriodDays, setGracePeriodDays] = useState(14);
  const [renewalReminderDays, setRenewalReminderDays] = useState('30, 7');
  const [selfCancelEnabled, setSelfCancelEnabled] = useState(true);
  const [selfUpdateEnabled, setSelfUpdateEnabled] = useState(true);
  const [publicPageEnabled, setPublicPageEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = query.data?.data;
    if (!p) return;
    setEnabled(p.enabled);
    setGracePeriodDays(p.gracePeriodDays);
    setRenewalReminderDays(p.renewalReminderDays.join(', '));
    setSelfCancelEnabled(p.selfCancelEnabled);
    setSelfUpdateEnabled(p.selfUpdateEnabled);
    setPublicPageEnabled(p.publicPageEnabled);
  }, [query.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const reminders = renewalReminderDays
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
      await apiPatch(`/api/v1/orgs/${activeOrgId}/membership-policies`, {
        enabled,
        gracePeriodDays,
        renewalReminderDays: reminders,
        selfCancelEnabled,
        selfUpdateEnabled,
        publicPageEnabled,
      });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2500);
      await qc.invalidateQueries({ queryKey: ['membership-policies', activeOrgId] });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!perms.loading && !canManage) {
    return <EmptyState title="Permission required." description="Editing membership policies requires the memberships.manage permission." />;
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members & CRM</div>
          <h1 className="h-display mt-1">Membership policies</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            Control whether memberships are live, when expired members lapse, and which self-serve options will be exposed as public purchase flows arrive.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-sm text-accent-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
          <button type="submit" disabled={saving || !query.data} className="btn">{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>

      <div className="panel max-w-xl space-y-6 p-6">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>
            <div className="font-medium">Enable memberships</div>
            <div className="text-sm text-paper-600">Allows admins to manage tiers and enroll contacts.</div>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={publicPageEnabled} onChange={(e) => setPublicPageEnabled(e.target.checked)} />
          <span>
            <div className="font-medium">Show public join page</div>
            <div className="text-sm text-paper-600">Reserved for Phase 3 public checkout and Stripe Connect.</div>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={selfCancelEnabled} onChange={(e) => setSelfCancelEnabled(e.target.checked)} />
          <span>
            <div className="font-medium">Allow self-cancel</div>
            <div className="text-sm text-paper-600">Visitors can cancel eligible memberships from manage links once self-serve membership links are enabled.</div>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={selfUpdateEnabled} onChange={(e) => setSelfUpdateEnabled(e.target.checked)} />
          <span>
            <div className="font-medium">Allow self-updates</div>
            <div className="text-sm text-paper-600">Reserved for billing and profile update flows in later phases.</div>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="h-eyebrow">Grace period days</span>
            <input type="number" className="input mt-1" min={0} max={365} value={gracePeriodDays} onChange={(e) => setGracePeriodDays(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="h-eyebrow">Reminder days</span>
            <input className="input mt-1" value={renewalReminderDays} onChange={(e) => setRenewalReminderDays(e.target.value)} placeholder="30, 7" />
          </label>
        </div>
      </div>
    </form>
  );
}
