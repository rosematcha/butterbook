'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiGet, getToken, setToken } from '../../lib/api';
import { useSession, type Membership, type User } from '../../lib/session';
import { useApplyBranding } from '../../lib/branding';
import { CommandPalette } from '../components/command-palette';
import { ShortcutHelp } from '../components/shortcut-help';

interface NavItem { href: string; label: string }

const MAIN_NAV: NavItem[] = [
  { href: '/app', label: 'Today' },
  { href: '/app/visits', label: 'All visits' },
  { href: '/app/events', label: 'Events' },
];

const SETTINGS_NAV: NavItem[] = [
  { href: '/app/locations', label: 'Locations' },
  { href: '/app/form', label: 'Form fields' },
  { href: '/app/members', label: 'Members' },
  { href: '/app/roles', label: 'Roles' },
  { href: '/app/branding', label: 'Branding' },
  { href: '/app/audit', label: 'Audit log' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, memberships, activeOrgId, setSession, setActiveOrgId, clear } = useSession();

  // Paints the org's palette onto <html> via CSS custom properties so every
  // `bg-brand-*` / `text-brand-*` class on the page picks it up.
  useApplyBranding(activeOrgId);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ data: { user: User; memberships: Membership[] } }>('/api/v1/auth/me'),
    enabled: typeof window !== 'undefined' && !!getToken(),
    retry: false,
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    if (me.data) setSession(me.data.data.user, me.data.data.memberships);
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
    router.replace('/login');
  }

  const active = memberships.find((m) => m.orgId === activeOrgId);

  if (me.isLoading || !user) {
    return <main className="p-6 text-sm text-paper-500">Loading…</main>;
  }

  if (memberships.length === 0) {
    // Let the new-org route render through; otherwise the "Create one" link
    // navigates into this layout and stays stuck on the empty state forever.
    if (pathname === '/app/orgs/new') {
      return <main className="mx-auto max-w-lg p-10">{children}</main>;
    }
    return (
      <main className="mx-auto max-w-lg p-10">
        <h1 className="h-display">No organization yet</h1>
        <p className="mt-3 text-paper-600">You aren’t a member of any organization.</p>
        <Link href="/app/orgs/new" className="btn mt-5 inline-flex">Create one</Link>
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
          <select
            value={activeOrgId ?? ''}
            onChange={(e) => setActiveOrgId(e.target.value || null)}
            className="input mt-1.5"
          >
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
                {m.isSuperadmin ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {MAIN_NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link ${isActive(n.href) ? 'nav-link-active' : ''}`}>
              {n.label}
            </Link>
          ))}
          <div className="nav-section">Settings</div>
          {SETTINGS_NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link ${isActive(n.href) ? 'nav-link-active' : ''}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-paper-200 pt-4">
          <div className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-paper-400">Signed in</div>
          <div className="truncate px-2.5 text-sm">{user.email}</div>
          <button onClick={handleLogout} className="btn-ghost mt-2 w-full justify-start px-2.5">Sign out</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-paper-200 bg-white/70 px-10 py-4 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-paper-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent" aria-hidden />
            {active?.orgName ?? 'No org'}
          </div>
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
        </header>
        <main className="px-10 py-8">{children}</main>
      </div>
      <CommandPalette />
      <ShortcutHelp />
    </div>
  );
}
