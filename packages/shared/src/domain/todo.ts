/**
 * Todo domain — the shared contract between server and mobile app, and the
 * demo domain that exercises every repo convention end-to-end (cursor
 * pagination, optimistic mutations, offline cache, WebSocket invalidation).
 *
 * Contains the entity type, input validators and the list-query validator
 * following the repo-wide cursor pagination convention (@app/shared/api/pagination).
 */
import { CURSOR_PAGINATION, SORT_ORDERS } from '../api/pagination';
import type { UtcIsoString } from '../time';
import { s, toValidator, type Infer } from '../validation';

const TODO_STATUSES = ['open', 'done'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

/** Sortable fields for `GET /api/todos` (whitelist — never raw SQL columns). */
const TODO_SORT_FIELDS = ['createdAt', 'title'] as const;
export type TodoSortField = (typeof TODO_SORT_FIELDS)[number];

export interface Todo {
  id: string;
  title: string;
  status: TodoStatus;
  /** UTC — converted to the viewer's time zone only at the display boundary. */
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
}

const titleSchema = s.string().check(
  s.minLength(1),
  s.maxLength(200),
  s.refine((value) => value.trim().length > 0, { message: 'Title must not be blank' }),
);

/** Body of `POST /api/todos`. Strict: unknown fields are rejected. */
export const createTodoValidator = toValidator(
  s.strictObject({
    title: titleSchema,
  }),
);
export type CreateTodoInput = Infer<typeof createTodoValidator>;

/** Body of `PATCH /api/todos/:id`. At least one field must be present. */
export const updateTodoValidator = toValidator(
  s
    .strictObject({
      title: s.optional(titleSchema),
      status: s.optional(s.enum(TODO_STATUSES)),
    })
    .check(
      s.refine((patch) => patch.title !== undefined || patch.status !== undefined, {
        message: 'At least one of "title" or "status" is required',
      }),
    ),
);
export type UpdateTodoInput = Infer<typeof updateTodoValidator>;

/**
 * Query of `GET /api/todos` — cursor pagination convention plus the
 * endpoint's own filter params (`status`, `q`).
 */
export const listTodosQueryValidator = toValidator(
  s.object({
    limit: s._default(
      s.int().check(s.gte(1), s.lte(CURSOR_PAGINATION.maxLimit)),
      CURSOR_PAGINATION.defaultLimit,
    ),
    /** Opaque `nextCursor` from the previous page; absent on the first page. */
    cursor: s.optional(s.string().check(s.minLength(1))),
    sortBy: s._default(s.enum(TODO_SORT_FIELDS), 'createdAt'),
    sortOrder: s._default(s.enum(SORT_ORDERS), 'desc'),
    /** Filter: exact status match. */
    status: s.optional(s.enum(TODO_STATUSES)),
    /** Filter: case-insensitive substring match on the title. */
    q: s.optional(s.string().check(s.maxLength(200))),
  }),
);
export type TodoListQuery = Infer<typeof listTodosQueryValidator>;
