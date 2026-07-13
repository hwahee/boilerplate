import type { ServerConfig } from '../config';
import type { Logger } from '../lib/log';
import { createDryRunPushSender } from './dry-run';
import { createExpoPushSender } from './expo';
import type { PushSender } from './types';

export type { PushSender } from './types';

/** Driver selection is pure configuration — see PUSH_DRIVER in .env.example. */
export function createPushSender(config: ServerConfig, log: Logger): PushSender {
  return config.pushDriver === 'expo' ? createExpoPushSender(log) : createDryRunPushSender(log);
}
