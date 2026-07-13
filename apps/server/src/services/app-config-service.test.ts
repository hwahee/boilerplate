import { beforeEach, describe, expect, test } from 'bun:test';

import { createMemoryPubSub } from '../pubsub/memory';
import { CHANNELS, type PubSub } from '../pubsub/types';
import {
  createMemoryAppConfigRepository,
  createMemoryAuditLogRepository,
  createMemoryUnitOfWork,
  MemoryStore,
} from '../repositories/memory';
import { AppConfigService } from './app-config-service';

let store: MemoryStore;
let events: PubSub;

function makeService(): AppConfigService {
  return new AppConfigService({
    config: createMemoryAppConfigRepository(store),
    auditLogs: createMemoryAuditLogRepository(store),
    uow: createMemoryUnitOfWork(store),
    events,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  events = createMemoryPubSub();
});

describe('AppConfigService', () => {
  test('starts at revision 0 with no entries', async () => {
    expect(await makeService().get()).toEqual({ revision: 0, entries: {} });
  });

  test('set stores the value, bumps the revision and audits', async () => {
    const service = makeService();
    const first = await service.set('maintenance', { enabled: true, message: null });
    expect(first.revision).toBe(1);

    const second = await service.set('features', { newThing: true });
    expect(second.revision).toBe(2);

    const snapshot = await service.get();
    expect(snapshot.revision).toBe(2);
    expect(snapshot.entries).toEqual({
      maintenance: { enabled: true, message: null },
      features: { newThing: true },
    });
    expect(store.auditLogs.map((entry) => entry.action)).toEqual([
      'app-config.set',
      'app-config.set',
    ]);
  });

  test('broadcasts the new revision for the WebSocket push path', async () => {
    const received: unknown[] = [];
    await events.subscribe(CHANNELS.configChanged, (message) => received.push(message));

    await makeService().set('noticeBanner', { enabled: false, text: '', url: null });
    await Bun.sleep(0);

    expect(received).toEqual([{ revision: 1 }]);
  });

  test('overwriting a key keeps a single entry but still bumps the revision', async () => {
    const service = makeService();
    await service.set('features', { a: true });
    await service.set('features', { a: false });
    const snapshot = await service.get();
    expect(snapshot.revision).toBe(2);
    expect(snapshot.entries).toEqual({ features: { a: false } });
  });
});
