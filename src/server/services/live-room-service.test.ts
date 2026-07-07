import { describe, expect, test } from 'bun:test';

import type { ServerMessage } from '@shared/rooms/protocol';
import type { RoomSummary } from '@shared/rooms/room';

import { silentLogger } from '../lib/log';
import { LiveRoomService, type RoomClient } from './live-room-service';

/** Captures every frame the service sends, parsed back into ServerMessages. */
class FakeClient implements RoomClient {
  readonly received: ServerMessage[] = [];

  send(text: string): void {
    this.received.push(JSON.parse(text) as ServerMessage);
  }

  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter(
      (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
    );
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    const matches = this.ofType(type);
    const last = matches[matches.length - 1];
    if (!last) throw new Error(`no ${type} message received`);
    return last;
  }
}

function setup(random: () => number = () => 0) {
  const service = new LiveRoomService({ log: silentLogger, random });
  const room = service.createRoom({ name: '테스트 방', emoji: '🎲' });
  return { service, room };
}

function joinAll(service: LiveRoomService, room: RoomSummary, nicknames: string[]): FakeClient[] {
  return nicknames.map((nickname) => {
    const client = new FakeClient();
    service.join(room.id, nickname, client);
    return client;
  });
}

const stroke = (id: string, x = 0.5) => ({
  id,
  color: '#112233',
  size: 6,
  points: [{ x, y: 0.5 }],
});

describe('rooms and joining', () => {
  test('createRoom/listRooms with live participant counts', () => {
    const { service, room } = setup();
    expect(service.listRooms()).toEqual([{ ...room, participantCount: 0 }]);

    joinAll(service, room, ['철수']);
    expect(service.listRooms()[0]?.participantCount).toBe(1);
    expect(service.hasRoom(room.id)).toBe(true);
    expect(service.hasRoom('nope')).toBe(false);
  });

  test('joining an unknown room throws NotFoundError', () => {
    const { service } = setup();
    expect(() => service.join('nope', '철수', new FakeClient())).toThrow('room not found');
  });

  test('joiner gets a welcome snapshot; the room is notified', () => {
    const { service, room } = setup();
    const [first, second] = joinAll(service, room, ['철수', '영희']);

    const welcome = second?.last('welcome');
    expect(welcome?.room.id).toBe(room.id);
    expect(welcome?.participants.map((p) => p.nickname)).toEqual(['철수', '영희']);
    // The joiner's own system entry is part of the snapshot, not re-broadcast.
    expect(welcome?.chat.map((entry) => entry.kind)).toEqual(['system', 'system']);
    expect(second?.ofType('chat')).toHaveLength(0);

    expect(first?.last('participants').participants).toHaveLength(2);
    const joined = first?.last('chat').entry;
    expect(joined).toMatchObject({ kind: 'system', code: 'joined', params: { nickname: '영희' } });
  });

  test('duplicate nicknames get a numeric suffix', () => {
    const { service, room } = setup();
    const clients = joinAll(service, room, ['철수', '철수', '철수']);
    const welcome = clients[2]?.last('welcome');
    expect(welcome?.participants.map((p) => p.nickname)).toEqual(['철수', '철수 2', '철수 3']);
  });

  test('leaving notifies the room', () => {
    const { service, room } = setup();
    const [stayer, leaver] = joinAll(service, room, ['철수', '영희']);
    service.leave(leaver!);

    expect(stayer?.last('participants').participants.map((p) => p.nickname)).toEqual(['철수']);
    expect(stayer?.last('chat').entry).toMatchObject({ kind: 'system', code: 'left' });
    // A gone client no longer produces anything.
    service.handleMessage(leaver!, JSON.stringify({ type: 'chat', text: 'hi' }));
    expect(stayer?.ofType('chat').some((m) => m.entry.kind === 'user')).toBe(false);
  });
});

describe('chat, dice and reactions', () => {
  test('chat messages reach everyone including the sender', () => {
    const { service, room } = setup();
    const [alice, bob] = joinAll(service, room, ['철수', '영희']);
    service.handleMessage(alice!, JSON.stringify({ type: 'chat', text: '안녕!' }));

    for (const client of [alice, bob]) {
      expect(client?.last('chat').entry).toMatchObject({
        kind: 'user',
        nickname: '철수',
        text: '안녕!',
      });
    }
  });

  test('invalid frames are dropped silently', () => {
    const { service, room } = setup();
    const [alice] = joinAll(service, room, ['철수']);
    const before = alice!.received.length;
    service.handleMessage(alice!, 'not json');
    service.handleMessage(alice!, JSON.stringify({ type: 'chat', text: '' }));
    expect(alice!.received.length).toBe(before);
  });

  test('dice rolls are computed server-side from injected randomness', () => {
    const { service, room } = setup(() => 0.999);
    const [alice] = joinAll(service, room, ['철수']);
    service.handleMessage(alice!, JSON.stringify({ type: 'roll', sides: 20 }));
    expect(alice?.last('chat').entry).toMatchObject({ kind: 'dice', sides: 20, value: 20 });
  });

  test('reactions are broadcast but never stored in chat history', () => {
    const { service, room } = setup();
    const [alice] = joinAll(service, room, ['철수']);
    service.handleMessage(alice!, JSON.stringify({ type: 'reaction', emoji: '🎉' }));
    expect(alice?.last('reaction')).toMatchObject({ nickname: '철수', emoji: '🎉' });

    const late = new FakeClient();
    service.join(room.id, '영희', late);
    expect(late.last('welcome').chat.every((entry) => entry.kind !== 'user')).toBe(true);
  });
});

describe('shared canvas', () => {
  test('strokes fan out to everyone except the sender and land in snapshots', () => {
    const { service, room } = setup();
    const [alice, bob] = joinAll(service, room, ['철수', '영희']);

    service.handleMessage(alice!, JSON.stringify({ type: 'stroke', stroke: stroke('s1', 0.1) }));
    service.handleMessage(alice!, JSON.stringify({ type: 'stroke', stroke: stroke('s1', 0.2) }));

    expect(alice?.ofType('stroke')).toHaveLength(0);
    expect(bob?.ofType('stroke')).toHaveLength(2);

    // Chunks with the same id are merged into one stroke for new joiners.
    const late = new FakeClient();
    service.join(room.id, '민수', late);
    const strokes = late.last('welcome').strokes;
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.points.map((point) => point.x)).toEqual([0.1, 0.2]);
  });

  test('clear wipes the canvas for everyone', () => {
    const { service, room } = setup();
    const [alice, bob] = joinAll(service, room, ['철수', '영희']);
    service.handleMessage(alice!, JSON.stringify({ type: 'stroke', stroke: stroke('s1') }));
    service.handleMessage(bob!, JSON.stringify({ type: 'clear' }));

    expect(alice?.ofType('canvas-cleared')).toHaveLength(1);
    expect(alice?.last('chat').entry).toMatchObject({ kind: 'system', code: 'canvas-cleared' });

    const late = new FakeClient();
    service.join(room.id, '민수', late);
    expect(late.last('welcome').strokes).toHaveLength(0);
  });
});

describe('drawing quiz', () => {
  function startQuiz() {
    const context = setup(() => 0); // word index 0 → QUIZ_WORDS[0] (사과/apple)
    const [drawer, guesser] = joinAll(context.service, context.room, ['출제자', '도전자']);
    context.service.handleMessage(drawer!, JSON.stringify({ type: 'quiz-start' }));
    return { ...context, drawer: drawer!, guesser: guesser! };
  }

  test('starting needs at least two participants', () => {
    const { service, room } = setup();
    const [alone] = joinAll(service, room, ['철수']);
    service.handleMessage(alone!, JSON.stringify({ type: 'quiz-start' }));
    expect(alone?.ofType('quiz')).toHaveLength(0);
  });

  test('only the drawer receives the secret word', () => {
    const { drawer, guesser } = startQuiz();
    expect(drawer.last('quiz-word').word).toBe('사과 (apple)');
    expect(guesser.ofType('quiz-word')).toHaveLength(0);

    const quiz = guesser.last('quiz').quiz;
    expect(quiz).toMatchObject({ drawerNickname: '출제자', wordLength: 2 });
  });

  test('while the quiz runs only the drawer may draw or clear', () => {
    const { service, drawer, guesser } = startQuiz();
    service.handleMessage(guesser, JSON.stringify({ type: 'stroke', stroke: stroke('g1') }));
    expect(drawer.ofType('stroke')).toHaveLength(0);

    service.handleMessage(drawer, JSON.stringify({ type: 'stroke', stroke: stroke('d1') }));
    expect(guesser.ofType('stroke')).toHaveLength(1);
  });

  test('a correct guess scores a point and ends the round', () => {
    const { service, drawer, guesser } = startQuiz();
    service.handleMessage(guesser, JSON.stringify({ type: 'chat', text: 'apple' }));

    expect(drawer.last('chat').entry).toMatchObject({
      kind: 'system',
      code: 'quiz-correct',
      params: { nickname: '도전자', word: '사과 (apple)' },
    });
    const final = drawer.last('quiz');
    expect(final.quiz).toBeNull();
    expect(final.scores).toEqual([{ nickname: '도전자', score: 1 }]);
  });

  test("the drawer's own chat never wins the round", () => {
    const { service, drawer, guesser } = startQuiz();
    service.handleMessage(drawer, JSON.stringify({ type: 'chat', text: '사과' }));
    expect(guesser.ofType('quiz')).toHaveLength(1); // only the start broadcast
  });

  test('skipping reveals the word; a drawer leaving ends the round too', () => {
    const first = startQuiz();
    first.service.handleMessage(first.drawer, JSON.stringify({ type: 'quiz-skip' }));
    expect(first.guesser.last('chat').entry).toMatchObject({
      kind: 'system',
      code: 'quiz-ended',
      params: { word: '사과 (apple)' },
    });
    expect(first.guesser.last('quiz').quiz).toBeNull();

    const second = startQuiz();
    second.service.leave(second.drawer);
    expect(second.guesser.last('quiz').quiz).toBeNull();
    expect(second.guesser.last('chat').entry).toMatchObject({ code: 'quiz-ended' });
  });
});
