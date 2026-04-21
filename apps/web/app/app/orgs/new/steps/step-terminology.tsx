'use client';
import type { StepProps, Terminology, TimeModel } from '../types';

const TERMINOLOGY_OPTIONS: Array<{ value: Terminology; label: string; blurb: string }> = [
  { value: 'visit', label: 'Visits', blurb: 'Casual, open-ended. Good for drop-ins and general admission.' },
  { value: 'appointment', label: 'Appointments', blurb: 'Scheduled, formal. Good for tours, 1:1 meetings, or timed slots.' },
];

const TIME_MODEL_OPTIONS: Array<{ value: TimeModel; label: string; blurb: string }> = [
  { value: 'start_end', label: 'Start + end time', blurb: 'A booking has a definite window, e.g. 2–3 pm.' },
  { value: 'start_only', label: 'Start time only', blurb: 'Visitors arrive at a time; no end defined.' },
  { value: 'untimed', label: 'Untimed / day pass', blurb: 'A booking is for a date, not a specific time.' },
];

export function StepTerminology({ state, patch }: StepProps) {
  function chooseTerminology(t: Terminology) {
    const next: Partial<typeof state> = { terminology: t };
    // If the user hasn't touched the time model, flip it to the default for
    // the selected terminology.
    if (!state.timeModelTouched) {
      next.timeModel = t === 'appointment' ? 'start_end' : 'start_only';
    }
    patch(next);
  }

  return (
    <div className="grid gap-7">
      <section>
        <div className="h-eyebrow">What do you call them?</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {TERMINOLOGY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => chooseTerminology(opt.value)}
              className={`rounded-md border p-4 text-left transition ${
                state.terminology === opt.value
                  ? 'border-brand-accent bg-brand-accent/5 shadow-[inset_0_0_0_1px_rgb(var(--brand-accent)/0.4)]'
                  : 'border-paper-200 bg-white hover:border-paper-300'
              }`}
            >
              <div className="font-medium text-ink">{opt.label}</div>
              <div className="mt-1 text-xs text-paper-600">{opt.blurb}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="h-eyebrow">How do times work?</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TIME_MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => patch({ timeModel: opt.value, timeModelTouched: true })}
              className={`rounded-md border p-4 text-left transition ${
                state.timeModel === opt.value
                  ? 'border-brand-accent bg-brand-accent/5 shadow-[inset_0_0_0_1px_rgb(var(--brand-accent)/0.4)]'
                  : 'border-paper-200 bg-white hover:border-paper-300'
              }`}
            >
              <div className="font-medium text-ink">{opt.label}</div>
              <div className="mt-1 text-xs text-paper-600">{opt.blurb}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-paper-500">
          You can change any of this later from Settings — it&apos;s cosmetic labelling plus a default for new booking forms.
        </p>
      </section>
    </div>
  );
}
