/**
 * Playroom lobby: pick a nickname (remembered locally), create a room, join
 * one. The list polls every few seconds so participant counts stay live
 * without holding a WebSocket from the lobby.
 */
import { createRoomValidator, ROOM_EMOJIS, type RoomEmoji } from '@shared/rooms/room';
import { formatUtcInTimeZone } from '@shared/time';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { ApiRequestError } from '../api/http';
import { useCreateRoom, useRoomList } from '../api/queries';
import { useI18n } from '../i18n/locale-context';
import { loadNickname, saveNickname } from '../rooms/identity';
import { TESTID } from '../testing/testids';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { TextField } from '../ui/text-field';

export function RoomsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const roomList = useRoomList();
  const createRoom = useCreateRoom();

  const [nickname, setNickname] = useState(loadNickname);
  const [nicknameError, setNicknameError] = useState<string | undefined>(undefined);
  const [roomName, setRoomName] = useState('');
  const [roomNameError, setRoomNameError] = useState<string | undefined>(undefined);
  const [emoji, setEmoji] = useState<RoomEmoji>(ROOM_EMOJIS[0]);

  const updateNickname = (value: string) => {
    setNickname(value);
    setNicknameError(undefined);
    saveNickname(value);
  };

  /** Joining (and creating, which auto-joins) needs a nickname first. */
  const requireNickname = (): boolean => {
    if (nickname.trim().length > 0) return true;
    setNicknameError(t('rooms.nicknameRequired'));
    return false;
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!requireNickname()) return;
    const parsed = createRoomValidator.safeParse({ name: roomName, emoji });
    if (!parsed.ok) {
      setRoomNameError(t('error.validation'));
      return;
    }
    setRoomNameError(undefined);
    createRoom.mutate(parsed.value, {
      onSuccess: (room) => void navigate(`/rooms/${room.id}`),
    });
  };

  const join = (roomId: string) => {
    if (!requireNickname()) return;
    void navigate(`/rooms/${roomId}`);
  };

  const data = roomList.data;

  return (
    <section data-testid={TESTID.rooms.page} aria-labelledby="rooms-heading">
      <h2 id="rooms-heading">{t('rooms.title')}</h2>
      <p className="muted">{t('rooms.description')}</p>

      <div className="rooms-setup">
        <div className="rooms-nickname">
          <TextField
            label={t('rooms.nicknameLabel')}
            placeholder={t('rooms.nicknamePlaceholder')}
            value={nickname}
            onChange={(event) => updateNickname(event.target.value)}
            error={nicknameError}
            maxLength={20}
            testId={TESTID.rooms.nicknameInput}
          />
        </div>

        <form
          className="rooms-create"
          onSubmit={submitCreate}
          aria-label={t('rooms.createTitle')}
          data-testid={TESTID.rooms.createForm}
        >
          <TextField
            label={t('rooms.createNameLabel')}
            placeholder={t('rooms.createNamePlaceholder')}
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            error={roomNameError}
            maxLength={40}
            testId={TESTID.rooms.createNameInput}
          />
          <div
            className="rooms-emoji-picker"
            role="radiogroup"
            aria-label={t('rooms.createEmojiLabel')}
          >
            {ROOM_EMOJIS.map((option, index) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={emoji === option}
                aria-label={`${t('rooms.createEmojiLabel')} ${option}`}
                className={`rooms-emoji${emoji === option ? ' rooms-emoji--active' : ''}`}
                onClick={() => setEmoji(option)}
                data-testid={TESTID.rooms.createEmoji(index)}
              >
                {option}
              </button>
            ))}
          </div>
          <Button type="submit" loading={createRoom.isPending} testId={TESTID.rooms.createSubmit}>
            <Plus aria-hidden size="1em" />
            {t('rooms.createSubmit')}
          </Button>
        </form>
      </div>

      <h3>{t('rooms.listTitle')}</h3>

      {roomList.isPending && <Spinner label={t('common.loading')} testId={TESTID.rooms.loading} />}

      {roomList.isError && (
        <Alert
          tone="error"
          testId={TESTID.rooms.error}
          action={
            <Button
              variant="secondary"
              onClick={() => void roomList.refetch()}
              testId={TESTID.rooms.errorRetry}
            >
              {t('common.retry')}
            </Button>
          }
        >
          {t('rooms.loadFailed')}{' '}
          {roomList.error instanceof ApiRequestError ? roomList.error.message : null}
        </Alert>
      )}

      {data &&
        (data.items.length === 0 ? (
          <p data-testid={TESTID.rooms.empty}>{t('rooms.empty')}</p>
        ) : (
          <ul className="rooms-grid" data-testid={TESTID.rooms.list}>
            {data.items.map((room) => (
              <li key={room.id} className="card room-card" data-testid={TESTID.rooms.card(room.id)}>
                <span className="room-card__emoji" aria-hidden>
                  {room.emoji}
                </span>
                <div className="room-card__body">
                  <h4 className="room-card__name">{room.name}</h4>
                  <p className="muted room-card__meta">
                    {t('rooms.participantCount', { count: room.participantCount })}
                    {' · '}
                    <time dateTime={room.createdAt}>
                      {formatUtcInTimeZone(room.createdAt, { locale })}
                    </time>
                  </p>
                </div>
                <Button onClick={() => join(room.id)} testId={TESTID.rooms.cardJoin(room.id)}>
                  {t('rooms.join')}
                </Button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
