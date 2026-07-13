import { beforeEach, describe, expect, test } from 'bun:test';

import { NotFoundError } from '../lib/errors';
import { createMemoryPubSub } from '../pubsub/memory';
import { CHANNELS, type PubSub } from '../pubsub/types';
import {
  createMemoryAuditLogRepository,
  createMemoryUnitOfWork,
  createMemoryVersionPolicyRepository,
  MemoryStore,
} from '../repositories/memory';
import { VersionPolicyService } from './version-policy-service';

const INPUT = {
  minSupportedVersion: '1.2.0',
  latestVersion: '1.4.0',
  updateMode: 'ota',
  storeUrl: 'https://apps.apple.com/app/id0000000000',
  message: null,
} as const;

let store: MemoryStore;
let events: PubSub;
let clock: { nowMs: number };

function makeService(cacheTtlMs = 30_000): VersionPolicyService {
  return new VersionPolicyService({
    policies: createMemoryVersionPolicyRepository(store),
    auditLogs: createMemoryAuditLogRepository(store),
    uow: createMemoryUnitOfWork(store),
    events,
    cacheTtlMs,
    nowMs: () => clock.nowMs,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  events = createMemoryPubSub();
  clock = { nowMs: 1_000_000 };
});

describe('VersionPolicyService', () => {
  test('upsert stores the policy, audits it and broadcasts the change', async () => {
    const received: unknown[] = [];
    await events.subscribe(CHANNELS.versionPolicyChanged, (message) => received.push(message));

    const service = makeService();
    const policy = await service.upsert('ios', INPUT);
    await Bun.sleep(0);

    expect(policy).toMatchObject({ platform: 'ios', latestVersion: '1.4.0' });
    expect(store.versionPolicies.get('ios')?.minSupportedVersion).toBe('1.2.0');
    expect(store.auditLogs.map((entry) => entry.action)).toEqual(['version-policy.upserted']);
    expect(received).toEqual([{ platform: 'ios' }]);
  });

  test('getPolicy returns null for unconfigured platforms; requirePolicy throws', async () => {
    const service = makeService();
    expect(await service.getPolicy('android')).toBeNull();
    await expect(service.requirePolicy('android')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('getPolicy caches within the TTL and refreshes after it', async () => {
    const service = makeService(10_000);
    await service.upsert('ios', INPUT);
    expect((await service.getPolicy('ios'))?.latestVersion).toBe('1.4.0');

    // Write behind the service's back — the cache must hide it within the TTL…
    store.versionPolicies.set('ios', {
      ...store.versionPolicies.get('ios')!,
      latestVersion: '9.9.9',
    });
    expect((await service.getPolicy('ios'))?.latestVersion).toBe('1.4.0');

    // …and expose it once the TTL elapses.
    clock.nowMs += 10_001;
    expect((await service.getPolicy('ios'))?.latestVersion).toBe('9.9.9');
  });

  test('upsert invalidates the local cache immediately', async () => {
    const service = makeService(60_000);
    await service.upsert('ios', INPUT);
    await service.getPolicy('ios'); // warm the cache
    await service.upsert('ios', { ...INPUT, latestVersion: '1.5.0' });
    expect((await service.getPolicy('ios'))?.latestVersion).toBe('1.5.0');
  });

  test('invalidate() drops the cache (cross-instance broadcast path)', async () => {
    const service = makeService(60_000);
    await service.upsert('ios', INPUT);
    await service.getPolicy('ios');
    store.versionPolicies.set('ios', {
      ...store.versionPolicies.get('ios')!,
      latestVersion: '2.0.0',
    });
    service.invalidate();
    expect((await service.getPolicy('ios'))?.latestVersion).toBe('2.0.0');
  });
});
