import { beforeEach, describe, expect, test } from 'bun:test';

import { listTodosQueryValidator } from '@shared/domain/todo';

import { NotFoundError } from '../lib/errors';
import { createMemoryPubSub } from '../pubsub/memory';
import { CHANNELS, type PubSub } from '../pubsub/types';
import {
  createMemoryAuditLogRepository,
  createMemoryTodoRepository,
  createMemoryUnitOfWork,
  MemoryStore,
} from '../repositories/memory';
import type { AuditLogRepository } from '../repositories/types';
import { TodoService } from './todo-service';

let store: MemoryStore;
let events: PubSub;

function makeService(overrides: { auditLogs?: AuditLogRepository } = {}): TodoService {
  return new TodoService({
    todos: createMemoryTodoRepository(store),
    auditLogs: overrides.auditLogs ?? createMemoryAuditLogRepository(store),
    uow: createMemoryUnitOfWork(store),
    events,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  events = createMemoryPubSub();
});

describe('TodoService.create', () => {
  test('creates an open todo with a trimmed title', async () => {
    const todo = await makeService().create({ title: '  Buy milk  ' });
    expect(todo.title).toBe('Buy milk');
    expect(todo.status).toBe('open');
    expect(store.todos.get(todo.id)?.title).toBe('Buy milk');
  });

  test('writes the audit entry in the same transaction', async () => {
    const todo = await makeService().create({ title: 'Audit me' });
    expect(store.auditLogs).toHaveLength(1);
    expect(store.auditLogs[0]).toMatchObject({
      entityType: 'todo',
      entityId: todo.id,
      action: 'todo.created',
    });
  });

  test('publishes a change event', async () => {
    const received: unknown[] = [];
    await events.subscribe(CHANNELS.todosChanged, (message) => received.push(message));

    const todo = await makeService().create({ title: 'Notify' });
    await Bun.sleep(0); // memory pub/sub delivers asynchronously

    expect(received).toEqual([{ action: 'created', todoId: todo.id }]);
  });

  test('rolls the todo back when the audit write fails (transactionality)', async () => {
    const failingAudits: AuditLogRepository = {
      append: () => Promise.reject(new Error('audit db down')),
    };
    await expect(
      makeService({ auditLogs: failingAudits }).create({ title: 'Doomed' }),
    ).rejects.toThrow('audit db down');
    expect(store.todos.size).toBe(0); // nothing committed
  });
});

describe('TodoService.update', () => {
  test('applies a partial patch and bumps updatedAt', async () => {
    const service = makeService();
    const created = await service.create({ title: 'Original' });
    await Bun.sleep(2);

    const updated = await service.update(created.id, { status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.title).toBe('Original');
    expect(updated.updatedAt > created.updatedAt).toBe(true);
  });

  test('throws NotFoundError for unknown ids', async () => {
    await expect(makeService().update('missing', { status: 'done' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('TodoService.delete', () => {
  test('removes the todo and audits the deletion', async () => {
    const service = makeService();
    const todo = await service.create({ title: 'Remove me' });

    await service.delete(todo.id);
    expect(store.todos.size).toBe(0);
    expect(store.auditLogs.map((entry) => entry.action)).toEqual(['todo.created', 'todo.deleted']);
  });

  test('throws NotFoundError for unknown ids', async () => {
    await expect(makeService().delete('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TodoService.list / get', () => {
  test('returns the Page envelope', async () => {
    const service = makeService();
    await service.create({ title: 'One' });
    await service.create({ title: 'Two' });

    const page = await service.list(listTodosQueryValidator.parse({ pageSize: 1 }));
    expect(page.items).toHaveLength(1);
    expect(page.totalItems).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.hasNextPage).toBe(true);
  });

  test('get returns the todo or throws NotFoundError', async () => {
    const service = makeService();
    const todo = await service.create({ title: 'Find me' });
    expect((await service.get(todo.id)).id).toBe(todo.id);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
