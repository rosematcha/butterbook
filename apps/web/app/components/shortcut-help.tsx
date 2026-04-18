'use client';
/**
 * Lightweight help dialog listing available keyboard shortcuts. Opens from
 * `?help=1` in the URL (set by the command palette and the footer hint).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface Shortcut { keys: string[]; description: string; scope?: string }

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], description: 'Open command palette', scope: 'Anywhere' },
  { keys: ['Ctrl', 'K'], description: 'Open command palette (Windows / Linux)', scope: 'Anywhere' },
  { keys: ['?'], description: 'Show this list', scope: 'Anywhere' },
  { keys: ['Esc'], description: 'Close dialog', scope: 'Anywhere' },
  { keys: ['N'], description: 'Add visitor', scope: 'Today' },
  { keys: ['T'], description: 'Jump to today', scope: 'Today' },
  { keys: ['←'], description: 'Previous open day', scope: 'Today' },
  { keys: ['→'], description: 'Next open day', scope: 'Today' },
];

export function ShortcutHelp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlOpen = params.get('help') === '1';
  const [localOpen, setLocalOpen] = useState(false);
  const open = urlOpen || localOpen;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function close() {
    setLocalOpen(false);
    if (urlOpen) {
      const sp = new URLSearchParams(params.toString());
      sp.delete('help');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  // Global `?` shortcut toggles the overlay (ignored inside text fields and
  // when a modifier is held, so browser shortcuts still work).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        setLocalOpen((v) => !v);
      } else if (open && e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[68] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-paper-200 bg-white p-5 shadow-[0_12px_32px_rgb(0_0_0/0.18)]"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-medium text-ink">Keyboard shortcuts</h2>
          <button onClick={close} className="btn-ghost text-lg leading-none" aria-label="Close">×</button>
        </div>
        <dl className="mt-4 space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-paper-700">
                {s.description}
                {s.scope ? <span className="ml-2 text-[10px] uppercase tracking-wider text-paper-400">{s.scope}</span> : null}
              </dt>
              <dd className="flex shrink-0 gap-1">
                {s.keys.map((k, j) => (
                  <span key={j} className="kbd">{k}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
