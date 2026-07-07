/**
 * Word list + guess matching for the drawing quiz (캐치마인드).
 *
 * Every word carries both a Korean and an English form: the drawer sees both,
 * and a guess in either language counts. Matching is forgiving about case and
 * whitespace but otherwise exact — no fuzzy matching, so near-misses keep the
 * round going.
 */
export interface QuizWord {
  ko: string;
  en: string;
}

export const QUIZ_WORDS: readonly QuizWord[] = [
  { ko: '사과', en: 'apple' },
  { ko: '바나나', en: 'banana' },
  { ko: '수박', en: 'watermelon' },
  { ko: '케이크', en: 'cake' },
  { ko: '도넛', en: 'donut' },
  { ko: '피자', en: 'pizza' },
  { ko: '햄버거', en: 'hamburger' },
  { ko: '아이스크림', en: 'ice cream' },
  { ko: '김밥', en: 'gimbap' },
  { ko: '떡볶이', en: 'tteokbokki' },
  { ko: '고양이', en: 'cat' },
  { ko: '강아지', en: 'dog' },
  { ko: '코끼리', en: 'elephant' },
  { ko: '기린', en: 'giraffe' },
  { ko: '펭귄', en: 'penguin' },
  { ko: '나비', en: 'butterfly' },
  { ko: '공룡', en: 'dinosaur' },
  { ko: '문어', en: 'octopus' },
  { ko: '거북이', en: 'turtle' },
  { ko: '자동차', en: 'car' },
  { ko: '비행기', en: 'airplane' },
  { ko: '자전거', en: 'bicycle' },
  { ko: '로켓', en: 'rocket' },
  { ko: '기차', en: 'train' },
  { ko: '잠수함', en: 'submarine' },
  { ko: '우산', en: 'umbrella' },
  { ko: '안경', en: 'glasses' },
  { ko: '모자', en: 'hat' },
  { ko: '신발', en: 'shoes' },
  { ko: '시계', en: 'clock' },
  { ko: '컴퓨터', en: 'computer' },
  { ko: '카메라', en: 'camera' },
  { ko: '기타', en: 'guitar' },
  { ko: '피아노', en: 'piano' },
  { ko: '드럼', en: 'drum' },
  { ko: '무지개', en: 'rainbow' },
  { ko: '번개', en: 'lightning' },
  { ko: '눈사람', en: 'snowman' },
  { ko: '산', en: 'mountain' },
  { ko: '바다', en: 'sea' },
  { ko: '달', en: 'moon' },
  { ko: '별', en: 'star' },
  { ko: '태양', en: 'sun' },
  { ko: '구름', en: 'cloud' },
  { ko: '꽃', en: 'flower' },
  { ko: '나무', en: 'tree' },
  { ko: '집', en: 'house' },
  { ko: '다리', en: 'bridge' },
  { ko: '성', en: 'castle' },
  { ko: '등대', en: 'lighthouse' },
  { ko: '열기구', en: 'hot air balloon' },
  { ko: '축구공', en: 'soccer ball' },
  { ko: '농구', en: 'basketball' },
  { ko: '낚시', en: 'fishing' },
  { ko: '캠핑', en: 'camping' },
  { ko: '유령', en: 'ghost' },
  { ko: '로봇', en: 'robot' },
  { ko: '인어', en: 'mermaid' },
  { ko: '마법사', en: 'wizard' },
  { ko: '해적', en: 'pirate' },
  { ko: '왕관', en: 'crown' },
  { ko: '보물상자', en: 'treasure chest' },
];

function normalizeGuess(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, '');
}

/** True when `guess` names `word` in either language (case/space-insensitive). */
export function isCorrectGuess(word: QuizWord, guess: string): boolean {
  const normalized = normalizeGuess(guess);
  return normalized === normalizeGuess(word.ko) || normalized === normalizeGuess(word.en);
}

/** Shown to the drawer: both forms, e.g. `사과 (apple)`. */
export function formatQuizWord(word: QuizWord): string {
  return `${word.ko} (${word.en})`;
}
