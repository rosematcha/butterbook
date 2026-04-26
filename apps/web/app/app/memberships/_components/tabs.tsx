'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions, type Gate } from '../../../../lib/permissions';

interface Tab {
  href: string;
  label: string;
  requires?: Gate;
}

const TABS: Tab[] = [
  { href: '/app/memberships', label: 'Members' },
  { href: '/app/memberships/tiers', label: 'Tiers', requires: 'memberships.view_all' },
  { href: '/app/memberships/guest-passes', label: 'Guest passes', requires: 'memberships.view_all' },
  { href: '/app/memberships/promo-codes', label: 'Promo codes', requires: 'promo_codes.manage' },
  { href: '/app/memberships/policies', label: 'Policies', requires: 'memberships.manage' },
];

export function MembershipsTabs() {
  const pathname = usePathname();
  const perms = usePermissions();

  const visible = perms.loading
    ? TABS
    : TABS.filter((t) => perms.can(t.requires));

  return (
    <nav className="mb-6 flex gap-1 border-b border-paper-200">
      {visible.map((tab) => {
        const active =
          tab.href === '/app/memberships'
            ? pathname === '/app/memberships'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative px-3 py-2 text-sm font-medium transition ${
              active
                ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-brand-accent'
                : 'text-paper-600 hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
