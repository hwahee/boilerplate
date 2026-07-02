import { describe, expect, test } from 'bun:test';

import { buildPage, searchParamsToObject } from './pagination';

describe('buildPage', () => {
  test('computes totals and hasNextPage', () => {
    const page = buildPage(['a', 'b'], 5, { page: 1, pageSize: 2 });
    expect(page).toEqual({
      items: ['a', 'b'],
      page: 1,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  test('last page has no next page', () => {
    expect(buildPage(['e'], 5, { page: 3, pageSize: 2 }).hasNextPage).toBe(false);
  });

  test('empty result still reports one page', () => {
    const page = buildPage([], 0, { page: 1, pageSize: 20 });
    expect(page.totalPages).toBe(1);
    expect(page.hasNextPage).toBe(false);
  });
});

describe('searchParamsToObject', () => {
  test('coerces pagination numbers, keeps filters as strings', () => {
    const params = new URLSearchParams('page=2&pageSize=10&status=open&q=milk');
    expect(searchParamsToObject(params)).toEqual({
      page: 2,
      pageSize: 10,
      status: 'open',
      q: 'milk',
    });
  });

  test('non-numeric page stays NaN so validation rejects it', () => {
    const raw = searchParamsToObject(new URLSearchParams('page=abc'));
    expect(Number.isNaN(raw.page)).toBe(true);
  });
});
