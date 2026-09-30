import { z } from 'zod';

const LLM_PROVIDERS = ['anthropic', 'openai', 'mock'] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

const LLM_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type LlmEffort = (typeof LLM_EFFORTS)[number];

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
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default('gpt-5'),
  // Reasoning depth. Set explicitly: Claude Opus 5.5 defaults to `medium` when omitted.
  LLM_EFFORT: z.enum(LLM_EFFORTS).default('medium'),
  // Per-request timeout; the SDKs retry 408/409/429/5xx/connection errors up to LLM_MAX_RETRIES.
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1024).max(64_000).default(16_000),
  // Agent loop limits per patient message (LLM calls, and wall-clock budget).
  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(2).max(12).default(6),
  AGENT_TURN_BUDGET_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  // Chat: per-client messages per minute (each one costs LLM calls), turns per conversation, and
  // how many earlier turns are sent to the model as context.
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  CHAT_MAX_TURNS: z.coerce.number().int().min(1).max(200).default(30),
  CHAT_HISTORY_TURNS: z.coerce.number().int().min(0).max(50).default(10),
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
    readonly effort: LlmEffort;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly maxTokens: number;
    readonly anthropic: { readonly apiKey?: string; readonly model: string };
    readonly openai: { readonly apiKey?: string; readonly model: string };
  };
  abstract readonly agent: { readonly maxIterations: number; readonly turnBudgetMs: number };
  abstract readonly chat: {
    readonly rateLimitPerMinute: number;
    readonly maxTurns: number;
    readonly historyTurns: number;
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
      effort: env.LLM_EFFORT,
      timeoutMs: env.LLM_TIMEOUT_MS,
      maxRetries: env.LLM_MAX_RETRIES,
      maxTokens: env.LLM_MAX_TOKENS,
      anthropic: { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL },
      openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
    },
    agent: { maxIterations: env.AGENT_MAX_ITERATIONS, turnBudgetMs: env.AGENT_TURN_BUDGET_MS },
    chat: {
      rateLimitPerMinute: env.CHAT_RATE_LIMIT_PER_MINUTE,
      maxTurns: env.CHAT_MAX_TURNS,
      historyTurns: env.CHAT_HISTORY_TURNS,
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
