// Shared chrome for every marketing/info sub-page (e.g. /demo, eventually
// /changelog, /about). The shell owns the sticky nav, breadcrumb+title
// header, and footer. Callers pass the middle.
//
// Anatomy:
//   <SubPageShell breadcrumb={…} title="…" subtitle="…" maxWidth={960}>
//     {/* page-specific content */}
//   </SubPageShell>
//
// By default this renders with the marketing homepage's nav + palette so a
// visitor moving from / → /demo → /pricing feels like they stayed in one app.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IS_DEMO, MARKETING_URL } from '../../lib/env';

export interface BreadcrumbSegment {
  /** Shown in the breadcrumb trail. */
  label: string;
  /** If set, the segment is a link. Omit on the current-page segment. */
  href?: string;
}

export interface SubPageShellProps {
  breadcrumb: BreadcrumbSegment[];
  /** The H1. Plain string or ReactNode so pages can mix in italics. */
  title: ReactNode;
  /** One-line explanation shown below the H1. */
  subtitle?: ReactNode;
  /** Page body. */
  children: ReactNode;
  /**
   * Max width (in px) of header + body containers. 1080 suits most text-heavy
   * sub-pages; heavier mockup-driven pages can bump this to 1100–1200.
   */
  maxWidth?: number;
}

export function SubPageShell({
  breadcrumb,
  title,
  subtitle,
  children,
  maxWidth = 1080,
}: SubPageShellProps) {
  return (
    <div className="font-sans text-ink">
      <SubPageNav />
      <SubPageHeader breadcrumb={breadcrumb} title={title} subtitle={subtitle} maxWidth={maxWidth} />
      <div
        className="mx-auto px-6 pb-20 pt-12 sm:px-12 sm:pt-14"
        style={{ maxWidth }}
      >
        {children}
      </div>
      <SubPageFooter maxWidth={maxWidth} />
    </div>
  );
}

/* ---------- Sticky top nav ---------- */

export function SubPageNav() {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b border-paper-200 px-6 py-5 backdrop-blur-md sm:px-12"
      style={{ background: 'color-mix(in oklch, #fbfaf7 88%, transparent)' }}
    >
      <Wordmark size={22} />
      <nav className="hidden gap-7 text-sm text-paper-600 md:flex">
        <a href={`${MARKETING_URL}/#product`}>Product</a>
        <a href={`${MARKETING_URL}/#audience`}>Who it&apos;s for</a>
        <a href={`${MARKETING_URL}/#pricing`}>Pricing</a>
        <a href={`${MARKETING_URL}/#faq`}>FAQ</a>
      </nav>
      <div className="flex gap-2.5">
        {IS_DEMO ? (
          <Link href="/" className="btn-ghost">Sign in</Link>
        ) : (
          <a href={`${MARKETING_URL}/login`} className="btn-ghost">Sign in</a>
        )}
        <a href={`${MARKETING_URL}/register?ref=demo`} className="btn">
          Get started
        </a>
      </div>
    </header>
  );
}

/* ---------- Breadcrumb + title block ---------- */

function SubPageHeader({
  breadcrumb,
  title,
  subtitle,
  maxWidth,
}: {
  breadcrumb: BreadcrumbSegment[];
  title: ReactNode;
  subtitle?: ReactNode;
  maxWidth: number;
}) {
  return (
    <div className="border-b border-paper-200 bg-paper-50 px-6 sm:px-12">
      <div className="mx-auto pb-11 pt-12" style={{ maxWidth }}>
        <Breadcrumb items={breadcrumb} />
        <h1
          className="font-display"
          style={{ fontSize: 52, letterSpacing: '-0.03em', fontWeight: 380, lineHeight: 1.04 }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3.5 max-w-[56ch] text-[17px] leading-relaxed text-paper-600">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Breadcrumb({ items }: { items: BreadcrumbSegment[] }) {
  return (
    <div className="mb-5 text-[13px] text-paper-500">
      {items.map((seg, i) => {
        const isLast = i === items.length - 1;
        const node = seg.href ? (
          <a href={seg.href} className="text-paper-600 hover:text-ink">
            {seg.label}
          </a>
        ) : (
          <span>{seg.label}</span>
        );
        return (
          <span key={`${seg.label}-${i}`}>
            {node}
            {!isLast ? <span className="mx-2 text-paper-300">›</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- Footer ---------- */

function SubPageFooter({ maxWidth }: { maxWidth: number }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-paper-200 bg-paper-100 px-6 py-8 sm:px-12">
      <div
        className="mx-auto flex flex-wrap items-center justify-between gap-6"
        style={{ maxWidth }}
      >
        <Wordmark size={17} />
        <div className="flex gap-[22px] text-[13px] text-paper-600">
          <a href={`${MARKETING_URL}/#pricing`}>Pricing</a>
          <a href={`${MARKETING_URL}/#faq`}>FAQ</a>
          <a href="https://github.com/rosematcha/butterbook">GitHub</a>
        </div>
        <span className="text-[12px] text-paper-500">© {year} Butterbook</span>
      </div>
    </footer>
  );
}

/* ---------- Wordmark (shared) ---------- */

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <Link href={IS_DEMO ? '/' : MARKETING_URL} className="inline-flex items-center gap-2.5 leading-none">
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4" cy="10" r="2.2" className="fill-brand-accent" />
        <circle cx="16" cy="10" r="2.2" className="fill-brand-accent" />
        <rect x="4" y="9.4" width="12" height="1.2" className="fill-brand-accent" opacity="0.55" />
      </svg>
      <span
        style={{ fontSize: size * 0.95, lineHeight: 1 }}
        className="font-display font-medium tracking-tight-er text-ink"
      >
        Butterbook
      </span>
    </Link>
  );
}

/* ---------- Small arrow icon (used in CTAs) ---------- */

export function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
