/**
 * Chat over WebSocket (`/ws/chat`) — this instance's side of live delivery.
 *
 * One socket per browser tab carries any number of rooms: the client sends
 * `join` / `leave` frames and gets back the rooms' new messages and who is in
 * them (`ChatServerFrame`, @shared/domain/chat). Messages and presence
 * changes travel between instances over the pub/sub bus and each instance
 * forwards them to the sockets it holds, so with PUBSUB_DRIVER=redis two
 * people on different instances still share a room.
 *
 * Sending is not part of the socket: it is `POST /api/chat/rooms/:roomId/messages`,
 * so it goes through the same validation, error envelope and sign-in reading
 * as every other write.
 */
import {
  chatClientFrameValidator,
  guestIdValidator,
  participantKey,
  type ChatMessage,
  type ChatParticipant,
  type ChatServerFrame,
} from '@shared/domain/chat';

import { readCaller, type Caller } from '../auth/session';
import type { ServerConfig } from '../config';
import { NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/log';
import { PRESENCE_REFRESH_MS, type PresenceEntry, type PresenceStore } from '../presence';
import { CHANNELS, type PubSub } from '../pubsub';
import type { ChatService } from '../services/chat-service';

export interface ChatSocketData {
  kind: 'chat';
  connectionId: string;
  /** Read once from the upgrade request: the client reconnects when it signs in or out. */
  caller: Caller;
  guestId: string | undefined;
  /** Resolved on the first join, then the same in every room. */
  participant?: ChatParticipant;
  rooms: Set<string>;
  closed: boolean;
}

type ChatSocket = Bun.ServerWebSocket<ChatSocketData>;

interface ChatGatewayDeps {
  config: ServerConfig;
  chat: ChatService;
  presence: PresenceStore;
  events: PubSub;
  log: Logger;
}

export class ChatGateway {
  /** The sockets THIS instance holds, per room. */
  private readonly localRooms = new Map<string, Set<ChatSocket>>();

  constructor(private readonly deps: ChatGatewayDeps) {}

  /**
   * `GET /ws/chat?guestId=…` — who the socket is for. A signed-in member is
   * read from the session cookie; anyone else must bring their tab's guest id.
   * Returns the socket's data to upgrade with, or the response refusing it.
   */
  handshake(req: Request): ChatSocketData | Response {
    const caller = readCaller(req, this.deps.config);
    const parsed = guestIdValidator.safeParse(new URL(req.url).searchParams.get('guestId'));
    const guestId = parsed.ok ? parsed.value : undefined;
    if (caller.kind !== 'member' && guestId === undefined) {
      return new Response('A guestId is required when not signed in', { status: 400 });
    }
    return {
      kind: 'chat',
      connectionId: crypto.randomUUID(),
      caller,
      guestId,
      rooms: new Set(),
      closed: false,
    };
  }

  async message(ws: ChatSocket, raw: string | Buffer): Promise<void> {
    let frame;
    try {
      frame = chatClientFrameValidator.parse(JSON.parse(String(raw)));
    } catch {
      this.deps.log.warn('chat socket sent a malformed frame', { raw: String(raw).slice(0, 200) });
      return;
    }
    try {
      if (frame.type === 'join') await this.join(ws, frame.roomId);
      else await this.leave(ws, frame.roomId);
    } catch (error) {
      this.deps.log.error('chat socket frame failed', {
        type: frame.type,
        roomId: frame.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async close(ws: ChatSocket): Promise<void> {
    ws.data.closed = true;
    try {
      await Promise.all([...ws.data.rooms].map((roomId) => this.leave(ws, roomId)));
    } catch (error) {
      this.deps.log.warn('chat socket cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Starts forwarding the bus to this instance's sockets and keeping their
   * presence alive. Returns the stop function for graceful shutdown, which
   * also takes this instance's sockets out of every room right away (rather
   * than when their presence expires) and closes them so clients reconnect
   * to another instance.
   */
  async start(): Promise<() => Promise<void>> {
    const unsubscribeMessages = await this.deps.events.subscribe(
      CHANNELS.chatMessages,
      (payload) => {
        const message = payload as ChatMessage;
        this.broadcast(message.roomId, { type: 'message', message });
      },
    );
    const unsubscribePresence = await this.deps.events.subscribe(
      CHANNELS.chatPresence,
      (payload) => void this.pushPresence((payload as { roomId: string }).roomId),
    );
    const heartbeat = setInterval(() => void this.refreshPresence(), PRESENCE_REFRESH_MS);

    return async () => {
      clearInterval(heartbeat);
      await unsubscribeMessages();
      await unsubscribePresence();
      const sockets = new Set([...this.localRooms.values()].flatMap((set) => [...set]));
      await Promise.all([...sockets].map((ws) => this.close(ws)));
      for (const ws of sockets) ws.close(1001, 'server shutting down');
    };
  }

  private async join(ws: ChatSocket, roomId: string): Promise<void> {
    if (ws.data.rooms.has(roomId)) {
      this.send(ws, { type: 'joined', roomId });
      return;
    }
    try {
      await this.deps.chat.getRoom(roomId);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      this.send(ws, { type: 'error', roomId, code: 'NOT_FOUND' });
      return;
    }
    const participant = (ws.data.participant ??= await this.deps.chat.participantFor(
      ws.data.caller,
      ws.data.guestId,
    ));
    // Closed while we were looking things up: joining now would leave a ghost.
    if (ws.data.closed) return;

    // Registered before `joined` goes out, so no message sent after the client
    // hears `joined` (and fetches the history) can slip past it.
    ws.data.rooms.add(roomId);
    let sockets = this.localRooms.get(roomId);
    if (!sockets) {
      sockets = new Set();
      this.localRooms.set(roomId, sockets);
    }
    sockets.add(ws);
    await this.deps.presence.join(this.presenceEntry(ws, roomId, participant));
    this.send(ws, { type: 'joined', roomId });
    await this.deps.events.publish(CHANNELS.chatPresence, { roomId });
  }

  private async leave(ws: ChatSocket, roomId: string): Promise<void> {
    if (!ws.data.rooms.delete(roomId)) return;
    const sockets = this.localRooms.get(roomId);
    sockets?.delete(ws);
    if (sockets?.size === 0) this.localRooms.delete(roomId);
    await this.deps.presence.leave(roomId, ws.data.connectionId);
    await this.deps.events.publish(CHANNELS.chatPresence, { roomId });
  }

  /** Tells this instance's sockets in the room who is there now (one entry per person). */
  private async pushPresence(roomId: string): Promise<void> {
    if (!this.localRooms.has(roomId)) return; // nobody here to tell
    try {
      const participants = new Map<string, ChatParticipant>();
      for (const info of await this.deps.presence.list(roomId)) {
        const participant = info as ChatParticipant;
        const key = participantKey(participant);
        if (!participants.has(key)) participants.set(key, participant);
      }
      this.broadcast(roomId, {
        type: 'presence',
        roomId,
        participants: [...participants.values()],
      });
    } catch (error) {
      this.deps.log.warn('chat presence lookup failed', {
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshPresence(): Promise<void> {
    const entries = [...this.localRooms].flatMap(([roomId, sockets]) =>
      [...sockets].flatMap((ws) =>
        ws.data.participant ? [this.presenceEntry(ws, roomId, ws.data.participant)] : [],
      ),
    );
    try {
      await this.deps.presence.refresh(entries);
    } catch (error) {
      this.deps.log.warn('chat presence refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private presenceEntry(
    ws: ChatSocket,
    roomId: string,
    participant: ChatParticipant,
  ): PresenceEntry {
    return { scope: roomId, connectionId: ws.data.connectionId, info: participant };
  }

  private broadcast(roomId: string, frame: ChatServerFrame): void {
    const text = JSON.stringify(frame);
    for (const ws of this.localRooms.get(roomId) ?? []) ws.send(text);
  }

  private send(ws: ChatSocket, frame: ChatServerFrame): void {
    ws.send(JSON.stringify(frame));
  }
}
