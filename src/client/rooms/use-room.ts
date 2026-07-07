/**
 * The room connection hook — owns the WebSocket to `/ws/rooms/:roomId` and
 * every piece of live room state (participants, chat, quiz, scores, floating
 * reactions).
 *
 * Canvas strokes deliberately live in a REF, not in state: stroke chunks
 * arrive at pointer-move frequency and must not re-render React. The canvas
 * component repaints from the ref when `strokesVersion` bumps (see
 * ./room-canvas.tsx), while the sender's own chunks are appended silently —
 * they were already painted locally.
 */
import {
  appendStroke,
  type ChatEntry,
  type ClientMessage,
  type DiceSides,
  type QuizPublicState,
  type ReactionEmoji,
  type ScoreEntry,
  type ServerMessage,
  type Stroke,
} from '@shared/rooms/protocol';
import type { Participant, RoomSummary } from '@shared/rooms/room';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

/** How long a thrown emoji floats over the canvas before it is removed. */
const REACTION_LIFETIME_MS = 3_000;

type RoomConnectionStatus = 'connecting' | 'open' | 'closed';

interface FloatingReaction {
  key: string;
  emoji: ReactionEmoji;
  nickname: string;
  /** Horizontal position over the canvas, percent of its width. */
  x: number;
}

interface RoomState {
  status: RoomConnectionStatus;
  selfId: string | null;
  room: RoomSummary | null;
  participants: Participant[];
  chat: ChatEntry[];
  quiz: QuizPublicState | null;
  scores: ScoreEntry[];
  /** The secret quiz word — only ever set when WE are the drawer. */
  word: string | null;
  reactions: FloatingReaction[];
  /** Bumped whenever the strokes ref changed for reasons the canvas must repaint. */
  strokesVersion: number;
}

const INITIAL: RoomState = {
  status: 'connecting',
  selfId: null,
  room: null,
  participants: [],
  chat: [],
  quiz: null,
  scores: [],
  word: null,
  reactions: [],
  strokesVersion: 0,
};

type RoomAction =
  | { type: 'reset' }
  | { type: 'closed' }
  | { type: 'server-message'; message: ServerMessage; reactionKey: string; reactionX: number }
  | { type: 'expire-reaction'; key: string };

function reduce(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'reset':
      return INITIAL;
    case 'closed':
      return { ...state, status: 'closed' };
    case 'expire-reaction':
      return {
        ...state,
        reactions: state.reactions.filter((reaction) => reaction.key !== action.key),
      };
    case 'server-message':
      return applyServerMessage(state, action);
  }
}

function applyServerMessage(
  state: RoomState,
  action: Extract<RoomAction, { type: 'server-message' }>,
): RoomState {
  const message = action.message;
  switch (message.type) {
    case 'welcome':
      return {
        ...state,
        status: 'open',
        selfId: message.selfId,
        room: message.room,
        participants: message.participants,
        chat: message.chat,
        quiz: message.quiz,
        scores: message.scores,
        strokesVersion: state.strokesVersion + 1,
      };
    case 'participants':
      return { ...state, participants: message.participants };
    case 'chat':
      return { ...state, chat: [...state.chat, message.entry] };
    case 'stroke':
      return { ...state, strokesVersion: state.strokesVersion + 1 };
    case 'canvas-cleared':
      return { ...state, strokesVersion: state.strokesVersion + 1 };
    case 'reaction':
      return {
        ...state,
        reactions: [
          ...state.reactions,
          {
            key: action.reactionKey,
            emoji: message.emoji,
            nickname: message.nickname,
            x: action.reactionX,
          },
        ],
      };
    case 'quiz':
      return {
        ...state,
        quiz: message.quiz,
        scores: message.scores,
        // Our word is only meaningful while we are the running quiz's drawer.
        word: message.quiz ? state.word : null,
      };
    case 'quiz-word':
      return { ...state, word: message.word };
  }
}

export interface RoomHandle extends RoomState {
  /** All strokes to paint; owned by the hook, repaint on `strokesVersion`. */
  strokesRef: React.RefObject<Stroke[]>;
  reconnect: () => void;
  sendChat: (text: string) => void;
  /** Paints locally already happened — records the chunk and fans it out. */
  sendStrokeChunk: (chunk: Omit<Stroke, 'userId'>) => void;
  clearCanvas: () => void;
  sendReaction: (emoji: ReactionEmoji) => void;
  rollDice: (sides: DiceSides) => void;
  startQuiz: () => void;
  skipQuiz: () => void;
}

export function useRoom(roomId: string, nickname: string): RoomHandle {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  // The socket handler and sendStrokeChunk need the CURRENT self id without
  // re-binding; mirror it into a ref after every commit.
  const selfIdRef = useRef<string | null>(null);
  useEffect(() => {
    selfIdRef.current = state.selfId;
  }, [state.selfId]);

  useEffect(() => {
    dispatch({ type: 'reset' });
    strokesRef.current = [];

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/ws/rooms/${roomId}?nickname=${encodeURIComponent(nickname)}`,
    );
    socketRef.current = socket;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;

      // Stroke bookkeeping happens on the ref, outside of React state.
      if (message.type === 'welcome') strokesRef.current = message.strokes;
      if (message.type === 'canvas-cleared') strokesRef.current = [];
      if (message.type === 'stroke') {
        // Own chunks were painted at draw time and recorded by sendStrokeChunk.
        if (message.stroke.userId === selfIdRef.current) return;
        appendStroke(strokesRef.current, message.stroke);
      }

      const reactionKey = crypto.randomUUID();
      dispatch({
        type: 'server-message',
        message,
        reactionKey,
        reactionX: 10 + Math.random() * 80,
      });
      if (message.type === 'reaction') {
        const timer = setTimeout(() => {
          timers.delete(timer);
          dispatch({ type: 'expire-reaction', key: reactionKey });
        }, REACTION_LIFETIME_MS);
        timers.add(timer);
      }
    };
    socket.onclose = () => dispatch({ type: 'closed' });

    return () => {
      socketRef.current = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [roomId, nickname, attempt]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const sendStrokeChunk = useCallback(
    (chunk: Omit<Stroke, 'userId'>) => {
      const selfId = selfIdRef.current;
      if (!selfId) return;
      // Record locally so full repaints (someone else drew) keep our lines...
      appendStroke(strokesRef.current, {
        ...chunk,
        userId: selfId,
        points: [...chunk.points],
      });
      // ...and fan out. The server re-stamps userId; it never trusts ours.
      send({ type: 'stroke', stroke: chunk });
    },
    [send],
  );

  return {
    ...state,
    strokesRef,
    reconnect: useCallback(() => setAttempt((n) => n + 1), []),
    sendChat: useCallback((text: string) => send({ type: 'chat', text }), [send]),
    sendStrokeChunk,
    clearCanvas: useCallback(() => send({ type: 'clear' }), [send]),
    sendReaction: useCallback((emoji: ReactionEmoji) => send({ type: 'reaction', emoji }), [send]),
    rollDice: useCallback((sides: DiceSides) => send({ type: 'roll', sides }), [send]),
    startQuiz: useCallback(() => send({ type: 'quiz-start' }), [send]),
    skipQuiz: useCallback(() => send({ type: 'quiz-skip' }), [send]),
  };
}
