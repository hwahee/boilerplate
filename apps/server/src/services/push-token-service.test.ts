import { beforeEach, describe, expect, test } from 'bun:test';

import { createMemoryPushTokenRepository, MemoryStore } from '../repositories/memory';
import type { DevicePushToken } from '../repositories/types';
import type { PushMessage, PushSender } from '../push/types';
import { PushTokenService } from './push-token-service';

let store: MemoryStore;
let sent: { tokens: readonly DevicePushToken[]; message: PushMessage }[];

const recordingSender: PushSender = {
  driver: 'recording',
  send(tokens, message) {
    sent.push({ tokens, message });
    return Promise.resolve(tokens.map(({ token }) => ({ token, ok: true })));
  },
};

function makeService(): PushTokenService {
  return new PushTokenService({
    tokens: createMemoryPushTokenRepository(store),
    sender: recordingSender,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  sent = [];
});

describe('PushTokenService', () => {
  test('register upserts idempotently (same token, refreshed metadata)', async () => {
    const service = makeService();
    await service.register({ token: 'tok-1', platform: 'ios', appVersion: '1.0.0' });
    await service.register({ token: 'tok-1', platform: 'ios', appVersion: '1.1.0' });

    expect(store.pushTokens.size).toBe(1);
    expect(store.pushTokens.get('tok-1')?.appVersion).toBe('1.1.0');
  });

  test('unregister removes the token and is a no-op for unknown tokens', async () => {
    const service = makeService();
    await service.register({ token: 'tok-1', platform: 'android' });
    expect(await service.unregister('tok-1')).toBe(true);
    expect(await service.unregister('tok-1')).toBe(false);
    expect(store.pushTokens.size).toBe(0);
  });

  test('broadcast sends ONE batched call covering every registered device', async () => {
    const service = makeService();
    await service.register({ token: 'tok-1', platform: 'ios' });
    await service.register({ token: 'tok-2', platform: 'android' });

    const receipts = await service.broadcast({ title: 'Hello', body: 'World' });

    expect(sent).toHaveLength(1); // batched — never one provider call per token
    expect(sent[0]!.tokens.map((t) => t.token).sort()).toEqual(['tok-1', 'tok-2']);
    expect(receipts.every((receipt) => receipt.ok)).toBe(true);
  });

  test('broadcast with no registered devices skips the provider entirely', async () => {
    const receipts = await makeService().broadcast({ title: 'Hi', body: 'Nobody' });
    expect(receipts).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});
