import { RedisClient } from 'bun';

import type { PubSub, PubSubHandler } from './types';

/**
 * Redis pub/sub via Bun's built-in client (no external package).
 *
 * Two connections are used because a Redis connection in subscriber mode
 * cannot issue regular commands: one for PUBLISH, one for SUBSCRIBE.
 */
export function createRedisPubSub(redisUrl: string): PubSub {
  const publisher = new RedisClient(redisUrl);
  const subscriber = new RedisClient(redisUrl);
  const handlers = new Map<string, Set<PubSubHandler>>();

  return {
    async publish(channel, message) {
      await publisher.publish(channel, JSON.stringify(message ?? null));
    },

    async subscribe(channel, handler) {
      let subscribers = handlers.get(channel);
      if (!subscribers) {
        subscribers = new Set();
        handlers.set(channel, subscribers);
        await subscriber.subscribe(channel, (payload) => {
          const parsed: unknown = JSON.parse(payload);
          for (const subscribed of handlers.get(channel) ?? []) subscribed(parsed);
        });
      }
      subscribers.add(handler);

      return async () => {
        const current = handlers.get(channel);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) {
          handlers.delete(channel);
          await subscriber.unsubscribe(channel);
        }
      };
    },

    async close() {
      handlers.clear();
      publisher.close();
      subscriber.close();
      return Promise.resolve();
    },
  };
}
