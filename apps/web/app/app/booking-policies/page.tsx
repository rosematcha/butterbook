'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, ApiError } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { EmptyState } from '../../components/empty-state';
import { SettingsBackLink } from '../settings/_components/back-link';

interface Policy {
  cancelCutoffHours: number;
  rescheduleCutoffHours: number;
  selfCancelEnabled: boolean;
  selfRescheduleEnabled: boolean;
  refundPolicyText: string | null;
}

function formatHours(n: number): string {
  if (n === 0) return 'No cutoff. Any time before the visit.';
  if (n === 1) return '1 hour before';
  if (n < 24) return `${n} hours before`;
  if (n % 24 === 0) return `${n / 24} day${n === 24 ? '' : 's'} before`;
  return `${n} hours before`;
}

export default function BookingPoliciesPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('admin.manage_org');
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['booking-policies', activeOrgId],
    queryFn: () => apiGet<{ data: Policy }>(`/api/v1/orgs/${activeOrgId}/booking-policies`),
    enabled: !!activeOrgId && canManage,
  });

  const [cancelCutoffHours, setCancelCutoffHours] = useState(2);
  const [rescheduleCutoffHours, setRescheduleCutoffHours] = useState(2);
  const [selfCancelEnabled, setSelfCancelEnabled] = useState(true);
  const [selfRescheduleEnabled, setSelfRescheduleEnabled] = useState(false);
  const [refundPolicyText, setRefundPolicyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = query.data?.data;
    if (!p) return;
    setCancelCutoffHours(p.cancelCutoffHours);
    setRescheduleCutoffHours(p.rescheduleCutoffHours);
    setSelfCancelEnabled(p.selfCancelEnabled);
    setSelfRescheduleEnabled(p.selfRescheduleEnabled);
    setRefundPolicyText(p.refundPolicyText ?? '');
  }, [query.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/booking-policies`, {
        cancelCutoffHours,
        rescheduleCutoffHours,
        selfCancelEnabled,
        selfRescheduleEnabled,
        refundPolicyText: refundPolicyText.trim() === '' ? null : refundPolicyText,
      });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2500);
      await qc.invalidateQueries({ queryKey: ['booking-policies', activeOrgId] });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const activeActions = useMemo(() => {
    const parts: string[] = [];
    if (selfCancelEnabled) parts.push('cancel');
    if (selfRescheduleEnabled) parts.push('reschedule');
    return parts;
  }, [selfCancelEnabled, selfRescheduleEnabled]);

  if (!perms.loading && !canManage) {
    return (
      <EmptyState
        title="Permission required."
        description="Editing booking policies requires the admin.manage_org permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <SettingsBackLink />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Booking policies</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-paper-600">
            Rules for the visitor manage link. Turn self-serve on or off, set how close to the visit
            those actions stay open, and write the refund text shown next to them.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-sm text-accent-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
          <button type="submit" disabled={saving || !query.data} className="btn">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Self-serve</h2>
                <p className="mt-1 text-sm text-paper-600">
                  What visitors can do on their own, without emailing you.
                </p>
              </div>
              <span className={activeActions.length ? 'badge-accent' : 'badge'}>
                {activeActions.length === 0
                  ? 'Read-only link'
                  : activeActions.length === 2
                  ? 'Cancel + reschedule'
                  : activeActions.length === 1
                  ? `${activeActions[0].charAt(0).toUpperCase()}${activeActions[0].slice(1)} only`
                  : ''}
              </span>
            </div>

            <div className="mt-5 divide-y divide-paper-100">
              <ToggleRow
                title="Allow cancellations"
                description="Shows a cancel button on the manage link."
                checked={selfCancelEnabled}
                onChange={setSelfCancelEnabled}
              />
              <ToggleRow
                title="Allow rescheduling"
                description="Opens a slot picker so visitors can move their time."
                checked={selfRescheduleEnabled}
                onChange={setSelfRescheduleEnabled}
              />
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Cutoff windows</h2>
            <p className="mt-1 text-sm text-paper-600">
              Close the action a set number of hours before the visit. Outside that window the
              manage page shows a &ldquo;please contact us&rdquo; note instead.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <CutoffField
                label="Cancel cutoff"
                value={cancelCutoffHours}
                onChange={setCancelCutoffHours}
                disabled={!selfCancelEnabled}
              />
              <CutoffField
                label="Reschedule cutoff"
                value={rescheduleCutoffHours}
                onChange={setRescheduleCutoffHours}
                disabled={!selfRescheduleEnabled}
              />
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Refund language</h2>
            <p className="mt-1 text-sm text-paper-600">
              Shown under the cancel button. Plain text only. Leave blank to hide.
            </p>
            <textarea
              className="input mt-4 min-h-[112px]"
              placeholder="Refunds are issued for cancellations made at least 24 hours before your visit."
              value={refundPolicyText}
              onChange={(e) => setRefundPolicyText(e.target.value)}
              maxLength={1000}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-paper-500">
              <span>Plain text · up to 1,000 characters</span>
              <span className="tabular-nums">{refundPolicyText.length} / 1000</span>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="h-eyebrow">Preview</div>
          <h2 className="mt-1 font-display text-base font-medium tracking-tight-er text-ink">Manage your visit</h2>
          <p className="mt-1 text-xs text-paper-500">What a visitor sees after clicking the link.</p>

          <div className="mt-4 overflow-hidden rounded-lg border border-paper-200 bg-white shadow-[0_1px_0_rgb(0_0_0/0.03)]">
            <div className="border-b border-paper-200 bg-paper-50/60 px-5 py-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-paper-500">
                butterbook.app/manage
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <div className="h-eyebrow">Your visit</div>
                <div className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">
                  Saturday, June&nbsp;6
                </div>
                <div className="text-sm text-paper-600">2:30 PM · 4 guests</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selfCancelEnabled ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded-md border border-paper-300 bg-white px-3 py-1.5 text-sm text-paper-800"
                  >
                    Cancel visit
                  </button>
                ) : null}
                {selfRescheduleEnabled ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded-md bg-brand-accent px-3 py-1.5 text-sm font-medium text-brand-on-accent"
                  >
                    Reschedule
                  </button>
                ) : null}
                {!selfCancelEnabled && !selfRescheduleEnabled ? (
                  <div className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs text-paper-600">
                    No actions. Visitor is asked to contact you.
                  </div>
                ) : null}
              </div>

              {refundPolicyText.trim() ? (
                <div className="border-t border-paper-100 pt-4 text-xs leading-relaxed text-paper-600">
                  {refundPolicyText.slice(0, 240)}
                  {refundPolicyText.length > 240 ? '…' : ''}
                </div>
              ) : (
                <div className="border-t border-paper-100 pt-4 text-xs italic text-paper-400">
                  No refund language added.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-md border border-paper-200 bg-paper-50 p-4 text-xs leading-relaxed text-paper-600">
            <div className="h-eyebrow text-paper-500">Good to know</div>
            <ul className="mt-2 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-paper-400">·</span>
                <span>Links are signed and expire 7 days after the visit.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-paper-400">·</span>
                <span>Admins can always cancel from <Link href="/app/visits" className="link">All visits</Link>.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </form>
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
    <label className="flex cursor-pointer items-start gap-4 py-4 first:pt-0 last:pb-0">
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
        <div className="text-sm text-paper-600">{description}</div>
      </span>
    </label>
  );
}

function CutoffField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="h-eyebrow">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          className="input tabular-nums"
          min={0}
          max={168}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
        <span className="text-sm text-paper-500">hours</span>
      </div>
      <div className="mt-1.5 text-xs text-paper-500">{formatHours(value)}</div>
    </div>
  );
}
