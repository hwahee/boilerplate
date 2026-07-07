import { describe, expect, test } from 'bun:test';

import { appendStroke, clientMessageValidator, type Stroke } from './protocol';
import { formatQuizWord, isCorrectGuess, QUIZ_WORDS } from './quiz-words';
import { createRoomValidator, nicknameValidator } from './room';

describe('createRoomValidator', () => {
  test('accepts a valid room', () => {
    expect(createRoomValidator.parse({ name: '금요일 밤 낙서방', emoji: '🎨' })).toEqual({
      name: '금요일 밤 낙서방',
      emoji: '🎨',
    });
  });

  test('rejects blank names, unknown emoji and extra fields', () => {
    expect(createRoomValidator.safeParse({ name: '   ', emoji: '🎨' }).ok).toBe(false);
    expect(createRoomValidator.safeParse({ name: 'ok', emoji: '🦄' }).ok).toBe(false);
    expect(createRoomValidator.safeParse({ name: 'ok', emoji: '🎨', admin: true }).ok).toBe(false);
  });
});

describe('nicknameValidator', () => {
  test('accepts a nickname and rejects blank/overlong ones', () => {
    expect(nicknameValidator.parse('철수')).toBe('철수');
    expect(nicknameValidator.safeParse('  ').ok).toBe(false);
    expect(nicknameValidator.safeParse('가'.repeat(21)).ok).toBe(false);
  });
});

describe('clientMessageValidator', () => {
  test('accepts every message type', () => {
    const stroke = {
      id: 's1',
      color: '#112233',
      size: 6,
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 1 },
      ],
    };
    for (const message of [
      { type: 'chat', text: '안녕!' },
      { type: 'stroke', stroke },
      { type: 'clear' },
      { type: 'reaction', emoji: '🎉' },
      { type: 'roll', sides: 20 },
      { type: 'quiz-start' },
      { type: 'quiz-skip' },
    ]) {
      expect(clientMessageValidator.safeParse(message).ok).toBe(true);
    }
  });

  test('rejects out-of-contract payloads', () => {
    expect(clientMessageValidator.safeParse({ type: 'chat', text: '' }).ok).toBe(false);
    expect(clientMessageValidator.safeParse({ type: 'roll', sides: 7 }).ok).toBe(false);
    expect(clientMessageValidator.safeParse({ type: 'reaction', emoji: '🦄' }).ok).toBe(false);
    expect(
      clientMessageValidator.safeParse({
        type: 'stroke',
        stroke: { id: 's1', color: 'red', size: 6, points: [{ x: 0, y: 0 }] },
      }).ok,
    ).toBe(false);
    expect(
      clientMessageValidator.safeParse({
        type: 'stroke',
        stroke: { id: 's1', color: '#112233', size: 6, points: [{ x: 2, y: 0 }] },
      }).ok,
    ).toBe(false);
    expect(clientMessageValidator.safeParse({ type: 'unknown' }).ok).toBe(false);
  });
});

describe('appendStroke', () => {
  const chunk = (id: string, userId: string, x: number): Stroke => ({
    id,
    userId,
    color: '#000000',
    size: 6,
    points: [{ x, y: 0.5 }],
  });

  test('merges chunks with the same id and user into one stroke', () => {
    const strokes: Stroke[] = [];
    appendStroke(strokes, chunk('s1', 'u1', 0.1));
    appendStroke(strokes, chunk('s1', 'u1', 0.2));
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.points.map((point) => point.x)).toEqual([0.1, 0.2]);
  });

  test('keeps strokes from different users or ids separate', () => {
    const strokes: Stroke[] = [];
    appendStroke(strokes, chunk('s1', 'u1', 0.1));
    appendStroke(strokes, chunk('s2', 'u1', 0.2));
    appendStroke(strokes, chunk('s3', 'u2', 0.3));
    expect(strokes).toHaveLength(3);
  });
});

describe('quiz words', () => {
  test('matches guesses in either language, ignoring case and spaces', () => {
    const word = { ko: '아이스크림', en: 'ice cream' };
    expect(isCorrectGuess(word, '아이스크림')).toBe(true);
    expect(isCorrectGuess(word, '아이스 크림')).toBe(true);
    expect(isCorrectGuess(word, 'ICE CREAM')).toBe(true);
    expect(isCorrectGuess(word, 'icecream')).toBe(true);
    expect(isCorrectGuess(word, '아이스')).toBe(false);
  });

  test('formats the drawer hint with both forms', () => {
    expect(formatQuizWord({ ko: '사과', en: 'apple' })).toBe('사과 (apple)');
  });

  test('the word list is non-trivial and fully bilingual', () => {
    expect(QUIZ_WORDS.length).toBeGreaterThanOrEqual(40);
    for (const word of QUIZ_WORDS) {
      expect(word.ko.length).toBeGreaterThan(0);
      expect(word.en.length).toBeGreaterThan(0);
    }
  });
});
