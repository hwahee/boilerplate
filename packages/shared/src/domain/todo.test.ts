import { describe, expect, test } from 'bun:test';

import { createTodoValidator, listTodosQueryValidator, updateTodoValidator } from './todo';

describe('createTodoValidator', () => {
  test('accepts a valid title', () => {
    expect(createTodoValidator.parse({ title: 'Buy milk' })).toEqual({ title: 'Buy milk' });
  });

  test('rejects empty, blank and oversized titles', () => {
    expect(createTodoValidator.safeParse({ title: '' }).ok).toBe(false);
    expect(createTodoValidator.safeParse({ title: '   ' }).ok).toBe(false);
    expect(createTodoValidator.safeParse({ title: 'x'.repeat(201) }).ok).toBe(false);
  });

  test('rejects unknown fields (strict body)', () => {
    expect(createTodoValidator.safeParse({ title: 'ok', extra: true }).ok).toBe(false);
  });
});

describe('updateTodoValidator', () => {
  test('accepts partial patches', () => {
    expect(updateTodoValidator.parse({ status: 'done' })).toEqual({ status: 'done' });
    expect(updateTodoValidator.parse({ title: 'New' })).toEqual({ title: 'New' });
  });

  test('rejects an empty patch', () => {
    expect(updateTodoValidator.safeParse({}).ok).toBe(false);
  });

  test('rejects unknown statuses', () => {
    expect(updateTodoValidator.safeParse({ status: 'archived' }).ok).toBe(false);
  });
});

describe('listTodosQueryValidator', () => {
  test('applies the cursor pagination defaults', () => {
    expect(listTodosQueryValidator.parse({})).toEqual({
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  test('accepts a cursor, filters and sorting', () => {
    expect(
      listTodosQueryValidator.parse({
        limit: 50,
        cursor: 'opaque-cursor',
        sortBy: 'title',
        sortOrder: 'asc',
        status: 'open',
        q: 'milk',
      }),
    ).toMatchObject({ limit: 50, cursor: 'opaque-cursor', sortBy: 'title', status: 'open' });
  });

  test('rejects out-of-range and unknown values', () => {
    expect(listTodosQueryValidator.safeParse({ limit: 0 }).ok).toBe(false);
    expect(listTodosQueryValidator.safeParse({ limit: 101 }).ok).toBe(false);
    expect(listTodosQueryValidator.safeParse({ sortBy: 'id' }).ok).toBe(false);
    expect(listTodosQueryValidator.safeParse({ status: 'archived' }).ok).toBe(false);
    expect(listTodosQueryValidator.safeParse({ cursor: '' }).ok).toBe(false);
  });
});
