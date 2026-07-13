import { describe, expect, test } from 'bun:test';

import { s, toValidator, ValidationError } from './index';

const validator = toValidator(
  s.strictObject({
    name: s.string().check(s.minLength(1)),
    age: s.optional(s.int().check(s.gte(0))),
  }),
);

describe('validation facade', () => {
  test('parse returns the typed value on success', () => {
    expect(validator.parse({ name: 'Ada', age: 36 })).toEqual({ name: 'Ada', age: 36 });
  });

  test('parse throws ValidationError with library-agnostic issues', () => {
    try {
      validator.parse({ name: '', age: -1 });
      throw new Error('expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issues = (error as ValidationError).issues;
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.map((issue) => issue.path)).toContain('name');
      expect(issues.map((issue) => issue.path)).toContain('age');
      for (const issue of issues) {
        expect(typeof issue.message).toBe('string');
        expect(typeof issue.code).toBe('string');
      }
    }
  });

  test('safeParse never throws', () => {
    const ok = validator.safeParse({ name: 'Ada' });
    expect(ok).toEqual({ ok: true, value: { name: 'Ada' } });

    const bad = validator.safeParse({ name: 42 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]?.path).toBe('name');
  });

  test('nested paths are dotted', () => {
    const nested = toValidator(s.object({ user: s.object({ email: s.string() }) }));
    const result = nested.safeParse({ user: { email: 7 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('user.email');
  });
});
