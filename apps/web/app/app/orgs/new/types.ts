import type { FormField } from '@butterbook/shared';

export type Terminology = 'appointment' | 'visit';
export type TimeModel = 'start_end' | 'start_only' | 'untimed';

// Single source of truth for wizard state. Lives entirely on the client until
// the final "Create organization" submit — no intermediate server round-trips.
export interface WizardState {
  // Step 1
  name: string;
  slug: string;
  slugTouched: boolean;

  // Step 2
  country: string;
  address: string;
  zip: string;
  city: string;
  state: string;
  timezone: string;

  // Step 3
  terminology: Terminology;
  timeModel: TimeModel;
  timeModelTouched: boolean;

  // Step 4 (branding)
  logoUrl: string;
  accentHex: string | null;

  // Step 5 (intake form)
  formFields: FormField[];

  // Step 6 (invites)
  invites: Array<{ email: string }>;

  // Step 7 — UI-only intent capture. The wizard does not POST this anywhere
  // today; it exists so the import step has something to toggle while the
  // actual importers are still being built. Enabling a source later means
  // wiring a POST in wizard-shell.tsx#submit, not changing this type.
  importIntent: 'acuity' | 'google' | 'square' | 'csv' | null;
}

export type WizardPatch = Partial<WizardState>;

// Most steps only need state + patch. StepName and StepLocation also need the
// nav helpers so they can gate Continue on validity. The shell always passes
// both sets; step components opt in to what they need.
export interface StepProps {
  state: WizardState;
  patch: (p: WizardPatch) => void;
}

export interface NavStepProps extends StepProps {
  goNext: () => void;
  goBack: () => void;
  goTo: (i: number) => void;
}

export interface StepDef {
  title: string;           // shown in chrome eyebrow + review summary
  skippable?: boolean;
  Component: (props: NavStepProps) => JSX.Element;
  // Gate for the Continue button. Undefined = always enabled.
  canContinue?: (s: WizardState) => boolean;
}
