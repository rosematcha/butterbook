import Link from 'next/link';
import type { ReactNode } from 'react';

export default function Home() {
  return (
    <div className="mk">
      <MkNav />
      <MkHero />
      <MkProof />
      <MkTimelineSection />
      <MkFeatureGrid />
      <MkKiosk />
      <MkPricing />
      <MkFAQ />
      <MkFooter />
    </div>
  );
}

/* ---------- Wordmark ---------- */
function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
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
    </span>
  );
}

/* ---------- Nav ---------- */
function MkNav() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-paper-200 px-6 py-5 backdrop-blur-md sm:px-12"
      style={{ background: 'color-mix(in oklch, #fbfaf7 88%, transparent)' }}>
      <Wordmark size={22} />
      <nav className="hidden gap-7 text-sm text-paper-600 md:flex">
        <a href="#product">Product</a>
        <a href="#audience">Who it&apos;s for</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="flex gap-2.5">
        <Link href="/login" className="btn-ghost">Sign in</Link>
        <Link href="/register" className="btn inline-flex items-center gap-1.5">
          Book a demo <ArrowIcon />
        </Link>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function MkHero() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pb-[72px] pt-[72px] sm:px-12" id="product">
      <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div id="audience">
          <h1
            className="font-display text-balance"
            style={{
              fontSize: 'clamp(52px, 4.75vw, 74px)',
              lineHeight: 0.94,
              letterSpacing: '-0.035em',
              fontWeight: 380,
            }}
          >
            Reservations, events,<br />
            <span className="italic text-brand-accent">and everyone</span><br />
            who walks in.
          </h1>
          <p className="mt-8 max-w-[36ch] text-[19px] leading-relaxed text-paper-600">
            Butterbook runs bookings, events, payments, and visitor records for art museums,
            community studios, and solo practitioners. One tool for the whole day and the whole season.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-accent px-6 py-3.5 text-[15px] font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:-translate-y-px hover:bg-brand-accent/90"
            >
              Start free for 30 days
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-paper-300 bg-white px-6 py-3.5 text-[15px] font-medium text-paper-800 transition hover:border-paper-400 hover:bg-paper-50"
            >
              See the app <ArrowIcon />
            </Link>
          </div>
          <div className="mt-9 flex gap-6 text-[13px] text-paper-500">
            <span>No credit card</span>
            <span>·</span>
            <span>Set up in an afternoon</span>
            <span>·</span>
            <span>Export anytime</span>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  const rows: Array<[string, string, string, string | null]> = [
    ['10am', 'M. Rivera', 'Party of 2', 'docent'],
    ['10:15', 'Okafor family', 'Party of 4', 'members'],
    ['10:30', 'J. Bell', 'Party of 1', null],
    ['11am', 'A. Petrova', 'Party of 3', 'school'],
  ];
  return (
    <div className="relative hidden h-[540px] lg:block">
      {/* Back card — today visual */}
      <div className="absolute inset-y-10 right-0 left-10 overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-[0_16px_40px_rgb(0_0_0/0.10),0_0_0_1px_rgb(0_0_0/0.03)]">
        <div className="eyebrow flex items-center gap-2 border-b border-paper-200 px-4 py-3 text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
          The Whitman · Today
        </div>
        <div className="px-7 py-6">
          <div className="eyebrow text-[10px]">Today</div>
          <div
            className="mt-1 font-display"
            style={{ fontSize: 30, letterSpacing: '-0.025em', fontWeight: 450 }}
          >
            Saturday, April&nbsp;18
          </div>
          <div className="mt-1.5 text-[13px] text-paper-600">
            <span className="tabular">34</span> confirmed · <span className="tabular">2</span> cancelled · event day
          </div>
          <div className="mt-7 grid gap-y-2.5" style={{ gridTemplateColumns: '36px 1fr' }}>
            {rows.map(([t, n, p, tag], i) => (
              <div key={i} className="contents">
                <div className="pt-2 font-display text-xs text-paper-500">{t}</div>
                <div className="flex items-center justify-between gap-3 rounded-sm border-l-2 border-brand-accent bg-paper-50 px-3 py-2">
                  <div>
                    <div className="text-[13px] font-medium">{n}</div>
                    <div className="text-[11px] text-paper-600">{p}</div>
                  </div>
                  {tag && (
                    <span className="inline-flex items-center rounded-full border border-brand-accent/25 bg-brand-accent/10 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                      {tag}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating kiosk chip */}
      <div className="absolute bottom-0 left-0 w-60 rounded-[14px] border border-paper-200 bg-white p-5 shadow-[0_16px_40px_rgb(0_0_0/0.10),0_0_0_1px_rgb(0_0_0/0.03)]">
        <div className="eyebrow text-[10px]">Kiosk · Lobby</div>
        <div
          className="mt-1.5 font-display leading-[1.1]"
          style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 450 }}
        >
          Welcome.<br />Checking in?
        </div>
        <div className="mt-3.5 rounded-lg border border-paper-200 px-2.5 py-2 text-xs text-paper-500">
          Your name
        </div>
        <div className="mt-2 rounded-lg bg-brand-accent py-2.5 text-center text-xs font-medium text-brand-on-accent">
          Check in
        </div>
      </div>

      {/* Live now pill */}
      <div className="absolute right-0 top-0 flex items-center gap-2 rounded-full border border-paper-200 bg-white px-3 py-1.5 text-xs shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]">
        <span className="relative h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-brand-accent" />
          <span className="mk-pulse absolute -inset-[3px] rounded-full bg-brand-accent opacity-25" />
        </span>
        <span className="tabular">12 guests now</span>
      </div>
    </div>
  );
}

/* ---------- Principles band ---------- */
function MkProof() {
  const principles = [
    { kicker: 'Principle 01', title: 'Busy slots warn your team', body: 'Your staff still decides who comes in. No algorithm turns a family away at the door.' },
    { kicker: 'Principle 02', title: 'One price, every guest', body: 'A flat monthly rate that fits a grant line, so you can plan a season without ticket math.' },
    { kicker: 'Principle 03', title: 'Your data, ready to travel', body: 'Clean CSV and JSON exports on demand. Take your register to the board meeting, the auditor, the next platform.' },
    { kicker: 'Principle 04', title: 'You can read the code', body: 'Open changelog, open roadmap, open repo. Self-host if you want the keys.' },
  ];
  return (
    <section className="border-y border-paper-200 bg-paper-100 py-14">
      <div className="mx-auto max-w-[1280px] px-6 pb-5 sm:px-12">
        <div className="eyebrow">What we stand for</div>
      </div>
      <div
        className="mk-proof-scroll flex gap-5 overflow-x-auto px-6 pb-1 sm:px-12"
        style={{ scrollSnapType: 'x proximity' }}
      >
        {principles.map((p) => (
          <article
            key={p.title}
            className="flex flex-col gap-2.5 rounded-xl border border-paper-200 bg-paper-50 p-6"
            style={{ flex: '1 1 0', minWidth: 260, scrollSnapAlign: 'start' }}
          >
            <div className="eyebrow text-brand-accent">{p.kicker}</div>
            <h3 className="font-display text-xl font-normal tracking-tight-er">{p.title}</h3>
            <p className="text-[13px] leading-relaxed text-paper-600">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Timeline section ---------- */
function MkTimelineSection() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-[120px] sm:px-12">
      <div className="grid items-center gap-[72px] lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(36px, 4.5vw, 64px)',
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              fontWeight: 380,
            }}
          >
            A morning view of everyone who&apos;s&nbsp;coming.
          </h2>
          <p className="mt-6 max-w-[38ch] text-[17px] leading-relaxed text-paper-600">
            One page, one day. Who&apos;s arriving, in what size group, with what notes.
            The information a thoughtful front desk person would want at the start of their shift.
          </p>
          <ul className="mt-8 grid list-none gap-3.5 p-0 text-[15px]">
            {[
              ['Soft caps', 'Busy slots show a warning. No one gets turned away automatically.'],
              ['Tags', 'Label visits however your org thinks: school group, member, walk-in.'],
              ['Undo', 'Every cancellation and no-show is one click from being reversed.'],
            ].map(([k, v]) => (
              <li
                key={k}
                className="grid gap-4 border-t border-paper-200 pt-2.5"
                style={{ gridTemplateColumns: '80px 1fr' }}
              >
                <span className="font-display italic text-brand-accent">{k}</span>
                <span className="text-paper-600">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <TodayVisual />
      </div>
    </section>
  );
}

function TodayVisual() {
  const rows: Array<[string, string, string, string, string | null]> = [
    ['10am', 'M. Rivera', 'Party of 2', 'confirmed', 'docent'],
    ['10:15', 'Okafor family', 'Party of 4', 'confirmed', 'members'],
    ['10:30', 'J. Bell', 'Party of 1', 'confirmed', null],
    ['10:45', 'A. Petrova', 'Party of 3', 'cancelled', null],
    ['11am', 'Hayes Elementary', 'Party of 22', 'confirmed', 'school'],
    ['11:30', 'Lin-Park', 'Party of 2', 'confirmed', null],
  ];
  return (
    <div className="relative h-[460px]">
      <div className="absolute inset-0 grid overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-[0_16px_40px_rgb(0_0_0/0.10),0_0_0_1px_rgb(0_0_0/0.03)]"
        style={{ gridTemplateColumns: '200px 1fr' }}>
        {/* Sidebar */}
        <div className="flex flex-col gap-3.5 border-r border-paper-200 bg-paper-100 px-4 py-4">
          <div className="flex items-center gap-2 font-display text-[15px] tracking-tight-er">
            <span className="h-[7px] w-[7px] rounded-full bg-brand-accent" />
            Butterbook
          </div>
          {['Today', 'Register', 'Kiosk', 'Settings'].map((l, i) => (
            <div
              key={l}
              className="rounded-md border px-2 py-1.5 text-xs"
              style={{
                background: i === 0 ? '#fbfaf7' : 'transparent',
                color: i === 0 ? '#1a1714' : '#5d564b',
                fontWeight: i === 0 ? 500 : 400,
                borderColor: i === 0 ? '#ebe7dc' : 'transparent',
              }}
            >
              {l}
            </div>
          ))}
        </div>
        {/* Main */}
        <div className="overflow-hidden px-6 py-5">
          <div className="eyebrow text-[10px]">Today</div>
          <div className="mt-1 font-display" style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 450 }}>
            Saturday, April&nbsp;18
          </div>
          <div className="mt-1 text-xs text-paper-600">
            <span className="tabular">34</span> confirmed · <span className="tabular">2</span> cancelled · <span className="text-brand-accent">event day</span>
          </div>
          <div className="mt-[22px] grid gap-y-2" style={{ gridTemplateColumns: '42px 1fr' }}>
            {rows.map(([t, n, p, st, tag], i) => (
              <div key={i} className="contents">
                <div className="pt-2 font-display text-[11px] text-paper-500">{t}</div>
                <div
                  className="flex items-center justify-between gap-3 rounded-sm bg-paper-50 px-3 py-1.5"
                  style={{
                    borderLeft: `2px solid ${st === 'cancelled' ? '#d9d3c2' : 'rgb(var(--brand-accent))'}`,
                    opacity: st === 'cancelled' ? 0.6 : 1,
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{n}</div>
                    <div className="text-[10px] text-paper-600">
                      {p}
                      {st === 'cancelled' && ' · cancelled'}
                    </div>
                  </div>
                  {tag && (
                    <span className="inline-flex items-center rounded-full border border-brand-accent/25 bg-brand-accent/10 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                      {tag}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Now pill */}
      <div className="absolute right-6 -top-3 flex items-center gap-2 rounded-full border border-paper-200 bg-white px-2.5 py-1 text-[11px] shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
        <span className="tabular text-paper-600">now · 10:42am</span>
      </div>
    </div>
  );
}

/* ---------- Feature grid ---------- */
function MkFeatureGrid() {
  const features: Array<[string, string]> = [
    ['Register', 'A running, tagged record of who visited and when. Yours to export, always.'],
    ['Public booking', 'The same page works on a shared tablet at the door or linked from your website.'],
    ['Roles', 'Limit access by role, so a front desk volunteer sees what they need and nothing more.'],
    ['Form builder', 'Ask only what matters: name, group size, school, consent.'],
    ['Branding', "Your colors, your language, your org's name for things."],
    ['Audit log', 'Every mutation is logged, append-only, with the actor and reason attached.'],
  ];
  return (
    <section className="border-t border-paper-200 bg-paper-100 px-6 py-20 sm:px-12">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-start justify-between gap-12 md:flex-row md:items-baseline">
          <div>
            <h2
              className="font-display max-w-[18ch]"
              style={{
                fontSize: 'clamp(32px, 3.6vw, 52px)',
                letterSpacing: '-0.03em',
                fontWeight: 380,
              }}
            >
              Bookings, events, <span className="italic text-brand-accent">and everything after.</span>
            </h2>
          </div>
          <p className="max-w-[34ch] text-[15px] text-paper-600">
            Your register tracks every visit. Your events hold capacity. Your audit log keeps
            receipts. Your team sees who did what, and why.
          </p>
        </div>
        <div
          className="grid overflow-hidden rounded-xl border border-paper-200 md:grid-cols-3"
          style={{ background: '#ebe7dc', gap: 1 }}
        >
          {features.map(([title, body], i) => (
            <div key={title} className="min-h-[200px] bg-white px-7 py-8">
              <div className="mb-5 font-mono text-[11px] text-paper-500">0{i + 1}</div>
              <div className="mb-2 font-display" style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 450 }}>
                {title}
              </div>
              <p className="text-[14px] leading-relaxed text-paper-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Kiosk section ---------- */
function MkKiosk() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-[120px] sm:px-12">
      <div className="grid items-center gap-[72px] lg:grid-cols-[1.1fr_0.9fr]">
        <KioskVisual />
        <div>
          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(36px, 4.5vw, 64px)',
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              fontWeight: 380,
            }}
          >
            The booking page,<br />
            <span className="italic">wherever they are.</span>
          </h2>
          <p className="mt-6 max-w-[38ch] text-[17px] leading-relaxed text-paper-600">
            The booking page runs on your website, on a tablet by the door, or behind a taped-up
            QR code. Visitors add their name and go. No accounts, no app installs, no sign-in screens.
          </p>
          <Link
            href="/register"
            className="btn-secondary mt-8 inline-flex items-center gap-1.5"
          >
            Start your trial <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

function KioskVisual() {
  return (
    <div className="relative flex h-[500px] items-end justify-center">
      {/* Pedestal */}
      <div
        className="absolute bottom-0 h-24 w-[180px] rounded-t-sm"
        style={{ background: 'linear-gradient(180deg, #ebe7dc, #d9d3c2)' }}
      />
      <div className="absolute bottom-24 h-1.5 w-60 rounded-sm bg-paper-400 opacity-40" />

      {/* iPad frame */}
      <div
        className="relative mb-[60px] h-[440px] w-[340px] rounded-[28px] bg-ink p-2.5"
        style={{ boxShadow: '0 16px 40px rgb(0 0 0 / 0.10), 0 40px 80px -20px rgba(0,0,0,0.25)' }}
      >
        <div className="flex h-full w-full flex-col overflow-hidden rounded-[20px] bg-white px-6 py-8">
          <div className="eyebrow text-[10px]">
            <span className="text-brand-accent">●</span>&nbsp;&nbsp;The Whitman
          </div>
          <div
            className="mt-4 font-display leading-[1.05]"
            style={{ fontSize: 34, letterSpacing: '-0.025em', fontWeight: 380 }}
          >
            Welcome.<br />
            <span className="italic text-brand-accent">Checking in?</span>
          </div>
          <p className="mt-3.5 text-xs leading-relaxed text-paper-600">
            Tap your reservation or add your name to join the register.
          </p>
          <div className="mt-5 rounded-[10px] border border-paper-200 bg-paper-100 px-3.5 py-3 text-[13px] text-paper-500">
            Your name
          </div>
          <div className="mt-2.5 rounded-[10px] border border-paper-200 bg-paper-100 px-3.5 py-3 text-[13px] text-paper-500">
            Party size · 2
          </div>
          <div className="mt-auto rounded-[10px] bg-brand-accent py-3.5 text-center text-sm font-medium text-brand-on-accent">
            Check in
          </div>
        </div>
      </div>

      {/* QR chip */}
      <div
        className="absolute left-5 top-10 w-[120px] rounded-xl border border-paper-200 bg-white p-3 shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]"
        style={{ transform: 'rotate(-4deg)' }}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-ink">
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${(i % 8) * 12.5}%`,
                top: `${Math.floor(i / 8) * 12.5}%`,
                width: '12.5%',
                height: '12.5%',
                background: (i * 7 + 3) % 3 === 0 ? '#fff' : 'transparent',
              }}
            />
          ))}
          {[
            [0, 0],
            [0, 6],
            [6, 0],
          ].map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x * 12.5}%`,
                top: `${y * 12.5}%`,
                width: '25%',
                height: '25%',
                background: '#fff',
                border: '3px solid #1a1714',
              }}
            />
          ))}
        </div>
        <div className="eyebrow mt-2 text-center text-[10px]">Scan to check in</div>
      </div>

      {/* Live indicator */}
      <div className="absolute right-2.5 top-[60px] flex items-center gap-2 rounded-full border border-paper-200 bg-white px-3 py-1.5 text-[11px] shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
        <span className="text-paper-600">3 checked in · last 10m</span>
      </div>
    </div>
  );
}

/* ---------- Pricing ---------- */
function MkPricing() {
  type Plan = {
    name: string;
    price: string;
    tag: string;
    blurb: string;
    features: string[];
    highlight?: boolean;
  };
  const plans: Plan[] = [
    {
      name: 'Free',
      price: '$0',
      tag: 'Forever free',
      blurb: 'For small spaces just getting started.',
      features: [
        '50 contacts',
        '4 events / month',
        'Public booking page',
        'Visit register & export',
      ],
    },
    {
      name: 'Starter',
      price: '$8',
      tag: 'For growing calendars',
      blurb: 'Room for a busier season and the forms to go with it.',
      features: [
        '250 contacts',
        '10 events / month',
        '1,200 visits / month',
        'Custom form fields',
      ],
    },
    {
      name: 'Growth',
      price: '$18',
      tag: 'Most organizations',
      blurb: 'Everything a small org actually needs.',
      features: [
        '1,000 contacts',
        '50 events / month',
        '5,000 visits / month',
        'Email verification',
        'Payment processor integration',
      ],
      highlight: true,
    },
    {
      name: 'Professional',
      price: '$36',
      tag: 'For larger operations',
      blurb: 'More headroom, priority when you need it.',
      features: [
        '5,000 contacts',
        '100 events / month',
        '20,000 visits / month',
        'Email verification',
        'Payment processor integration',
        'Priority support',
      ],
    },
  ];
  return (
    <section className="border-t border-paper-200 bg-paper-100 px-6 py-20 sm:px-12" id="pricing">
      <div className="mx-auto max-w-[1280px]">
        <h2
          className="font-display max-w-[22ch]"
          style={{
            fontSize: 'clamp(32px, 3.6vw, 52px)',
            letterSpacing: '-0.03em',
            fontWeight: 380,
          }}
        >
          One flat rate. Built for the <span className="italic">whole organization.</span>
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                p.highlight
                  ? 'border-brand-accent shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]'
                  : 'border-paper-200 shadow-[0_1px_0_rgb(0_0_0/0.025)]'
              }`}
            >
              {p.highlight && (
                <div className="eyebrow absolute -top-[11px] left-6 rounded-full bg-brand-accent px-2.5 py-0.5 text-[10px] text-brand-on-accent">
                  {p.tag}
                </div>
              )}
              <div className="font-display" style={{ fontSize: 24, letterSpacing: '-0.02em', fontWeight: 450 }}>
                {p.name}
              </div>
              <div className="mt-2 min-h-[40px] text-[13px] text-paper-600">{p.blurb}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display" style={{ fontSize: 44, letterSpacing: '-0.03em', fontWeight: 400 }}>
                  {p.price}
                </span>
                {p.price.startsWith('$') && p.price !== '$0' && (
                  <span className="text-[13px] text-paper-500">/ month</span>
                )}
              </div>
              <ul className="mt-5 grid flex-1 list-none gap-2.5 p-0 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-brand-accent">
                      <CheckIcon />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-6 block w-full rounded-md px-4 py-2 text-center text-sm font-medium transition ${
                  p.highlight
                    ? 'bg-brand-accent text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] hover:bg-brand-accent/90'
                    : 'border border-paper-300 bg-white text-paper-800 hover:border-paper-400 hover:bg-paper-50'
                }`}
              >
                Start free
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-paper-200 bg-white px-6 py-5 text-[14px] text-paper-700 sm:flex-row sm:items-center">
          <div>
            <span className="font-display text-[16px] tracking-tight-er text-ink">Prefer to self-host?</span>
            <span className="ml-2 text-paper-600">
              Every feature, free forever. You bring the server; we bring the code.
            </span>
          </div>
          <a
            href="https://github.com/rosematcha/butterbook"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-accent hover:underline"
          >
            View on GitHub <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
function MkFAQ() {
  const qs: Array<[string, string]> = [
    [
      'Do my visitors need to create accounts?',
      'Never. Booking and check-in are open. Visitors fill in the fields you\u2019ve chosen and that\u2019s it.',
    ],
    [
      'What if my time slots get too busy?',
      'Butterbook shows a soft warning when a slot is getting full and suggests quieter times nearby. No one gets locked out.',
    ],
    [
      'Can I call it something other than a "visit"?',
      'Yes. Each org configures its own language: visits, appointments, sessions, reservations. The UI follows.',
    ],
    [
      'Can I export everything?',
      'Yes. Clean CSV for your records, and a full JSON export of your org\u2019s data anytime. No support tickets, no waiting.',
    ],
    [
      'Is my data private?',
      'PII is redactable per field. The audit log is append-only. Your data lives in the region you choose.',
    ],
    [
      'What if I already have a website?',
      'The booking page lives at your Butterbook subdomain and can be linked or embedded from anywhere. A WordPress plugin is on the roadmap.',
    ],
    [
      'Does Butterbook have any AI features?',
      'No, by design. Butterbook is a record-keeping and scheduling tool. Nothing in it tries to predict your visitors or optimize your capacity.',
    ],
  ];
  return (
    <section className="mx-auto max-w-[960px] px-6 py-[120px] sm:px-12" id="faq">
      <h2
        className="font-display mb-10"
        style={{
          fontSize: 'clamp(32px, 3.6vw, 52px)',
          letterSpacing: '-0.03em',
          fontWeight: 380,
        }}
      >
        What people ask.
      </h2>
      <div>
        {qs.map(([q, a]) => (
          <details key={q} className="group border-t border-paper-200 py-[22px]">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 font-display text-xl tracking-tight-er">
              {q}
              <span className="text-2xl leading-none text-paper-500 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3.5 max-w-[60ch] text-base leading-relaxed text-paper-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function MkFooter() {
  const cols: Array<[string, string[]]> = [
    ['Product', ['Today', 'Register', 'Kiosk', 'Form builder']],
    ['For', ['Museums', 'Studios', 'Solo practitioners', 'Community spaces']],
    ['Company', ['About', 'Changelog', 'Privacy', 'Terms']],
    ['Support', ['Docs', 'Status', 'Contact', 'Email us']],
  ];
  return (
    <footer className="border-t border-paper-200 bg-paper-100 px-6 pb-10 pt-20 sm:px-12">
      <div className="mx-auto grid max-w-[1280px] gap-12 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div>
          <Wordmark size={20} />
          <p className="mt-4 max-w-[30ch] text-[13px] text-paper-600">
            Reservation software for places that know their guests by name.
          </p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <div className="eyebrow mb-3.5">{title}</div>
            <ul className="grid list-none gap-2 p-0 text-sm text-paper-600">
              {links.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-[1280px] flex-col justify-between gap-2 border-t border-paper-200 pt-6 text-xs text-paper-500 md:flex-row">
        <span>© {new Date().getFullYear()} Butterbook. All rights reserved.</span>
        <span>Built for small organizations.</span>
      </div>
    </footer>
  );
}

/* ---------- Icons ---------- */
function ArrowIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

// Re-export type for TS happiness
export type _Placeholder = ReactNode;
