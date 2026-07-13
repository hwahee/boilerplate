/**
 * TanStack Query bindings — the ONLY way screens read/write server data.
 *
 * Conventions:
 *   - Query keys come from the `queryKeys` factory (never inline arrays).
 *   - Lists are `useInfiniteQuery` + cursor pagination (`nextCursor`).
 *   - Mutations use optimistic updates where the outcome is locally
 *     predictable (toggle/delete): snapshot → apply → rollback on error →
 *     invalidate on settle (re-sync with the server as the source of truth).
 *   - Retry policy (global defaults in src/App.tsx): queries retry twice on
 *     transport/5xx errors and never on 4xx contract errors; mutations never
 *     auto-retry (they are not idempotent).
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import type { CursorPage } from '@app/shared/api/pagination';
import type { Todo, TodoStatus, UpdateTodoInput } from '@app/shared/domain/todo';

import { useApi } from './ApiProvider';

export interface TodoFilter {
  status?: TodoStatus;
}

/** @public single source of query keys — import from here, never inline */
export const queryKeys = {
  todosRoot: ['todos'] as const,
  todos: (filter: TodoFilter) => ['todos', filter.status ?? 'all'] as const,
};

type TodoPages = InfiniteData<CursorPage<Todo>, string | null>;

const PAGE_SIZE = 20;

/** Infinite-scroll todo list; `fetchNextPage` pulls the next cursor page. */
export function useTodosInfinite(filter: TodoFilter) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.todos(filter),
    queryFn: ({ pageParam }) =>
      api.listTodos({
        limit: PAGE_SIZE,
        cursor: pageParam ?? undefined,
        status: filter.status,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Applies `mutate` to every cached todos page (all filters). */
function mapTodoPages(
  data: TodoPages | undefined,
  mutate: (todos: Todo[]) => Todo[],
): TodoPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: mutate(page.items) })),
  };
}

export function useCreateTodo() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.createTodo({ title }),
    // No optimistic insert: the server owns id/createdAt (list order).
    // Invalidate instead — the list refetches with the real row.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.todosRoot }),
  });
}

export function useUpdateTodo() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTodoInput }) =>
      api.updateTodo(id, patch),

    // Optimistic update: snapshot → apply locally → rollback on failure.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todosRoot });
      const snapshot = queryClient.getQueriesData<TodoPages>({ queryKey: queryKeys.todosRoot });
      queryClient.setQueriesData<TodoPages>({ queryKey: queryKeys.todosRoot }, (data) =>
        mapTodoPages(data, (todos) =>
          todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)),
        ),
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    // Re-sync: the server remains the source of truth (updatedAt etc.).
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.todosRoot }),
  });
}

export function useDeleteTodo() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTodo(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todosRoot });
      const snapshot = queryClient.getQueriesData<TodoPages>({ queryKey: queryKeys.todosRoot });
      queryClient.setQueriesData<TodoPages>({ queryKey: queryKeys.todosRoot }, (data) =>
        mapTodoPages(data, (todos) => todos.filter((todo) => todo.id !== id)),
      );
      return { snapshot };
    },
    onError: (_error, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.todosRoot }),
  });
}
