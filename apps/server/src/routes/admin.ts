/**
 * /api/admin/* — operator endpoints for the version policy, remote config
 * and push broadcasts.
 *
 * Auth: `Authorization: Bearer <ADMIN_TOKEN>`. When ADMIN_TOKEN is not
 * configured the endpoints reject every call — there is no default token
 * and no anonymous admin mode. (Note for a future GraphQL layer: the same
 * split applies — persisted-query fingerprints for app clients, arbitrary
 * queries only with this admin token.)
 */
import { isPlatform } from '@app/shared/domain/platform';
import { upsertConfigEntryValidator } from '@app/shared/domain/app-config';
import { upsertVersionPolicyValidator } from '@app/shared/domain/version-policy';
import { s, toValidator, ValidationError } from '@app/shared/validation';

import type { Container } from '../container';
import { UnauthorizedError } from '../lib/errors';
import { apiRoute, json, type HttpDeps } from '../http/respond';
import { CHANNELS } from '../pubsub';

function requireAdmin(req: Request, deps: HttpDeps): void {
  const token = deps.config.adminToken;
  const header = req.headers.get('authorization');
  if (!token || header !== `Bearer ${token}`) throw new UnauthorizedError();
}

export function adminVersionPolicyRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/admin/version-policy/:platform'>(
    {
      /** PUT /api/admin/version-policy/:platform {minSupportedVersion, latestVersion, updateMode, storeUrl, message?} → VersionPolicy */
      PUT: async (req) => {
        requireAdmin(req, deps);
        const { platform } = req.params;
        if (!isPlatform(platform)) {
          throw new ValidationError([
            { path: 'platform', message: 'platform must be ios or android', code: 'invalid_enum' },
          ]);
        }
        const input = upsertVersionPolicyValidator.parse(await req.json());
        return json(await container.versionPolicyService().upsert(platform, input));
      },
    },
    deps,
  );
}

const CONFIG_KEY_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

export function adminAppConfigRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/admin/app-config/:key'>(
    {
      /** PUT /api/admin/app-config/:key {value: <any JSON>} → { revision } */
      PUT: async (req) => {
        requireAdmin(req, deps);
        const { key } = req.params;
        if (!CONFIG_KEY_RE.test(key)) {
          throw new ValidationError([
            { path: 'key', message: 'Invalid config key', code: 'invalid_key' },
          ]);
        }
        const input = upsertConfigEntryValidator.parse(await req.json());
        return json(await container.appConfigService().set(key, input.value));
      },
    },
    deps,
  );
}

const broadcastValidator = toValidator(
  s.strictObject({
    title: s.string().check(s.minLength(1), s.maxLength(200)),
    body: s.string().check(s.minLength(1), s.maxLength(2000)),
    data: s.optional(s.record(s.string(), s.unknown())),
  }),
);

export function adminPushBroadcastRoute(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/admin/push/broadcast'>(
    {
      /**
       * POST /api/admin/push/broadcast {title, body, data?} → 202
       * Enqueues a background job — worker-role processes do the actual
       * sending through the PushSender facade (see src/worker.ts).
       */
      POST: async (req) => {
        requireAdmin(req, deps);
        const message = broadcastValidator.parse(await req.json());
        await container.pubsub().publish(CHANNELS.jobs, { type: 'push.broadcast', ...message });
        return json({ enqueued: true }, { status: 202 });
      },
    },
    deps,
  );
}
