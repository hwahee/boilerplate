/**
 * /api/app-config — remote config polling endpoint.
 *
 * Traffic-frugal by design: the response carries `ETag: "cfg-<revision>"`;
 * clients poll with `If-None-Match` and get an empty 304 when nothing
 * changed. The WebSocket push path (/ws) covers the "changed" direction —
 * polling is the safety net (background return, dropped sockets).
 */
import type { AppConfigResponse } from '@app/shared/domain/app-config';

import type { Container } from '../container';
import { apiRoute, json, type HttpDeps } from '../http/respond';

function etagOf(revision: number): string {
  return `"cfg-${revision}"`;
}

export function appConfigRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/app-config'>(
    {
      /** GET /api/app-config → { revision, entries } (304 on ETag match) */
      GET: async (req) => {
        const snapshot = await container.appConfigService().get();
        const etag = etagOf(snapshot.revision);
        const headers = { etag, 'cache-control': 'no-cache' };

        if (req.headers.get('if-none-match') === etag) {
          return new Response(null, { status: 304, headers });
        }
        const body: AppConfigResponse = snapshot;
        return json(body, { headers });
      },
    },
    deps,
  );
}
