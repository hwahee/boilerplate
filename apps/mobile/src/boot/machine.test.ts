import { describe, expect, test } from 'bun:test';

import { DEFAULT_APP_CONFIG, type AppConfig } from '@app/shared/domain/app-config';
import type { UpdateDecision } from '@app/shared/domain/version-policy';

import { bootReducer, INITIAL_BOOT_STATE, type BootEvent, type BootState } from './machine';

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  ...DEFAULT_APP_CONFIG,
  ...overrides,
});

const UP_TO_DATE: UpdateDecision = { kind: 'up-to-date' };
const OPTIONAL: UpdateDecision = {
  kind: 'optional',
  via: 'ota',
  latestVersion: '1.1.0',
  storeUrl: 'https://store.example',
  message: null,
};
const FORCE: UpdateDecision = { kind: 'force', storeUrl: 'https://store.example', message: 'old' };

function run(events: BootEvent[], from: BootState = INITIAL_BOOT_STATE): BootState {
  return events.reduce(bootReducer, from);
}

const loaded = (cfg: AppConfig, decision: UpdateDecision): BootEvent => ({
  type: 'BOOT_DATA_LOADED',
  config: cfg,
  decision,
});

describe('boot machine — loading outcomes', () => {
  test('clean boot: no ad, no update → ready without prompt', () => {
    const state = run([loaded(config(), UP_TO_DATE)]);
    expect(state).toEqual({ phase: 'ready', optionalUpdate: null });
  });

  test('force update blocks everything — even when maintenance/ad are on', () => {
    const cfg = config({
      maintenance: { enabled: true, message: 'down' },
      bootAd: { ...DEFAULT_APP_CONFIG.bootAd, enabled: true },
    });
    const state = run([loaded(cfg, FORCE)]);
    expect(state).toEqual({
      phase: 'force-update',
      storeUrl: 'https://store.example',
      message: 'old',
    });
  });

  test('maintenance (kill switch) beats the ad slot', () => {
    const cfg = config({
      maintenance: { enabled: true, message: null },
      bootAd: { ...DEFAULT_APP_CONFIG.bootAd, enabled: true },
    });
    expect(run([loaded(cfg, UP_TO_DATE)])).toEqual({ phase: 'maintenance', message: null });
  });

  test('boot ad enabled → ad phase, carrying the pending optional update', () => {
    const cfg = config({ bootAd: { ...DEFAULT_APP_CONFIG.bootAd, enabled: true } });
    const state = run([loaded(cfg, OPTIONAL)]);
    expect(state).toMatchObject({ phase: 'ad', status: 'loading', minShowElapsed: false });
  });

  test('optional update, no ad → ready WITH the prompt payload', () => {
    const state = run([loaded(config(), OPTIONAL)]);
    expect(state).toEqual({ phase: 'ready', optionalUpdate: OPTIONAL });
  });

  test('fetch failure fails OPEN into the app (offline cold start)', () => {
    expect(run([{ type: 'BOOT_DATA_FAILED' }])).toEqual({ phase: 'ready', optionalUpdate: null });
  });
});

describe('boot machine — ad phase', () => {
  const adBoot = loaded(
    config({ bootAd: { enabled: true, minShowMs: 1000, timeoutMs: 4000, skippable: true } }),
    OPTIONAL,
  );

  test('happy path: ready → min show elapsed → completed → app (prompt kept)', () => {
    const state = run([
      adBoot,
      { type: 'AD_READY' },
      { type: 'AD_MIN_SHOW_ELAPSED' },
      { type: 'AD_COMPLETED' },
    ]);
    expect(state).toEqual({ phase: 'ready', optionalUpdate: OPTIONAL });
  });

  test('load failure never blocks entry', () => {
    expect(run([adBoot, { type: 'AD_FAILED' }]).phase).toBe('ready');
  });

  test('timeout never blocks entry (slow ad network)', () => {
    expect(run([adBoot, { type: 'AD_TIMEOUT' }]).phase).toBe('ready');
    expect(run([adBoot, { type: 'AD_READY' }, { type: 'AD_TIMEOUT' }]).phase).toBe('ready');
  });

  test('skip works only after the minimum show time', () => {
    const showing = run([adBoot, { type: 'AD_READY' }]);
    expect(bootReducer(showing, { type: 'AD_SKIPPED' })).toBe(showing); // too early

    const skippable = bootReducer(showing, { type: 'AD_MIN_SHOW_ELAPSED' });
    expect(bootReducer(skippable, { type: 'AD_SKIPPED' }).phase).toBe('ready');
  });

  test('skip is refused when the config says non-skippable', () => {
    const nonSkippable = loaded(
      config({ bootAd: { enabled: true, minShowMs: 0, timeoutMs: 4000, skippable: false } }),
      UP_TO_DATE,
    );
    const state = run([
      nonSkippable,
      { type: 'AD_READY' },
      { type: 'AD_MIN_SHOW_ELAPSED' },
      { type: 'AD_SKIPPED' },
    ]);
    expect(state.phase).toBe('ad'); // still showing — completion is the only exit
  });

  test('completion is held until the minimum show time', () => {
    const state = run([adBoot, { type: 'AD_READY' }, { type: 'AD_COMPLETED' }]);
    expect(state.phase).toBe('ad');
  });
});

describe('boot machine — maintenance & terminal states', () => {
  test('maintenance retries back into loading', () => {
    const maintenance = run([
      loaded(config({ maintenance: { enabled: true, message: null } }), UP_TO_DATE),
    ]);
    expect(bootReducer(maintenance, { type: 'RETRY' })).toEqual(INITIAL_BOOT_STATE);
  });

  test('ready and force-update ignore stray events', () => {
    const ready = run([loaded(config(), UP_TO_DATE)]);
    expect(bootReducer(ready, { type: 'AD_FAILED' })).toBe(ready);

    const forced = run([loaded(config(), FORCE)]);
    expect(bootReducer(forced, { type: 'RETRY' })).toBe(forced);
  });

  test('events out of phase are ignored (no invalid transitions)', () => {
    expect(bootReducer(INITIAL_BOOT_STATE, { type: 'AD_READY' })).toBe(INITIAL_BOOT_STATE);
    expect(bootReducer(INITIAL_BOOT_STATE, { type: 'AD_SKIPPED' })).toBe(INITIAL_BOOT_STATE);
  });
});
