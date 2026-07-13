import { describe, expect, test } from 'bun:test';

import { listTodosQueryValidator, type Todo } from '@app/shared/domain/todo';
import type { UtcIsoString } from '@app/shared/time';

import { createMemoryTodoRepository, createMemoryUnitOfWork, MemoryStore } from './memory';

function makeTodo(overrides: Partial<Todo> & Pick<Todo, 'id' | 'title'>): Todo {
  return {
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z' as UtcIsoString,
    updatedAt: '2026-01-01T00:00:00.000Z' as UtcIsoString,
    ...overrides,
  };
}

function seededStore(): MemoryStore {
  const store = new MemoryStore();
  store.todos.set(
    '1',
    makeTodo({ id: '1', title: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' as UtcIsoString }),
  );
  store.todos.set(
    '2',
    makeTodo({
      id: '2',
      title: 'bravo',
      status: 'done',
      createdAt: '2026-01-02T00:00:00.000Z' as UtcIsoString,
    }),
  );
  store.todos.set(
    '3',
    makeTodo({ id: '3', title: 'Charlie', createdAt: '2026-01-03T00:00:00.000Z' as UtcIsoString }),
  );
  return store;
}

const query = (input: Record<string, unknown> = {}) => listTodosQueryValidator.parse(input);

describe('memory todo repository — list', () => {
  test('sorts by createdAt desc by default', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const items = await repo.list(query(), null);
    expect(items.map((todo) => todo.id)).toEqual(['3', '2', '1']);
  });

  test('filters by status', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const items = await repo.list(query({ status: 'done' }), null);
    expect(items.map((todo) => todo.id)).toEqual(['2']);
  });

  test('filters by q, case-insensitively', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const items = await repo.list(query({ q: 'BRA' }), null);
    expect(items.map((todo) => todo.title)).toEqual(['bravo']);
  });

  test('sorts by title ascending', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const items = await repo.list(query({ sortBy: 'title', sortOrder: 'asc' }), null);
    expect(items.map((todo) => todo.title)).toEqual(['Alpha', 'bravo', 'Charlie']);
  });

  test('returns limit + 1 rows so the service can detect a next page', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const items = await repo.list(query({ limit: 2 }), null);
    expect(items).toHaveLength(3); // 2 requested + 1 lookahead
  });

  test('keyset cursor: continues strictly after (v, id) in the ordering', async () => {
    const repo = createMemoryTodoRepository(seededStore());
    const q = query({ limit: 1 });
    const first = await repo.list(q, null);
    expect(first[0]!.id).toBe('3');

    const second = await repo.list(q, { v: first[0]!.createdAt, id: first[0]!.id });
    expect(second[0]!.id).toBe('2');

    const third = await repo.list(q, { v: second[0]!.createdAt, id: second[0]!.id });
    expect(third[0]!.id).toBe('1');
    expect(third).toHaveLength(1); // no lookahead row — this is the end
  });

  test('keyset cursor breaks createdAt ties by id ascending', async () => {
    const store = new MemoryStore();
    const at = '2026-01-01T00:00:00.000Z' as UtcIsoString;
    for (const id of ['a', 'b', 'c']) {
      store.todos.set(id, makeTodo({ id, title: id, createdAt: at }));
    }
    const repo = createMemoryTodoRepository(store);
    const q = query({ limit: 1 });
    const first = await repo.list(q, null);
    const second = await repo.list(q, { v: at, id: first[0]!.id });
    expect(first[0]!.id).toBe('a');
    expect(second[0]!.id).toBe('b');
  });
});

describe('memory unit of work', () => {
  test('commits mutations when the callback succeeds', async () => {
    const store = new MemoryStore();
    const repo = createMemoryTodoRepository(store);
    const uow = createMemoryUnitOfWork(store);

    await uow.run(async (tx) => {
      await repo.insert(makeTodo({ id: 'a', title: 'kept' }), tx);
    });
    expect(store.todos.has('a')).toBe(true);
  });

  test('rolls every mutation back when the callback throws', async () => {
    const store = seededStore();
    const repo = createMemoryTodoRepository(store);
    const uow = createMemoryUnitOfWork(store);

    await expect(
      uow.run(async (tx) => {
        await repo.insert(makeTodo({ id: 'x', title: 'doomed' }), tx);
        await repo.deleteById('1', tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(store.todos.has('x')).toBe(false);
    expect(store.todos.has('1')).toBe(true);
  });
});
