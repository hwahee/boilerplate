/**
 * /api/push-tokens — device push token registration.
 *
 * The app registers its provider token after boot (and re-registers on every
 * launch — the operation is an idempotent upsert). Unregistration uses POST
 * with the token in the body: tokens are long, secret-ish blobs that don't
 * belong in URLs or access logs.
 */
import {
  registerPushTokenValidator,
  unregisterPushTokenValidator,
} from '@app/shared/domain/push-token';

import type { Container } from '../container';
import { apiRoute, type HttpDeps } from '../http/respond';

export function pushTokenRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/push-tokens'>(
    {
      /** POST /api/push-tokens {token, platform, appVersion?} → 204 */
      POST: async (req) => {
        const input = registerPushTokenValidator.parse(await req.json());
        await container.pushTokenService().register(input);
        return new Response(null, { status: 204 });
      },
    },
    deps,
  );
}

export function pushTokenUnregisterRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/push-tokens/unregister'>(
    {
      /** POST /api/push-tokens/unregister {token} → 204 (idempotent) */
      POST: async (req) => {
        const input = unregisterPushTokenValidator.parse(await req.json());
        await container.pushTokenService().unregister(input.token);
        return new Response(null, { status: 204 });
      },
    },
    deps,
  );
}
