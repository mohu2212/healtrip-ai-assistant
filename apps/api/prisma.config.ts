import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load apps/api/.env for local CLI use (Node built-in, no dotenv dependency).
// In CI/hosting, DATABASE_URL comes from the real environment.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not using `env()` on purpose: it throws when unset, and `prisma generate`
    // (run on install/build) must work without a database.
    url: process.env.DATABASE_URL,
  },
});
