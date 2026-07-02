/**
 * Todo business logic — pure of HTTP concerns, unit-tested against the
 * in-memory repositories.
 */
import type { CreateTodoInput, Todo, TodoListQuery, UpdateTodoInput } from '@shared/domain/todo';
import { buildPage, type Page } from '@shared/api/pagination';
import { nowUtc } from '@shared/time';

import { NotFoundError } from '../lib/errors';
import { CHANNELS, type PubSub } from '../pubsub';
import type { AuditLogRepository, TodoRepository, UnitOfWork } from '../repositories/types';

export interface TodoChangedEvent {
  action: 'created' | 'updated' | 'deleted';
  todoId: string;
}

interface TodoServiceDeps {
  todos: TodoRepository;
  auditLogs: AuditLogRepository;
  uow: UnitOfWork;
  events: PubSub;
}

export class TodoService {
  constructor(private readonly deps: TodoServiceDeps) {}

  async list(query: TodoListQuery): Promise<Page<Todo>> {
    const { items, totalItems } = await this.deps.todos.list(query);
    return buildPage(items, totalItems, query);
  }

  async get(id: string): Promise<Todo> {
    const todo = await this.deps.todos.findById(id);
    if (!todo) throw new NotFoundError('todo', id);
    return todo;
  }

  async create(input: CreateTodoInput): Promise<Todo> {
    const now = nowUtc();
    const todo: Todo = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    // ── Transaction boundary: todo row + audit entry are atomic. ──
    await this.deps.uow.run(async (tx) => {
      await this.deps.todos.insert(todo, tx);
      await this.deps.auditLogs.append(
        {
          entityType: 'todo',
          entityId: todo.id,
          action: 'todo.created',
          payload: { title: todo.title },
          createdAt: now,
        },
        tx,
      );
    });

    await this.notifyChanged({ action: 'created', todoId: todo.id });
    // Demo background job: worker-role processes pick this up (see src/server/worker).
    await this.deps.events.publish(CHANNELS.jobs, { type: 'todo.created', todoId: todo.id });
    return todo;
  }

  async update(id: string, patch: UpdateTodoInput): Promise<Todo> {
    const now = nowUtc();

    // ── Transaction boundary: read + write + audit entry are atomic. ──
    const updated = await this.deps.uow.run(async (tx) => {
      const existing = await this.deps.todos.findById(id, tx);
      if (!existing) throw new NotFoundError('todo', id);

      const next: Todo = {
        ...existing,
        title: patch.title !== undefined ? patch.title.trim() : existing.title,
        status: patch.status ?? existing.status,
        updatedAt: now,
      };
      await this.deps.todos.update(next, tx);
      await this.deps.auditLogs.append(
        {
          entityType: 'todo',
          entityId: id,
          action: 'todo.updated',
          payload: patch,
          createdAt: now,
        },
        tx,
      );
      return next;
    });

    await this.notifyChanged({ action: 'updated', todoId: id });
    return updated;
  }

  async delete(id: string): Promise<void> {
    // ── Transaction boundary: delete + audit entry are atomic. ──
    await this.deps.uow.run(async (tx) => {
      const deleted = await this.deps.todos.deleteById(id, tx);
      if (!deleted) throw new NotFoundError('todo', id);
      await this.deps.auditLogs.append(
        {
          entityType: 'todo',
          entityId: id,
          action: 'todo.deleted',
          createdAt: nowUtc(),
        },
        tx,
      );
    });

    await this.notifyChanged({ action: 'deleted', todoId: id });
  }

  /** Fans out to all instances (WebSocket bridges live in src/server/index.ts). */
  private async notifyChanged(event: TodoChangedEvent): Promise<void> {
    await this.deps.events.publish(CHANNELS.todosChanged, event);
  }
}
