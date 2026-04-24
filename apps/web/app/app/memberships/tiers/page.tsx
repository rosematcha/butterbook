'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useConfirm } from '../../../../lib/confirm';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { EmptyState } from '../../../components/empty-state';
import { SkeletonRows } from '../../../components/skeleton-rows';
import { intervalLabel, money, type MembershipBillingInterval, type MembershipTier } from '../types';

interface TierDraft {
  id: string | null;
  slug: string;
  name: string;
  description: string;
  price: string;
  billingInterval: MembershipBillingInterval;
  durationDays: string;
  guestPassesIncluded: string;
  maxActive: string;
  sortOrder: string;
  memberOnlyEventAccess: boolean;
  active: boolean;
}

const emptyDraft: TierDraft = {
  id: null,
  slug: '',
  name: '',
  description: '',
  price: '',
  billingInterval: 'year',
  durationDays: '365',
  guestPassesIncluded: '0',
  maxActive: '',
  sortOrder: '0',
  memberOnlyEventAccess: true,
  active: true,
};

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function MembershipTiersPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canView = perms.has('memberships.view_all');
  const canManage = perms.has('memberships.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<TierDraft>(emptyDraft);

  const tiers = useQuery({
    queryKey: ['membership-tiers', activeOrgId],
    queryFn: () => apiGet<{ data: MembershipTier[] }>(`/api/v1/orgs/${activeOrgId}/membership-tiers`),
    enabled: !!activeOrgId && canView,
  });

  useEffect(() => {
    if (draft.billingInterval === 'lifetime') setDraft((d) => ({ ...d, durationDays: '' }));
    if (draft.billingInterval === 'month' && draft.durationDays === '') setDraft((d) => ({ ...d, durationDays: '30' }));
    if (draft.billingInterval === 'year' && draft.durationDays === '') setDraft((d) => ({ ...d, durationDays: '365' }));
  }, [draft.billingInterval, draft.durationDays]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        priceCents: Math.round(Number(draft.price || '0') * 100),
        billingInterval: draft.billingInterval,
        durationDays: draft.durationDays.trim() === '' ? null : Number(draft.durationDays),
        guestPassesIncluded: Number(draft.guestPassesIncluded || '0'),
        memberOnlyEventAccess: draft.memberOnlyEventAccess,
        maxActive: draft.maxActive.trim() === '' ? null : Number(draft.maxActive),
        sortOrder: Number(draft.sortOrder || '0'),
        active: draft.active,
      };
      return draft.id
        ? apiPatch<{ data: MembershipTier }>(`/api/v1/orgs/${activeOrgId}/membership-tiers/${draft.id}`, body)
        : apiPost<{ data: MembershipTier }>(`/api/v1/orgs/${activeOrgId}/membership-tiers`, body);
    },
    onSuccess: (res) => {
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ['membership-tiers', activeOrgId] });
      toast.push({ kind: 'success', message: 'Tier saved', description: res.data.name });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Tier could not be saved') }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/membership-tiers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['membership-tiers', activeOrgId] });
      toast.push({ kind: 'success', message: 'Tier archived' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Tier could not be archived') }),
  });

  function editTier(tier: MembershipTier) {
    setDraft({
      id: tier.id,
      slug: tier.slug,
      name: tier.name,
      description: tier.description ?? '',
      price: String(tier.priceCents / 100),
      billingInterval: tier.billingInterval,
      durationDays: tier.durationDays == null ? '' : String(tier.durationDays),
      guestPassesIncluded: String(tier.guestPassesIncluded),
      maxActive: tier.maxActive == null ? '' : String(tier.maxActive),
      sortOrder: String(tier.sortOrder),
      memberOnlyEventAccess: tier.memberOnlyEventAccess,
      active: tier.active,
    });
  }

  async function archiveTier(tier: MembershipTier) {
    const ok = await confirm({
      title: `Archive "${tier.name}"?`,
      description: 'Existing memberships keep this tier, but new enrollments and public member-only selection should stop using it.',
      confirmLabel: 'Archive tier',
      danger: true,
    });
    if (ok) remove.mutate(tier.id);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  if (!perms.loading && !canView) {
    return <EmptyState title="Permission required." description="Membership tiers require the memberships.view_all permission." />;
  }

  const rows = tiers.data?.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members & CRM</div>
          <h1 className="h-display mt-1">Membership tiers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Define the levels admins can enroll manually today and Stripe will sell publicly in the next phase.
          </p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Price</th>
                <th className="px-4 py-2">Access</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tiers.isPending ? <SkeletonRows cols={5} rows={5} /> : rows.map((tier) => (
                <tr key={tier.id} className="border-t border-paper-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{tier.name}</div>
                    <div className="text-xs text-paper-500">/{tier.slug} · sort {tier.sortOrder}</div>
                    {tier.description ? <div className="mt-1 max-w-md text-xs text-paper-600">{tier.description}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{money(tier.priceCents)}</div>
                    <div className="text-xs text-paper-500">{intervalLabel(tier.billingInterval)}{tier.durationDays ? ` · ${tier.durationDays} days` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-paper-700">
                    {tier.memberOnlyEventAccess ? 'Member events' : 'No event gate'}
                    <div className="text-xs text-paper-500">{tier.guestPassesIncluded} guest passes</div>
                  </td>
                  <td className="px-4 py-3">{tier.active ? <span className="badge-accent">Active</span> : <span className="badge">Inactive</span>}</td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    {canManage ? <button className="btn-ghost text-xs" onClick={() => editTier(tier)}>Edit</button> : null}
                    {canManage ? <button className="btn-ghost text-xs text-red-700 hover:bg-red-50" onClick={() => archiveTier(tier)}>Archive</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tiers.isSuccess && rows.length === 0 ? (
            <div className="p-6"><EmptyState title="No tiers yet." description="Create the first tier to start enrolling members." className="mt-0" /></div>
          ) : null}
        </div>

        {canManage ? (
          <form onSubmit={onSubmit} className="panel space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-medium text-ink">{draft.id ? 'Edit tier' : 'New tier'}</h2>
              {draft.id ? <button type="button" className="btn-ghost text-xs" onClick={() => setDraft(emptyDraft)}>Clear</button> : null}
            </div>
            <label className="block">
              <span className="h-eyebrow">Name</span>
              <input required className="input mt-1" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="h-eyebrow">Slug</span>
              <input required className="input mt-1" value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} placeholder="family" />
            </label>
            <label className="block">
              <span className="h-eyebrow">Description</span>
              <textarea className="input mt-1 min-h-[80px]" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="h-eyebrow">Price</span>
                <input required className="input mt-1" inputMode="decimal" value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} placeholder="75" />
              </label>
              <label className="block">
                <span className="h-eyebrow">Interval</span>
                <select className="input mt-1" value={draft.billingInterval} onChange={(e) => setDraft((d) => ({ ...d, billingInterval: e.target.value as MembershipBillingInterval }))}>
                  <option value="year">Year</option>
                  <option value="month">Month</option>
                  <option value="lifetime">Lifetime</option>
                  <option value="one_time">One-time</option>
                </select>
              </label>
              <label className="block">
                <span className="h-eyebrow">Duration days</span>
                <input className="input mt-1" type="number" min={1} value={draft.durationDays} onChange={(e) => setDraft((d) => ({ ...d, durationDays: e.target.value }))} placeholder="Auto" />
              </label>
              <label className="block">
                <span className="h-eyebrow">Sort order</span>
                <input className="input mt-1" type="number" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
              </label>
              <label className="block">
                <span className="h-eyebrow">Guest passes</span>
                <input className="input mt-1" type="number" min={0} value={draft.guestPassesIncluded} onChange={(e) => setDraft((d) => ({ ...d, guestPassesIncluded: e.target.value }))} />
              </label>
              <label className="block">
                <span className="h-eyebrow">Active cap</span>
                <input className="input mt-1" type="number" min={1} value={draft.maxActive} onChange={(e) => setDraft((d) => ({ ...d, maxActive: e.target.value }))} placeholder="None" />
              </label>
            </div>
            <label className="flex items-start gap-3 text-sm text-paper-700">
              <input type="checkbox" className="mt-1" checked={draft.memberOnlyEventAccess} onChange={(e) => setDraft((d) => ({ ...d, memberOnlyEventAccess: e.target.checked }))} />
              <span>Can satisfy member-only event requirements</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-paper-700">
              <input type="checkbox" className="mt-1" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
              <span>Available for new enrollments</span>
            </label>
            <button className="btn w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save tier'}</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
