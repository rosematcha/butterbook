'use client';
import type { NavStepProps } from '../types';

export function StepReview({ state, goTo }: NavStepProps) {
  const validInvites = state.invites.filter((r) => r.email.trim().length > 0);
  const location = [state.address, state.city, state.state, state.zip]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="grid gap-5">
      <div>
        <div className="h-eyebrow">Review</div>
        <p className="mt-1 text-xs text-paper-500">
          Anything here can be edited later. Check the basics and create.
        </p>
      </div>

      <div className="grid gap-3">
        <Row label="Organization" onEdit={() => goTo(0)}>
          <div className="font-medium text-ink">{state.name || <em className="text-paper-400">Unnamed</em>}</div>
          <div className="text-xs text-paper-500">butterbook.app/{state.slug || '—'}</div>
        </Row>

        <Row label="Location" onEdit={() => goTo(1)}>
          <div className="text-sm text-ink">{location || <em className="text-paper-400">No address</em>}</div>
          <div className="text-xs text-paper-500">{state.country} · {state.timezone}</div>
        </Row>

        <Row label="Terminology" onEdit={() => goTo(2)}>
          <div className="text-sm text-ink">
            {state.terminology === 'appointment' ? 'Appointments' : 'Visits'}
            <span className="ml-2 text-xs text-paper-500">
              · {state.timeModel === 'start_end' ? 'Start + end time' : state.timeModel === 'start_only' ? 'Start time only' : 'Untimed / day pass'}
            </span>
          </div>
        </Row>

        <Row label="Branding" onEdit={() => goTo(3)}>
          <div className="flex items-center gap-3 text-sm text-ink">
            {state.accentHex ? (
              <span
                className="inline-block h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: state.accentHex }}
              />
            ) : (
              <span className="text-xs text-paper-400">Default accent</span>
            )}
            {state.logoUrl ? (
              <span className="truncate text-xs text-paper-500">{state.logoUrl}</span>
            ) : (
              <span className="text-xs text-paper-400">No logo</span>
            )}
          </div>
        </Row>

        <Row label="Intake form" onEdit={() => goTo(4)}>
          <div className="text-sm text-ink">
            {state.formFields.length === 0
              ? <em className="text-paper-400">No fields</em>
              : `${state.formFields.length} field${state.formFields.length === 1 ? '' : 's'}: ${state.formFields.map((f) => f.label).join(', ')}`}
          </div>
        </Row>

        <Row label="Invites" onEdit={() => goTo(5)}>
          {validInvites.length === 0 ? (
            <span className="text-xs text-paper-400">None</span>
          ) : (
            <div className="text-sm text-ink">
              {validInvites.map((r) => r.email.trim()).join(', ')}
            </div>
          )}
        </Row>

        <Row label="Data import" onEdit={() => goTo(6)}>
          <div className="text-sm text-ink">
            {state.importIntent === 'acuity'
              ? 'Acuity. We\'ll email when ready.'
              : <em className="text-paper-400">Skipped</em>}
          </div>
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-md border border-paper-200 bg-white p-4">
      <div className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-paper-500">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs text-paper-600 underline underline-offset-2 hover:text-ink"
      >
        Change
      </button>
    </div>
  );
}
