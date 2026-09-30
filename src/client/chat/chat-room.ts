import type { ChatMessage, ChatParticipant, ChatServerFrame } from '@shared/domain/chat';

import type { chatApi } from '../api/endpoints';
import type { ChatConnection } from './chat-connection';
import { mergeMessages } from './messages';

/**
 *   - `connecting`   — joining, or fetching the backlog
 *   - `live`         — caught up; new messages arrive as they are sent
 *   - `reconnecting` — the socket dropped; what is shown may be missing the latest
 *   - `unavailable`  — there is no such room
 */
type ChatRoomStatus = 'connecting' | 'live' | 'reconnecting' | 'unavailable';

export interface ChatRoomState {
  status: ChatRoomStatus;
  /** Oldest first. */
  messages: readonly ChatMessage[];
  /** Who is in the room right now, one entry per person. */
  participants: readonly ChatParticipant[];
}

interface ChatRoomDeps {
  connection: ChatConnection;
  api: Pick<typeof chatApi, 'history' | 'send'>;
  guestId: () => string;
}

const CATCH_UP_RETRY_MS = 3000;

/**
 * One room as the page sees it — framework-free, so any UI (React through
 * `useChatRoom`, or anything else) can draw it. Watching starts with the first
 * subscriber and stops with the last; the state stays for the next one.
 *
 * Joining order is what keeps the view whole: the socket joins first, and only
 * when the server answers `joined` (from then on every new message reaches us
 * live) is the history fetched; the two overlap and `mergeMessages` folds them.
 */
export class ChatRoom {
  private state: ChatRoomState = { status: 'connecting', messages: [], participants: [] };
  private readonly subscribers = new Set<() => void>();
  private stopWatching: (() => void) | undefined;
  private catchUpRun = 0;
  private catchUpRetry: ReturnType<typeof setTimeout> | undefined;
  /**
   * Every message up to this seq is held — where the next catch-up starts.
   * Only a live room vouches for that: a message that arrives before the room
   * is caught up (our own send, a frame racing `joined`) may sit after a hole.
   */
  private caughtUpTo: number | undefined;

  constructor(
    readonly roomId: string,
    private readonly deps: ChatRoomDeps,
  ) {}

  /** For `useSyncExternalStore`: the same object until something changes. */
  getSnapshot = (): ChatRoomState => this.state;

  subscribe = (onChange: () => void): (() => void) => {
    this.subscribers.add(onChange);
    if (!this.stopWatching) {
      // Back after a break: what we hold is kept, but it is not live until caught up.
      this.state = { ...this.state, status: 'connecting' };
      this.stopWatching = this.deps.connection.watch(this.roomId, {
        onFrame: (frame) => this.onFrame(frame),
        onDisconnect: () => this.onDisconnect(),
      });
    }
    return () => {
      this.subscribers.delete(onChange);
      if (this.subscribers.size > 0) return;
      this.stopWatching?.();
      this.stopWatching = undefined;
      this.pause();
    };
  };

  /** Sends as the signed-in member, or as this tab's guest. Resolves with the stored message. */
  async send(text: string): Promise<ChatMessage> {
    const message = await this.deps.api.send(this.roomId, { text, guestId: this.deps.guestId() });
    this.update({ messages: mergeMessages(this.state.messages, [message]) });
    return message;
  }

  private onFrame(frame: ChatServerFrame): void {
    switch (frame.type) {
      case 'joined':
        void this.catchUp();
        break;
      case 'message':
        this.update({ messages: mergeMessages(this.state.messages, [frame.message]) });
        break;
      case 'presence':
        this.update({ participants: frame.participants });
        break;
      case 'error':
        this.cancelCatchUp();
        this.update({ status: 'unavailable' });
        break;
    }
  }

  private onDisconnect(): void {
    this.pause();
    if (this.state.status !== 'unavailable') this.update({ status: 'reconnecting' });
  }

  /** Stops catching up, remembering how far we are if we were caught up. */
  private pause(): void {
    this.cancelCatchUp();
    if (this.state.status === 'live') this.caughtUpTo = this.state.messages.at(-1)?.seq;
  }

  /** Fetches what we have not seen yet: the backlog the first time, then only newer messages. */
  private async catchUp(): Promise<void> {
    this.cancelCatchUp();
    const run = this.catchUpRun;
    const after = this.state.status === 'live' ? this.state.messages.at(-1)?.seq : this.caughtUpTo;
    try {
      const { items } = await this.deps.api.history(
        this.roomId,
        after === undefined ? {} : { after },
      );
      if (run !== this.catchUpRun) return; // superseded by a newer join or a disconnect
      this.update({
        status: 'live',
        messages: mergeMessages(this.state.messages, items, { after }),
      });
    } catch {
      if (run !== this.catchUpRun) return;
      // The socket is fine but the history is not: try again rather than wait for a reconnect.
      this.catchUpRetry = setTimeout(() => void this.catchUp(), CATCH_UP_RETRY_MS);
    }
  }

  private cancelCatchUp(): void {
    this.catchUpRun += 1;
    clearTimeout(this.catchUpRetry);
  }

  private update(patch: Partial<ChatRoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const onChange of this.subscribers) onChange();
  }
}
