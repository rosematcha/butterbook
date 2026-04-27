export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ path: string; message: string }>;
}

export const ERROR_TYPES = {
  validation_failed: 'https://scheduler.app/errors/validation_failed',
  authentication_required: 'https://scheduler.app/errors/authentication_required',
  permission_denied: 'https://scheduler.app/errors/permission_denied',
  not_found: 'https://scheduler.app/errors/not_found',
  conflict: 'https://scheduler.app/errors/conflict',
  idempotency_conflict: 'https://scheduler.app/errors/idempotency_conflict',
  rate_limit: 'https://scheduler.app/errors/rate_limit',
  capacity_exceeded: 'https://scheduler.app/errors/capacity_exceeded',
  availability_conflict: 'https://scheduler.app/errors/availability_conflict',
  superadmin_invariant: 'https://scheduler.app/errors/superadmin_invariant',
  internal: 'https://scheduler.app/errors/internal',
  sso_required: 'https://scheduler.app/errors/sso_required',
} as const;
