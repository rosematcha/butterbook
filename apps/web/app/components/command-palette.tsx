'use client';
/**
 * ⌘K / Ctrl+K command palette. Fuzzy-searches over navigation destinations
 * and actions (sign out).
 *
 * Global shortcut: ⌘K on mac, Ctrl+K elsewhere. Esc closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/session';
import { getToken, setToken } from '../../lib/api';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  onSelect: () => void;
}

/** Case-insensitive substring/subsequence match. Cheap and predictable. */
function matches(q: string, text: string): boolean {
  if (!q) return true;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  if (hay.includes(needle)) return true;
  // Subsequence fallback: "admin" matches "audit admin log"
  let i = 0;
  for (const c of hay) {
    if (c === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

export function CommandPalette() {
  const router = useRouter();
  const { clear } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Global open shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  async function logout() {
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

  const commands = useMemo<Command[]>(() => {
    const nav: Array<{ href: string; label: string; keywords?: string }> = [
      { href: '/app', label: 'Today', keywords: 'home dashboard calendar timeline' },
      { href: '/app/visits', label: 'All visits', keywords: 'visitors bookings' },
      { href: '/app/events', label: 'Events', keywords: 'programs tours' },
      { href: '/app/contacts', label: 'Contacts', keywords: 'crm visitors people profiles' },
      { href: '/app/contacts/segments', label: 'Segments', keywords: 'crm filters audiences tags' },
      { href: '/app/memberships', label: 'Memberships', keywords: 'crm members renewals enrollments' },
      { href: '/app/memberships/tiers', label: 'Membership tiers', keywords: 'pricing levels passes' },
      { href: '/app/memberships/policies', label: 'Membership policies', keywords: 'grace reminders self serve' },
      { href: '/app/settings/stripe', label: 'Stripe settings', keywords: 'payments connect checkout billing' },
      { href: '/app/locations', label: 'Locations', keywords: 'place site' },
      { href: '/app/form', label: 'Form fields', keywords: 'questions intake' },
      { href: '/app/members', label: 'Members', keywords: 'staff team invite' },
      { href: '/app/roles', label: 'Roles', keywords: 'permissions access' },
      { href: '/app/branding', label: 'Branding', keywords: 'theme color logo palette' },
      { href: '/app/reports', label: 'Reports', keywords: 'analytics csv headcount' },
      { href: '/app/audit', label: 'Audit log', keywords: 'history trail log' },
    ];
    const list: Command[] = nav.map((n) => ({
      id: `nav:${n.href}`,
      group: 'Go to',
      label: n.label,
      ...(n.keywords ? { keywords: n.keywords } : {}),
      onSelect: () => router.push(n.href),
    }));

    list.push({
      id: 'action:new-visitor',
      group: 'Actions',
      label: 'Add visitor on Today',
      keywords: 'new visit booking add',
      onSelect: () => router.push('/app?add=1'),
    });
    list.push({
      id: 'action:new-event',
      group: 'Actions',
      label: 'Create event',
      keywords: 'new event tour program',
      onSelect: () => router.push('/app/events?new=1'),
    });
    list.push({
      id: 'action:logout',
      group: 'Actions',
      label: 'Sign out',
      keywords: 'logout exit',
      onSelect: () => { void logout(); },
    });
    list.push({
      id: 'help:shortcuts',
      group: 'Help',
      label: 'Keyboard shortcuts',
      keywords: 'help shortcuts keys hotkey',
      onSelect: () => router.push('/app?help=1'),
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filtered = useMemo(() => {
    return commands.filter((c) => matches(query, `${c.label} ${c.group} ${c.keywords ?? ''}`));
  }, [commands, query]);

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1));
  }, [filtered.length, cursor]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      const chosen = filtered[cursor];
      if (chosen) {
        chosen.onSelect();
        setOpen(false);
      }
    }
  }

  // Group the filtered commands while preserving order.
  const grouped: Array<{ group: string; items: Command[] }> = [];
  for (const c of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === c.group) last.items.push(c);
    else grouped.push({ group: c.group, items: [c] });
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center bg-ink/30 p-6 pt-[15vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-paper-200 bg-white shadow-[0_12px_40px_rgb(0_0_0/0.18)]"
      >
        <div className="flex items-center gap-3 border-b border-paper-200 px-4">
          <span className="text-sm text-paper-400">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKey}
            placeholder="Search actions, pages, orgs…"
            className="flex-1 border-0 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-paper-400"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-paper-500">No matches.</div>
          ) : null}
          {grouped.map((g) => (
            <div key={g.group} className="py-1">
              <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                {g.group}
              </div>
              {g.items.map((item) => {
                const globalIndex = filtered.indexOf(item);
                const active = globalIndex === cursor;
                return (
                  <button
                    key={item.id}
                    onMouseMove={() => setCursor(globalIndex)}
                    onClick={() => { item.onSelect(); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition ${
                      active ? 'bg-brand-accent/10 text-ink' : 'text-paper-800 hover:bg-paper-50'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.hint ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-paper-500">{item.hint}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-paper-200 bg-paper-50 px-4 py-2 text-[11px] text-paper-500">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navigate · <span className="kbd">↵</span> select · <span className="kbd">esc</span> close
          </span>
          <span><span className="kbd">?</span> shortcuts</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
