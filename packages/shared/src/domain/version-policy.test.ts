import { describe, expect, test } from 'bun:test';

import type { UtcIsoString } from '../time';
import {
  decideUpdate,
  SKIP_REMIND_AFTER_MS,
  upsertVersionPolicyValidator,
  versionPolicyValidator,
  type VersionPolicy,
} from './version-policy';

const policy: VersionPolicy = {
  platform: 'ios',
  minSupportedVersion: '1.2.0',
  latestVersion: '1.4.0',
  updateMode: 'ota',
  storeUrl: 'https://apps.apple.com/app/id0000000000',
  message: null,
  updatedAt: '2026-07-01T00:00:00.000Z' as UtcIsoString,
};

const NOW = 1_800_000_000_000;

describe('decideUpdate', () => {
  test('below minSupportedVersion → force, regardless of skip history', () => {
    const decision = decideUpdate({
      policy,
      appVersion: '1.1.9',
      skip: { version: '1.4.0', skippedAtMs: NOW - 1000 },
      nowMs: NOW,
    });
    expect(decision).toEqual({ kind: 'force', storeUrl: policy.storeUrl, message: null });
  });

  test('behind latestVersion → optional update via the policy mode', () => {
    expect(decideUpdate({ policy, appVersion: '1.3.0', nowMs: NOW })).toEqual({
      kind: 'optional',
      via: 'ota',
      latestVersion: '1.4.0',
      storeUrl: policy.storeUrl,
      message: null,
    });
    expect(
      decideUpdate({ policy: { ...policy, updateMode: 'store' }, appVersion: '1.3.0', nowMs: NOW }),
    ).toMatchObject({ kind: 'optional', via: 'store' });
  });

  test('at (or beyond) latestVersion → up-to-date', () => {
    expect(decideUpdate({ policy, appVersion: '1.4.0', nowMs: NOW }).kind).toBe('up-to-date');
    expect(decideUpdate({ policy, appVersion: '2.0.0', nowMs: NOW }).kind).toBe('up-to-date');
  });

  test('"later" suppresses the SAME version within the remind window', () => {
    const skip = { version: '1.4.0', skippedAtMs: NOW - 1000 };
    expect(decideUpdate({ policy, appVersion: '1.3.0', skip, nowMs: NOW }).kind).toBe('up-to-date');
  });

  test('the prompt returns after the remind window elapses', () => {
    const skip = { version: '1.4.0', skippedAtMs: NOW - SKIP_REMIND_AFTER_MS - 1 };
    expect(decideUpdate({ policy, appVersion: '1.3.0', skip, nowMs: NOW }).kind).toBe('optional');
  });

  test('a NEWER version prompts again even if an older one was skipped', () => {
    const skip = { version: '1.3.5', skippedAtMs: NOW - 1000 };
    expect(decideUpdate({ policy, appVersion: '1.3.0', skip, nowMs: NOW }).kind).toBe('optional');
  });

  test('fails open on an unparsable app version (server 426 gate backstops)', () => {
    expect(decideUpdate({ policy, appVersion: 'garbage', nowMs: NOW }).kind).toBe('up-to-date');
  });
});

describe('versionPolicyValidator', () => {
  test('accepts a valid API response', () => {
    expect(versionPolicyValidator.safeParse({ ...policy }).ok).toBe(true);
  });

  test('rejects malformed versions and unknown platforms/modes', () => {
    expect(versionPolicyValidator.safeParse({ ...policy, latestVersion: '1.4' }).ok).toBe(false);
    expect(versionPolicyValidator.safeParse({ ...policy, platform: 'web' }).ok).toBe(false);
    expect(versionPolicyValidator.safeParse({ ...policy, updateMode: 'magic' }).ok).toBe(false);
  });
});

describe('upsertVersionPolicyValidator', () => {
  const body = {
    minSupportedVersion: '1.2.0',
    latestVersion: '1.4.0',
    updateMode: 'store',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
  };

  test('accepts a valid upsert and defaults message to null', () => {
    expect(upsertVersionPolicyValidator.parse(body)).toEqual({ ...body, message: null } as never);
  });

  test('rejects latestVersion < minSupportedVersion', () => {
    expect(upsertVersionPolicyValidator.safeParse({ ...body, latestVersion: '1.1.0' }).ok).toBe(
      false,
    );
  });

  test('rejects unknown fields (strict body)', () => {
    expect(upsertVersionPolicyValidator.safeParse({ ...body, extra: 1 }).ok).toBe(false);
  });
});
