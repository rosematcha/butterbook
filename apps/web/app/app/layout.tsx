'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiGet, getToken, setToken } from '../../lib/api';
import { useSession, type Membership, type User } from '../../lib/session';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, memberships, activeOrgId, setSession, setActiveOrgId, clear } = useSession();

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

  const nav = [
    { href: '/app', label: 'Overview' },
    { href: '/app/members', label: 'Members' },
    { href: '/app/roles', label: 'Roles' },
    { href: '/app/locations', label: 'Locations' },
    { href: '/app/events', label: 'Events' },
    { href: '/app/visits', label: 'Visits' },
    { href: '/app/reports', label: 'Reports' },
    { href: '/app/branding', label: 'Branding' },
    { href: '/app/audit', label: 'Audit log' },
  ];

  if (me.isLoading || !user) {
    return (
      <main className="p-6 text-sm text-slate-500">Loading…</main>
    );
  }

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">No org yet</h1>
        <p className="mt-2 text-slate-600">You are not a member of any organization.</p>
        <Link href="/app/orgs/new" className="btn mt-4 inline-block">Create one</Link>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Org</div>
          <select
            value={activeOrgId ?? ''}
            onChange={(e) => setActiveOrgId(e.target.value || null)}
            className="input mt-1"
          >
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
                {m.isSuperadmin ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const activeNav = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded px-2 py-1.5 text-sm ${activeNav ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">Signed in as</div>
          <div className="truncate text-sm font-medium">{user.email}</div>
          <button onClick={handleLogout} className="btn-secondary mt-2 w-full">Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">
              {active?.orgName ?? 'No org'}
            </h1>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
