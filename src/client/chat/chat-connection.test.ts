import { beforeEach, describe, expect, test } from 'bun:test';

import type { ChatClientFrame, ChatServerFrame } from '@shared/domain/chat';

import { ChatConnection, type RoomListener } from './chat-connection';

/** Just enough of a WebSocket for the connection to drive. */
class FakeSocket {
  readyState = 0;
  sent: ChatClientFrame[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(JSON.parse(data) as ChatClientFrame);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  /** Test side: the server accepted the socket. */
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: ChatServerFrame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

let sockets: FakeSocket[];
let connection: ChatConnection;
const latest = () => sockets.at(-1)!;

function recorder(): RoomListener & { frames: ChatServerFrame[]; drops: number } {
  const listener = {
    frames: [] as ChatServerFrame[],
    drops: 0,
    onFrame: (frame: ChatServerFrame) => listener.frames.push(frame),
    onDisconnect: () => (listener.drops += 1),
  };
  return listener;
}

beforeEach(() => {
  sockets = [];
  connection = new ChatConnection(
    () => 'ws://test/ws/chat?guestId=a1b2c3',
    (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  );
});

describe('ChatConnection', () => {
  test('opens one socket for the first room and joins every watched room once open', () => {
    connection.watch('a', recorder());
    connection.watch('b', recorder());
    expect(sockets).toHaveLength(1);

    latest().open();
    expect(latest().sent).toEqual([
      { type: 'join', roomId: 'a' },
      { type: 'join', roomId: 'b' },
    ]);
  });

  test('routes each frame to its own room', () => {
    const a = recorder();
    const b = recorder();
    connection.watch('a', a);
    connection.watch('b', b);
    latest().open();

    latest().receive({ type: 'joined', roomId: 'b' });
    expect(a.frames).toEqual([]);
    expect(b.frames).toEqual([{ type: 'joined', roomId: 'b' }]);
  });

  test('leaves a room when it is let go, and closes shortly after the last one', async () => {
    const stopA = connection.watch('a', recorder());
    const stopB = connection.watch('b', recorder());
    latest().open();

    stopA();
    expect(latest().sent.at(-1)).toEqual({ type: 'leave', roomId: 'a' });
    expect(latest().closed).toBe(false);
    stopB();
    await Bun.sleep(5); // past the short grace period
    expect(latest().closed).toBe(true);
  });

  test('a room watched again right away keeps the same socket (e.g. StrictMode remount)', async () => {
    const stop = connection.watch('a', recorder());
    stop();
    connection.watch('a', recorder());
    await Bun.sleep(5);
    expect(sockets).toHaveLength(1);
    expect(latest().closed).toBe(false);
  });

  test('reconnect() swaps the socket at once and tells the rooms', () => {
    const room = recorder();
    connection.watch('a', room);
    latest().open();

    connection.reconnect();
    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.closed).toBe(true);
    expect(room.drops).toBe(1);
    latest().open();
    expect(latest().sent).toEqual([{ type: 'join', roomId: 'a' }]);
  });

  test('a dropped socket is reopened after a pause while rooms are watched', async () => {
    const room = recorder();
    connection.watch('a', room);
    latest().open();

    latest().onclose?.();
    expect(room.drops).toBe(1);
    expect(sockets).toHaveLength(1);
    await Bun.sleep(1100); // first retry after 1s
    expect(sockets).toHaveLength(2);
  });
});
