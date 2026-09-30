import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, type ErrorCode, type ErrorResponseBody } from '../errors/app-error.js';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Messages for errors raised by the framework/middleware (not by our code). Application code
 * throws `AppError` with a deliberate, client-safe message; anything else gets a stable message
 * here so parser/internal wording never reaches clients.
 */
const SAFE_MESSAGE_BY_CODE: Partial<Record<ErrorCode, string>> = {
  BAD_REQUEST: 'Malformed request',
  NOT_FOUND: 'Resource not found',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  RATE_LIMITED: 'Too many requests, please slow down',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again shortly.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorResponseBody['error']['details'];
}

/**
 * The single place that turns *any* thrown value into the public error contract.
 * - Known errors keep a client-safe message; unknown errors become a generic 500.
 * - Internal details (stack, SQL, provider messages) are logged, never returned.
 * - Every error carries the request ID so a user report can be matched to server logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string | number }>();
    const res = http.getResponse<Response>();

    const { status, code, message, details } = this.normalize(exception);
    const requestId = req.id === undefined ? undefined : String(req.id);

    const logContext = {
      requestId,
      code,
      status,
      method: req.method,
      path: req.originalUrl.split('?')[0],
    };
    if (status >= 500) {
      this.logger.error({ ...logContext, err: exception }, 'Unhandled error');
    } else {
      this.logger.warn(logContext, message);
    }

    const body: ErrorResponseBody = {
      error: { code, message, ...(details?.length ? { details } : {}), requestId },
    };
    res.status(status).json(body);
  }

  normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
      const message =
        SAFE_MESSAGE_BY_CODE[code] ??
        (status >= 500 ? SAFE_MESSAGE_BY_CODE.INTERNAL_ERROR! : exception.message);
      return { status, code, message };
    }

    // http-errors raised by Express middleware (e.g. body-parser: 413 too large, 415 charset).
    if (isHttpErrorLike(exception)) {
      const code = CODE_BY_STATUS[exception.status] ?? 'BAD_REQUEST';
      return {
        status: exception.status,
        code,
        message: SAFE_MESSAGE_BY_CODE[code] ?? SAFE_MESSAGE_BY_CODE.BAD_REQUEST!,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: SAFE_MESSAGE_BY_CODE.NOT_FOUND!,
        };
      }
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Resource already exists',
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: SAFE_MESSAGE_BY_CODE.INTERNAL_ERROR!,
    };
  }
}

function isHttpErrorLike(e: unknown): e is { status: number } {
  if (typeof e !== 'object' || e === null) return false;
  const status = (e as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 && 'expose' in e;
}
