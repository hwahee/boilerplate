/**
 * ═══ THE API CATALOG — every server endpoint the app talks to, in ONE place ═══
 *
 * Rules:
 *   - Components NEVER call fetch or the client directly; they use the
 *     TanStack Query hooks in ./queries.ts, which call these functions.
 *   - Each function documents: purpose, method+path, params, response shape,
 *     and the error codes worth branching on.
 *   - Types come from @app/shared — the same contracts the server validates.
 *
 * Wire discipline (version skew): mobile binaries live for weeks. Response
 * fields used here may be ADDED to by the server but never removed or
 * repurposed — see docs/release-playbook.md.
 */
import type { CursorPage } from '@app/shared/api/pagination';
import { appConfigResponseValidator, type AppConfigResponse } from '@app/shared/domain/app-config';
import type { RegisterPushTokenInput } from '@app/shared/domain/push-token';
import type {
  CreateTodoInput,
  Todo,
  TodoListQuery,
  UpdateTodoInput,
} from '@app/shared/domain/todo';
import { versionPolicyValidator, type VersionPolicy } from '@app/shared/domain/version-policy';
import type { Platform } from '@app/shared/domain/platform';

import type { ApiClient } from './client';

export interface AppConfigFetchResult {
  /** `null` when the server answered 304 Not Modified (nothing changed). */
  payload: AppConfigResponse | null;
  /** Echo back via `ifNoneMatch` on the next poll. */
  etag: string | null;
}

export interface Endpoints {
  /**
   * Version/update policy for this platform — called on cold start and on
   * every foreground return (see src/boot + src/lifecycle).
   *
   * GET /api/version-policy?platform=ios|android
   * → VersionPolicy (validated; a malformed payload throws and the boot
   *   sequence fails open rather than crashing)
   * Errors: 404 NOT_FOUND when no policy is configured for the platform.
   */
  getVersionPolicy(platform: Platform): Promise<VersionPolicy>;

  /**
   * Remote config snapshot with ETag-based polling.
   *
   * GET /api/app-config  (If-None-Match: <etag from the previous call>)
   * → 200 { revision, entries } + ETag   — something changed
   * → 304 (empty)                        — nothing changed, payload = null
   */
  getAppConfig(ifNoneMatch?: string | null): Promise<AppConfigFetchResult>;

  /**
   * One page of todos — cursor pagination for infinite scroll.
   *
   * GET /api/todos?limit&cursor&sortBy&sortOrder&status&q
   * → CursorPage<Todo> (feed `nextCursor` back as `cursor` for the next page)
   * Errors: 400 VALIDATION_ERROR on malformed cursors/params.
   */
  listTodos(query: Partial<TodoListQuery>): Promise<CursorPage<Todo>>;

  /**
   * POST /api/todos {title} → 201 Todo
   * Errors: 400 VALIDATION_ERROR (empty/blank/oversized title).
   */
  createTodo(input: CreateTodoInput): Promise<Todo>;

  /**
   * PATCH /api/todos/:id {title?, status?} → Todo
   * Errors: 404 NOT_FOUND, 400 VALIDATION_ERROR (empty patch).
   */
  updateTodo(id: string, patch: UpdateTodoInput): Promise<Todo>;

  /**
   * DELETE /api/todos/:id → 204
   * Errors: 404 NOT_FOUND.
   */
  deleteTodo(id: string): Promise<void>;

  /**
   * Registers this device's push token (idempotent upsert; re-run on every
   * launch). POST /api/push-tokens {token, platform, appVersion?} → 204
   */
  registerPushToken(input: RegisterPushTokenInput): Promise<void>;

  /**
   * Unregisters a push token (logout / permission revoked).
   * POST /api/push-tokens/unregister {token} → 204 (idempotent)
   */
  unregisterPushToken(token: string): Promise<void>;
}

export function createEndpoints(client: ApiClient): Endpoints {
  return {
    async getVersionPolicy(platform) {
      const { data } = await client.request<unknown>('/api/version-policy', {
        query: { platform },
      });
      return versionPolicyValidator.parse(data) as VersionPolicy;
    },

    async getAppConfig(ifNoneMatch) {
      const response = await client.request<unknown>('/api/app-config', {
        headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : undefined,
      });
      const etag = response.headers.get('etag');
      if (response.status === 304) return { payload: null, etag };
      return { payload: appConfigResponseValidator.parse(response.data), etag };
    },

    async listTodos(query) {
      const { data } = await client.request<CursorPage<Todo>>('/api/todos', {
        query: {
          limit: query.limit,
          cursor: query.cursor,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          status: query.status,
          q: query.q,
        },
      });
      return data;
    },

    async createTodo(input) {
      const { data } = await client.request<Todo>('/api/todos', { method: 'POST', body: input });
      return data;
    },

    async updateTodo(id, patch) {
      const { data } = await client.request<Todo>(`/api/todos/${id}`, {
        method: 'PATCH',
        body: patch,
      });
      return data;
    },

    async deleteTodo(id) {
      await client.request<void>(`/api/todos/${id}`, { method: 'DELETE' });
    },

    async registerPushToken(input) {
      await client.request<void>('/api/push-tokens', { method: 'POST', body: input });
    },

    async unregisterPushToken(token) {
      await client.request<void>('/api/push-tokens/unregister', {
        method: 'POST',
        body: { token },
      });
    },
  };
}
