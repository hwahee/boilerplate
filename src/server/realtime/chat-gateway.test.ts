/**
 * The gateway's presence bookkeeping, driven with stand-in sockets: the
 * orderings that are hard to provoke over real connections.
 */
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { ChatServerFrame } from '@shared/domain/chat';

import { loadServerConfig } from '../config';
import { createContainer, type Container } from '../container';
import { silentLogger } from '../lib/log';
import { createMemoryPresenceStore } from '../presence/memory';
import type { PresenceStore } from '../presence/types';
import { ChatGateway, type ChatSocketData } from './chat-gateway';

const ROOM = 'room';

let container: Container;
let stop: (() => Promise<void>) | undefined;

beforeEach(async () => {
  container = createContainer(loadServerConfig({ DB_DRIVER: 'memory', AUTH_DRIVER: 'dev' }), {
    log: silentLogger,
  });
  await container.chatService().openRoom({
    id: ROOM,
    policy: { retentionMs: null, backlog: { maxCount: 10, maxAgeMs: null } },
  });
});

afterEach(async () => {
  await stop?.();
  stop = undefined;
  await container.dispose();
});

async function startGateway(presence: PresenceStore): Promise<ChatGateway> {
  const gateway = new ChatGateway({
    config: container.config,
    chat: container.chatService(),
    presence,
    events: container.pubsub(),
    log: silentLogger,
    presenceRefreshMs: 10,
  });
  stop = await gateway.start();
  return gateway;
}

/** A stand-in for Bun's server socket that records what it is sent. */
function fakeSocket(gateway: ChatGateway, guestId: string) {
  const data = gateway.handshake(new Request(`http://test/ws/chat?guestId=${guestId}`));
  if (data instanceof Response) throw new Error('handshake refused');
  const frames: ChatServerFrame[] = [];
  const ws = {
    data,
    send: (text: string) => frames.push(JSON.parse(text) as ChatServerFrame),
    close: () => undefined,
  } as unknown as Bun.ServerWebSocket<ChatSocketData>;
  return {
    ws,
    frames,
    join: () => gateway.message(ws, JSON.stringify({ type: 'join', roomId: ROOM })),
  };
}

test('a change that races a snapshot is sent after it, not lost under it', async () => {
  const memory = createMemoryPresenceStore();
  let release!: () => void;
  const firstListHeld = new Promise<void>((resolve) => (release = resolve));
  let lists = 0;
  const gateway = await startGateway({
    ...memory,
    // The first joiner's snapshot read is slow; the second joins meanwhile.
    list: async (scope) => {
      if (lists++ === 0) await firstListHeld;
      return memory.list(scope);
    },
  });

  const first = fakeSocket(gateway, 'aaaaaa');
  const second = fakeSocket(gateway, 'bbbbbb');
  const firstJoining = first.join();
  await Bun.sleep(5);
  await second.join();
  await Bun.sleep(5);
  release();
  await firstJoining;
  await Bun.sleep(5);

  const snapshotAt = first.frames.findIndex((frame) => frame.type === 'presence');
  const secondArrivedAt = first.frames.findIndex(
    (frame) =>
      frame.type === 'presence-add' && frame.entry.connectionId === second.ws.data.connectionId,
  );
  expect(snapshotAt).toBeGreaterThanOrEqual(0);
  expect(secondArrivedAt).toBeGreaterThan(snapshotAt);
});

test('connections that expired in a room are announced as departures', async () => {
  const memory = createMemoryPresenceStore();
  const expired = ['crashed-instance-connection'];
  const gateway = await startGateway({
    ...memory,
    sweep: () => Promise.resolve(expired.splice(0)),
  });

  const socket = fakeSocket(gateway, 'aaaaaa');
  await socket.join();
  await Bun.sleep(30); // a few heartbeats

  expect(socket.frames).toContainEqual({
    type: 'presence-remove',
    roomId: ROOM,
    connectionId: 'crashed-instance-connection',
  });
});
