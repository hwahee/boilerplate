import { describe, expect, test } from 'bun:test';

import { readSessionUserId } from './session';

const withCookie = (cookie: string) => new Request('http://localhost/', { headers: { cookie } });

describe('readSessionUserId', () => {
  test('AUTH_DRIVER=dev reads the user id from the session cookie', () => {
    expect(readSessionUserId(withCookie('a=1; session=alice'), { authDriver: 'dev' })).toBe(
      'alice',
    );
  });

  test('no cookie, or a cleared (empty) one, means signed out', () => {
    expect(readSessionUserId(new Request('http://localhost/'), { authDriver: 'dev' })).toBe(
      undefined,
    );
    expect(readSessionUserId(withCookie('session='), { authDriver: 'dev' })).toBe(undefined);
  });

  test('AUTH_DRIVER=none never trusts a session cookie, even a well-formed one', () => {
    expect(readSessionUserId(withCookie('session=alice'), { authDriver: 'none' })).toBe(undefined);
  });
});
