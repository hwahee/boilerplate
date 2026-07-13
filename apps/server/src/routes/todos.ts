/**
 * /api/todos — REST resource following every repo convention:
 * cursor pagination/sort/filter (@app/shared/api/pagination), the error
 * envelope, schema validation at the boundary, and UTC-only timestamps.
 */
import { searchParamsToObject } from '@app/shared/api/pagination';
import {
  createTodoValidator,
  listTodosQueryValidator,
  updateTodoValidator,
} from '@app/shared/domain/todo';

import type { Container } from '../container';
import { apiRoute, json, type HttpDeps } from '../http/respond';

export function todoCollectionRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/todos'>(
    {
      /** GET /api/todos?limit&cursor&sortBy&sortOrder&status&q → CursorPage<Todo> */
      GET: async (req) => {
        const params = new URL(req.url).searchParams;
        params.delete('lang'); // locale override is not part of the list query
        const query = listTodosQueryValidator.parse(searchParamsToObject(params));
        return json(await container.todoService().list(query));
      },

      /** POST /api/todos {title} → 201 Todo */
      POST: async (req) => {
        const input = createTodoValidator.parse(await req.json());
        const todo = await container.todoService().create(input);
        return json(todo, { status: 201 });
      },
    },
    deps,
  );
}

export function todoItemRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/todos/:id'>(
    {
      /** GET /api/todos/:id → Todo | 404 */
      GET: async (req) => json(await container.todoService().get(req.params.id)),

      /** PATCH /api/todos/:id {title?, status?} → Todo | 404 */
      PATCH: async (req) => {
        const patch = updateTodoValidator.parse(await req.json());
        return json(await container.todoService().update(req.params.id, patch));
      },

      /** DELETE /api/todos/:id → 204 | 404 */
      DELETE: async (req) => {
        await container.todoService().delete(req.params.id);
        return new Response(null, { status: 204 });
      },
    },
    deps,
  );
}
