/**
 * Client-identification headers — sent by the mobile app on EVERY request.
 *
 * Mobile clients cannot be force-refreshed like a browser tab: old app
 * versions stay in the field for weeks. The server therefore needs to know
 * exactly which app version and platform is calling so it can
 *
 *   - keep responses backward-compatible (see docs/release-playbook.md), and
 *   - reject end-of-life versions with HTTP 426 `UPGRADE_REQUIRED` based on
 *     the version policy (the ONLY sanctioned way to break compatibility:
 *     raise `minSupportedVersion` and force-update the stragglers).
 *
 * Requests WITHOUT these headers (curl, admin tooling, future web console)
 * bypass the upgrade gate — the gate targets app builds, not humans.
 */

/** App binary version, plain semver — e.g. `1.4.2`. */
export const APP_VERSION_HEADER = 'x-app-version';

/** Client platform: `ios` | `android`. */
export const PLATFORM_HEADER = 'x-platform';
