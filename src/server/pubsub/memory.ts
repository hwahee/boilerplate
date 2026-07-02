import type { PubSub, PubSubHandler } from './types';

/**
 * Single-process pub/sub. Messages are JSON round-tripped so that anything
 * that would break under Redis (functions, class instances, cycles) also
 * breaks here — keeping the two drivers behaviorally interchangeable.
 */
export function createMemoryPubSub(): PubSub {
  const handlers = new Map<string, Set<PubSubHandler>>();
  let closed = false;

  return {
    async publish(channel, message) {
      if (closed) return;
      const serialized = JSON.stringify(message ?? null);
      const subscribers = handlers.get(channel);
      if (!subscribers) return;
      for (const handler of subscribers) {
        // Deliver asynchronously, like a real broker would.
        queueMicrotask(() => handler(JSON.parse(serialized)));
      }
      return Promise.resolve();
    },

    async subscribe(channel, handler) {
      let subscribers = handlers.get(channel);
      if (!subscribers) {
        subscribers = new Set();
        handlers.set(channel, subscribers);
      }
      subscribers.add(handler);
      return Promise.resolve(async () => {
        subscribers.delete(handler);
        return Promise.resolve();
      });
    },

    async close() {
      closed = true;
      handlers.clear();
      return Promise.resolve();
    },
  };
}
