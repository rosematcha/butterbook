'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useConfirm } from '../../../../lib/confirm';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { EmptyState } from '../../../components/empty-state';
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
  const [editorOpen, setEditorOpen] = useState(false);

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
      setEditorOpen(false);
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
    setEditorOpen(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function newTier() {
    setDraft(emptyDraft);
    setEditorOpen(true);
  }

  const rows = useMemo(() => {
    const data = tiers.data?.data ?? [];
    return [...data].sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
  }, [tiers.data]);

  const activeCount = rows.filter((t) => t.active).length;

  if (!perms.loading && !canView) {
    return (
      <EmptyState
        title="Permission required."
        description="Membership tiers require the memberships.view_all permission."
      />
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Tiers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Membership tiers. Enroll members manually, or sell publicly through Stripe.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-paper-500">
            {rows.length} total · {activeCount} active
          </span>
          {canManage ? (
            <button type="button" className="btn" onClick={newTier}>
              New tier
            </button>
          ) : null}
        </div>
      </div>

      {canManage && editorOpen ? (
        <form onSubmit={onSubmit} className="panel relative mb-6 overflow-hidden p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full"
            style={{ background: 'radial-gradient(circle, rgb(var(--brand-accent) / 0.08), transparent 65%)' }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="h-eyebrow">{draft.id ? 'Editing' : 'Creating'}</div>
              <h2 className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">
                {draft.id ? draft.name || 'Tier' : 'New tier'}
              </h2>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setDraft(emptyDraft); setEditorOpen(false); }}
            >
              Cancel
            </button>
          </div>

          <div className="relative mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="h-eyebrow">Name</span>
                  <input
                    required
                    className="input mt-1"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Family"
                  />
                </label>
                <label className="block">
                  <span className="h-eyebrow">Slug</span>
                  <input
                    required
                    className="input mt-1 font-mono text-[13px]"
                    value={draft.slug}
                    onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                    placeholder="family"
                  />
                </label>
              </div>
              <label className="block">
                <span className="h-eyebrow">Description</span>
                <textarea
                  className="input mt-1 min-h-[80px]"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="A line or two about what this tier includes."
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="h-eyebrow">Price (USD)</span>
                  <input
                    required
                    className="input mt-1 tabular-nums"
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                    placeholder="75"
                  />
                </label>
                <label className="block">
                  <span className="h-eyebrow">Interval</span>
                  <select
                    className="input mt-1"
                    value={draft.billingInterval}
                    onChange={(e) => setDraft((d) => ({ ...d, billingInterval: e.target.value as MembershipBillingInterval }))}
                  >
                    <option value="year">Year</option>
                    <option value="month">Month</option>
                    <option value="lifetime">Lifetime</option>
                    <option value="one_time">One-time</option>
                  </select>
                </label>
                <label className="block">
                  <span className="h-eyebrow">Duration days</span>
                  <input
                    className="input mt-1 tabular-nums"
                    type="number"
                    min={1}
                    value={draft.durationDays}
                    onChange={(e) => setDraft((d) => ({ ...d, durationDays: e.target.value }))}
                    placeholder="Auto"
                    disabled={draft.billingInterval === 'lifetime'}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="h-eyebrow">Guest passes</span>
                  <input
                    className="input mt-1 tabular-nums"
                    type="number"
                    min={0}
                    value={draft.guestPassesIncluded}
                    onChange={(e) => setDraft((d) => ({ ...d, guestPassesIncluded: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="h-eyebrow">Active cap</span>
                  <input
                    className="input mt-1 tabular-nums"
                    type="number"
                    min={1}
                    value={draft.maxActive}
                    onChange={(e) => setDraft((d) => ({ ...d, maxActive: e.target.value }))}
                    placeholder="None"
                  />
                </label>
                <label className="block">
                  <span className="h-eyebrow">Sort order</span>
                  <input
                    className="input mt-1 tabular-nums"
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-paper-200 bg-paper-50/60 p-4">
              <ToggleRow
                title="Member-only events"
                description="This tier can satisfy member-only event gating."
                checked={draft.memberOnlyEventAccess}
                onChange={(v) => setDraft((d) => ({ ...d, memberOnlyEventAccess: v }))}
              />
              <ToggleRow
                title="Available for new enrollments"
                description="Off keeps it visible on existing members but hides from pickers."
                checked={draft.active}
                onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
              />
            </div>
          </div>

          <div className="relative mt-5 flex items-center justify-end gap-2">
            <button type="submit" className="btn" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : draft.id ? 'Save tier' : 'Create tier'}
            </button>
          </div>
        </form>
      ) : null}

      {tiers.isSuccess && rows.length === 0 ? (
        <EmptyState
          title="No tiers yet."
          description="Create the first tier to start enrolling members. A single annual tier is a fine place to start."
        />
      ) : tiers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="panel h-48 animate-pulse bg-paper-50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((tier, i) => (
            <TierCard
              key={tier.id}
              tier={tier}
              featured={i === 1 && rows.length >= 3}
              onEdit={canManage ? () => editTier(tier) : undefined}
              onArchive={canManage ? () => archiveTier(tier) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TierCard({
  tier,
  featured,
  onEdit,
  onArchive,
}: {
  tier: MembershipTier;
  featured: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
}) {
  const interval = intervalLabel(tier.billingInterval);
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white p-6 transition ${
        featured ? 'border-brand-accent/40 shadow-[0_4px_20px_rgb(0_0_0/0.04)]' : 'border-paper-200'
      } ${!tier.active ? 'opacity-70' : ''}`}
    >
      {featured ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(var(--brand-accent) / 0.12), transparent 65%)' }}
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="h-eyebrow">/{tier.slug}</div>
          <h3 className="mt-1 font-display text-2xl font-medium tracking-tight-er text-ink">
            {tier.name}
          </h3>
        </div>
        {tier.active ? (
          <span className="badge-accent shrink-0">Active</span>
        ) : (
          <span className="badge shrink-0">Archived</span>
        )}
      </div>

      {tier.description ? (
        <p className="relative mt-3 text-sm leading-relaxed text-paper-600">{tier.description}</p>
      ) : (
        <p className="relative mt-3 text-sm italic text-paper-400">No description.</p>
      )}

      <div className="relative mt-5 flex items-baseline gap-2 border-t border-paper-100 pt-4">
        <span className="font-display text-4xl font-medium tracking-tight-er text-ink tabular-nums">
          {money(tier.priceCents)}
        </span>
        <span className="text-sm text-paper-500">
          /{interval === 'one-time' ? 'once' : interval}
        </span>
      </div>

      <ul className="relative mt-4 space-y-2 text-sm text-paper-700">
        <FeatureRow
          on={tier.memberOnlyEventAccess}
          label={tier.memberOnlyEventAccess ? 'Member-only event access' : 'Public events only'}
        />
        <FeatureRow
          on={tier.guestPassesIncluded > 0}
          label={
            tier.guestPassesIncluded === 0
              ? 'No guest passes'
              : `${tier.guestPassesIncluded} guest pass${tier.guestPassesIncluded === 1 ? '' : 'es'}`
          }
        />
        <FeatureRow
          on={tier.durationDays != null}
          label={
            tier.billingInterval === 'lifetime'
              ? 'Lifetime access'
              : tier.durationDays
              ? `${tier.durationDays}-day term`
              : 'No term set'
          }
        />
        {tier.maxActive != null ? (
          <FeatureRow on label={`Capped at ${tier.maxActive} active`} muted />
        ) : null}
      </ul>

      {(onEdit || onArchive) ? (
        <div className="relative mt-6 flex items-center justify-between border-t border-paper-100 pt-4 text-xs">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper-400">
            Sort {tier.sortOrder}
          </span>
          <div className="flex items-center gap-1">
            {onEdit ? (
              <button type="button" className="btn-ghost text-xs" onClick={onEdit}>
                Edit
              </button>
            ) : null}
            {onArchive && tier.active ? (
              <button type="button" className="btn-ghost text-xs text-red-700 hover:bg-red-50" onClick={onArchive}>
                Archive
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function FeatureRow({ on, label, muted }: { on: boolean; label: string; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {on ? (
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-0.5 shrink-0 ${muted ? 'text-paper-400' : 'text-emerald-600'}`}
          aria-hidden
        >
          <path d="M4 12l5 5L20 7" />
        </svg>
      ) : (
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-paper-300"
          aria-hidden
        >
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={muted ? 'text-paper-500' : undefined}>{label}</span>
    </li>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2 first:pt-0 last:pb-0">
      <span
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-brand-accent' : 'bg-paper-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs leading-relaxed text-paper-600">{description}</div>
      </span>
    </label>
  );
}
