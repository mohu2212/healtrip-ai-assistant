import { z } from 'zod';

const LLM_PROVIDERS = ['anthropic', 'openai', 'mock'] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

/** Treat `FOO=` (empty string) the same as unset, so defaults and "required" checks behave. */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((raw) =>
      raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LLM_PROVIDER: z.enum(LLM_PROVIDERS).default('anthropic'),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default('gpt-5'),
});

const REQUIRED_KEY_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  mock: null,
} as const satisfies Record<LlmProviderName, string | null>;

/** Typed, immutable runtime configuration. Injected everywhere via the `AppConfig` class token. */
export abstract class AppConfig {
  abstract readonly nodeEnv: 'development' | 'test' | 'production';
  abstract readonly port: number;
  abstract readonly logLevel: string;
  abstract readonly corsOrigins: readonly string[];
  abstract readonly rateLimitPerMinute: number;
  abstract readonly databaseUrl: string;
  abstract readonly llm: {
    readonly provider: LlmProviderName;
    readonly anthropic: { readonly apiKey?: string; readonly model: string };
    readonly openai: { readonly apiKey?: string; readonly model: string };
  };
}

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Validates the environment once at boot (fail fast). Error messages list variable names and
 * what is wrong — never the values, so secrets can't leak into logs.
 */
export function loadEnv(source: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(source);
  const problems = [
    ...(parsed.success ? [] : parsed.error.issues.map((issue) => describeIssue(issue, source))),
    // Checked on the raw source so it is reported together with any other problem.
    ...missingProviderKey(source),
  ];
  if (!parsed.success || problems.length) throw new InvalidEnvironmentError(problems);

  const env = parsed.data;
  return deepFreeze({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGINS,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    databaseUrl: env.DATABASE_URL,
    llm: {
      provider: env.LLM_PROVIDER,
      anthropic: { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL },
      openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
    },
  });
}

/** Human-readable problem for one variable. Describes the rule, never the received value. */
function describeIssue(
  issue: z.core.$ZodIssue,
  source: Record<string, string | undefined>,
): string {
  const variable = String(issue.path[0] ?? '(root)');
  const isMissing = source[variable] === undefined || source[variable]?.trim() === '';
  const problem = (() => {
    if (isMissing) return 'is required';
    switch (issue.code) {
      case 'invalid_type':
        return `must be a ${issue.expected}`;
      case 'invalid_value':
        return `must be one of: ${issue.values.join(', ')}`;
      case 'invalid_format':
        return `must be a valid ${issue.format}`;
      case 'too_small':
      case 'too_big':
        return 'is out of range';
      default:
        return 'is invalid';
    }
  })();
  return `${variable}: ${problem}`;
}

function missingProviderKey(source: Record<string, string | undefined>): string[] {
  const provider = (source.LLM_PROVIDER?.trim() || 'anthropic') as LlmProviderName;
  const key = REQUIRED_KEY_BY_PROVIDER[provider];
  if (!key || source[key]?.trim()) return [];
  return [`${key}: is required when LLM_PROVIDER=${provider}`];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
