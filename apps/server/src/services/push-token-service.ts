/**
 * Device push token registry + broadcast sending.
 *
 * Sending goes through the PushSender facade (src/push) — dry-run by default,
 * so the whole pipeline works with zero credentials.
 */
import type { RegisterPushTokenInput } from '@app/shared/domain/push-token';
import { nowUtc } from '@app/shared/time';

import type { PushMessage, PushSendReceipt, PushSender } from '../push/types';
import type { PushTokenRepository } from '../repositories/types';

interface PushTokenServiceDeps {
  tokens: PushTokenRepository;
  sender: PushSender;
}

export class PushTokenService {
  constructor(private readonly deps: PushTokenServiceDeps) {}

  /** Idempotent: re-registering refreshes platform/appVersion/updatedAt. */
  async register(input: RegisterPushTokenInput): Promise<void> {
    const now = nowUtc();
    await this.deps.tokens.upsert({
      token: input.token,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Idempotent: unregistering an unknown token is a no-op. */
  async unregister(token: string): Promise<boolean> {
    return this.deps.tokens.deleteByToken(token);
  }

  /**
   * Sends `message` to every registered device (config-change notices,
   * marketing pushes, …). The sender batches internally — one provider call
   * per chunk, never one per token.
   */
  async broadcast(message: PushMessage): Promise<PushSendReceipt[]> {
    const tokens = await this.deps.tokens.listAll();
    if (tokens.length === 0) return [];
    return this.deps.sender.send(tokens, message);
  }
}
