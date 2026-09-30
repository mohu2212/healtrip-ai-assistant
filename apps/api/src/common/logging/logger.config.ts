import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/env.schema.js';
import { getRequestId } from './request-id.js';

/**
 * Structured JSON logs (pretty in development) correlated by request ID.
 *
 * Privacy: request/response bodies are never logged — chat messages can contain health
 * information. Only method, path, status and timing are recorded, and credential-bearing
 * headers are redacted in case a serializer is ever widened.
 */
export function buildLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.nodeEnv === 'test' ? 'silent' : config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
          : undefined,
      // The ID is assigned earlier by requestIdMiddleware; reuse it so logs and responses match.
      genReqId: getRequestId,
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // Health checks are polled by the hosting platform — don't flood the logs.
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    },
  };
}
