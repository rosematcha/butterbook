import { MARKETING_URL } from '../../lib/env';
import { SubPageShell } from '../components/sub-page';
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
    caps: ['Unlimited contacts', '200 appointments / month', '4 events / month'],
    features: ['Public booking page', 'Kiosk check-in', 'Waitlists', 'Reports & CSV'],
  },
  {
    name: 'Starter',
    price: '$8',
    tag: 'For growing calendars',
    blurb: 'Room for a busier season and the forms to go with it.',
    caps: ['Unlimited contacts', '1,500 appointments / month', '15 events / month'],
    features: ['Everything in Free', 'Custom form fields', 'Custom branding'],
  },
  {
    name: 'Growth',
    price: '$18',
    tag: 'Most organizations',
    blurb: 'Verified bookings, paid event tickets, and the volume for both.',
    caps: ['Unlimited contacts', '6,000 appointments / month', '50 events / month'],
    features: ['Everything in Starter', 'Email verification', 'Event ticket payments'],
    accent: true,
  },
  {
    name: 'Professional',
    price: '$36',
    tag: 'For larger operations',
    blurb: 'Memberships, promo codes, and member-only events.',
    caps: ['Unlimited contacts', '25,000 appointments / month', '150 events / month'],
    features: ['Everything in Growth', 'Visitor memberships & subscriptions', 'Priority support'],
  },
];

type MatrixVal = string | boolean;

const MATRIX: { label: string; vals: MatrixVal[] }[] = [
  { label: 'Contacts', vals: ['Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'Appointments / month', vals: ['200', '1,500', '6,000', '25,000'] },
  { label: 'Events / month', vals: ['4', '15', '50', '150'] },
  { label: 'Kiosk & QR check-in', vals: [true, true, true, true] },
  { label: 'Events & registration', vals: [true, true, true, true] },
  { label: 'Waitlists', vals: [true, true, true, true] },
  { label: 'Reports & CSV export', vals: [true, true, true, true] },
  { label: 'Audit log', vals: [true, true, true, true] },
  { label: 'Visitor self-serve links', vals: [true, true, true, true] },
  { label: 'Unlimited team seats', vals: [true, true, true, true] },
  { label: 'Custom forms', vals: [false, true, true, true] },
  { label: 'Custom branding', vals: [false, true, true, true] },
  { label: 'Email verification', vals: [false, false, true, true] },
  { label: 'Event ticket payments', vals: [false, false, true, true] },
  { label: 'Visitor memberships & subscriptions', vals: [false, false, false, true] },
  { label: 'Promo codes & guest passes', vals: [false, false, false, true] },
  { label: 'Member-only events', vals: [false, false, false, true] },
  { label: 'Priority support', vals: [false, false, false, true] },
];

const FAQ_ITEMS = [
  {
    q: 'Can I switch plans later?',
    a: 'Yes, any time. Move up or down from your account settings. Changes take effect at the start of your next billing cycle. No penalties.',
  },
  {
    q: 'What counts toward the appointment and event caps?',
    a: 'Every booking counts as one appointment, including event registrations and visitor self-serve bookings. Cancellations and no-shows still count for the month they happened. The events cap counts published events: every event you put on the calendar in a given month, regardless of how many people register for it.',
  },
  {
    q: 'When do the monthly caps reset?',
    a: 'On the first of each calendar month, in your organization\'s timezone. Counts are not cumulative; last month\'s appointments don\'t carry over.',
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
];

export default function PricingPage() {
  return (
    <SubPageShell
      breadcrumb={[{ label: 'Butterbook', href: MARKETING_URL }, { label: 'Pricing' }]}
      title={
        <>
          Priced for<br />
          <em>organizations</em>.
        </>
      }
      subtitle="One rate per organization. The bill doesn't change when you sell more tickets or add more staff."
    >
      {/* Plan cards — full-bleed dark band flush against the header */}
      <div className="-mt-12 w-screen ml-[calc(50%-50vw)] border-b border-paper-200 bg-paper-100 sm:-mt-14">
        <div className="mx-auto px-6 py-14 sm:px-12" style={{ maxWidth: 1280 }}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map(p => <PlanCard key={p.name} plan={p} />)}
          </div>
        </div>
      </div>

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
            Add your whole staff, your seasonal volunteers, and your board members. The
            bill is the same on a slow Tuesday as it is on your busiest Saturday.
          </p>
          <p>
            Your visitor data stays with your organization. CSV export and the audit log are
            on every plan, including Free.
          </p>
          <p>
            Kiosk check-in runs on any tablet at the front desk. Visitors reschedule
            themselves with a link in their confirmation email. When someone cancels, the
            next person on the waitlist gets the slot.
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
              {MATRIX.map((row) => (
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
            We&apos;re a small team and we don&apos;t have a formal enterprise plan yet. If
            your volumes exceed Professional, write to us. We&apos;ll work something out.
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

      {/* FAQ — full width */}
      <section className="mt-16 border-t border-paper-200 pt-12">
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
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-accent px-6 py-3.5 text-[15px] font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:-translate-y-px hover:bg-brand-accent/90"
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
          : 'border-paper-200 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]'
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
