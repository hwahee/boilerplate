import { guestIdValidator } from '@shared/domain/chat';

const STORAGE_KEY = 'app.chat.guest-id';

/** Used when sessionStorage is unavailable (private mode, blocked storage). */
let fallback: string | undefined;

function newGuestId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 6);
}

/**
 * This tab's guest id — how a visitor who is not signed in is named in chat.
 * It lives in the tab (sessionStorage): a reload keeps it, a new tab or a
 * return visit is a new guest. The server never takes it as proof of who
 * someone is (CLAUDE.md: guest state stays in the tab).
 */
export function tabGuestId(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored !== null && guestIdValidator.safeParse(stored).ok) return stored;
    const created = newGuestId();
    sessionStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return (fallback ??= newGuestId());
  }
}
