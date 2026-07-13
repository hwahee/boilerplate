/**
 * App-version upgrade gate — version-skew handling for mobile clients.
 *
 * Mobile apps cannot be force-refreshed, so the API stays backward-compatible
 * with every version >= `minSupportedVersion` (rules: docs/release-playbook.md).
 * The ONE mechanism that retires old versions: the app sends
 * `X-App-Version` + `X-Platform` on every request, and anything below the
 * platform's `minSupportedVersion` receives HTTP 426 UPGRADE_REQUIRED with
 * enough detail to render the forced-update screen offline-independently.
 *
 * Requests without valid app headers (curl, health probes, admin tooling)
 * pass through — the gate targets app builds, not humans. The policy lookup
 * is served from the VersionPolicyService per-process cache, so the gate
 * adds no per-request DB round trip.
 */
import type { UpgradeRequiredDetails } from '@app/shared/api/errors';
import { APP_VERSION_HEADER, PLATFORM_HEADER } from '@app/shared/api/headers';
import { isPlatform } from '@app/shared/domain/platform';
import { isValidSemver, semverLt } from '@app/shared/semver';

import type { VersionPolicyService } from '../services/version-policy-service';
import { errorResponse, type VersionGate } from './respond';

export function createVersionGate(policies: VersionPolicyService): VersionGate {
  return async (req, ctx) => {
    const clientVersion = req.headers.get(APP_VERSION_HEADER);
    const platform = req.headers.get(PLATFORM_HEADER);
    if (clientVersion === null || !isPlatform(platform) || !isValidSemver(clientVersion)) {
      return undefined;
    }

    const policy = await policies.getPolicy(platform);
    if (!policy || !semverLt(clientVersion, policy.minSupportedVersion)) return undefined;

    const details: UpgradeRequiredDetails = {
      platform,
      clientVersion,
      minSupportedVersion: policy.minSupportedVersion,
      storeUrl: policy.storeUrl,
    };
    return errorResponse(426, 'UPGRADE_REQUIRED', ctx, details);
  };
}

/** No-op gate for surfaces that must never block (e.g. the policy endpoint itself). */
export const noVersionGate: VersionGate = () => Promise.resolve(undefined);
