/**
 * The home page's chat box — one way to draw a room. Everything about the room
 * itself (joining, the backlog, live messages, who is here, sending,
 * reconnecting) comes from the chat core's `useChatRoom`; another feature can
 * draw the same kind of room entirely differently.
 */
import type { ChatParticipant } from '@shared/domain/chat';
import { participantKey, sendChatMessageValidator } from '@shared/domain/chat';
import { HOME_CHAT_ROOM } from '@shared/domain/home-chat';
import { formatUtcInTimeZone } from '@shared/time';
import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ApiRequestError } from '../api/http';
import { useChatRoom, type UseChatRoom } from '../chat/use-chat-room';
import { useI18n } from '../i18n/locale-context';
import { TESTID } from '../testing/testids';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TextField } from '../ui/text-field';

const STATUS_TONES = {
  connecting: 'neutral',
  live: 'success',
  reconnecting: 'warning',
  unavailable: 'danger',
} as const satisfies Record<UseChatRoom['status'], string>;

export function HomeChat() {
  const { t, locale } = useI18n();
  const room = useChatRoom(HOME_CHAT_ROOM.id);
  const sendMessage = useMutation({ mutationFn: (text: string) => room.send(text) });

  // The only local state: the uncommitted message.
  const [text, setText] = useState('');

  // Keep the newest message in view.
  const logRef = useRef<HTMLOListElement>(null);
  const lastSeq = room.messages.at(-1)?.seq;
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lastSeq]);

  const nameOf = (participant: ChatParticipant) =>
    participant.kind === 'member'
      ? participant.displayName
      : t('chat.guestName', { id: participant.guestId });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = sendChatMessageValidator.safeParse({ text });
    if (!parsed.ok) return; // nothing worth sending yet
    sendMessage.mutate(parsed.value.text, { onSuccess: () => setText('') });
  };

  const sendError = sendMessage.isError
    ? sendMessage.error instanceof ApiRequestError
      ? sendMessage.error.message
      : t('chat.sendFailed')
    : undefined;

  return (
    <section
      className="card chat-panel"
      aria-labelledby="home-chat-heading"
      data-testid={TESTID.home.chat.panel}
    >
      <header className="chat-panel__header">
        <h2 id="home-chat-heading">{t('chat.title')}</h2>
        <span role="status">
          <Badge tone={STATUS_TONES[room.status]} testId={TESTID.home.chat.status}>
            {t(`chat.status.${room.status}`)}
          </Badge>
        </span>
      </header>
      <p className="muted chat-panel__description">{t('chat.description')}</p>

      <div className="chat-participants" data-testid={TESTID.home.chat.participants}>
        <span className="muted">{t('chat.participants', { count: room.participants.length })}</span>
        <ul>
          {room.participants.map((participant) => (
            <li key={participantKey(participant)}>{nameOf(participant)}</li>
          ))}
        </ul>
      </div>

      {room.messages.length === 0 && room.status === 'live' ? (
        <p className="chat-empty muted" data-testid={TESTID.home.chat.empty}>
          {t('chat.empty')}
        </p>
      ) : (
        <ol
          ref={logRef}
          className="chat-log"
          role="log"
          aria-label={t('chat.log')}
          aria-busy={room.status === 'connecting' || undefined}
          data-testid={TESTID.home.chat.log}
        >
          {room.messages.map((message) => {
            const mine = room.isMine(message);
            return (
              <li
                key={message.seq}
                className={mine ? 'chat-message chat-message--mine' : 'chat-message'}
                data-testid={TESTID.home.chat.message(message.seq)}
              >
                <div className="chat-message__meta">
                  <span className="chat-message__author">
                    {nameOf(message.author)}
                    {mine && ` (${t('chat.you')})`}
                  </span>
                  {/* Boundary time-zone conversion: UTC → viewer's zone. */}
                  <time className="muted" dateTime={message.createdAt}>
                    {formatUtcInTimeZone(message.createdAt, { locale })}
                  </time>
                </div>
                <p className="chat-message__text">{message.text}</p>
              </li>
            );
          })}
        </ol>
      )}

      <form
        className="chat-compose"
        onSubmit={submit}
        aria-label={t('chat.send')}
        data-testid={TESTID.home.chat.form}
      >
        <TextField
          label={t('chat.inputLabel')}
          hideLabel
          placeholder={t('chat.inputPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          error={sendError}
          maxLength={1000}
          autoComplete="off"
          testId={TESTID.home.chat.input}
        />
        <Button
          type="submit"
          loading={sendMessage.isPending}
          disabled={room.status === 'unavailable' || sendMessage.isPending}
          testId={TESTID.home.chat.send}
        >
          <Send aria-hidden size="1em" />
          {t('chat.send')}
        </Button>
      </form>
    </section>
  );
}
