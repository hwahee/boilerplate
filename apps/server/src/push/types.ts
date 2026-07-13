/**
 * Push notification facade — the delivery provider is an implementation
 * detail behind `PushSender`.
 *
 * Drivers (selected by PUSH_DRIVER, see src/push/index.ts):
 *   - `dry-run` — logs every send; the default, works with zero credentials.
 *   - `expo`    — Expo push service (works with `ExponentPushToken[…]`
 *                 tokens; FCM/APNs credentials are managed by EAS).
 *
 * Adding FCM or APNs directly means one new file implementing `PushSender` —
 * no service or route changes.
 */
import type { DevicePushToken } from '../repositories/types';

export interface PushMessage {
  title: string;
  body: string;
  /** Arrives as the notification payload; used for deep-link routing in the app. */
  data?: Record<string, unknown>;
}

export interface PushSendReceipt {
  token: string;
  ok: boolean;
  /** Provider error detail when `ok` is false. */
  detail?: string;
}

export interface PushSender {
  /** Driver name, for logs/diagnostics. */
  readonly driver: string;
  /**
   * Sends one message to many devices. Implementations MUST batch provider
   * calls (never one HTTP call per token) and MUST NOT throw for individual
   * delivery failures — those come back as `ok: false` receipts.
   */
  send(tokens: readonly DevicePushToken[], message: PushMessage): Promise<PushSendReceipt[]>;
}
