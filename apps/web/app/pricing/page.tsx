import { MARKETING_URL } from '../../lib/env';
import { ArrowIcon, SubPageShell } from '../components/sub-page';
import { FAQList } from '../components/faq-list';

type Plan = {
  name: string;
  price: string;
  tag: string;
  blurb: string;
  caps: string[];
  features: string[];
  accent?: boolean;
};

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    tag: 'Try before you pay',
    blurb: 'Poke around, book a few guests, see if it fits.',
    caps: ['10 contacts', '4 events / month', '50 appointments / month'],
    features: ['Public booking page', 'Kiosk check-in', 'Waitlists', 'Reports & CSV'],
  },
  {
    name: 'Starter',
    price: '$8',
    tag: 'For growing calendars',
    blurb: 'Room for a busier season and the forms to go with it.',
    caps: ['250 contacts', '10 events / month', '1,200 appointments / month'],
    features: ['Everything in Free', 'Custom form fields', 'Custom branding'],
  },
  {
    name: 'Growth',
    price: '$18',
    tag: 'Most organizations',
    blurb: 'Everything a small org needs.',
    caps: ['1,000 contacts', '50 events / month', '5,000 appointments / month'],
    features: ['Everything in Starter', 'Email verification', 'Payment processor'],
    accent: true,
  },
  {
    name: 'Professional',
    price: '$36',
    tag: 'For larger operations',
    blurb: 'More headroom, priority when you need it.',
    caps: ['5,000 contacts', '100 events / month', '20,000 appointments / month'],
    features: ['Everything in Growth', 'Priority support'],
  },
];

type MatrixVal = string | boolean;

const MATRIX: { label: string; vals: MatrixVal[] }[] = [
  { label: 'Contacts', vals: ['10', '250', '1,000', '5,000'] },
  { label: 'Events / month', vals: ['4', '10', '50', '100'] },
  { label: 'Appointments / month', vals: ['50', '1,200', '5,000', '20,000'] },
  { label: 'Kiosk & QR check-in', vals: [true, true, true, true] },
  { label: 'Events & registration', vals: [true, true, true, true] },
  { label: 'Waitlists', vals: [true, true, true, true] },
  { label: 'Custom forms', vals: [false, true, true, true] },
  { label: 'Custom branding', vals: [false, true, true, true] },
  { label: 'Reports & CSV export', vals: [true, true, true, true] },
  { label: 'Audit log', vals: [true, true, true, true] },
  { label: 'Visitor self-serve links', vals: [true, true, true, true] },
  { label: 'Unlimited team seats', vals: [true, true, true, true] },
  { label: 'Email verification', vals: [false, false, true, true] },
  { label: 'Payment processor', vals: [false, false, true, true] },
  { label: 'Priority support', vals: [false, false, false, true] },
];

const FLOOR_FEATURES = [
  'Kiosk and QR code check-in',
  'Waitlists on any event',
  'Reports and CSV export',
  'Append-only audit log',
  'Visitor self-serve cancel and reschedule',
  'Unlimited team seats',
];

const FAQ_ITEMS = [
  {
    q: 'Can I switch plans later?',
    a: 'Yes, any time. Move up or down from your account settings. Changes take effect at the start of your next billing cycle. No penalties.',
  },
  {
    q: 'What happens if I go over a monthly cap?',
    a: "We'll tell you when you're approaching a limit. Nothing gets cut off mid-month. Upgrade before the next cycle, or stay on your current plan and wait for the counter to reset.",
  },
  {
    q: 'Do you charge per staff member?',
    a: 'No. Every plan includes unlimited team seats. Add your whole staff, your seasonal volunteers, your board members. The price stays the same.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. CSV export is on every plan, including Free. Your visitor register, appointment history, and form responses are yours to keep.',
  },
  {
    q: 'Is there a setup fee or contract?',
    a: 'Neither. Plans are month-to-month. Cancel from settings any time.',
  },
  {
    q: 'Do you offer a discount for nonprofits or very small museums?',
    a: "Yes. Write to us with a little context about your organization and we'll sort something out.",
  },
];

export default function PricingPage() {
  return (
    <SubPageShell
      breadcrumb={[{ label: 'Butterbook', href: MARKETING_URL }, { label: 'Pricing' }]}
      title={
        <>
          Priced for <em>organizations</em>,<br />
          not platforms.
        </>
      }
      subtitle="One rate per organization. The bill doesn't change when you sell more tickets or add more staff."
    >
      {/* Hero CTAs */}
      <div className="mb-14 flex flex-wrap gap-3">
        <a href={`${MARKETING_URL}/register`} className="btn">Start free</a>
        <a href={`${MARKETING_URL}/demo`} className="btn-ghost">
          Try the demo <ArrowIcon size={14} />
        </a>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map(p => <PlanCard key={p.name} plan={p} />)}
      </div>

      {/* Included in every plan */}
      <section className="mt-16 border-t border-paper-200 pt-12">
        <h2
          className="font-display mb-2"
          style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 380 }}
        >
          Included in every plan
        </h2>
        <p className="mb-8 text-[15px] text-paper-600">Every plan ships with these, from Free up.</p>
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {FLOOR_FEATURES.map(f => (
            <li key={f} className="flex items-baseline gap-2.5 text-[15px] text-paper-700">
              <span className="text-brand-accent" aria-hidden>✓</span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* Why Butterbook? */}
      <section className="mt-16 grid items-start gap-12 border-t border-paper-200 pt-12 lg:grid-cols-[260px_1fr]">
        <h2
          className="font-display"
          style={{ fontSize: 36, letterSpacing: '-0.03em', fontWeight: 380, lineHeight: 1.1 }}
        >
          Why<br />Butterbook?
        </h2>
        <div className="space-y-5 text-[15.5px] leading-relaxed text-paper-600">
          <p>
            Most scheduling tools charge per ticket sold, per seat on your account, or per
            feature unlocked. That works for platforms that want a stake in your revenue. We
            sell software.
          </p>
          <p>
            Nothing here phones home to optimize your capacity or surface insights. Your
            visitor data belongs to your organization. The bill is the same on a slow Tuesday
            as it is on your busiest Saturday of the year.
          </p>
          <p>
            The codebase is open. Self-host and pay us nothing if you prefer. We&apos;d rather
            you pick Butterbook because it fits than because switching would be painful.
          </p>
        </div>
      </section>

      {/* Full comparison matrix */}
      <section className="mt-16 border-t border-paper-200 pt-12">
        <h2
          className="font-display mb-7"
          style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 380 }}
        >
          Full comparison
        </h2>
        <div className="overflow-x-auto rounded-xl border border-paper-200">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-paper-100">
                <th className="w-[38%] border-b border-paper-200 px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-paper-500">
                  Feature
                </th>
                {PLANS.map(p => (
                  <th
                    key={p.name}
                    className={`border-b border-paper-200 px-4 py-3.5 text-center font-display text-[17px] font-normal tracking-tight-er ${
                      p.accent ? 'text-brand-accent' : 'text-ink'
                    }`}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, ri) => (
                <tr key={row.label}>
                  <td className="border-t border-paper-200 px-5 py-3.5 font-medium text-ink">
                    {row.label}
                  </td>
                  {row.vals.map((v, ci) => (
                    <td
                      key={ci}
                      className={`border-t border-paper-200 px-4 py-3.5 text-center ${
                        typeof v === 'boolean'
                          ? v
                            ? 'text-base text-accent-500'
                            : 'text-paper-300'
                          : 'font-mono text-[13px] text-paper-700'
                      } ${PLANS[ci].accent ? 'bg-brand-accent/[0.025]' : ''}`}
                    >
                      {typeof v === 'boolean' ? (v ? '✓' : '—') : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Need more / self-host */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <aside className="rounded-xl border border-paper-200 bg-white p-7">
          <h3
            className="font-display mb-2.5"
            style={{ fontSize: 19, letterSpacing: '-0.02em', fontWeight: 400 }}
          >
            Need more than Professional?
          </h3>
          <p className="mb-4 text-[14.5px] leading-relaxed text-paper-600">
            If you&apos;re running higher volumes, need a custom contract, or want to talk about
            data residency and dedicated support, we&apos;re happy to work something out. No
            sales funnel. Email us.
          </p>
          <a
            href="mailto:hello@butterbook.app"
            className="text-[14px] text-brand-accent underline underline-offset-[3px]"
          >
            Get in touch →
          </a>
        </aside>
        <aside className="rounded-xl border border-paper-200 bg-white p-7">
          <h3
            className="font-display mb-2.5"
            style={{ fontSize: 19, letterSpacing: '-0.02em', fontWeight: 400 }}
          >
            Prefer to self-host?
          </h3>
          <p className="mb-4 text-[14.5px] leading-relaxed text-paper-600">
            Butterbook is open source. Run it on your own infrastructure, keep everything
            on-premises, and pay nothing to us. The codebase is the same one that runs the
            hosted version.
          </p>
          <a
            href="https://github.com/rosematcha/butterbook"
            className="text-[14px] text-brand-accent underline underline-offset-[3px]"
          >
            View on GitHub →
          </a>
        </aside>
      </div>

      {/* Nonprofit note */}
      <section className="mt-5 rounded-xl border border-paper-200 bg-paper-100 px-7 py-6">
        <h3
          className="font-display mb-2"
          style={{ fontSize: 17, letterSpacing: '-0.015em', fontWeight: 450 }}
        >
          Nonprofits and very small museums
        </h3>
        <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-paper-600">
          If your organization is a registered nonprofit, or if you&apos;re a sole curator
          running a very small site, write to us. No discount form to fill out. We work it
          out case by case.{' '}
          <a
            href="mailto:hello@butterbook.app"
            className="text-brand-accent underline underline-offset-[3px]"
          >
            hello@butterbook.app
          </a>
        </p>
      </section>

      {/* FAQ */}
      <section className="mt-16 border-t border-paper-200 pt-12" style={{ maxWidth: 800 }}>
        <h2
          className="font-display mb-2"
          style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 380 }}
        >
          Questions
        </h2>
        <FAQList items={FAQ_ITEMS} closing />
      </section>

      {/* Closing CTA */}
      <section className="mt-16 border-t border-paper-200 pb-4 pt-14 text-center">
        <h2
          className="font-display mb-4"
          style={{ fontSize: 40, letterSpacing: '-0.03em', fontWeight: 380, lineHeight: 1.06 }}
        >
          Start on the free plan.<br />
          <em className="text-brand-accent">Move up when you need to.</em>
        </h2>
        <p className="mb-8 text-[16px] text-paper-600">No credit card. Cancel any time.</p>
        <a
          href={`${MARKETING_URL}/register`}
          className="btn"
          style={{ fontSize: 16, padding: '14px 32px' }}
        >
          Start free
        </a>
      </section>
    </SubPageShell>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 ${
        plan.accent
          ? 'border-brand-accent bg-white shadow-[0_4px_14px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.03)]'
          : 'border-paper-200 bg-paper-50 shadow-[0_1px_0_rgb(0_0_0/0.025)]'
      }`}
    >
      {plan.accent && (
        <div className="absolute -top-[10px] right-5 rounded-full bg-brand-accent px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-brand-on-accent">
          {plan.tag}
        </div>
      )}
      <div
        className="font-display tracking-tight-er"
        style={{ fontSize: 22, fontWeight: 450 }}
      >
        {plan.name}
      </div>
      {!plan.accent && (
        <div className="mt-0.5 text-[12px] text-paper-500">{plan.tag}</div>
      )}
      <div
        className="mt-5 font-display"
        style={{ fontSize: 38, letterSpacing: '-0.03em', fontWeight: 350 }}
      >
        {plan.price}
        <span className="text-[16px] font-normal tracking-normal text-paper-500"> /mo</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-paper-600">{plan.blurb}</p>
      <ul className="mt-5 space-y-2 border-t border-paper-200 pt-4">
        {plan.caps.map(c => (
          <li key={c} className="text-[13px] text-paper-700">{c}</li>
        ))}
        {plan.features.map(f => (
          <li key={f} className="flex items-baseline gap-2 text-[13px]">
            <span className="text-brand-accent" aria-hidden>✓</span>
            <span className="text-paper-700">{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <a
          href={`${MARKETING_URL}/register`}
          className={`${plan.accent ? 'btn' : 'btn-ghost border border-paper-300'} w-full justify-center`}
        >
          {plan.price === '$0' ? 'Start free' : `Choose ${plan.name}`}
        </a>
      </div>
    </div>
  );
}
