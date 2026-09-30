import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ text: z.string().trim().min(1).max(10), meta: z.object({ n: z.number() }) }),
  );

  it('returns the parsed (transformed) value', () => {
    expect(pipe.transform({ text: '  hi  ', meta: { n: 1 } })).toEqual({
      text: 'hi',
      meta: { n: 1 },
    });
  });

  it('throws VALIDATION_FAILED with paths, without echoing the input', () => {
    const secret = 'my chest hurts a lot and my name is X';
    let error: unknown;
    try {
      pipe.transform({ text: secret, meta: {} });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe('VALIDATION_FAILED');
    expect(appError.details?.map((d) => d.path)).toEqual(['text', 'meta.n']);
    expect(JSON.stringify(appError.details)).not.toContain(secret);
  });
});
