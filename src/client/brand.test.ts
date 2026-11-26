import { describe, expect, test } from 'bun:test';

import { translate } from '@shared/i18n';

import { brandProblem, LOGO, resolveBrand, TITLE_VISIBLE } from './brand';

const logo = { src: 'x.svg' };

describe('resolveBrand', () => {
  test('shows the tagline while the title is visible', () => {
    expect(resolveBrand('Name', ' Tag ', null, true)).toEqual({
      logo: null,
      title: 'Name',
      titleVisible: true,
      tagline: 'Tag',
    });
  });

  test('hides the tagline with the title but keeps the title text', () => {
    const brand = resolveBrand('Name', 'Tag', logo, false);
    expect(brand.title).toBe('Name');
    expect(brand.tagline).toBe('');
  });
});

describe('brandProblem', () => {
  test('the title is always required', () => {
    expect(brandProblem('  ', logo, true)).not.toBeNull();
    expect(brandProblem('', logo, false)).not.toBeNull();
  });

  test('a hidden title needs a logo', () => {
    expect(brandProblem('Name', null, false)).not.toBeNull();
    expect(brandProblem('Name', logo, false)).toBeNull();
    expect(brandProblem('Name', null, true)).toBeNull();
  });
});

test('the configured brand satisfies the rules in every locale', () => {
  for (const locale of ['en', 'ko'] as const) {
    expect(brandProblem(translate(locale, 'app.title'), LOGO, TITLE_VISIBLE)).toBeNull();
  }
});
