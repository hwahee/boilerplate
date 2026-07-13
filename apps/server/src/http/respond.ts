/**
 * Route plumbing shared by every API endpoint:
 *
 *   - JSON responses
 *   - the repo-wide error envelope (@app/shared/api/errors), localized
 *   - the app-version upgrade gate (426, see ./version-gate.ts)
 *   - CORS preflight + response headers
 *   - mapping of domain errors (ValidationError, NotFoundError, …) to HTTP
 */
import type { ApiErrorBody, ApiErrorCode } from '@app/shared/api/errors';
import type { MessageKey } from '@app/shared/i18n';
import { ValidationError } from '@app/shared/validation';

import type { ServerConfig } from '../config';
import { NotFoundError, UnauthorizedError, UpgradeRequiredError } from '../lib/errors';
import type { Logger } from '../lib/log';
import { createRequestContext, type RequestContext } from './context';
import { corsHeaders, preflightResponse } from './cors';

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  });
}

const ERROR_MESSAGE_KEYS: Record<ApiErrorCode, MessageKey> = {
  VALIDATION_ERROR: 'error.validation',
  NOT_FOUND: 'error.notFound',
  UNAUTHORIZED: 'error.unauthorized',
  UPGRADE_REQUIRED: 'error.upgradeRequired',
  INTERNAL_ERROR: 'error.internal',
};

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  ctx: RequestContext,
  details?: unknown,
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message: ctx.t(ERROR_MESSAGE_KEYS[code]),
      ...(details === undefined ? {} : { details }),
    },
  };
  return json(body, { status });
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ApiHandler<P extends string> = (
  req: Bun.BunRequest<P>,
  ctx: RequestContext,
) => Promise<Response>;

/**
 * Pre-handler check derived from the client-identification headers; returns
 * a response (e.g. 426) to short-circuit the request. See ./version-gate.ts.
 */
export type VersionGate = (req: Request, ctx: RequestContext) => Promise<Response | undefined>;

export interface HttpDeps {
  config: ServerConfig;
  log: Logger;
  versionGate: VersionGate;
}

/**
 * Wraps a set of method handlers into a Bun `routes` entry with the shared
 * middleware behavior applied (preflight, upgrade gate, error mapping,
 * CORS response headers).
 */
export function apiRoute<P extends string>(
  handlers: Partial<Record<Method, ApiHandler<P>>>,
  deps: HttpDeps,
): Record<string, (req: Bun.BunRequest<P>) => Promise<Response>> {
  const wrap =
    (handler: ApiHandler<P>) =>
    async (req: Bun.BunRequest<P>): Promise<Response> => {
      const ctx = createRequestContext(req);
      let response: Response;
      try {
        response = (await deps.versionGate(req, ctx)) ?? (await handler(req, ctx));
      } catch (error) {
        response = mapError(error, ctx, deps.log);
      }
      // Append CORS headers for allowed cross-origin callers.
      for (const [name, value] of Object.entries(corsHeaders(req, deps.config.corsOrigins))) {
        response.headers.set(name, value);
      }
      return response;
    };

  const route: Record<string, (req: Bun.BunRequest<P>) => Promise<Response>> = {
    OPTIONS: (req) => Promise.resolve(preflightResponse(req, deps.config.corsOrigins)),
  };
  for (const [method, handler] of Object.entries(handlers)) {
    route[method] = wrap(handler);
  }
  return route;
}

function mapError(error: unknown, ctx: RequestContext, log: Logger): Response {
  if (error instanceof ValidationError) {
    return errorResponse(400, 'VALIDATION_ERROR', ctx, error.issues);
  }
  if (error instanceof SyntaxError) {
    // Malformed JSON body is the caller's problem, not a server fault.
    return errorResponse(400, 'VALIDATION_ERROR', ctx, [
      { path: '', message: 'Request body is not valid JSON', code: 'invalid_json' },
    ]);
  }
  if (error instanceof NotFoundError) {
    return errorResponse(404, 'NOT_FOUND', ctx, { resource: error.resource, id: error.id });
  }
  if (error instanceof UnauthorizedError) {
    return errorResponse(401, 'UNAUTHORIZED', ctx);
  }
  if (error instanceof UpgradeRequiredError) {
    return errorResponse(426, 'UPGRADE_REQUIRED', ctx, error.details);
  }
  log.error('unhandled error in api handler', {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return errorResponse(500, 'INTERNAL_ERROR', ctx);
}
