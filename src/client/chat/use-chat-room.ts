/**
 * React binding of the chat core — how a feature attaches chat on the client:
 *
 *   const room = useChatRoom('inquiry.42');
 *   room.messages / room.participants / room.status / room.send(text) / room.isMine(message)
 *
 * The drawing is the feature's own (the home page's box is one example,
 * src/client/pages/home-chat.tsx); joining, catching up, live delivery,
 * presence and reconnecting are all here, the same for every room.
 */
import {
  CHAT_SOCKET_PATH,
  participantKey,
  type ChatMessage,
  type ChatParticipant,
} from '@shared/domain/chat';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { chatApi } from '../api/endpoints';
import { ApiRequestError } from '../api/http';
import { useMe } from '../api/queries';
import { ChatConnection } from './chat-connection';
import { ChatRoom, type ChatRoomState } from './chat-room';
import { tabGuestId } from './guest-id';

function socketUrl(): string {
  const url = new URL(CHAT_SOCKET_PATH, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Always sent; the server ignores it for a signed-in member.
  url.searchParams.set('guestId', tabGuestId());
  return String(url);
}

// One socket per tab, one store per room — shared by every component on the page.
let connection: ChatConnection | undefined;
const rooms = new Map<string, ChatRoom>();

function roomFor(roomId: string): ChatRoom {
  connection ??= new ChatConnection(socketUrl);
  let room = rooms.get(roomId);
  if (!room) {
    room = new ChatRoom(roomId, { connection, api: chatApi, guestId: tabGuestId });
    rooms.set(roomId, room);
  }
  return room;
}

/** Who the chat socket was opened as (a participant key); `undefined` until first known. */
let socketIdentity: string | undefined;

/**
 * Who this tab speaks as. `undefined` while that is not known yet; with
 * `AUTH_DRIVER=none` (no `me` at all) everyone is a guest.
 */
function useSelf(): ChatParticipant | undefined {
  const me = useMe();
  if (me.isSuccess) {
    return me.data
      ? { kind: 'member', userId: me.data.id, displayName: me.data.displayName }
      : { kind: 'guest', guestId: tabGuestId() };
  }
  if (me.error instanceof ApiRequestError && me.error.code === 'NOT_FOUND') {
    return { kind: 'guest', guestId: tabGuestId() };
  }
  return undefined;
}

export interface UseChatRoom extends ChatRoomState {
  /** Sends a message; rejects with `ApiRequestError` (localized `message`) on failure. */
  send(text: string): Promise<ChatMessage>;
  /** Whether this tab's visitor wrote the message (for "my message" styling). */
  isMine(message: ChatMessage): boolean;
}

export function useChatRoom(roomId: string): UseChatRoom {
  const room = roomFor(roomId);
  const state = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const self = useSelf();

  // The server reads who we are when the socket opens: after a sign-in or
  // sign-out, open a new one so presence and authorship follow.
  const identity = self === undefined ? undefined : participantKey(self);
  useEffect(() => {
    if (identity === undefined) return;
    if (socketIdentity !== undefined && socketIdentity !== identity) connection?.reconnect();
    socketIdentity = identity;
  }, [identity]);

  const send = useCallback((text: string) => room.send(text), [room]);
  const isMine = useCallback(
    (message: ChatMessage) => identity !== undefined && participantKey(message.author) === identity,
    [identity],
  );

  return { ...state, send, isMine };
}
