// Shared data + visual primitives used by every /how-it-works variation.
// The page variations (page.tsx, v2/page.tsx, ...) import from here so the
// content and mock UI stay identical — only the layout changes between them.

import type { ReactNode } from 'react';

export type Step = {
  num: string;
  title: string;
  body: string;
  Visual: () => JSX.Element;
};

export const STEPS: Step[] = [
  {
    num: '01',
    title: 'Configure your venue',
    body: 'Set hours, capacity, and the form fields visitors fill in. Plan about an hour. Longer if you want to tune which fields are required.',
    Visual: ConfigVisual,
  },
  {
    num: '02',
    title: 'Publish your booking page',
    body: 'You get a public URL. Visitors pick a slot and get a confirmation email with links to reschedule or cancel without calling you.',
    Visual: BookVisual,
  },
  {
    num: '03',
    title: 'Check visitors in',
    body: 'The kiosk runs in any browser. Staff scan a QR code or search by name. Walk-ins book on the spot.',
    Visual: KioskVisual,
  },
  {
    num: '04',
    title: 'Cancellations promote the next person',
    body: 'Someone cancels. The next person on the waitlist moves up and gets a confirmation email. You handle the edge cases.',
    Visual: ManageVisual,
  },
  {
    num: '05',
    title: 'Pull a report',
    body: 'Check headcount by period, booking sources, no-shows, cancellations. Export a CSV of your register. Pipe it into your analytics tool or build a chart yourself.',
    Visual: ReportVisual,
  },
];

export const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Events',
    body: 'Separate capacity bucket, own slug and form, waitlist auto-promotion on cancellation, publish and unpublish without losing data.',
  },
  {
    title: 'Notifications',
    body: 'Six editable templates: confirmation, cancellation, reschedule, waitlist, event announcement, invitation. Test-send before going live.',
  },
];

/* ---------- FrameCard ---------- */

export function FrameCard({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-paper-200 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-center gap-[7px] border-b border-paper-200 bg-paper-50 px-3.5 py-2 font-mono text-[10.5px] tracking-[0.02em] text-paper-500">
        <span className="h-[5px] w-[5px] rounded-full bg-brand-accent" />
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ---------- Visuals ---------- */

function ConfigVisual() {
  const fields: Array<[string, string, string, boolean]> = [
    ['Aa', 'Name', 'Primary · required', true],
    ['@', 'Email', 'Required', false],
    ['123', 'Party size', 'Required', false],
    ['Aa', 'Notes', 'Optional', false],
  ];
  return (
    <FrameCard label="settings · form fields">
      <div className="px-[18px] py-4 text-[12.5px]">
        <div
          className="font-display mb-3"
          style={{ fontSize: 15, letterSpacing: '-0.02em' }}
        >
          Form fields
        </div>
        {fields.map(([icon, name, meta, primary], i) => (
          <div
            key={name}
            className={`mb-[3px] flex items-center gap-2.5 rounded-md px-2.5 py-[7px] ${
              i === 0 ? 'bg-paper-50' : ''
            }`}
          >
            <span
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10px] font-semibold ${
                primary
                  ? 'border-brand-accent/25 bg-brand-accent/[0.14] text-brand-accent'
                  : 'border-paper-200 bg-paper-50 text-paper-500'
              }`}
            >
              {icon}
            </span>
            <span className="flex-1 font-medium">{name}</span>
            <span className="text-[10.5px] text-paper-500">{meta}</span>
          </div>
        ))}
      </div>
    </FrameCard>
  );
}

function BookVisual() {
  return (
    <FrameCard label="yourmuseum.butterbook.app">
      <div className="px-5 py-[18px]">
        <div className="font-display" style={{ fontSize: 18, letterSpacing: '-0.025em' }}>
          Book a visit
        </div>
        <div className="mb-3.5 mt-0.5 text-[11px] text-paper-500">The Whitman Museum</div>
        <div className="grid gap-2">
          <Field label="Name" value="M. Rivera" />
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Date" value="Apr 18" />
            <Field label="Time" value="10:00 am" />
          </div>
          <div className="rounded-md bg-brand-accent px-3 py-2 text-center text-[12px] font-medium text-brand-on-accent">
            Confirm booking
          </div>
        </div>
      </div>
    </FrameCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-paper-200 bg-paper-50 px-2.5 py-[7px]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-paper-500">
        {label}
      </div>
      <div className="mt-px text-[12.5px] text-ink">{value}</div>
    </div>
  );
}

function KioskVisual() {
  return (
    <FrameCard label="kiosk · check-in">
      <div className="min-h-[146px] px-[18px] py-5 text-center">
        <div
          className="font-display"
          style={{ fontSize: 15, letterSpacing: '-0.02em' }}
        >
          Welcome
        </div>
        <div className="mb-3.5 mt-[3px] text-[10.5px] text-paper-500">
          Scan or search to check in
        </div>
        <div
          className="mx-auto h-16 w-16 rounded-lg border border-paper-200 bg-paper-100"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #1a1714 0 3px, transparent 3px 7px), repeating-linear-gradient(90deg, #1a1714 0 3px, transparent 3px 7px)',
            backgroundSize: '7px 7px',
            backgroundBlendMode: 'multiply',
            opacity: 0.9,
          }}
        />
        <div className="mt-2.5 text-[10px] text-paper-500">or tap to search</div>
      </div>
    </FrameCard>
  );
}

function ManageVisual() {
  return (
    <FrameCard label="auto-promotion">
      <div className="px-4 py-4 text-[12px]">
        <div className="mb-1.5 flex items-center gap-2 rounded-md bg-paper-50 px-2.5 py-2 opacity-55 line-through">
          <span className="h-1.5 w-1.5 rounded-full bg-paper-300" />
          <span className="flex-1">J. Bell · 10:30</span>
          <span className="text-[10px] text-paper-500">cancelled</span>
        </div>
        <div className="py-1 text-center font-mono text-[10px] text-paper-500">↓ slot released</div>
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-green-600/20 bg-green-600/10 px-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green-700" />
          <span className="flex-1 font-medium">A. Chen · 10:30</span>
          <span className="text-[10px] font-semibold text-green-800">promoted</span>
        </div>
        <div className="mt-3 border-t border-dashed border-paper-200 pt-2.5 font-mono text-[10px] text-paper-500">
          → confirmation email sent
        </div>
      </div>
    </FrameCard>
  );
}

function ReportVisual() {
  const bars = [24, 32, 28, 40, 36, 48, 44];
  const max = 48;
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <FrameCard label="reports · headcount by day">
      <div className="px-[18px] py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div
            className="font-display"
            style={{ fontSize: 20, letterSpacing: '-0.025em' }}
          >
            252
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-paper-500">
            Last 7 days
          </div>
        </div>
        <div className="flex h-[60px] items-end gap-1.5">
          {bars.map((b, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-[3px] ${
                i === bars.length - 1 ? 'bg-brand-accent' : 'bg-brand-accent/30'
              }`}
              style={{ height: `${(b / max) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-[5px] flex gap-1.5 font-mono text-[9px] tracking-[0.05em] text-paper-500">
          {days.map((d, i) => (
            <div key={i} className="flex-1 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-paper-200 pt-2 text-[10.5px] text-paper-600">
          <span>Export CSV</span>
          <span className="font-mono">↓</span>
        </div>
      </div>
    </FrameCard>
  );
}

/* ---------- Features strip ---------- */

export function FeaturesStrip() {
  return (
    <section className="w-screen ml-[calc(50%-50vw)] border-y border-paper-200 bg-paper-100 mt-16">
      <div className="mx-auto px-6 py-16 sm:px-12" style={{ maxWidth: 1080 }}>
        <div className="font-mono mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-paper-500">
          Also included
        </div>
        <h2
          className="font-display max-w-[22ch] mb-7"
          style={{ fontSize: 32, letterSpacing: '-0.028em', fontWeight: 400, lineHeight: 1.1 }}
        >
          A few more pieces.
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-paper-200 bg-white p-7">
              <div
                className="font-display mb-2"
                style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 400 }}
              >
                {f.title}
              </div>
              <p className="text-[14.5px] leading-relaxed text-paper-600">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */

export function ClosingCTA({ marketingUrl }: { marketingUrl: string }) {
  return (
    <section className="mt-16 grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col justify-between gap-7 rounded-2xl border border-brand-accent bg-white p-8 shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]">
        <div>
          <div
            className="font-display mb-2"
            style={{ fontSize: 24, letterSpacing: '-0.02em', fontWeight: 400 }}
          >
            Try the demo
          </div>
          <p className="text-[14.5px] leading-relaxed text-paper-600">
            A live sandbox with sample data loaded. Browse every screen, book a visit, try the
            kiosk. No signup.
          </p>
        </div>
        <a
          href="/demo"
          className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand-accent px-5 py-2.5 text-[14px] font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:-translate-y-px hover:bg-brand-accent/90"
        >
          Open demo →
        </a>
      </div>
      <div className="flex flex-col justify-between gap-7 rounded-2xl border border-paper-200 bg-white p-8">
        <div>
          <div
            className="font-display mb-2"
            style={{ fontSize: 24, letterSpacing: '-0.02em', fontWeight: 400 }}
          >
            Start a free account
          </div>
          <p className="text-[14.5px] leading-relaxed text-paper-600">
            The Free plan has no time limit. One location, one booking page, register and CSV
            export. No credit card.
          </p>
        </div>
        <a
          href={`${marketingUrl}/register`}
          className="btn-ghost self-start border border-paper-300"
        >
          Get started free
        </a>
      </div>
    </section>
  );
}
