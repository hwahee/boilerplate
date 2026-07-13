import type { Logger } from '../lib/log';
import type { PushSendReceipt, PushSender } from './types';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
}

/**
 * Expo push service driver. Works with `ExponentPushToken[…]` tokens
 * collected via expo-notifications; FCM/APNs credentials live in EAS, not
 * here — the server never holds signing material.
 */
export function createExpoPushSender(log: Logger): PushSender {
  return {
    driver: 'expo',
    async send(tokens, message) {
      const receipts: PushSendReceipt[] = [];

      for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
        const chunk = tokens.slice(i, i + CHUNK_SIZE);
        try {
          const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              chunk.map((t) => ({
                to: t.token,
                title: message.title,
                body: message.body,
                data: message.data,
              })),
            ),
          });
          if (!response.ok) {
            const detail = `expo push HTTP ${response.status}`;
            receipts.push(...chunk.map(({ token }) => ({ token, ok: false, detail })));
            continue;
          }
          const payload = (await response.json()) as { data?: ExpoTicket[] };
          chunk.forEach(({ token }, index) => {
            const ticket = payload.data?.[index];
            receipts.push(
              ticket?.status === 'ok'
                ? { token, ok: true }
                : { token, ok: false, detail: ticket?.message ?? 'no ticket returned' },
            );
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          log.error('expo push chunk failed', { detail, chunkSize: chunk.length });
          receipts.push(...chunk.map(({ token }) => ({ token, ok: false, detail })));
        }
      }

      return receipts;
    },
  };
}
