'use client';
import { useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { MINIMAL_NAME_FIELD } from '@butterbook/shared';
import { apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import type { StepDef, WizardPatch, WizardState } from './types';
import { isValidSlug } from './use-slug-check';
import { StepName, stepNameCanContinue } from './steps/step-name';
import { StepLocation, stepLocationCanContinue } from './steps/step-location';
import { StepTerminology } from './steps/step-terminology';
import { StepBranding } from './steps/step-branding';
import { StepForm } from './steps/step-form';
import { StepInvite } from './steps/step-invite';
import { StepImport } from './steps/step-import';
import { StepReview } from './steps/step-review';

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function initialState(): WizardState {
  return {
    name: '',
    slug: '',
    slugTouched: false,
    country: 'US',
    address: '',
    zip: '',
    city: '',
    state: '',
    timezone: guessTimezone(),
    terminology: 'visit',
    timeModel: 'start_only',
    timeModelTouched: false,
    logoUrl: '',
    accentHex: null,
    formFields: MINIMAL_NAME_FIELD.map((f) => ({ ...f })),
    invites: [],
    importIntent: null,
  };
}

function reducer(state: WizardState, patch: WizardPatch): WizardState {
  return { ...state, ...patch };
}

const STEPS: StepDef[] = [
  { title: 'Name your org', Component: StepName, canContinue: stepNameCanContinue },
  { title: 'Where you are', Component: StepLocation, canContinue: stepLocationCanContinue },
  { title: 'How you speak', Component: StepTerminology },
  { title: 'Branding', skippable: true, Component: StepBranding },
  { title: 'Intake form', skippable: true, Component: StepForm },
  { title: 'Invite teammates', skippable: true, Component: StepInvite },
  { title: 'Import past data', skippable: true, Component: StepImport },
  { title: 'Review', Component: StepReview },
];

export function WizardShell() {
  const router = useRouter();
  const qc = useQueryClient();
  const { setActiveOrgId, memberships } = useSession();
  const [state, patch] = useReducer(reducer, undefined, initialState);
  const [i, setI] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[i]!;
  const isLast = i === STEPS.length - 1;
  const canContinue = step.canContinue ? step.canContinue(state) : true;

  function goNext() {
    if (!canContinue || submitting) return;
    if (isLast) {
      void submit();
      return;
    }
    setI((x) => Math.min(STEPS.length - 1, x + 1));
  }
  function goBack() {
    setI((x) => Math.max(0, x - 1));
  }
  function goTo(n: number) {
    setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  }
  function skip() {
    setI((x) => Math.min(STEPS.length - 1, x + 1));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Only send slug if it still matches the server-side shape; otherwise let
      // the server derive one from the name (matches legacy behavior).
      const slug = isValidSlug(state.slug) ? state.slug : undefined;

      const res = await apiPost<{ data: { id: string } }>('/api/v1/orgs', {
        name: state.name.trim(),
        ...(slug ? { publicSlug: slug } : {}),
        address: state.address.trim(),
        zip: state.zip.trim(),
        timezone: state.timezone,
        country: state.country,
        ...(state.city.trim() ? { city: state.city.trim() } : {}),
        ...(state.state.trim() ? { state: state.state.trim() } : {}),
        terminology: state.terminology,
        timeModel: state.timeModel,
        formFields: state.formFields,
      });
      const orgId = res.data.id;

      if (state.logoUrl.trim() || state.accentHex) {
        try {
          await apiPatch(`/api/v1/orgs/${orgId}/branding`, {
            ...(state.logoUrl.trim() ? { logoUrl: state.logoUrl.trim() } : {}),
            ...(state.accentHex ? { theme: { accentColor: state.accentHex } } : {}),
          });
        } catch (e) {
          // Non-fatal — user can fix branding later, but surface it in the console.
          console.warn('[wizard] branding patch failed', e);
        }
      }

      // Fan out invites. Failures are warned but don't abort the wizard.
      const validInvites = state.invites
        .map((r) => r.email.trim())
        .filter((e) => e.length > 0);
      if (validInvites.length > 0) {
        const results = await Promise.allSettled(
          validInvites.map((email) =>
            apiPost(`/api/v1/orgs/${orgId}/invitations`, { email, roleIds: [] }),
          ),
        );
        const failed = results
          .map((r, idx) => (r.status === 'rejected' ? { email: validInvites[idx]!, reason: r.reason } : null))
          .filter((x): x is { email: string; reason: unknown } => x !== null);
        if (failed.length > 0) {
          console.warn('[wizard] some invitations failed', failed);
        }
      }

      setActiveOrgId(orgId);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push('/app');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.problem.detail ?? err.problem.title
          : 'Failed to create organization.',
      );
      setSubmitting(false);
    }
  }

  const StepComponent = step.Component;

  return (
    <div className="panel p-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-eyebrow">
            Step {i + 1} of {STEPS.length} · {step.title}
          </div>
          <h1 className="h-display mt-1">Set up your organization</h1>
        </div>
        {memberships.length > 0 ? (
          <Link href="/app" className="btn-ghost">Cancel</Link>
        ) : null}
      </div>

      <div
        className="mt-4 h-1 overflow-hidden rounded-full bg-paper-200"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuenow={i + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        <div
          className="h-full rounded-full bg-brand-accent transition-all"
          style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="mt-7">
        <StepComponent
          state={state}
          patch={patch}
          goNext={goNext}
          goBack={goBack}
          goTo={goTo}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between border-t border-paper-200 pt-5">
        <button
          type="button"
          onClick={goBack}
          className="btn-ghost"
          disabled={i === 0 || submitting}
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {step.skippable ? (
            <button type="button" onClick={skip} className="btn-ghost" disabled={submitting}>
              Skip for now
            </button>
          ) : null}
          <button
            type="button"
            onClick={goNext}
            className="btn-accent"
            disabled={!canContinue || submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Creating…' : isLast ? 'Create organization' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
