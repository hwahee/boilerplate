/**
 * Inside a playroom: shared canvas + chat side by side, with the drawing quiz,
 * dice rolls and floating emoji reactions layered on top. All live state comes
 * from the room WebSocket via useRoom; the only local state is uncommitted
 * form input and the brush settings.
 */
import { DICE_SIDES, REACTION_EMOJIS, type ChatEntry } from '@shared/rooms/protocol';
import { ROOM_LIMITS } from '@shared/rooms/room';
import { Dices, Eraser, LogOut, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useI18n } from '../i18n/locale-context';
import { colorForNickname, loadNickname, saveNickname } from '../rooms/identity';
import { RoomCanvas, type BrushSettings } from '../rooms/room-canvas';
import { useRoom } from '../rooms/use-room';
import { TESTID } from '../testing/testids';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { TextField } from '../ui/text-field';

const BRUSH_COLORS = [
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

const BRUSH_SIZES = { fine: 4, regular: 9, bold: 20 } as const;
type BrushSizeName = keyof typeof BRUSH_SIZES;
const ERASER: BrushSettings = { color: '#ffffff', size: 40 };

export function RoomPage() {
  const params = useParams();
  const roomId = params.roomId ?? '';
  const [nickname, setNickname] = useState(() => loadNickname().trim());

  // Deep links land here without a nickname — ask before connecting.
  if (!nickname) {
    return (
      <NicknameGate
        onSubmit={(value) => {
          saveNickname(value);
          setNickname(value);
        }}
      />
    );
  }
  return <ConnectedRoom roomId={roomId} nickname={nickname} />;
}

function NicknameGate({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('rooms.nicknameRequired'));
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <section data-testid={TESTID.room.page}>
      <form
        className="room-nickname-gate"
        onSubmit={submit}
        aria-label={t('rooms.nicknameLabel')}
        data-testid={TESTID.room.nicknameForm}
      >
        <TextField
          label={t('rooms.nicknameLabel')}
          placeholder={t('rooms.nicknamePlaceholder')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error}
          maxLength={ROOM_LIMITS.nicknameMax}
          testId={TESTID.room.nicknameInput}
        />
        <Button type="submit" testId={TESTID.room.nicknameSubmit}>
          {t('rooms.join')}
        </Button>
      </form>
    </section>
  );
}

function ConnectedRoom({ roomId, nickname }: { roomId: string; nickname: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const room = useRoom(roomId, nickname);

  const [color, setColor] = useState<string>(BRUSH_COLORS[0]);
  const [sizeName, setSizeName] = useState<BrushSizeName>('regular');
  const [erasing, setErasing] = useState(false);
  const [draft, setDraft] = useState('');
  const chatLogRef = useRef<HTMLOListElement | null>(null);

  const chatLength = room.chat.length;
  useEffect(() => {
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chatLength]);

  const isDrawer = room.quiz !== null && room.quiz.drawerId === room.selfId;
  const canDraw = room.quiz === null || isDrawer;
  const brush: BrushSettings = erasing ? ERASER : { color, size: BRUSH_SIZES[sizeName] };

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    room.sendChat(text);
    setDraft('');
  };

  if (room.status === 'connecting') {
    return (
      <section data-testid={TESTID.room.page}>
        <Spinner label={t('room.connecting')} testId={TESTID.room.connecting} />
      </section>
    );
  }

  if (room.status === 'closed' || !room.room) {
    return (
      <section data-testid={TESTID.room.page}>
        <Alert
          tone="error"
          testId={TESTID.room.disconnected}
          action={
            <Button variant="secondary" onClick={room.reconnect} testId={TESTID.room.reconnect}>
              {t('room.reconnect')}
            </Button>
          }
        >
          {t('room.disconnected')}{' '}
          <Link to="/rooms" data-testid={TESTID.room.backToLobby}>
            {t('room.backToLobby')}
          </Link>
        </Alert>
      </section>
    );
  }

  return (
    <section className="room" data-testid={TESTID.room.page} aria-labelledby="room-heading">
      <header className="room-header">
        <h2 id="room-heading" className="room-header__title">
          <span aria-hidden>{room.room.emoji}</span> {room.room.name}
        </h2>
        <ul
          className="room-participants"
          aria-label={t('room.participants')}
          data-testid={TESTID.room.participants}
        >
          {room.participants.map((participant) => (
            <li
              key={participant.id}
              className="room-participants__chip"
              data-testid={TESTID.room.participant(participant.id)}
            >
              <span
                className="room-participants__dot"
                style={{ background: colorForNickname(participant.nickname) }}
                aria-hidden
              />
              {participant.nickname}
              {participant.id === room.selfId ? ' ★' : ''}
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          onClick={() => void navigate('/rooms')}
          aria-label={t('room.leave')}
          testId={TESTID.room.leave}
        >
          <LogOut aria-hidden size="1em" />
          {t('room.leave')}
        </Button>
      </header>

      <div className="room-quiz" data-testid={TESTID.room.quizBanner}>
        {room.quiz === null ? (
          <>
            <Button
              variant="secondary"
              onClick={room.startQuiz}
              disabled={room.participants.length < 2}
              testId={TESTID.room.quizStart}
            >
              🎨 {t('room.quiz.start')}
            </Button>
            {room.participants.length < 2 && (
              <span className="muted">{t('room.quiz.needTwo')}</span>
            )}
          </>
        ) : isDrawer ? (
          <>
            <strong>{room.word ? t('room.quiz.yourWord', { word: room.word }) : '…'}</strong>
            <Button variant="secondary" onClick={room.skipQuiz} testId={TESTID.room.quizSkip}>
              {t('room.quiz.skip')}
            </Button>
          </>
        ) : (
          <>
            <strong>{t('room.quiz.guess', { nickname: room.quiz.drawerNickname })}</strong>
            <span className="muted">
              {t('room.quiz.hint', { length: room.quiz.wordLength })}{' '}
              <span aria-hidden>{'◯'.repeat(room.quiz.wordLength)}</span>
            </span>
          </>
        )}
        {room.scores.length > 0 && (
          <ul
            className="room-scores"
            aria-label={t('room.quiz.scores')}
            data-testid={TESTID.room.scoreboard}
          >
            {room.scores.map((entry) => (
              <li key={entry.nickname} className="room-scores__chip">
                <span style={{ color: colorForNickname(entry.nickname) }}>{entry.nickname}</span>
                <strong>{entry.score}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="room-main">
        <div className="room-board">
          <div className="room-canvas-wrap">
            <RoomCanvas
              strokesRef={room.strokesRef}
              strokesVersion={room.strokesVersion}
              brush={brush}
              canDraw={canDraw}
              onStrokeChunk={room.sendStrokeChunk}
              testId={TESTID.room.canvas}
              aria-label={t('room.canvasLabel')}
            />
            {/* Thrown emoji float up over the canvas and expire on their own. */}
            <div className="room-reactions-layer" aria-hidden>
              {room.reactions.map((reaction) => (
                <span
                  key={reaction.key}
                  className="room-reaction-float"
                  style={{ left: `${reaction.x}%` }}
                >
                  {reaction.emoji}
                  <small>{reaction.nickname}</small>
                </span>
              ))}
            </div>
            {!canDraw && room.quiz && (
              <p className="room-canvas-lock">
                {t('room.canvas.locked', { nickname: room.quiz.drawerNickname })}
              </p>
            )}
          </div>

          <div className="room-toolbar" role="toolbar" aria-label={t('room.canvasLabel')}>
            <div className="room-toolbar__group">
              {BRUSH_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`room-swatch${!erasing && color === option ? ' room-swatch--active' : ''}`}
                  style={{ background: option }}
                  aria-label={t('room.canvas.color', { color: option })}
                  aria-pressed={!erasing && color === option}
                  onClick={() => {
                    setColor(option);
                    setErasing(false);
                  }}
                  data-testid={TESTID.room.color(option.slice(1))}
                />
              ))}
            </div>
            <div className="room-toolbar__group">
              {(Object.keys(BRUSH_SIZES) as BrushSizeName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`room-brush${!erasing && sizeName === name ? ' room-brush--active' : ''}`}
                  aria-label={t(`room.canvas.size.${name}`)}
                  aria-pressed={!erasing && sizeName === name}
                  onClick={() => {
                    setSizeName(name);
                    setErasing(false);
                  }}
                  data-testid={TESTID.room.brushSize(name)}
                >
                  <span
                    className="room-brush__dot"
                    style={{ width: BRUSH_SIZES[name] / 2 + 4, height: BRUSH_SIZES[name] / 2 + 4 }}
                    aria-hidden
                  />
                </button>
              ))}
              <button
                type="button"
                className={`room-brush${erasing ? ' room-brush--active' : ''}`}
                aria-label={t('room.canvas.eraser')}
                aria-pressed={erasing}
                onClick={() => setErasing(true)}
                data-testid={TESTID.room.eraser}
              >
                <Eraser aria-hidden size="1em" />
              </button>
            </div>
            <Button
              variant="ghost"
              onClick={room.clearCanvas}
              disabled={!canDraw}
              aria-label={t('room.canvas.clear')}
              testId={TESTID.room.clear}
            >
              <Trash2 aria-hidden size="1em" />
              {t('room.canvas.clear')}
            </Button>
          </div>
        </div>

        <aside className="room-chat" aria-label={t('room.chatTitle')}>
          <h3 className="room-chat__title">{t('room.chatTitle')}</h3>
          <ol className="room-chat__log" ref={chatLogRef} data-testid={TESTID.room.chatLog}>
            {room.chat.map((entry) => (
              <ChatLine key={entry.id} entry={entry} selfId={room.selfId} />
            ))}
          </ol>

          <div className="room-chat__fun">
            <div className="room-toolbar__group" aria-label={t('room.chatTitle')}>
              {REACTION_EMOJIS.map((emoji, index) => (
                <button
                  key={emoji}
                  type="button"
                  className="room-reaction-btn"
                  aria-label={t('room.reactionLabel', { emoji })}
                  onClick={() => room.sendReaction(emoji)}
                  data-testid={TESTID.room.reaction(index)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="room-toolbar__group">
              {DICE_SIDES.map((sides) => (
                <button
                  key={sides}
                  type="button"
                  className="room-dice-btn"
                  aria-label={t('room.dice', { sides })}
                  onClick={() => room.rollDice(sides)}
                  data-testid={TESTID.room.dice(sides)}
                >
                  <Dices aria-hidden size="1em" /> D{sides}
                </button>
              ))}
            </div>
          </div>

          <form className="room-chat__form" onSubmit={submitChat} aria-label={t('room.chatSend')}>
            <TextField
              label={t('room.chatInputLabel')}
              placeholder={t('room.chatPlaceholder')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={ROOM_LIMITS.chatTextMax}
              autoComplete="off"
              testId={TESTID.room.chatInput}
            />
            <Button type="submit" aria-label={t('room.chatSend')} testId={TESTID.room.chatSend}>
              <Send aria-hidden size="1em" />
            </Button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function ChatLine({ entry, selfId }: { entry: ChatEntry; selfId: string | null }) {
  const { t } = useI18n();

  if (entry.kind === 'system') {
    return (
      <li className="room-chat__line room-chat__line--system muted">
        {t(`room.system.${entry.code}`, entry.params)}
      </li>
    );
  }

  if (entry.kind === 'dice') {
    return (
      <li className="room-chat__line room-chat__line--dice">
        <span aria-hidden>🎲</span>{' '}
        {t('room.diceResult', { nickname: entry.nickname, sides: entry.sides, value: entry.value })}
      </li>
    );
  }

  return (
    <li className="room-chat__line">
      <strong style={{ color: colorForNickname(entry.nickname) }}>
        {entry.nickname}
        {entry.userId === selfId ? ' ★' : ''}
      </strong>{' '}
      {entry.text}
    </li>
  );
}
