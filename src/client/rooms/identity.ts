/**
 * Player identity helpers: the locally remembered nickname and the stable
 * per-nickname accent color used for participant chips and chat names.
 */

const NICKNAME_KEY = 'playroom.nickname';

export function loadNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname.trim());
}

/**
 * Deterministic accent color: same nickname → same hue on every client,
 * with fixed saturation/lightness that read well on both themes.
 */
export function colorForNickname(nickname: string): string {
  let hash = 0;
  for (const char of nickname) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return `hsl(${hash % 360} 60% 45%)`;
}
