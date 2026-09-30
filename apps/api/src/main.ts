import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { AppConfig, InvalidEnvironmentError, loadEnv } from './config/env.schema.js';

// Local development convenience; in hosting, variables come from the real environment.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  // Fail fast with a readable message before Nest starts (ConfigModule re-uses the same loader).
  loadEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // configured explicitly (with a size limit) in configureApp
    bufferLogs: true,
    abortOnError: false, // throw instead of process.abort() so we can print a clear message
  });
  configureApp(app);
  await app.listen(app.get(AppConfig).port);
}

try {
  await bootstrap();
} catch (error) {
  if (error instanceof InvalidEnvironmentError) {
    console.error(`\n${error.message}\n\nSee apps/api/.env.example.\n`);
  } else {
    console.error('Failed to start the API:', error);
  }
  process.exit(1);
}
