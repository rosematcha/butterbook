'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, ApiError } from '../../../../lib/api';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { EmptyState } from '../../../components/empty-state';
import type { MembershipPolicy } from '../types';

type ProgramTone = 'live' | 'internal' | 'off';

function formatDays(n: number): string {
  if (n === 0) return 'No grace. Lapses immediately.';
  if (n === 1) return '1 day after end date';
  if (n < 14) return `${n} days after end date`;
  if (n % 7 === 0) return `${n / 7} week${n === 7 ? '' : 's'} after end date`;
  return `${n} days after end date`;
}

function parseReminderList(raw: string): number[] {
  return raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);
}

function formatReminderList(list: number[]): string {
  if (list.length === 0) return 'No reminders will be sent.';
  if (list.length === 1) return `One reminder, ${list[0]} days before expiry.`;
  const head = list.slice(0, -1).join(', ');
  return `Reminders at ${head} and ${list[list.length - 1]} days before expiry.`;
}

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

  const reminderList = useMemo(() => parseReminderList(renewalReminderDays), [renewalReminderDays]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/membership-policies`, {
        enabled,
        gracePeriodDays,
        renewalReminderDays: reminderList,
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
    return (
      <EmptyState
        title="Permission required."
        description="Editing membership policies requires the memberships.manage permission."
      />
    );
  }

  const tone: ProgramTone = !enabled ? 'off' : publicPageEnabled ? 'live' : 'internal';

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Membership policies</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-paper-600">
            Turn the program on or off, decide where members can self-serve, and set the cadence
            of expiry reminders.
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="panel relative overflow-hidden p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full"
              style={{
                background: enabled
                  ? 'radial-gradient(circle at center, rgb(var(--brand-accent) / 0.12), transparent 65%)'
                  : 'radial-gradient(circle at center, rgb(148 163 184 / 0.09), transparent 65%)',
              }}
            />
            <div className="relative flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="h-eyebrow">Program</div>
                <h2 className="mt-1 font-display text-2xl font-medium tracking-tight-er text-ink">
                  {enabled ? 'Memberships are on' : 'Memberships are off'}
                </h2>
                <p className="mt-1 max-w-md text-sm text-paper-600">
                  {enabled
                    ? 'Admins can enroll contacts and build tiers. With Stripe connected, visitors can also pay through the public join page.'
                    : 'The program is paused. No admin or public surfaces render. Existing records are preserved.'}
                </p>
              </div>
              <PillToggle checked={enabled} onChange={setEnabled} label="Enable memberships" />
            </div>
          </section>

          <section className={`panel p-6 transition ${!enabled ? 'pointer-events-none opacity-55' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">
                  Public access
                </h2>
                <p className="mt-1 text-sm text-paper-600">
                  What visitors see before they sign in.
                </p>
              </div>
              <span className={tone === 'live' ? 'badge-accent' : 'badge'}>
                {tone === 'live' ? 'Public' : tone === 'internal' ? 'Internal only' : 'Off'}
              </span>
            </div>
            <div className="mt-5 divide-y divide-paper-100">
              <ToggleRow
                title="Show public join page"
                description="Needs a connected Stripe account. Visitors pick a tier and check out directly."
                checked={publicPageEnabled}
                onChange={setPublicPageEnabled}
                disabled={!enabled}
              />
            </div>
          </section>

          <section className={`panel p-6 transition ${!enabled ? 'pointer-events-none opacity-55' : ''}`}>
            <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">
              Member self-serve
            </h2>
            <p className="mt-1 text-sm text-paper-600">
              Which actions the manage link exposes to the member themselves.
            </p>
            <div className="mt-5 divide-y divide-paper-100">
              <ToggleRow
                title="Allow self-cancel"
                description="Shows a cancel button in the member's manage page."
                checked={selfCancelEnabled}
                onChange={setSelfCancelEnabled}
                disabled={!enabled}
              />
              <ToggleRow
                title="Allow self-updates"
                description="Lets members edit their contact details and saved preferences."
                checked={selfUpdateEnabled}
                onChange={setSelfUpdateEnabled}
                disabled={!enabled}
              />
            </div>
          </section>

          <section className={`panel p-6 transition ${!enabled ? 'pointer-events-none opacity-55' : ''}`}>
            <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">
              Expiry rhythm
            </h2>
            <p className="mt-1 text-sm text-paper-600">
              How long a member stays active after their end date, and when to email a renewal
              reminder.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <div className="h-eyebrow">Grace period</div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    className="input tabular-nums"
                    min={0}
                    max={365}
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                    disabled={!enabled}
                  />
                  <span className="text-sm text-paper-500">days</span>
                </div>
                <div className="mt-1.5 text-xs text-paper-500">{formatDays(gracePeriodDays)}.</div>
              </div>
              <div>
                <div className="h-eyebrow">Reminder days</div>
                <input
                  type="text"
                  className="input mt-1 tabular-nums"
                  placeholder="30, 7"
                  value={renewalReminderDays}
                  onChange={(e) => setRenewalReminderDays(e.target.value)}
                  disabled={!enabled}
                />
                <div className="mt-1.5 text-xs text-paper-500">{formatReminderList(reminderList)}</div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <section className="panel p-5">
            <div className="h-eyebrow">Program status</div>
            <div className="mt-3 flex items-center gap-2">
              <StatusDot tone={tone} />
              <span className="text-sm font-medium text-ink">
                {tone === 'live' ? 'Live & public' : tone === 'internal' ? 'Internal only' : 'Turned off'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-paper-600">
              {tone === 'live'
                ? 'Visitors can find and purchase tiers. Admins manage members internally.'
                : tone === 'internal'
                ? 'Admins can build the program without exposing it to visitors yet.'
                : 'No admin or public surfaces render until the program is turned on.'}
            </p>

            <dl className="mt-5 grid gap-px overflow-hidden rounded-md border border-paper-200 bg-paper-200">
              <ReadoutRow label="Grace" value={`${gracePeriodDays}d`} />
              <ReadoutRow
                label="Reminders"
                value={reminderList.length ? reminderList.map((d) => `${d}d`).join(' · ') : '—'}
              />
              <ReadoutRow
                label="Self-cancel"
                value={selfCancelEnabled ? 'On' : 'Off'}
                good={selfCancelEnabled}
              />
              <ReadoutRow
                label="Self-update"
                value={selfUpdateEnabled ? 'On' : 'Off'}
                good={selfUpdateEnabled}
              />
            </dl>

            <div className="mt-5 border-t border-paper-100 pt-4 text-sm">
              <div className="h-eyebrow">Related</div>
              <ul className="mt-2 space-y-1.5">
                <li><Link href="/app/memberships/tiers" className="link">Tiers &amp; pricing</Link></li>
                <li><Link href="/app/settings/stripe" className="link">Stripe setup</Link></li>
                <li><Link href="/app/notifications" className="link">Notification templates</Link></li>
              </ul>
            </div>
          </section>

          <section className="rounded-lg border border-paper-200 bg-paper-50/70 p-5 text-sm leading-relaxed text-paper-600">
            <div className="h-eyebrow text-paper-500">A note</div>
            <p className="mt-2">
              Grace period affects what counts as &ldquo;lapsed&rdquo; in reports. Reminder days feed
              the renewal notification template.
            </p>
          </section>
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
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-4 py-4 first:pt-0 last:pb-0 ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
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
        disabled={disabled}
      />
      <span className="flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-sm text-paper-600">{description}</div>
      </span>
    </label>
  );
}

function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-brand-accent' : 'bg-paper-300'
      }`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.15)] transition ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function StatusDot({ tone }: { tone: ProgramTone }) {
  const cls =
    tone === 'live' ? 'bg-emerald-500' : tone === 'internal' ? 'bg-amber-500' : 'bg-paper-300';
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      <span className={`absolute inline-flex h-4 w-4 rounded-full opacity-30 ${cls}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  );
}

function ReadoutRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5">
      <span className="text-xs uppercase tracking-[0.12em] text-paper-500">{label}</span>
      <span className={`text-sm tabular-nums ${good ? 'text-emerald-700' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
