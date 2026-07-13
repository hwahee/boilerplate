/**
 * /api/version-policy — the app's first call on boot and foreground return.
 *
 * Returns the platform's update policy (min supported / latest version,
 * delivery mode, store URL). The platform comes from `?platform=` or the
 * `X-Platform` header. 404 means "no policy configured" — the app treats
 * that as up-to-date (fail open; the seed data always configures both
 * platforms in real environments).
 */
import { PLATFORM_HEADER } from '@app/shared/api/headers';
import { isPlatform } from '@app/shared/domain/platform';
import { ValidationError } from '@app/shared/validation';

import type { Container } from '../container';
import { apiRoute, json, type HttpDeps } from '../http/respond';

export function versionPolicyRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/version-policy'>(
    {
      /** GET /api/version-policy?platform=ios|android → VersionPolicy | 404 */
      GET: async (req) => {
        const platform =
          new URL(req.url).searchParams.get('platform') ?? req.headers.get(PLATFORM_HEADER);
        if (!isPlatform(platform)) {
          throw new ValidationError([
            { path: 'platform', message: 'platform must be ios or android', code: 'invalid_enum' },
          ]);
        }
        return json(await container.versionPolicyService().requirePolicy(platform));
      },
    },
    deps,
  );
}
