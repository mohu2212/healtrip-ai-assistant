import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Validates and parses a request part (body / query / params) against a zod schema.
 * The schemas live in `@healtrip/shared`, so the API and the web client share one contract.
 * The error lists the failing paths but never echoes the input — it can contain patient text.
 *
 * Usage: `@Body(new ZodValidationPipe(SendMessageSchema)) body: SendMessage`
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw AppError.validation(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
}
