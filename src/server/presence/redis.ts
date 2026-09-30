import { RedisClient } from 'bun';

import { PRESENCE_TTL_MS, type PresenceEntry, type PresenceStore } from './types';

/** Stored per connection: who it is, and until when it counts as present. */
interface StoredEntry {
  info: unknown;
  expiresAt: number;
}

/**
 * Redis presence via Bun's built-in client: one hash per scope
 * (`presence:<scope>`), one field per connection. Each field carries its own
 * expiry, because a hash field cannot expire by itself; `list` skips and
 * removes expired fields. The hash as a whole expires once nobody refreshes
 * it, so an abandoned scope does not linger.
 */
export function createRedisPresenceStore(redisUrl: string): PresenceStore {
  const client = new RedisClient(redisUrl);
  const keyOf = (scope: string) => `presence:${scope}`;

  async function write({ scope, connectionId, info }: PresenceEntry): Promise<void> {
    const stored: StoredEntry = { info: info ?? null, expiresAt: Date.now() + PRESENCE_TTL_MS };
    await client.hset(keyOf(scope), { [connectionId]: JSON.stringify(stored) });
    await client.pexpire(keyOf(scope), PRESENCE_TTL_MS);
  }

  function parse(value: string): StoredEntry | null {
    try {
      const parsed = JSON.parse(value) as Partial<StoredEntry>;
      return typeof parsed.expiresAt === 'number' ? (parsed as StoredEntry) : null;
    } catch {
      return null;
    }
  }

  return {
    join: write,

    async leave(scope, connectionId) {
      await client.hdel(keyOf(scope), connectionId);
    },

    async list(scope) {
      const fields = (await client.hgetall(keyOf(scope))) ?? {};
      const now = Date.now();
      const present: unknown[] = [];
      const expired: string[] = [];
      for (const [connectionId, value] of Object.entries(fields)) {
        const entry = parse(value);
        if (entry && entry.expiresAt > now) present.push(entry.info);
        else expired.push(connectionId);
      }
      const [first, ...rest] = expired;
      if (first !== undefined) await client.hdel(keyOf(scope), first, ...rest);
      return present;
    },

    async refresh(entries) {
      await Promise.all(entries.map(write));
    },

    async close() {
      client.close();
      return Promise.resolve();
    },
  };
}
