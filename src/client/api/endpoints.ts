/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API CATALOG — every server endpoint the client uses, in ONE place.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Conventions (shared with the server, see src/shared/api):
 *   - List endpoints take `page`, `pageSize`, `sortBy`, `sortOrder` plus
 *     endpoint-specific flat filter params, and return the `Page<T>` envelope.
 *   - Errors always arrive as `{ error: { code, message, details? } }` and are
 *     surfaced as `ApiRequestError` (src/client/api/http.ts).
 *   - All timestamps are UTC ISO strings; format them for display with
 *     `formatUtcInTimeZone` (@shared/time) — never re-interpret on the client.
 *
 * Adding an endpoint? Define it here with a doc comment like the ones below;
 * components must import from this module (or the query hooks built on it in
 * ./queries.ts), never call `fetch` directly.
 */
import type { Page } from '@shared/api/pagination';
import type { CreateTodoInput, Todo, TodoListQuery, UpdateTodoInput } from '@shared/domain/todo';
import type { DevLoginInput, User } from '@shared/domain/user';

import { ApiRequestError, apiFetch } from './http';

/** The client may send a partial list query; the server applies the defaults. */
export type TodoListQueryInput = Partial<TodoListQuery>;

export const todosApi = {
  /**
   * `GET /api/todos`
   *
   * Paginated todo list.
   * - Filters: `status` ('open' | 'done'), `q` (case-insensitive title search)
   * - Sort:    `sortBy` ('createdAt' | 'title') + `sortOrder` ('asc' | 'desc')
   * - Returns: `Page<Todo>` — `items`, `page`, `pageSize`, `totalItems`,
   *            `totalPages`, `hasNextPage`
   */
  list(query: TodoListQueryInput = {}): Promise<Page<Todo>> {
    return apiFetch('/api/todos', { searchParams: query });
  },

  /**
   * `GET /api/todos/:id`
   *
   * Single todo by id.
   * - Errors: 404 `NOT_FOUND` when the id does not exist.
   */
  get(id: string): Promise<Todo> {
    return apiFetch(`/api/todos/${id}`);
  },

  /**
   * `POST /api/todos`
   *
   * Creates a todo (status starts as 'open').
   * - Body:   `{ title: string }` — 1–200 chars, not blank.
   * - Errors: 400 `VALIDATION_ERROR` with issue details.
   * - Returns 201 with the created `Todo`.
   */
  create(input: CreateTodoInput): Promise<Todo> {
    return apiFetch('/api/todos', { method: 'POST', body: input });
  },

  /**
   * `PATCH /api/todos/:id`
   *
   * Partial update; at least one of `title` / `status` must be present.
   * - Errors: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`.
   * - Returns the updated `Todo`.
   */
  update(id: string, patch: UpdateTodoInput): Promise<Todo> {
    return apiFetch(`/api/todos/${id}`, { method: 'PATCH', body: patch });
  },

  /**
   * `DELETE /api/todos/:id`
   *
   * Deletes a todo.
   * - Errors: 404 `NOT_FOUND`.
   * - Returns 204 (void).
   */
  remove(id: string): Promise<void> {
    return apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
  },
};

/**
 * Sign-in. The session travels as an httpOnly cookie the browser sends on its
 * own (same-origin), so none of these calls handle a token.
 *
 * These endpoints exist only when the server runs with `AUTH_DRIVER=dev`;
 * otherwise every one of them answers 404 `NOT_FOUND`.
 */
export const authApi = {
  /**
   * `POST /api/auth/dev-login`
   *
   * Signs in by user id alone — no password (development only). The first
   * sign-in with an id creates that user.
   * - Body:   `{ userId: string }` — 1–50 chars of `a-z`, `0-9`, `_`, `-`.
   * - Errors: 400 `VALIDATION_ERROR`.
   * - Returns the signed-in `User` and sets the session cookie.
   */
  devLogin(input: DevLoginInput): Promise<User> {
    return apiFetch('/api/auth/dev-login', { method: 'POST', body: input });
  },

  /**
   * `GET /api/auth/me`
   *
   * The signed-in user.
   * - Returns `null` when signed out (the server's 401 `UNAUTHORIZED`).
   */
  async me(): Promise<User | null> {
    try {
      return await apiFetch<User>('/api/auth/me');
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'UNAUTHORIZED') return null;
      throw error;
    }
  },

  /**
   * `POST /api/auth/logout`
   *
   * Signs out (clears the session cookie). Succeeds when already signed out.
   * - Returns 204 (void).
   */
  logout(): Promise<void> {
    return apiFetch('/api/auth/logout', { method: 'POST' });
  },
};
