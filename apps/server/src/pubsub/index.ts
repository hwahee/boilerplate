import type { ServerConfig } from '../config';
import { createMemoryPubSub } from './memory';
import { createRedisPubSub } from './redis';
import type { PubSub } from './types';

export { CHANNELS, type PubSub } from './types';

/** Driver selection is pure configuration — see PUBSUB_DRIVER in .env.example. */
export function createPubSub(config: ServerConfig): PubSub {
  if (config.pubsubDriver === 'redis') {
    if (!config.redisUrl) throw new Error('REDIS_URL is required when PUBSUB_DRIVER=redis');
    return createRedisPubSub(config.redisUrl);
  }
  return createMemoryPubSub();
}
