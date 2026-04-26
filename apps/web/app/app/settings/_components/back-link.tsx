'use client';
import Link from 'next/link';

export function SettingsBackLink() {
  return (
    <Link
      href="/app/settings"
      className="mb-4 inline-flex items-center gap-1 text-sm text-paper-600 transition hover:text-ink"
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      Settings
    </Link>
  );
}
