import { describe, expect, test } from 'bun:test';

import { compareSemver, isValidSemver, parseSemver, semverGte, semverLt } from './index';

describe('parseSemver', () => {
  test('parses a plain MAJOR.MINOR.PATCH version', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseSemver('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  test('tolerates surrounding whitespace (header values)', () => {
    expect(parseSemver(' 1.2.3 ')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  test.each(['', '1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-beta.1', '1.2.3+42', '01.2.3', 'a.b.c'])(
    'rejects %j',
    (input) => {
      expect(parseSemver(input)).toBeNull();
      expect(isValidSemver(input)).toBe(false);
    },
  );
});

describe('compareSemver', () => {
  test('orders numerically per segment, not lexicographically', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0); // 10 > 9
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  test('throws on malformed input instead of guessing', () => {
    expect(() => compareSemver('1.2', '1.2.3')).toThrow(TypeError);
    expect(() => compareSemver('1.2.3', 'nope')).toThrow(TypeError);
  });
});

describe('helpers', () => {
  test('semverLt / semverGte', () => {
    expect(semverLt('1.0.0', '1.0.1')).toBe(true);
    expect(semverLt('1.0.1', '1.0.1')).toBe(false);
    expect(semverGte('1.0.1', '1.0.1')).toBe(true);
    expect(semverGte('1.0.0', '1.0.1')).toBe(false);
  });
});
