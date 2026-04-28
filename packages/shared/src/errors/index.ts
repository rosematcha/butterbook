export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ path: string; message: string }>;
}

export const ERROR_TYPES = {
  validation_failed: 'https://butterbook.app/errors/validation_failed',
  authentication_required: 'https://butterbook.app/errors/authentication_required',
  permission_denied: 'https://butterbook.app/errors/permission_denied',
  not_found: 'https://butterbook.app/errors/not_found',
  conflict: 'https://butterbook.app/errors/conflict',
  idempotency_conflict: 'https://butterbook.app/errors/idempotency_conflict',
  rate_limit: 'https://butterbook.app/errors/rate_limit',
  capacity_exceeded: 'https://butterbook.app/errors/capacity_exceeded',
  availability_conflict: 'https://butterbook.app/errors/availability_conflict',
  superadmin_invariant: 'https://butterbook.app/errors/superadmin_invariant',
  internal: 'https://butterbook.app/errors/internal',
  sso_required: 'https://butterbook.app/errors/sso_required',
  plan_feature_locked: 'https://butterbook.app/errors/plan-feature-locked',
} as const;
