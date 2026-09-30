import { InvalidEnvironmentError, loadEnv } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://user:secret-password@db.example.com/healtrip',
  LLM_PROVIDER: 'mock',
};

function problemsOf(source: Record<string, string | undefined>): string[] {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error.problems;
    throw error;
  }
  throw new Error('expected loadEnv to throw');
}

describe('loadEnv', () => {
  it('applies defaults', () => {
    const config = loadEnv(base);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 4000,
      corsOrigins: ['http://localhost:3000'],
      rateLimitPerMinute: 60,
      llm: {
        provider: 'mock',
        effort: 'medium',
        timeoutMs: 60_000,
        maxRetries: 2,
        maxTokens: 16_000,
        dailyTokenBudget: 0,
        anthropic: { model: 'claude-opus-5-5' },
      },
    });
  });

  it('parses a comma-separated CORS allowlist', () => {
    const config = loadEnv({
      ...base,
      CORS_ORIGINS: ' https://app.example.com, http://localhost:3000 ,',
    });
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'http://localhost:3000']);
  });

  it('returns an immutable config', () => {
    const config = loadEnv(base);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.llm.anthropic)).toBe(true);
  });

  it('requires the API key of the selected LLM provider', () => {
    expect(problemsOf({ ...base, LLM_PROVIDER: 'anthropic' })).toEqual([
      'ANTHROPIC_API_KEY: is required when LLM_PROVIDER=anthropic',
    ]);
    expect(problemsOf({ ...base, LLM_PROVIDER: 'openai', OPENAI_API_KEY: '  ' })).toEqual([
      'OPENAI_API_KEY: is required when LLM_PROVIDER=openai',
    ]);
    expect(() =>
      loadEnv({ ...base, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
    ).not.toThrow();
  });

  it('reports every problem at once', () => {
    expect(
      problemsOf({
        LLM_PROVIDER: 'anthropic',
        PORT: 'abc',
        CORS_ORIGINS: 'ftp://x',
        NODE_ENV: 'qa',
      }),
    ).toEqual([
      'NODE_ENV: must be one of: development, test, production',
      'PORT: must be a number',
      'CORS_ORIGINS: must be a valid url',
      'DATABASE_URL: is required',
      'ANTHROPIC_API_KEY: is required when LLM_PROVIDER=anthropic',
    ]);
  });

  it('never includes secret values in error messages', () => {
    const error = (() => {
      try {
        loadEnv({ ...base, DATABASE_URL: 'mysql://user:secret-password@host/db', PORT: '99999' });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error).toBeInstanceOf(InvalidEnvironmentError);
    expect(error!.message).not.toContain('secret-password');
    expect(error!.message).not.toContain('99999');
  });
});
