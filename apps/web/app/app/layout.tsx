'use client';
import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, getToken, setToken } from '../../lib/api';
import { IS_DEMO, MARKETING_URL } from '../../lib/env';
import { useSession, type Membership, type User } from '../../lib/session';
import { useApplyBranding } from '../../lib/branding';
import { usePermissions, type Gate } from '../../lib/permissions';
import { useTerminology } from '../../lib/use-terminology';
import { makePrefetchers } from '../../lib/prefetch';
import { CommandPalette } from '../components/command-palette';
import { ShortcutHelp } from '../components/shortcut-help';
import { PrefetchLink } from '../components/prefetch-link';
import { SkeletonBlock } from '../components/skeleton-rows';

type PrefetchKey = keyof ReturnType<typeof makePrefetchers>;
interface NavItem { href: string; label: string; prefetch?: PrefetchKey; requires?: Gate }

// Gates mirror the API's `requirePermission` / `requireSuperadmin` calls for
// the page's primary GET — e.g. /app/members fetches members+invitations which
// both require admin.manage_users, so hiding the nav item when the user can't
// pass that check avoids a doomed query and the "permission denied" flash.
const SETTINGS_NAV: NavItem[] = [
  { href: '/app/locations', label: 'Locations', prefetch: 'locations', requires: 'admin.manage_locations' },
  { href: '/app/form', label: 'Form fields', prefetch: 'form', requires: 'admin.manage_forms' },
  { href: '/app/members', label: 'Members', prefetch: 'members', requires: 'admin.manage_users' },
  { href: '/app/roles', label: 'Roles', prefetch: 'roles', requires: 'admin.manage_roles' },
  { href: '/app/branding', label: 'Branding', prefetch: 'branding', requires: 'admin.manage_org' },
  { href: '/app/booking-page', label: 'Booking page', requires: 'admin.manage_org' },
  { href: '/app/booking-policies', label: 'Booking policies', requires: 'admin.manage_org' },
  { href: '/app/memberships/policies', label: 'Membership policies', requires: 'memberships.manage' },
  { href: '/app/settings/stripe', label: 'Stripe', prefetch: 'stripe', requires: 'stripe.manage' },
  { href: '/app/notifications', label: 'Notifications', requires: 'notifications.manage' },
  { href: '/app/audit', label: 'Audit log', prefetch: 'audit', requires: 'superadmin' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { user, membership, activeOrgId, setSession, clear } = useSession();
  const term = useTerminology();
  const perms = usePermissions();

  const mainNav: NavItem[] = [
    { href: '/app', label: 'Today', prefetch: 'today' },
    { href: '/app/visits', label: `All ${term.nounPlural}`, prefetch: 'visits', requires: 'visits.view_all' },
    { href: '/app/events', label: 'Events', prefetch: 'events', requires: 'events.view_registrations' },
    { href: '/app/contacts', label: 'Contacts', prefetch: 'contacts', requires: 'contacts.view_all' },
    { href: '/app/memberships', label: 'Memberships', prefetch: 'memberships', requires: 'memberships.view_all' },
    { href: '/app/memberships/tiers', label: 'Tiers', prefetch: 'membershipTiers', requires: 'memberships.view_all' },
    { href: '/app/memberships/promo-codes', label: 'Promo codes', requires: 'promo_codes.manage' },
  ];

  // While /auth/me is still loading we don't yet know what the user can do, so
  // show every nav item rather than flashing an empty sidebar for ~200ms on
  // fresh loads. Once permissions are known we filter down.
  const filterNav = (items: NavItem[]) =>
    perms.loading ? items : items.filter((n) => perms.can(n.requires));

  // Prefetchers reset when orgId flips so we don't warm the wrong org's data.
  const prefetchers = useMemo(() => makePrefetchers(qc, activeOrgId), [qc, activeOrgId]);

  // Paints the org's palette onto <html> via CSS custom properties so every
  // `bg-brand-*` / `text-brand-*` class on the page picks it up.
  useApplyBranding(activeOrgId);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ data: { user: User; membership: Membership | null } }>('/api/v1/auth/me'),
    enabled: typeof window !== 'undefined' && !!getToken(),
    retry: false,
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    if (me.data) setSession(me.data.data.user, me.data.data.membership);
    if (me.isError) {
      setToken(null);
      clear();
      router.replace('/login');
    }
  }, [me.data, me.isError, router, setSession, clear]);

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
    } catch {
      /* ignore */
    }
    setToken(null);
    clear();
    qc.clear();
    // In demo builds "sign out" is "exit demo" — land on the landing page
    // rather than /login, since /login in demo mode would just prompt to
    // re-enter the sandbox.
    router.replace(IS_DEMO ? '/' : '/login');
  }

  const active = membership;

  // Only show the "set up your organization" empty state once /me has
  // resolved AND the session effect has synced membership into Zustand.
  // Otherwise we'd briefly flash the empty state while membership defaults
  // to null between fetch resolution and setSession firing.
  if (me.isSuccess && user !== null && membership === null) {
    // On demo builds, "no membership" means the sandbox expired (prune cron
    // deleted the org but the cookie is still around). Bounce to the landing
    // page so they can start fresh — don't offer "Create an organization,"
    // which isn't a thing in the demo.
    if (IS_DEMO) {
      if (typeof window !== 'undefined') {
        setToken(null);
        clear();
        router.replace('/');
      }
      return null;
    }
    // Let the new-org route (and any other /app/orgs/* bootstrap route) render
    // through; otherwise the "Create one" link would navigate into this same
    // layout and stay stuck on the empty state forever.
    if (pathname.startsWith('/app/orgs/')) {
      return (
        <main className="mx-auto max-w-xl px-6 py-14">
          <div className="mb-6 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent" aria-hidden />
            <span className="font-display text-xl font-medium tracking-tight-er text-ink">Butterbook</span>
          </div>
          {children}
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent" aria-hidden />
          <span className="font-display text-xl font-medium tracking-tight-er text-ink">Butterbook</span>
        </div>
        <div className="panel p-8">
          <div className="h-eyebrow">Welcome, {user.email}</div>
          <h1 className="h-display mt-2">Let’s set up your organization</h1>
          <p className="mt-3 text-paper-600">
            An organization is the top-level container for your museum: its locations, staff, events,
            and visitor forms all live here. You’ll be the first superadmin.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-paper-700">
            <li className="flex gap-2"><span className="text-brand-accent">•</span>Takes about a minute — just name, address, and timezone.</li>
            <li className="flex gap-2"><span className="text-brand-accent">•</span>You can invite staff and add more locations afterwards.</li>
            <li className="flex gap-2"><span className="text-brand-accent">•</span>Nothing is public until you publish an event.</li>
          </ul>
          <div className="mt-7 flex items-center gap-3">
            <Link href="/app/orgs/new" className="btn-accent">Create your organization</Link>
            <button onClick={handleLogout} className="btn-ghost">Sign out</button>
          </div>
        </div>
      </main>
    );
  }

  const isActive = (href: string) => (href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-paper-200 bg-paper-100/60 px-3 py-5">
        <Link href="/app" className="mb-5 flex items-center gap-2 px-2.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent" aria-hidden />
          <span className="font-display text-xl font-medium tracking-tight-er text-ink">Butterbook</span>
        </Link>

        <div className="mb-4 px-2.5">
          <div className="h-eyebrow">Organization</div>
          <div className="mt-1.5 truncate rounded-md border border-paper-200 bg-white px-2.5 py-1.5 text-sm">
            {active?.orgName ?? <SkeletonBlock className="h-3 w-32" />}
            {active?.isSuperadmin ? <span className="ml-1 text-paper-400">★</span> : null}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {filterNav(mainNav).map((n) => (
            <PrefetchLink
              key={n.href}
              href={n.href}
              className={`nav-link ${isActive(n.href) ? 'nav-link-active' : ''}`}
              prefetchData={n.prefetch ? prefetchers[n.prefetch] : undefined}
            >
              {n.label}
            </PrefetchLink>
          ))}
          {filterNav(SETTINGS_NAV).length > 0 ? <div className="nav-section">Settings</div> : null}
          {filterNav(SETTINGS_NAV).map((n) => (
            <PrefetchLink
              key={n.href}
              href={n.href}
              className={`nav-link ${isActive(n.href) ? 'nav-link-active' : ''}`}
              prefetchData={n.prefetch ? prefetchers[n.prefetch] : undefined}
            >
              {n.label}
            </PrefetchLink>
          ))}
        </nav>

        <div className="mt-6 border-t border-paper-200 pt-4">
          <div className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-paper-400">
            {IS_DEMO ? 'Signed in · demo' : 'Signed in'}
          </div>
          <div className="truncate px-2.5 text-sm">
            {user?.email ?? <SkeletonBlock className="h-3 w-32" />}
          </div>
          <button onClick={handleLogout} className="btn-ghost mt-2 w-full justify-start px-2.5">
            {IS_DEMO ? 'Exit demo' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-paper-200 bg-white/70 px-10 py-4 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-paper-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent" aria-hidden />
            {active?.orgName ?? (me.isPending ? <SkeletonBlock className="h-3 w-28" /> : 'No org')}
            {IS_DEMO ? (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-brand-accent/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-brand-accent">
                sandbox
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2.5">
            {IS_DEMO ? (
              <a
                href={`${MARKETING_URL}/register?ref=demo`}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:bg-brand-accent/90"
              >
                Sign up for real
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                // Dispatch a synthetic ⌘K so the palette opens from its own listener.
                const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
                window.dispatchEvent(ev);
              }}
              className="hidden items-center gap-2 rounded-md border border-paper-200 bg-white px-2.5 py-1 text-xs text-paper-600 transition hover:border-paper-300 hover:text-ink sm:flex"
              aria-label="Open command palette"
            >
              <span>Quick find</span>
              <span className="kbd">⌘K</span>
            </button>
          </div>
        </header>
        <main className="px-10 py-8">{children}</main>
      </div>
      {/* ShortcutHelp reads useSearchParams; wrap in Suspense so the route
          isn't force-dynamic just for the keyboard overlay. */}
      <Suspense fallback={null}>
        <CommandPalette />
        <ShortcutHelp />
      </Suspense>
    </div>
  );
}
