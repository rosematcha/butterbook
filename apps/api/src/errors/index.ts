import { ERROR_TYPES, type ProblemDetails } from '@butterbook/shared';

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly type: string;
  abstract readonly title: string;
  readonly fields?: Array<{ path: string; message: string }>;

  constructor(message?: string, fields?: Array<{ path: string; message: string }>) {
    super(message);
    if (fields) this.fields = fields;
  }

  toProblem(instance?: string): ProblemDetails {
    const p: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
    };
    if (this.message) p.detail = this.message;
    if (instance) p.instance = instance;
    if (this.fields) p.errors = this.fields;
    return p;
  }
}

export class ValidationError extends AppError {
  readonly status = 422;
  readonly type = ERROR_TYPES.validation_failed;
  readonly title = 'Validation Failed';
}

export class AuthenticationError extends AppError {
  readonly status = 401;
  readonly type = ERROR_TYPES.authentication_required;
  readonly title = 'Authentication Required';
}

export class PermissionError extends AppError {
  readonly status = 403;
  readonly type = ERROR_TYPES.permission_denied;
  readonly title = 'Permission Denied';
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly type = ERROR_TYPES.not_found;
  readonly title = 'Not Found';
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly type = ERROR_TYPES.conflict;
  readonly title = 'Conflict';
}

export class IdempotencyConflictError extends AppError {
  readonly status = 422;
  readonly type = ERROR_TYPES.idempotency_conflict;
  readonly title = 'Idempotency Key Reused With Different Body';
}

export class RateLimitError extends AppError {
  readonly status = 429;
  readonly type = ERROR_TYPES.rate_limit;
  readonly title = 'Too Many Requests';
}

export class CapacityError extends AppError {
  readonly status = 409;
  readonly type = ERROR_TYPES.capacity_exceeded;
  readonly title = 'Event At Capacity';
}

export class AvailabilityError extends AppError {
  readonly status = 409;
  readonly type = ERROR_TYPES.availability_conflict;
  readonly title = 'Time Not Available';
}

export class SuperadminInvariantError extends AppError {
  readonly status = 409;
  readonly type = ERROR_TYPES.superadmin_invariant;
  readonly title = 'Operation Would Leave Org Without A Superadmin';
}

export class SsoRequiredError extends AppError {
  readonly status = 403;
  readonly type = ERROR_TYPES.sso_required;
  readonly title = 'SSO Required';
}

export class InternalError extends AppError {
  readonly status = 500;
  readonly type = ERROR_TYPES.internal;
  readonly title = 'Internal Server Error';
}
