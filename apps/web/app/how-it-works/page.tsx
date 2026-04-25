// Timeline rail layout. Numbered dots down a left rail tie the five steps
// together; copy sits in the middle column with the visual tucked to the right.

import { MARKETING_URL } from '../../lib/env';
import { SubPageShell } from '../components/sub-page';
import { ClosingCTA, FeaturesStrip, STEPS } from './shared';
import type { Step } from './shared';

export default function HowItWorksPage() {
  return (
    <SubPageShell
      breadcrumb={[{ label: 'Butterbook', href: MARKETING_URL }, { label: 'How it works' }]}
      title="How it works"
      subtitle="Five steps. The first three take an afternoon."
    >
      <div className="mx-auto max-w-[860px]">
        <ol className="relative pl-14">
          <div
            className="absolute left-[18px] top-[18px] bottom-[18px] w-px bg-paper-200"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <StepItem key={s.num} step={s} isLast={i === STEPS.length - 1} />
          ))}
        </ol>
      </div>

      <FeaturesStrip />
      <ClosingCTA marketingUrl={MARKETING_URL} />
    </SubPageShell>
  );
}

function StepItem({ step, isLast }: { step: Step; isLast: boolean }) {
  const { Visual } = step;
  return (
    <li className={`relative ${isLast ? '' : 'pb-14'}`}>
      <div
        className="absolute -left-14 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-paper-200 bg-white font-mono text-[11px] font-semibold text-paper-700 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
        aria-hidden
      >
        {step.num}
      </div>

      <div className="grid items-start gap-8 md:grid-cols-[1fr_280px]">
        <div>
          <h2
            className="font-display mb-3"
            style={{ fontSize: 28, letterSpacing: '-0.028em', fontWeight: 400, lineHeight: 1.12 }}
          >
            {step.title}
          </h2>
          <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-paper-600">{step.body}</p>
        </div>
        <div className="w-full max-w-[280px]">
          <Visual />
        </div>
      </div>
    </li>
  );
}
