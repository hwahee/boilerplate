/**
 * Playroom realtime protocol — every message that crosses the room WebSocket
 * (`/ws/rooms/:roomId`), as discriminated unions:
 *
 *   - `ClientMessage` (client → server) is untrusted input and MUST be parsed
 *     with `clientMessageValidator` on the server.
 *   - `ServerMessage` (server → client) is trusted; the client narrows on
 *     `type` directly.
 *
 * Canvas coordinate system: stroke points are normalized to `[0, 1]` on both
 * axes (the canvas keeps a fixed aspect ratio on every client, so normalized
 * points render identically everywhere). Brush `size` is expressed in
 * 1/1000ths of the canvas height.
 */
import { s, toValidator, type Infer } from '../validation';
import type { Participant, RoomSummary } from './room';
import { ROOM_LIMITS } from './room';

/** Emoji a user can "throw" over the room — a fixed, validated set. */
export const REACTION_EMOJIS = ['👍', '😂', '❤️', '🎉', '😮', '😭', '🔥', '👏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Dice offered by the dice roller. */
export const DICE_SIDES = [6, 20, 100] as const;
export type DiceSides = (typeof DICE_SIDES)[number];

// ── Canvas ──────────────────────────────────────────────────────────────────

export interface StrokePoint {
  x: number;
  y: number;
}

/**
 * One brush stroke. Long strokes are streamed as several messages sharing an
 * `id`; `appendStroke` merges them, so both the server history and every
 * client accumulate identical stroke lists.
 */
export interface Stroke {
  id: string;
  userId: string;
  color: string;
  size: number;
  points: StrokePoint[];
}

/**
 * Merges an incoming stroke (or stroke chunk) into `strokes` in place:
 * appends points to the stroke with the same id from the same user, or pushes
 * a new stroke. Returns the merged stroke.
 */
export function appendStroke(strokes: Stroke[], incoming: Stroke): Stroke {
  for (const known of strokes) {
    if (known.id === incoming.id && known.userId === incoming.userId) {
      known.points.push(...incoming.points);
      return known;
    }
  }
  strokes.push(incoming);
  return incoming;
}

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * System chat entries carry a code + params instead of prose so each client
 * renders them in its own locale (message keys `rooms.system.<code>`).
 */
export type SystemChatCode =
  'joined' | 'left' | 'canvas-cleared' | 'quiz-started' | 'quiz-correct' | 'quiz-ended';

export type ChatEntry =
  | { id: string; at: string; kind: 'user'; userId: string; nickname: string; text: string }
  | {
      id: string;
      at: string;
      kind: 'dice';
      userId: string;
      nickname: string;
      sides: DiceSides;
      value: number;
    }
  | {
      id: string;
      at: string;
      kind: 'system';
      code: SystemChatCode;
      params: Record<string, string>;
    };

// ── Drawing quiz ────────────────────────────────────────────────────────────

/**
 * Quiz state as everyone sees it — the secret word itself travels only to the
 * drawer, in a dedicated `quiz-word` message. `wordLength` lets guessers see
 * an underscore hint.
 */
export interface QuizPublicState {
  drawerId: string;
  drawerNickname: string;
  wordLength: number;
  startedAt: string;
}

/** Scores are keyed by nickname so a rejoining player keeps their points. */
export interface ScoreEntry {
  nickname: string;
  score: number;
}

// ── Client → server ─────────────────────────────────────────────────────────

const strokeSchema = s.strictObject({
  id: s.string().check(s.minLength(1), s.maxLength(64)),
  color: s.string().check(s.regex(/^#[0-9a-f]{6}$/)),
  size: s.number().check(s.gte(ROOM_LIMITS.strokeSizeMin), s.lte(ROOM_LIMITS.strokeSizeMax)),
  points: s
    .array(
      s.strictObject({
        x: s.number().check(s.gte(0), s.lte(1)),
        y: s.number().check(s.gte(0), s.lte(1)),
      }),
    )
    .check(s.minLength(1), s.maxLength(ROOM_LIMITS.strokePointsMax)),
});

export const clientMessageValidator = toValidator(
  s.union([
    s.strictObject({
      type: s.literal('chat'),
      text: s.string().check(s.minLength(1), s.maxLength(ROOM_LIMITS.chatTextMax)),
    }),
    /** A stroke or stroke chunk; the server stamps the sender's userId. */
    s.strictObject({ type: s.literal('stroke'), stroke: strokeSchema }),
    s.strictObject({ type: s.literal('clear') }),
    s.strictObject({ type: s.literal('reaction'), emoji: s.enum(REACTION_EMOJIS) }),
    s.strictObject({
      type: s.literal('roll'),
      sides: s.union([s.literal(6), s.literal(20), s.literal(100)]),
    }),
    /** Start a drawing quiz with the sender as drawer (ignored if one runs). */
    s.strictObject({ type: s.literal('quiz-start') }),
    /** Drawer gives up: reveal the word and end the round. */
    s.strictObject({ type: s.literal('quiz-skip') }),
  ]),
);
export type ClientMessage = Infer<typeof clientMessageValidator>;

// ── Server → client ─────────────────────────────────────────────────────────

export type ServerMessage =
  /** First message after joining: who you are + the full room snapshot. */
  | {
      type: 'welcome';
      selfId: string;
      room: RoomSummary;
      participants: Participant[];
      chat: ChatEntry[];
      strokes: Stroke[];
      quiz: QuizPublicState | null;
      scores: ScoreEntry[];
    }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'chat'; entry: ChatEntry }
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'canvas-cleared' }
  | { type: 'reaction'; userId: string; nickname: string; emoji: ReactionEmoji }
  | { type: 'quiz'; quiz: QuizPublicState | null; scores: ScoreEntry[] }
  /** Sent only to the drawer — the secret word to draw. */
  | { type: 'quiz-word'; word: string };
