/**
 * Playroom domain — the shared contract between server and client.
 *
 * A "room" is a LIVE space (its lifetime is the server process, nothing is
 * persisted): users create one from the lobby, join it under a nickname and
 * then chat, draw on a shared canvas, roll dice, throw emoji reactions and
 * play the drawing-quiz game together. The realtime message protocol lives
 * in ./protocol.ts.
 */
import type { UtcIsoString } from '../time';
import { s, toValidator, type Infer } from '../validation';

/** Hard limits shared by validators (client forms) and server-side caps. */
export const ROOM_LIMITS = {
  /** Room name length. */
  nameMax: 40,
  /** Nickname length. */
  nicknameMax: 20,
  /** One chat message. */
  chatTextMax: 300,
  /** Chat entries kept for the snapshot sent to new joiners. */
  chatHistoryMax: 200,
  /** Strokes kept for the canvas snapshot sent to new joiners. */
  strokeHistoryMax: 400,
  /** Points accepted in a single stroke message (chunks share a stroke id). */
  strokePointsMax: 256,
  /** Stroke brush size range (in canvas-height-relative units, see protocol). */
  strokeSizeMin: 1,
  strokeSizeMax: 48,
} as const;

/** Room icon choices — a fixed set so the lobby stays a fun, curated grid. */
export const ROOM_EMOJIS = ['🎨', '🎲', '💬', '🚀', '🌙', '🍕', '🐱', '🎮'] as const;
export type RoomEmoji = (typeof ROOM_EMOJIS)[number];

/** What the lobby (and the welcome snapshot) sees of a room. */
export interface RoomSummary {
  id: string;
  name: string;
  emoji: RoomEmoji;
  /** UTC — converted to the viewer's time zone only at the client boundary. */
  createdAt: UtcIsoString;
  participantCount: number;
}

/** A user currently connected to a room. The id is per-connection. */
export interface Participant {
  id: string;
  nickname: string;
}

const nameSchema = s.string().check(
  s.minLength(1),
  s.maxLength(ROOM_LIMITS.nameMax),
  s.refine((value) => value.trim().length > 0, { message: 'Name must not be blank' }),
);

/** Body of `POST /api/rooms`. Strict: unknown fields are rejected. */
export const createRoomValidator = toValidator(
  s.strictObject({
    name: nameSchema,
    emoji: s.enum(ROOM_EMOJIS),
  }),
);
export type CreateRoomInput = Infer<typeof createRoomValidator>;

/** Nickname carried on the WebSocket upgrade (`?nickname=`). */
export const nicknameValidator = toValidator(
  s.string().check(
    s.minLength(1),
    s.maxLength(ROOM_LIMITS.nicknameMax),
    s.refine((value) => value.trim().length > 0, { message: 'Nickname must not be blank' }),
  ),
);
