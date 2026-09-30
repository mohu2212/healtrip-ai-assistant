import { HttpStatus } from '@nestjs/common';

/** Stable, machine-readable error codes — part of the public API contract. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Body of every non-2xx response: `{ error: { code, message, details?, requestId } }`. */
export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId?: string;
  };
}

/**
 * Domain error thrown by application code. `message` must be safe to show to API clients;
 * put anything sensitive in `cause` (logged server-side only).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: HttpStatus,
    readonly details?: ErrorDetail[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }

  static notFound(what: string) {
    return new AppError('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
  }

  static validation(details: ErrorDetail[]) {
    return new AppError(
      'VALIDATION_FAILED',
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
