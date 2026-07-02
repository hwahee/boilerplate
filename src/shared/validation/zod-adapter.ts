/**
 * zod/mini adapter for the validation facade.
 *
 * This is the ONLY file in the repository that may import zod (enforced by
 * ESLint `no-restricted-imports`). To swap the schema library:
 *
 *   1. Write a new adapter (e.g. `yup-adapter.ts`) exposing an equivalent
 *      `toValidator` and schema-builder export.
 *   2. Re-point the re-exports in ./index.ts and update the (small, colocated)
 *      schema definition sites.
 *
 * Consumers of `Validator<T>` are untouched by such a swap.
 */
import * as z from 'zod/mini';

import {
  ValidationError,
  type ValidationIssue,
  type ValidationResult,
  type Validator,
} from './core';

/**
 * Schema builder namespace, re-exported under a neutral name so definition
 * sites read `s.object({ … })` rather than being visibly tied to zod.
 */
export { z as s };

/** Minimal structural view of a zod schema — keeps us off zod's internal type names. */
interface ZodLikeSchema<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: readonly ZodLikeIssue[] } };
}

interface ZodLikeIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code?: string;
}

function toIssues(issues: readonly ZodLikeIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code ?? 'invalid',
  }));
}

/** Wraps a zod schema into the library-agnostic {@link Validator} contract. */
export function toValidator<T>(schema: ZodLikeSchema<T>): Validator<T> {
  return {
    parse(input: unknown): T {
      const result = schema.safeParse(input);
      if (!result.success) throw new ValidationError(toIssues(result.error.issues));
      return result.data;
    },
    safeParse(input: unknown): ValidationResult<T> {
      const result = schema.safeParse(input);
      return result.success
        ? { ok: true, value: result.data }
        : { ok: false, issues: toIssues(result.error.issues) };
    },
  };
}
