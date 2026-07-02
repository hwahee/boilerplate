/**
 * Deployment-version handshake.
 *
 * Problem: during a rolling deploy, several server instances with different
 * builds serve traffic at once. A browser tab running client build X must not
 * silently talk to a server running build Y (and vice versa) — API contracts
 * may have changed between builds.
 *
 * Mechanism:
 *   - `scripts/build.ts` injects the build version into BOTH bundles via the
 *     `APP_BUILD_VERSION` compile-time define, so a given client bundle and the
 *     server binary that embeds it always share one version string.
 *   - The client sends `X-App-Version` with every API request.
 *   - The server rejects a mismatch with HTTP 409 `VERSION_MISMATCH`; the
 *     client then reloads once to fetch the matching assets from the new
 *     server (see `src/client/api/http.ts`).
 *   - In development both sides resolve to `"dev"`, so the check is inert.
 */

declare global {
  // Injected at build time (scripts/build.ts); undefined in development.
  var APP_BUILD_VERSION: string | undefined;
}

export const APP_VERSION: string =
  typeof APP_BUILD_VERSION !== 'undefined' && APP_BUILD_VERSION ? APP_BUILD_VERSION : 'dev';

/** Request header carrying the client's build version. */
export const VERSION_HEADER = 'x-app-version';
