'use client';
import type { StepProps } from '../types';

interface ImportOption {
  id: 'acuity' | 'google' | 'square' | 'csv';
  label: string;
  blurb: string;
  status: 'coming-soon' | 'planned';
}

const OPTIONS: ImportOption[] = [
  { id: 'acuity', label: 'Acuity Scheduling', blurb: 'Pull past appointments and client records.', status: 'coming-soon' },
  { id: 'google', label: 'Google Calendar', blurb: 'Import existing events as visits.', status: 'planned' },
  { id: 'square', label: 'Square Appointments', blurb: 'Sync services and bookings.', status: 'planned' },
  { id: 'csv', label: 'Upload CSV', blurb: 'Bring records in from any other system.', status: 'planned' },
];

export function StepImport({ state, patch }: StepProps) {
  return (
    <div className="grid gap-5">
      <div>
        <div className="h-eyebrow">Import past data</div>
        <p className="mt-1 text-xs text-paper-500">
          Bringing history over? Tell us which system you&apos;re coming from and we&apos;ll follow up when the importer is ready.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = state.importIntent === opt.id;
          const enabled = opt.status === 'coming-soon';
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!enabled}
              aria-pressed={selected}
              onClick={() => patch({ importIntent: selected ? null : opt.id })}
              className={`rounded-md border p-4 text-left transition ${
                selected
                  ? 'border-brand-accent bg-brand-accent/5 shadow-[inset_0_0_0_1px_rgb(var(--brand-accent)/0.4)]'
                  : enabled
                  ? 'border-paper-200 bg-white hover:border-paper-300'
                  : 'cursor-not-allowed border-paper-200 bg-paper-50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{opt.label}</span>
                <span className={enabled ? 'badge-accent' : 'badge'}>
                  {enabled ? 'Coming soon' : 'Planned'}
                </span>
              </div>
              <div className="mt-1 text-xs text-paper-600">{opt.blurb}</div>
              {selected ? (
                <div className="mt-2 text-xs text-accent-700">
                  We&apos;ll email you the moment the {opt.label} importer is ready.
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-paper-500">
        Starting fresh? Skip this step — you can import later from Settings.
      </p>
    </div>
  );
}
