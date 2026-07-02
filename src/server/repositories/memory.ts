/**
 * In-memory implementations of the persistence contracts.
 *
 * Used by the test suite (tests run with a single command, no external
 * services) and by DB-less local hacking (`DB_DRIVER=memory`). Semantics
 * mirror the Postgres implementation: same sorting, same filtering, same
 * pagination and snapshot-based transaction rollback.
 *
 * Limitation (documented on purpose): the snapshot/restore transaction model
 * is process-local and not safe for concurrent interleaved transactions —
 * fine for tests and local development, never used in production.
 */
import type { Todo, TodoListQuery } from '@shared/domain/todo';

import type {
  AuditLogEntry,
  AuditLogRepository,
  DbSession,
  TodoRepository,
  UnitOfWork,
} from './types';

export class MemoryStore {
  todos = new Map<string, Todo>();
  auditLogs: AuditLogEntry[] = [];

  snapshot(): { todos: Map<string, Todo>; auditLogs: AuditLogEntry[] } {
    return {
      todos: new Map([...this.todos].map(([id, todo]) => [id, { ...todo }])),
      auditLogs: this.auditLogs.map((entry) => ({ ...entry })),
    };
  }

  restore(snapshot: ReturnType<MemoryStore['snapshot']>): void {
    this.todos = snapshot.todos;
    this.auditLogs = snapshot.auditLogs;
  }
}

const MEMORY_SESSION: DbSession = { __dbSession: true };

export function createMemoryUnitOfWork(store: MemoryStore): UnitOfWork {
  return {
    async run<T>(fn: (session: DbSession) => Promise<T>): Promise<T> {
      const snapshot = store.snapshot();
      try {
        return await fn(MEMORY_SESSION);
      } catch (error) {
        store.restore(snapshot); // "rollback"
        throw error;
      }
    },
  };
}

function compareTodos(a: Todo, b: Todo, query: TodoListQuery): number {
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const primary =
    query.sortBy === 'title'
      ? a.title.localeCompare(b.title)
      : a.createdAt.localeCompare(b.createdAt);
  if (primary !== 0) return primary * direction;
  // Stable tiebreak on id, matching the SQL `ORDER BY …, id ASC`.
  return a.id.localeCompare(b.id);
}

export function createMemoryTodoRepository(store: MemoryStore): TodoRepository {
  return {
    async list(query) {
      let items = [...store.todos.values()];
      if (query.status) items = items.filter((todo) => todo.status === query.status);
      if (query.q) {
        const needle = query.q.toLowerCase();
        items = items.filter((todo) => todo.title.toLowerCase().includes(needle));
      }
      items.sort((a, b) => compareTodos(a, b, query));
      const offset = (query.page - 1) * query.pageSize;
      return Promise.resolve({
        items: items.slice(offset, offset + query.pageSize).map((todo) => ({ ...todo })),
        totalItems: items.length,
      });
    },

    async findById(id) {
      const todo = store.todos.get(id);
      return Promise.resolve(todo ? { ...todo } : null);
    },

    async insert(todo) {
      store.todos.set(todo.id, { ...todo });
      return Promise.resolve();
    },

    async update(todo) {
      store.todos.set(todo.id, { ...todo });
      return Promise.resolve();
    },

    async deleteById(id) {
      return Promise.resolve(store.todos.delete(id));
    },
  };
}

export function createMemoryAuditLogRepository(store: MemoryStore): AuditLogRepository {
  return {
    async append(entry) {
      store.auditLogs.push({ ...entry });
      return Promise.resolve();
    },
  };
}
