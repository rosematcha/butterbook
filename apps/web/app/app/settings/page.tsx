'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePermissions, type Gate } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { getToken } from '../../../lib/api';
import { useToast } from '../../../lib/toast';

interface SettingsCard {
  href: string;
  label: string;
  description: string;
  requires?: Gate;
}

interface SettingsGroup {
  heading: string;
  cards: SettingsCard[];
}

const GROUPS: SettingsGroup[] = [
  {
    heading: 'Organization',
    cards: [
      { href: '/app/branding', label: 'Branding', description: 'Colors, logo, and visual identity for your public pages.', requires: 'admin.manage_org' },
      { href: '/app/form', label: 'Form fields', description: 'Customize the fields visitors fill out on check-in.', requires: 'admin.manage_forms' },
      { href: '/app/locations', label: 'Locations', description: 'Manage physical sites, hours, and QR codes.', requires: 'admin.manage_locations' },
    ],
  },
  {
    heading: 'People',
    cards: [
      { href: '/app/members', label: 'Members', description: 'Org staff who can sign in and manage operations.', requires: 'admin.manage_users' },
      { href: '/app/roles', label: 'Roles', description: 'Define roles and assign permissions to staff members.', requires: 'admin.manage_roles' },
    ],
  },
  {
    heading: 'Public surfaces',
    cards: [
      { href: '/app/booking-page', label: 'Booking page', description: 'Configure your public booking page appearance and behavior.', requires: 'admin.manage_org' },
      { href: '/app/booking-policies', label: 'Booking policies', description: 'Cancellation windows, reschedule rules, and refund text.', requires: 'admin.manage_org' },
    ],
  },
  {
    heading: 'Revenue',
    cards: [
      { href: '/app/settings/stripe', label: 'Stripe', description: 'Connect Stripe for membership payments and checkout.', requires: 'stripe.manage' },
    ],
  },
  {
    heading: 'Communications',
    cards: [
      { href: '/app/notifications', label: 'Notifications', description: 'Email templates, test sends, and outbox viewer.', requires: 'notifications.manage' },
    ],
  },
  {
    heading: 'Security',
    cards: [
      { href: '/app/settings/sso', label: 'SSO', description: 'Single sign-on providers and enforcement policies.', requires: 'admin.manage_org' },
      { href: '/app/settings/api-keys', label: 'API keys', description: 'Manage org-scoped API keys for integrations.', requires: 'api_keys.manage' },
    ],
  },
  {
    heading: 'Data',
    cards: [
      { href: '/app/audit', label: 'Audit log', description: 'Immutable record of every admin action in this organization.', requires: 'superadmin' },
    ],
  },
];

export default function SettingsPage() {
  const perms = usePermissions();

  const visibleGroups = GROUPS
    .map((g) => ({
      ...g,
      cards: perms.loading ? g.cards : g.cards.filter((c) => perms.can(c.requires)),
    }))
    .filter((g) => g.cards.length > 0);

  return (
    <div>
      <div className="mb-8">
        <div className="h-eyebrow">Configuration</div>
        <h1 className="h-display mt-1">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
          Organization configuration, staff, integrations, and data management.
        </p>
      </div>

      <div className="space-y-8">
        {visibleGroups.map((group) => (
          <section key={group.heading}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-paper-500">
              {group.heading}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex flex-col rounded-lg border border-paper-200 bg-white p-5 transition hover:border-paper-300 hover:shadow-[0_2px_8px_rgb(0_0_0/0.04)]"
                >
                  <span className="font-medium text-ink transition group-hover:text-brand-accent">
                    {card.label}
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-paper-600">
                    {card.description}
                  </span>
                </Link>
              ))}
              {group.heading === 'Data' && perms.can('superadmin') ? <ExportCard /> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ExportCard() {
  const { activeOrgId, membership } = useSession();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!activeOrgId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/orgs/${activeOrgId}/export`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const slug = membership?.publicSlug ?? 'org';
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `butterbook-export-${slug}-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push({ kind: 'success', message: 'Export downloaded' });
    } catch (e) {
      toast.push({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      className="group flex flex-col rounded-lg border border-paper-200 bg-white p-5 text-left transition hover:border-paper-300 hover:shadow-[0_2px_8px_rgb(0_0_0/0.04)]"
    >
      <span className="font-medium text-ink transition group-hover:text-brand-accent">
        {exporting ? 'Exporting…' : 'Export org data'}
      </span>
      <span className="mt-1 text-sm leading-relaxed text-paper-600">
        Download the entire organization as a JSON file. Superadmin only.
      </span>
    </button>
  );
}
