/**
 * Request identity — the one place "who is calling" enters the server.
 *
 * AUTH_DRIVER decides how a request proves who it is:
 *   - `none` — nobody is ever signed in; a session cookie is ignored even if sent.
 *   - `dev`  — the cookie holds the user id itself, unsigned: anyone who knows
 *              an id can sign in as it. That is the accepted premise of the dev
 *              driver (CLAUDE.md), which is why config.ts refuses to boot it
 *              with APP_ENV=production.
 *
 * A later driver (an external login provider) changes what the cookie holds
 * and how it is verified — here. Routes and services only ever read
 * `ctx.userId` (src/server/http/context.ts).
 */
import type { ServerConfig } from '../config';

const SESSION_COOKIE = 'session';

/** The signed-in user's id, or `undefined` when the request carries none. */
export function readSessionUserId(
  req: Request,
  config: Pick<ServerConfig, 'authDriver'>,
): string | undefined {
  if (config.authDriver !== 'dev') return undefined;
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  const value = new Bun.CookieMap(header).get(SESSION_COOKIE);
  // Empty is what a cleared cookie holds — signed out, not a user named ''.
  return value === null || value === '' ? undefined : value;
}

/** Signs the response's browser in as `userId` (httpOnly: page scripts never see it). */
export function setSessionCookie(req: Bun.BunRequest, userId: string): void {
  req.cookies.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function clearSessionCookie(req: Bun.BunRequest): void {
  req.cookies.delete({ name: SESSION_COOKIE, path: '/' });
}
