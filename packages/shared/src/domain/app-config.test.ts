import { describe, expect, test } from 'bun:test';

import { appConfigResponseValidator, DEFAULT_APP_CONFIG, parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  test('empty entries → all defaults (app works with zero config rows)', () => {
    expect(parseAppConfig({})).toEqual(DEFAULT_APP_CONFIG);
  });

  test('parses well-formed entries', () => {
    const config = parseAppConfig({
      maintenance: { enabled: true, message: 'Back at 09:00 UTC' },
      noticeBanner: { enabled: true, text: 'v2 is coming', url: 'https://example.com' },
      features: { newTodoComposer: true, experimentalSearch: false },
      bootAd: { enabled: true, minShowMs: 1000, timeoutMs: 3000, skippable: false },
      configPolling: { intervalMs: 30_000 },
    });
    expect(config.maintenance).toEqual({ enabled: true, message: 'Back at 09:00 UTC' });
    expect(config.noticeBanner.text).toBe('v2 is coming');
    expect(config.features.newTodoComposer).toBe(true);
    expect(config.bootAd).toEqual({
      enabled: true,
      minShowMs: 1000,
      timeoutMs: 3000,
      skippable: false,
    });
    expect(config.configPolling.intervalMs).toBe(30_000);
  });

  test('applies nested defaults for omitted optional fields', () => {
    const config = parseAppConfig({ maintenance: { enabled: true }, bootAd: { enabled: true } });
    expect(config.maintenance).toEqual({ enabled: true, message: null });
    expect(config.bootAd).toEqual({
      enabled: true,
      minShowMs: 1500,
      timeoutMs: 4000,
      skippable: true,
    });
  });

  test('a malformed key falls back to ITS default without affecting others', () => {
    const config = parseAppConfig({
      maintenance: 'yes please', // wrong shape
      features: { good: true },
    });
    expect(config.maintenance).toEqual(DEFAULT_APP_CONFIG.maintenance);
    expect(config.features).toEqual({ good: true });
  });

  test('out-of-range ad timings fall back (a typo cannot dead-lock boot)', () => {
    const config = parseAppConfig({
      bootAd: { enabled: true, minShowMs: 999_999, timeoutMs: 3000, skippable: true },
    });
    expect(config.bootAd).toEqual(DEFAULT_APP_CONFIG.bootAd);
  });

  test('unknown keys are ignored (forward compatibility)', () => {
    expect(parseAppConfig({ futureKey: { anything: 1 } })).toEqual(DEFAULT_APP_CONFIG);
  });
});

describe('appConfigResponseValidator', () => {
  test('accepts the wire envelope', () => {
    const result = appConfigResponseValidator.safeParse({
      revision: 3,
      entries: { features: { a: true } },
    });
    expect(result.ok).toBe(true);
  });

  test('rejects a missing/negative revision', () => {
    expect(appConfigResponseValidator.safeParse({ entries: {} }).ok).toBe(false);
    expect(appConfigResponseValidator.safeParse({ revision: -1, entries: {} }).ok).toBe(false);
  });
});
