import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/logging/request-id.js';
import { AppConfig } from './config/env.schema.js';

/** Chat messages are short; anything bigger is a mistake or abuse. */
export const JSON_BODY_LIMIT = '16kb';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise exactly the
 * middleware, security headers and error handling that run in production.
 * The app must be created with `{ bodyParser: false, bufferLogs: true }`.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');

  // Render / Vercel sit behind one proxy hop: trust it so rate limiting sees the real client IP.
  app.set('trust proxy', 1);

  // Order matters: request ID → security headers → CORS → body parser.
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}
