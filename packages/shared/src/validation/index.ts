/**
 * Validation facade — the single import point for schema validation.
 *
 * Usage (definition site):
 *
 *   import { s, toValidator, type Infer } from '@app/shared/validation';
 *   export const createUserValidator = toValidator(
 *     s.object({ name: s.string().check(s.minLength(1)) }),
 *   );
 *   export type CreateUserInput = Infer<typeof createUserValidator>;
 *
 * Usage (consumer site — knows nothing about the underlying library):
 *
 *   const input = createUserValidator.parse(await req.json());
 */
export {
  ValidationError,
  /** @public part of the facade contract, even while unused internally */
  type ValidationIssue,
  /** @public part of the facade contract, even while unused internally */
  type ValidationResult,
  /** @public part of the facade contract, even while unused internally */
  type Validator,
  type Infer,
} from './core';
export { s, toValidator } from './zod-adapter';
