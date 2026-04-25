'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useConfirm } from '../../../../lib/confirm';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { EmptyState } from '../../../components/empty-state';
import { money, type MembershipTier, type PromoCode, type PromoCodeDiscountType } from '../types';

interface Draft {
  id: string | null;
  code: string;
  description: string;
  discountType: PromoCodeDiscountType;
  discountPercent: string;
  discountAmount: string;
  membershipTierId: string;
  startsAt: string;
  expiresAt: string;
  maxRedemptions: string;
  active: boolean;
}

const emptyDraft: Draft = {
  id: null,
  code: '',
  description: '',
  discountType: 'percent',
  discountPercent: '10',
  discountAmount: '',
  membershipTierId: '',
  startsAt: '',
  expiresAt: '',
  maxRedemptions: '',
  active: true,
};

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function PromoCodesPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('promo_codes.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);

  const promos = useQuery({
    queryKey: ['promo-codes', activeOrgId],
    queryFn: () => apiGet<{ data: PromoCode[] }>(`/api/v1/orgs/${activeOrgId}/promo-codes`),
    enabled: !!activeOrgId && canManage,
  });
  const tiers = useQuery({
    queryKey: ['membership-tiers', activeOrgId],
    queryFn: () => apiGet<{ data: MembershipTier[] }>(`/api/v1/orgs/${activeOrgId}/membership-tiers`),
    enabled: !!activeOrgId && canManage,
  });

  const tierById = useMemo(() => new Map((tiers.data?.data ?? []).map((tier) => [tier.id, tier])), [tiers.data]);
  const rows = promos.data?.data ?? [];

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: draft.code.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        discountType: draft.discountType,
        discountPercent: draft.discountType === 'percent' ? Number(draft.discountPercent || '0') : null,
        discountAmountCents: draft.discountType === 'amount' ? Math.round(Number(draft.discountAmount || '0') * 100) : null,
        membershipTierId: draft.membershipTierId || null,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        maxRedemptions: draft.maxRedemptions.trim() === '' ? null : Number(draft.maxRedemptions),
        active: draft.active,
      };
      return draft.id
        ? apiPatch<{ data: PromoCode }>(`/api/v1/orgs/${activeOrgId}/promo-codes/${draft.id}`, body)
        : apiPost<{ data: PromoCode }>(`/api/v1/orgs/${activeOrgId}/promo-codes`, body);
    },
    onSuccess: (res) => {
      setDraft(emptyDraft);
      setEditorOpen(false);
      qc.invalidateQueries({ queryKey: ['promo-codes', activeOrgId] });
      toast.push({ kind: 'success', message: 'Promo code saved', description: res.data.code });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Promo code could not be saved') }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/promo-codes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes', activeOrgId] });
      toast.push({ kind: 'success', message: 'Promo code archived' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Promo code could not be archived') }),
  });

  function editPromo(promo: PromoCode) {
    setDraft({
      id: promo.id,
      code: promo.code,
      description: promo.description ?? '',
      discountType: promo.discountType,
      discountPercent: promo.discountPercent == null ? '' : String(promo.discountPercent),
      discountAmount: promo.discountAmountCents == null ? '' : String(promo.discountAmountCents / 100),
      membershipTierId: promo.membershipTierId ?? '',
      startsAt: promo.startsAt ? promo.startsAt.slice(0, 16) : '',
      expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 16) : '',
      maxRedemptions: promo.maxRedemptions == null ? '' : String(promo.maxRedemptions),
      active: promo.active,
    });
    setEditorOpen(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function archivePromo(promo: PromoCode) {
    const ok = await confirm({
      title: `Archive "${promo.code}"?`,
      description: 'Existing checkout records keep their metadata, but the code can no longer be used.',
      confirmLabel: 'Archive code',
      danger: true,
    });
    if (ok) remove.mutate(promo.id);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  if (!perms.loading && !canManage) {
    return <EmptyState title="Permission required." description="Promo code management requires the promo_codes.manage permission." />;
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Promo codes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Create checkout discounts for public membership sales, with optional tier scoping and redemption caps.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => { setDraft(emptyDraft); setEditorOpen(true); }}>
          New promo code
        </button>
      </div>

      {editorOpen ? (
        <form onSubmit={onSubmit} className="panel mb-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="h-eyebrow">{draft.id ? 'Editing' : 'Creating'}</div>
              <h2 className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">{draft.id ? draft.code : 'New code'}</h2>
            </div>
            <button type="button" className="btn-ghost" onClick={() => { setDraft(emptyDraft); setEditorOpen(false); }}>
              Cancel
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="h-eyebrow">Code</span>
              <input required className="input mt-1 font-mono uppercase" value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="SPRING10" />
            </label>
            <label className="block">
              <span className="h-eyebrow">Discount type</span>
              <select className="input mt-1" value={draft.discountType} onChange={(e) => setDraft((d) => ({ ...d, discountType: e.target.value as PromoCodeDiscountType }))}>
                <option value="percent">Percent</option>
                <option value="amount">Fixed amount</option>
              </select>
            </label>
            {draft.discountType === 'percent' ? (
              <label className="block">
                <span className="h-eyebrow">Percent off</span>
                <input required type="number" min={1} max={100} className="input mt-1 tabular-nums" value={draft.discountPercent} onChange={(e) => setDraft((d) => ({ ...d, discountPercent: e.target.value }))} />
              </label>
            ) : (
              <label className="block">
                <span className="h-eyebrow">Amount off (USD)</span>
                <input required inputMode="decimal" className="input mt-1 tabular-nums" value={draft.discountAmount} onChange={(e) => setDraft((d) => ({ ...d, discountAmount: e.target.value }))} placeholder="15" />
              </label>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block md:col-span-2">
              <span className="h-eyebrow">Description</span>
              <input className="input mt-1" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Spring acquisition campaign" />
            </label>
            <label className="block">
              <span className="h-eyebrow">Membership tier</span>
              <select className="input mt-1" value={draft.membershipTierId} onChange={(e) => setDraft((d) => ({ ...d, membershipTierId: e.target.value }))}>
                <option value="">Any tier</option>
                {(tiers.data?.data ?? []).map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="h-eyebrow">Starts</span>
              <input type="datetime-local" className="input mt-1" value={draft.startsAt} onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))} />
            </label>
            <label className="block">
              <span className="h-eyebrow">Expires</span>
              <input type="datetime-local" className="input mt-1" value={draft.expiresAt} onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))} />
            </label>
            <label className="block">
              <span className="h-eyebrow">Max redemptions</span>
              <input type="number" min={1} className="input mt-1 tabular-nums" value={draft.maxRedemptions} onChange={(e) => setDraft((d) => ({ ...d, maxRedemptions: e.target.value }))} placeholder="Unlimited" />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm text-paper-700">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
              Active
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button type="submit" className="btn" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save promo code'}</button>
          </div>
        </form>
      ) : null}

      {promos.isPending ? (
        <div className="panel h-48 animate-pulse bg-paper-50" />
      ) : rows.length === 0 ? (
        <EmptyState title="No promo codes yet." description="Create a code when a campaign needs a measurable membership discount." />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-200 bg-paper-50 text-xs uppercase tracking-[0.16em] text-paper-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Redemptions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-100">
              {rows.map((promo) => (
                <tr key={promo.id}>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-ink">{promo.code}</div>
                    {promo.description ? <div className="mt-0.5 text-xs text-paper-500">{promo.description}</div> : null}
                  </td>
                  <td className="px-4 py-3">{formatDiscount(promo)}</td>
                  <td className="px-4 py-3">{promo.membershipTierId ? tierById.get(promo.membershipTierId)?.name ?? 'Selected tier' : 'Any tier'}</td>
                  <td className="px-4 py-3 tabular-nums">{promo.redeemedCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ''}</td>
                  <td className="px-4 py-3"><span className={promo.active ? 'badge-accent' : 'badge'}>{promo.active ? 'Active' : 'Paused'}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn-ghost mr-2" onClick={() => editPromo(promo)}>Edit</button>
                    <button type="button" className="btn-ghost text-red-700" onClick={() => archivePromo(promo)}>Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDiscount(promo: PromoCode): string {
  return promo.discountType === 'percent' ? `${promo.discountPercent ?? 0}% off` : `${money(promo.discountAmountCents ?? 0)} off`;
}
