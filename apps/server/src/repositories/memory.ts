/**
 * In-memory implementations of the persistence contracts.
 *
 * Used by the test suite (tests run with a single command, no external
 * services) and by DB-less local hacking (`DB_DRIVER=memory`). Semantics
 * mirror the Postgres implementation: same sorting, same filtering, same
 * keyset pagination and snapshot-based transaction rollback.
 *
 * Limitation (documented on purpose): the snapshot/restore transaction model
 * is process-local and not safe for concurrent interleaved transactions —
 * fine for tests and local development, never used in production.
 */
import type { Todo, TodoListQuery } from '@app/shared/domain/todo';
import type { Platform } from '@app/shared/domain/platform';
import type { VersionPolicy } from '@app/shared/domain/version-policy';

import type {
  AppConfigRepository,
  AuditLogEntry,
  AuditLogRepository,
  DbSession,
  DevicePushToken,
  PushTokenRepository,
  TodoListCursor,
  TodoRepository,
  UnitOfWork,
  VersionPolicyRepository,
} from './types';

export class MemoryStore {
  todos = new Map<string, Todo>();
  auditLogs: AuditLogEntry[] = [];
  versionPolicies = new Map<Platform, VersionPolicy>();
  appConfig = new Map<string, unknown>();
  appConfigRevision = 0;
  pushTokens = new Map<string, DevicePushToken>();

  snapshot() {
    return {
      todos: new Map([...this.todos].map(([id, todo]) => [id, { ...todo }])),
      auditLogs: this.auditLogs.map((entry) => ({ ...entry })),
      versionPolicies: new Map(
        [...this.versionPolicies].map(([platform, policy]) => [platform, { ...policy }]),
      ),
      appConfig: new Map(this.appConfig),
      appConfigRevision: this.appConfigRevision,
      pushTokens: new Map([...this.pushTokens].map(([token, row]) => [token, { ...row }])),
    };
  }

  restore(snapshot: ReturnType<MemoryStore['snapshot']>): void {
    this.todos = snapshot.todos;
    this.auditLogs = snapshot.auditLogs;
    this.versionPolicies = snapshot.versionPolicies;
    this.appConfig = snapshot.appConfig;
    this.appConfigRevision = snapshot.appConfigRevision;
    this.pushTokens = snapshot.pushTokens;
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

/** The sort-key value a cursor carries for a row (matches the Postgres driver). */
function sortValue(todo: Todo, sortBy: TodoListQuery['sortBy']): string {
  return sortBy === 'title' ? todo.title : todo.createdAt;
}

function compareTodos(a: Todo, b: Todo, query: TodoListQuery): number {
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const primary = sortValue(a, query.sortBy).localeCompare(sortValue(b, query.sortBy));
  if (primary !== 0) return primary * direction;
  // Stable tiebreak on id, matching the SQL `ORDER BY …, id ASC`.
  return a.id.localeCompare(b.id);
}

/** Is `todo` strictly AFTER the cursor position in the query's ordering? */
function isAfterCursor(todo: Todo, cursor: TodoListCursor, query: TodoListQuery): boolean {
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const primary = sortValue(todo, query.sortBy).localeCompare(cursor.v) * direction;
  if (primary !== 0) return primary > 0;
  return todo.id.localeCompare(cursor.id) > 0;
}

export function createMemoryTodoRepository(store: MemoryStore): TodoRepository {
  return {
    async list(query, cursor) {
      let items = [...store.todos.values()];
      if (query.status) items = items.filter((todo) => todo.status === query.status);
      if (query.q) {
        const needle = query.q.toLowerCase();
        items = items.filter((todo) => todo.title.toLowerCase().includes(needle));
      }
      items.sort((a, b) => compareTodos(a, b, query));
      if (cursor) items = items.filter((todo) => isAfterCursor(todo, cursor, query));
      // limit + 1: the extra row tells the service whether a next page exists.
      return Promise.resolve(items.slice(0, query.limit + 1).map((todo) => ({ ...todo })));
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

export function createMemoryVersionPolicyRepository(store: MemoryStore): VersionPolicyRepository {
  return {
    async findByPlatform(platform) {
      const policy = store.versionPolicies.get(platform);
      return Promise.resolve(policy ? { ...policy } : null);
    },
    async upsert(policy) {
      store.versionPolicies.set(policy.platform, { ...policy });
      return Promise.resolve();
    },
  };
}

export function createMemoryAppConfigRepository(store: MemoryStore): AppConfigRepository {
  return {
    async getAll() {
      return Promise.resolve({
        revision: store.appConfigRevision,
        entries: Object.fromEntries(store.appConfig),
      });
    },
    async set(key, value) {
      store.appConfig.set(key, structuredClone(value));
      store.appConfigRevision += 1;
      return Promise.resolve(store.appConfigRevision);
    },
  };
}

export function createMemoryPushTokenRepository(store: MemoryStore): PushTokenRepository {
  return {
    async upsert(row) {
      const existing = store.pushTokens.get(row.token);
      store.pushTokens.set(row.token, {
        ...row,
        createdAt: existing?.createdAt ?? row.createdAt,
      });
      return Promise.resolve();
    },
    async deleteByToken(token) {
      return Promise.resolve(store.pushTokens.delete(token));
    },
    async listAll() {
      return Promise.resolve([...store.pushTokens.values()].map((row) => ({ ...row })));
    },
  };
}
