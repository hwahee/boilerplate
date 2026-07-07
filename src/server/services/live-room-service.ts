/**
 * Live playrooms — the realtime heart of the rooms feature.
 *
 * Unlike TodoService this service is NOT backed by a repository: a room is a
 * live session (participants, chat, canvas, a running quiz), so its state
 * lives in process memory and its lifetime is the server process. Sockets are
 * held behind the minimal `RoomClient` interface so unit tests can drive the
 * whole protocol with fakes.
 *
 * Documented limitation: room state is per-instance. Running multiple web
 * instances would need sticky sessions or a shared store + pub/sub fan-out
 * (the bus in src/server/pubsub is the starting point for that).
 */
import {
  appendStroke,
  clientMessageValidator,
  type ChatEntry,
  type ClientMessage,
  type QuizPublicState,
  type ScoreEntry,
  type ServerMessage,
  type Stroke,
  type SystemChatCode,
} from '@shared/rooms/protocol';
import {
  formatQuizWord,
  isCorrectGuess,
  QUIZ_WORDS,
  type QuizWord,
} from '@shared/rooms/quiz-words';
import {
  ROOM_LIMITS,
  type CreateRoomInput,
  type Participant,
  type RoomSummary,
} from '@shared/rooms/room';
import { nowUtc } from '@shared/time';

import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/log';

/** The one thing the service needs from a WebSocket — testable with fakes. */
export interface RoomClient {
  send(text: string): void;
}

interface RunningQuiz {
  word: QuizWord;
  drawerId: string;
  drawerNickname: string;
  startedAt: string;
}

interface LiveRoom {
  id: string;
  name: string;
  emoji: RoomSummary['emoji'];
  createdAt: RoomSummary['createdAt'];
  members: Map<RoomClient, Participant>;
  chat: ChatEntry[];
  strokes: Stroke[];
  quiz: RunningQuiz | null;
  /** nickname → points, so a rejoining player keeps their score. */
  scores: Map<string, number>;
}

export interface LiveRoomServiceDeps {
  log: Logger;
  /** Injectable randomness (word pick, dice) so tests are deterministic. */
  random?: () => number;
}

export class LiveRoomService {
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly memberships = new Map<RoomClient, LiveRoom>();
  private readonly log: Logger;
  private readonly random: () => number;

  constructor(deps: LiveRoomServiceDeps) {
    this.log = deps.log;
    this.random = deps.random ?? Math.random;
  }

  createRoom(input: CreateRoomInput): RoomSummary {
    const room: LiveRoom = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      emoji: input.emoji,
      createdAt: nowUtc(),
      members: new Map(),
      chat: [],
      strokes: [],
      quiz: null,
      scores: new Map(),
    };
    this.rooms.set(room.id, room);
    return summarize(room);
  }

  /** Lobby listing, newest room first. */
  listRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summarize);
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Adds the connection to the room: the joiner gets the `welcome` snapshot,
   * everyone else gets the updated participant list + a system chat entry.
   */
  join(roomId: string, requestedNickname: string, client: RoomClient): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundError('room', roomId);

    const participant: Participant = {
      id: crypto.randomUUID(),
      nickname: dedupeNickname(room, requestedNickname.trim()),
    };
    const entry = this.systemEntry('joined', { nickname: participant.nickname });
    this.pushChat(room, entry);

    room.members.set(client, participant);
    this.memberships.set(client, room);

    send(client, {
      type: 'welcome',
      selfId: participant.id,
      room: summarize(room),
      participants: [...room.members.values()],
      chat: room.chat,
      strokes: room.strokes,
      quiz: publicQuiz(room),
      scores: scoreboard(room),
    });
    this.broadcast(
      room,
      { type: 'participants', participants: [...room.members.values()] },
      client,
    );
    this.broadcast(room, { type: 'chat', entry }, client);
  }

  leave(client: RoomClient): void {
    const room = this.memberships.get(client);
    if (!room) return;
    const participant = room.members.get(client);
    this.memberships.delete(client);
    room.members.delete(client);
    if (!participant) return;

    this.announce(room, 'left', { nickname: participant.nickname });
    this.broadcast(room, { type: 'participants', participants: [...room.members.values()] });

    // A round cannot continue without its drawer — reveal the word and end it.
    if (room.quiz?.drawerId === participant.id) this.endQuiz(room);
  }

  /** Entry point for every inbound WebSocket frame from a room member. */
  handleMessage(client: RoomClient, raw: string | Buffer): void {
    const room = this.memberships.get(client);
    const participant = room?.members.get(client);
    if (!room || !participant) return;

    let message: ClientMessage;
    try {
      message = clientMessageValidator.parse(JSON.parse(String(raw)));
    } catch {
      // Out-of-contract frames (buggy or malicious clients) are dropped.
      this.log.warn('dropped invalid room message', { roomId: room.id });
      return;
    }

    switch (message.type) {
      case 'chat':
        return this.onChat(room, participant, message.text);
      case 'stroke':
        return this.onStroke(room, participant, client, message.stroke);
      case 'clear':
        return this.onClear(room, participant);
      case 'reaction':
        return this.broadcast(room, {
          type: 'reaction',
          userId: participant.id,
          nickname: participant.nickname,
          emoji: message.emoji,
        });
      case 'roll':
        return this.onRoll(room, participant, message.sides);
      case 'quiz-start':
        return this.onQuizStart(room, participant, client);
      case 'quiz-skip':
        if (room.quiz?.drawerId === participant.id) this.endQuiz(room);
        return;
    }
  }

  // ── Message handlers ──────────────────────────────────────────────────────

  private onChat(room: LiveRoom, participant: Participant, text: string): void {
    const entry: ChatEntry = {
      id: crypto.randomUUID(),
      at: nowUtc(),
      kind: 'user',
      userId: participant.id,
      nickname: participant.nickname,
      text,
    };
    this.pushChat(room, entry);
    this.broadcast(room, { type: 'chat', entry });

    // Drawing quiz: any non-drawer chat message doubles as a guess.
    const quiz = room.quiz;
    if (!quiz || quiz.drawerId === participant.id || !isCorrectGuess(quiz.word, text)) return;
    room.scores.set(participant.nickname, (room.scores.get(participant.nickname) ?? 0) + 1);
    room.quiz = null;
    this.announce(room, 'quiz-correct', {
      nickname: participant.nickname,
      word: formatQuizWord(quiz.word),
    });
    this.broadcast(room, { type: 'quiz', quiz: null, scores: scoreboard(room) });
  }

  private onStroke(
    room: LiveRoom,
    participant: Participant,
    client: RoomClient,
    stroke: Omit<Stroke, 'userId'>,
  ): void {
    // While a quiz runs, the canvas belongs to the drawer.
    if (room.quiz && room.quiz.drawerId !== participant.id) return;
    const stamped: Stroke = { ...stroke, userId: participant.id };
    appendStroke(room.strokes, { ...stamped, points: [...stamped.points] });
    while (room.strokes.length > ROOM_LIMITS.strokeHistoryMax) room.strokes.shift();
    // The sender already rendered locally — fan out to everyone else.
    this.broadcast(room, { type: 'stroke', stroke: stamped }, client);
  }

  private onClear(room: LiveRoom, participant: Participant): void {
    if (room.quiz && room.quiz.drawerId !== participant.id) return;
    room.strokes = [];
    this.broadcast(room, { type: 'canvas-cleared' });
    this.announce(room, 'canvas-cleared', { nickname: participant.nickname });
  }

  private onRoll(room: LiveRoom, participant: Participant, sides: 6 | 20 | 100): void {
    const entry: ChatEntry = {
      id: crypto.randomUUID(),
      at: nowUtc(),
      kind: 'dice',
      userId: participant.id,
      nickname: participant.nickname,
      sides,
      value: 1 + Math.floor(this.random() * sides),
    };
    this.pushChat(room, entry);
    this.broadcast(room, { type: 'chat', entry });
  }

  private onQuizStart(room: LiveRoom, participant: Participant, client: RoomClient): void {
    // Needs someone to guess; the client disables the button too.
    if (room.quiz || room.members.size < 2) return;
    const word = QUIZ_WORDS[Math.floor(this.random() * QUIZ_WORDS.length)];
    if (!word) return;
    room.quiz = {
      word,
      drawerId: participant.id,
      drawerNickname: participant.nickname,
      startedAt: nowUtc(),
    };
    room.strokes = [];
    this.broadcast(room, { type: 'canvas-cleared' });
    this.announce(room, 'quiz-started', { nickname: participant.nickname });
    this.broadcast(room, { type: 'quiz', quiz: publicQuiz(room), scores: scoreboard(room) });
    send(client, { type: 'quiz-word', word: formatQuizWord(word) });
  }

  /** Ends the round without a winner, revealing the word. */
  private endQuiz(room: LiveRoom): void {
    const quiz = room.quiz;
    if (!quiz) return;
    room.quiz = null;
    this.announce(room, 'quiz-ended', { word: formatQuizWord(quiz.word) });
    this.broadcast(room, { type: 'quiz', quiz: null, scores: scoreboard(room) });
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────

  private systemEntry(code: SystemChatCode, params: Record<string, string>): ChatEntry {
    return { id: crypto.randomUUID(), at: nowUtc(), kind: 'system', code, params };
  }

  /** Records + broadcasts a system chat entry. */
  private announce(room: LiveRoom, code: SystemChatCode, params: Record<string, string>): void {
    const entry = this.systemEntry(code, params);
    this.pushChat(room, entry);
    this.broadcast(room, { type: 'chat', entry });
  }

  private pushChat(room: LiveRoom, entry: ChatEntry): void {
    room.chat.push(entry);
    while (room.chat.length > ROOM_LIMITS.chatHistoryMax) room.chat.shift();
  }

  private broadcast(room: LiveRoom, message: ServerMessage, except?: RoomClient): void {
    const frame = JSON.stringify(message);
    for (const member of room.members.keys()) {
      if (member !== except) member.send(frame);
    }
  }
}

function send(client: RoomClient, message: ServerMessage): void {
  client.send(JSON.stringify(message));
}

function summarize(room: LiveRoom): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    emoji: room.emoji,
    createdAt: room.createdAt,
    participantCount: room.members.size,
  };
}

function publicQuiz(room: LiveRoom): QuizPublicState | null {
  if (!room.quiz) return null;
  return {
    drawerId: room.quiz.drawerId,
    drawerNickname: room.quiz.drawerNickname,
    wordLength: room.quiz.word.ko.length,
    startedAt: room.quiz.startedAt,
  };
}

function scoreboard(room: LiveRoom): ScoreEntry[] {
  return [...room.scores.entries()]
    .map(([nickname, score]) => ({ nickname, score }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
}

/** `철수` joining a room that already has one becomes `철수 2`, then `철수 3`… */
function dedupeNickname(room: LiveRoom, nickname: string): string {
  const taken = new Set([...room.members.values()].map((member) => member.nickname));
  if (!taken.has(nickname)) return nickname;
  let counter = 2;
  while (taken.has(`${nickname} ${counter}`)) counter += 1;
  return `${nickname} ${counter}`;
}
