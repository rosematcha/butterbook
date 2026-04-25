'use client';

// "Try the demo" info page.
//
// Lives at `butterbook.app/demo` on the marketing build; also reachable at
// `demo.butterbook.app/demo` on the demo build. Layout is identical between
// them — only the primary button's behavior changes (link vs. inline
// provision). All chrome comes from <SubPageShell>, all sampled-data visuals
// come from <MiniApp>, and the accordion matches the marketing homepage via
// <FAQList>. Anything page-specific — launch card, credentials, copy-to-
// clipboard — lives here.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiPost, getToken, setToken } from '../../lib/api';
import { DEMO_URL, IS_DEMO, MARKETING_URL } from '../../lib/env';
import { ArrowIcon, SubPageShell } from '../components/sub-page';
import { FAQList } from '../components/faq-list';
import { MiniApp } from '../components/mini-app';

interface DemoSessionResponse {
  data: { token: string; orgId: string; expiresAt: string };
}

const FAQ_ITEMS = [
  {
    q: 'Does the demo have all the features?',
    a: "Yes. The demo runs the same code as a production Butterbook install. A few mutations are fenced off so one visitor's session can't affect another's: invitations (no real email leaves the instance) and deleting the org (you'd lose your own copy).",
  },
  {
    q: 'How often does data reset?',
    a: "We delete your sandbox after twelve hours of inactivity. Come back later and you’ll land in a fresh copy, reseeded with dates around the day you return.",
  },
  {
    q: 'Can I use it on mobile?',
    a: 'The booking page and kiosk work on any device. The admin interface fits a desktop best, but a tablet handles it.',
  },
  {
    q: 'Is there a time limit while I browse?',
    a: 'No. The twelve-hour clock starts when you stop clicking.',
  },
  {
    q: 'Is any of this data real?',
    a: "None. The Whitman is a fictional museum and the guests are invented. Emails won’t leave the sandbox, but please don’t type real visitor names into the forms.",
  },
];

export default function DemoInfoPage() {
  return (
    <SubPageShell
      breadcrumb={[{ label: 'Butterbook', href: MARKETING_URL }, { label: 'Try the demo' }]}
      title="Try the demo"
      subtitle="A live copy running the latest release. Click around, book a visit, try the kiosk. No signup."
    >
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <LaunchColumn />
        <div className="lg:sticky lg:top-[96px]">
          <MiniApp />
        </div>
      </div>

      <section className="mt-[72px] border-t border-paper-200 pt-10">
        <h2
          className="font-display mb-6"
          style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 380 }}
        >
          Questions about the demo
        </h2>
        <FAQList items={FAQ_ITEMS} closing />
      </section>
    </SubPageShell>
  );
}

/* ---------- Left column: launch button, credentials, feature list ---------- */

function LaunchColumn() {
  return (
    <div>
      <OpenDemoButton />

      <div className="mt-4">
        <Creds />
      </div>

      <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
        Each demo runs in its own instance. Please don&apos;t enter real visitor data anyway.
      </div>

      <ul className="mt-5 grid list-none gap-2.5 p-0 text-[13.5px]">
        {[
          ['Sandbox deletes after twelve hours idle', 'No cleanup on your end.'],
          ['Invitations don’t send', 'No real email leaves this instance.'],
          ['Every page of the real app', 'Same code as production. No fake buttons.'],
        ].map(([title, body]) => (
          <li key={title} className="grid gap-px border-t border-paper-200 pt-2.5">
            <span className="font-medium text-ink">{title}</span>
            <span className="text-paper-500">{body}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7 border-t border-paper-200 pt-6">
        <p className="m-0 text-[14px] leading-relaxed text-paper-600">
          Want to test with your own data?{' '}
          <a
            href={`${MARKETING_URL}/register?ref=demo`}
            className="text-brand-accent underline decoration-brand-accent/40 underline-offset-[3px] hover:decoration-brand-accent"
          >
            Start a free account
          </a>
          . No credit card.
        </p>
      </div>
    </div>
  );
}

/* ---------- Open-demo CTA (prod: link; demo: provisions inline) ---------- */

function OpenDemoButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!IS_DEMO) {
    return (
      <a
        href={DEMO_URL}
        className="flex items-center justify-between rounded-[11px] bg-brand-accent px-[22px] py-[18px] text-[16px] font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:-translate-y-px hover:shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]"
      >
        <span>Open demo</span>
        <ArrowIcon />
      </a>
    );
  }

  async function enterDemo() {
    setError(null);
    setPending(true);
    try {
      if (getToken()) {
        router.push('/app');
        return;
      }
      const res = await apiPost<DemoSessionResponse>('/api/v1/demo/session', {});
      setToken(res.data.token);
      router.push('/app');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('The demo is at capacity right now. Try again in a few minutes.');
      } else {
        setError('Something went wrong opening the demo. Refresh and try again.');
      }
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={enterDemo}
        disabled={pending}
        className="flex w-full items-center justify-between rounded-[11px] bg-brand-accent px-[22px] py-[18px] text-[16px] font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:-translate-y-px hover:shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)] disabled:opacity-60 disabled:hover:translate-y-0"
      >
        <span>{pending ? 'Opening the sandbox…' : 'Open demo'}</span>
        {!pending && <ArrowIcon />}
      </button>
      {error ? (
        <p role="alert" className="mt-3 max-w-[40ch] text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Credentials box with copy-to-clipboard ---------- */

function Creds() {
  const [copied, setCopied] = useState<'e' | 'p' | null>(null);

  function copy(value: string, key: 'e' | 'p') {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  }

  const rows: Array<{ label: string; value: string; key: 'e' | 'p' }> = [
    { label: 'Email', value: 'admin', key: 'e' },
    { label: 'Password', value: 'password', key: 'p' },
  ];

  return (
    <div className="overflow-hidden rounded-[9px] border border-paper-200 bg-white">
      {rows.map((r, i) => (
        <div
          key={r.key}
          className={`flex items-center gap-3 px-3.5 py-2.5 ${
            i < rows.length - 1 ? 'border-b border-paper-200' : ''
          }`}
        >
          <span className="w-[60px] shrink-0 text-[11px] font-semibold text-paper-500">{r.label}</span>
          <code className="flex-1 font-mono text-[13.5px] tracking-[-0.01em] text-ink">{r.value}</code>
          <button
            type="button"
            onClick={() => copy(r.value, r.key)}
            className={`rounded-[5px] border px-2.5 py-[3px] text-[11px] font-medium transition ${
              copied === r.key
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-paper-200 bg-paper-50 text-paper-600 hover:border-paper-300 hover:text-ink'
            }`}
          >
            {copied === r.key ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      ))}
    </div>
  );
}
