import { describe, expect, test } from 'bun:test';

import { negotiateLocale, translate } from './index';

describe('translate', () => {
  test('returns catalog text per locale', () => {
    expect(translate('en', 'todos.title')).toBe('Todos');
    expect(translate('ko', 'todos.title')).toBe('할 일');
  });

  test('interpolates {placeholders}', () => {
    expect(translate('en', 'update.ota.body', { version: '1.4.0' })).toContain('1.4.0');
    expect(translate('ko', 'todos.toggleStatus', { title: '우유 사기', status: '완료' })).toBe(
      '"우유 사기" 항목을 완료 상태로 변경',
    );
  });

  test('leaves unknown placeholders intact', () => {
    expect(translate('en', 'update.ota.body', {})).toContain('{version}');
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
