/**
 * The presence contract, run against every driver: memory always, Redis only
 * when REDIS_URL points at a server (e.g. `docker compose --profile redis up -d`).
 */
import { afterEach, describe, expect, test } from 'bun:test';

import { createMemoryPresenceStore } from './memory';
import { createRedisPresenceStore } from './redis';
import type { PresenceStore } from './types';

const redisUrl = process.env.REDIS_URL;

const drivers: [string, (() => PresenceStore) | undefined][] = [
  ['memory', createMemoryPresenceStore],
  ['redis', redisUrl ? () => createRedisPresenceStore(redisUrl) : undefined],
];

for (const [name, create] of drivers) {
  describe.skipIf(!create)(`presence (${name})`, () => {
    const opened: PresenceStore[] = [];
    // A fresh scope per test keeps runs against a shared Redis apart.
    const scope = () => `test.${crypto.randomUUID()}`;
    const open = () => {
      const store = create!();
      opened.push(store);
      return store;
    };

    afterEach(async () => {
      for (const store of opened.splice(0)) await store.close();
    });

    test('lists who joined, until they leave', async () => {
      const store = open();
      const room = scope();
      await store.join({ scope: room, connectionId: 'c1', info: { name: 'alice' } });
      await store.join({ scope: room, connectionId: 'c2', info: { name: 'bob' } });
      const listed = await store.list(room);
      expect(listed).toHaveLength(2);
      expect(listed).toContainEqual({ name: 'alice' });
      expect(listed).toContainEqual({ name: 'bob' });

      await store.leave(room, 'c1');
      expect(await store.list(room)).toEqual([{ name: 'bob' }]);
    });

    test('scopes are independent', async () => {
      const store = open();
      const [a, b] = [scope(), scope()];
      await store.join({ scope: a, connectionId: 'c1', info: 'in a' });
      expect(await store.list(b)).toEqual([]);
    });

    test('leaving twice, or a connection never joined, is harmless', async () => {
      const store = open();
      const room = scope();
      await store.leave(room, 'nobody');
      await store.join({ scope: room, connectionId: 'c1', info: 1 });
      await store.leave(room, 'c1');
      await store.leave(room, 'c1');
      expect(await store.list(room)).toEqual([]);
    });

    test('refreshing keeps entries listed', async () => {
      const store = open();
      const room = scope();
      const entry = { scope: room, connectionId: 'c1', info: 'still here' };
      await store.join(entry);
      await store.refresh([entry]);
      expect(await store.list(room)).toEqual(['still here']);
    });
  });
}
