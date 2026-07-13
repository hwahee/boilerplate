import type { Logger } from '../lib/log';
import type { PushSender } from './types';

/**
 * Dry-run driver: logs what WOULD be sent and reports success for every
 * token. The default driver — the entire push pipeline (registration,
 * broadcast jobs, receipts) is exercisable with zero provider credentials.
 */
export function createDryRunPushSender(log: Logger): PushSender {
  return {
    driver: 'dry-run',
    async send(tokens, message) {
      log.info('push dry-run: would send notification', {
        title: message.title,
        body: message.body,
        data: message.data,
        recipients: tokens.length,
        sample: tokens.slice(0, 3).map((t) => `${t.platform}:${t.token.slice(0, 24)}…`),
      });
      return Promise.resolve(tokens.map(({ token }) => ({ token, ok: true })));
    },
  };
}
