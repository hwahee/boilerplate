import { describe, expect, test } from 'bun:test';

import { translate } from '@shared/i18n';

import { brandProblem, LOGO, resolveBrand } from './brand';

describe('resolveBrand', () => {
  test('keeps the tagline when there is a title', () => {
    expect(resolveBrand('Name', 'Tag', null)).toEqual({
      logo: null,
      title: 'Name',
      tagline: 'Tag',
    });
  });

  test('drops the tagline without a title', () => {
    expect(resolveBrand('  ', 'Tag', { src: 'x.svg', alt: 'Name' }).tagline).toBe('');
  });
});

describe('brandProblem', () => {
  const logo = { src: 'x.svg' };

  test('a title alone, or with a logo, is valid', () => {
    expect(brandProblem('Name', null)).toBeNull();
    expect(brandProblem('Name', logo)).toBeNull();
  });

  test('without a title the logo must exist and carry alt text', () => {
    expect(brandProblem('', null)).not.toBeNull();
    expect(brandProblem('', logo)).not.toBeNull();
    expect(brandProblem('', { ...logo, alt: 'Name' })).toBeNull();
  });
});

test('the configured brand satisfies the rules in every locale', () => {
  for (const locale of ['en', 'ko'] as const) {
    expect(brandProblem(translate(locale, 'app.title'), LOGO)).toBeNull();
  }
});
