import { describe, expect, test } from 'bun:test';

import { negotiateLocale, translate } from './index';

describe('translate', () => {
  test('returns catalog text per locale', () => {
    expect(translate('en', 'todos.title')).toBe('Todos');
    expect(translate('ko', 'todos.title')).toBe('할 일');
  });

  test('interpolates {placeholders}', () => {
    expect(translate('en', 'common.page', { page: 2, totalPages: 5 })).toBe('Page 2 of 5');
    expect(translate('ko', 'common.page', { page: 2, totalPages: 5 })).toBe('5페이지 중 2페이지');
  });

  test('leaves unknown placeholders intact', () => {
    expect(translate('en', 'common.page', { page: 1 })).toBe('Page 1 of {totalPages}');
  });
});

describe('negotiateLocale', () => {
  test('picks the highest-quality supported language', () => {
    expect(negotiateLocale('ko-KR,ko;q=0.9,en-US;q=0.8')).toBe('ko');
    expect(negotiateLocale('en-GB,en;q=0.9')).toBe('en');
    expect(negotiateLocale('fr-FR,ko;q=0.5')).toBe('ko');
  });

  test('falls back to the default locale', () => {
    expect(negotiateLocale(null)).toBe('en');
    expect(negotiateLocale('')).toBe('en');
    expect(negotiateLocale('fr-FR,de;q=0.9')).toBe('en');
  });
});
