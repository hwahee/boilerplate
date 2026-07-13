/**
 * Postgres implementations of the persistence contracts.
 *
 * Column mapping: snake_case in SQL ⇄ camelCase in the domain. Timestamps are
 * `timestamptz` and always read/written as UTC (`UtcIsoString`).
 */
import type { Todo, TodoListQuery, TodoStatus } from '@app/shared/domain/todo';
import type { Platform } from '@app/shared/domain/platform';
import type { UpdateMode } from '@app/shared/domain/version-policy';
import { toUtcIso } from '@app/shared/time';

import { sessionSql, type PostgresDb } from '../db/postgres';
import type {
  AppConfigRepository,
  AuditLogEntry,
  AuditLogRepository,
  DbSession,
  DevicePushToken,
  PushTokenRepository,
  TodoRepository,
  VersionPolicyRepository,
} from './types';

interface TodoRow {
  id: string;
  title: string;
  status: TodoStatus;
  created_at: Date;
  updated_at: Date;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: toUtcIso(row.created_at),
    updatedAt: toUtcIso(row.updated_at),
  };
}

/** Whitelist mapping of API sort fields to real columns — never interpolate user input. */
const SORT_COLUMNS: Record<TodoListQuery['sortBy'], string> = {
  createdAt: 'created_at',
  title: 'title',
};

export function createPostgresTodoRepository(db: PostgresDb): TodoRepository {
  return {
    async list(query, cursor, session) {
      const sql = sessionSql(db, session);

      // Dynamic-but-safe query construction: the WHERE clause is built from
      // validated filters with positional parameters; ORDER BY only ever uses
      // whitelisted identifiers from SORT_COLUMNS.
      const column = SORT_COLUMNS[query.sortBy];
      const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
      const where: string[] = [];
      const params: unknown[] = [];

      if (query.status) {
        params.push(query.status);
        where.push(`status = $${params.length}`);
      }
      if (query.q) {
        params.push(`%${query.q}%`);
        where.push(`title ILIKE $${params.length}`);
      }
      if (cursor) {
        // Keyset condition matching `ORDER BY <column> <dir>, id ASC`:
        // rows strictly after (cursor.v, cursor.id) in that ordering.
        params.push(cursor.v);
        const v = `$${params.length}`;
        params.push(cursor.id);
        const id = `$${params.length}`;
        const primary = query.sortOrder === 'asc' ? `${column} > ${v}` : `${column} < ${v}`;
        where.push(`(${primary} OR (${column} = ${v} AND id > ${id}::uuid))`);
      }
      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      // limit + 1: the extra row tells the service whether a next page exists.
      params.push(query.limit + 1);
      const rows = await sql.unsafe<TodoRow[]>(
        `SELECT id, title, status, created_at, updated_at
           FROM todos
           ${whereClause}
          ORDER BY ${column} ${direction}, id ASC
          LIMIT $${params.length}`,
        params,
      );
      return rows.map(rowToTodo);
    },

    async findById(id, session) {
      const sql = sessionSql(db, session);
      const rows = await sql<TodoRow[]>`
        SELECT id, title, status, created_at, updated_at FROM todos WHERE id = ${id}
      `;
      const row = rows[0];
      return row ? rowToTodo(row) : null;
    },

    async insert(todo, session) {
      const sql = sessionSql(db, session);
      await sql`
        INSERT INTO todos (id, title, status, created_at, updated_at)
        VALUES (${todo.id}, ${todo.title}, ${todo.status}, ${todo.createdAt}, ${todo.updatedAt})
      `;
    },

    async update(todo, session) {
      const sql = sessionSql(db, session);
      await sql`
        UPDATE todos
           SET title = ${todo.title},
               status = ${todo.status},
               updated_at = ${todo.updatedAt}
         WHERE id = ${todo.id}
      `;
    },

    async deleteById(id, session) {
      const sql = sessionSql(db, session);
      const rows = await sql<{ id: string }[]>`
        DELETE FROM todos WHERE id = ${id} RETURNING id
      `;
      return rows.length > 0;
    },
  };
}

export function createPostgresAuditLogRepository(db: PostgresDb): AuditLogRepository {
  return {
    async append(entry: AuditLogEntry, session?: DbSession) {
      const sql = sessionSql(db, session);
      await sql`
        INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
        VALUES (
          ${entry.entityType},
          ${entry.entityId},
          ${entry.action},
          ${entry.payload === undefined ? null : JSON.stringify(entry.payload)}::jsonb,
          ${entry.createdAt}
        )
      `;
    },
  };
}

interface VersionPolicyRow {
  platform: Platform;
  min_supported_version: string;
  latest_version: string;
  update_mode: UpdateMode;
  store_url: string;
  message: string | null;
  updated_at: Date;
}

export function createPostgresVersionPolicyRepository(db: PostgresDb): VersionPolicyRepository {
  return {
    async findByPlatform(platform, session) {
      const sql = sessionSql(db, session);
      const rows = await sql<VersionPolicyRow[]>`
        SELECT platform, min_supported_version, latest_version, update_mode,
               store_url, message, updated_at
          FROM version_policies
         WHERE platform = ${platform}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        platform: row.platform,
        minSupportedVersion: row.min_supported_version,
        latestVersion: row.latest_version,
        updateMode: row.update_mode,
        storeUrl: row.store_url,
        message: row.message,
        updatedAt: toUtcIso(row.updated_at),
      };
    },

    async upsert(policy, session) {
      const sql = sessionSql(db, session);
      await sql`
        INSERT INTO version_policies
          (platform, min_supported_version, latest_version, update_mode, store_url, message, updated_at)
        VALUES
          (${policy.platform}, ${policy.minSupportedVersion}, ${policy.latestVersion},
           ${policy.updateMode}, ${policy.storeUrl}, ${policy.message}, ${policy.updatedAt})
        ON CONFLICT (platform) DO UPDATE SET
          min_supported_version = EXCLUDED.min_supported_version,
          latest_version = EXCLUDED.latest_version,
          update_mode = EXCLUDED.update_mode,
          store_url = EXCLUDED.store_url,
          message = EXCLUDED.message,
          updated_at = EXCLUDED.updated_at
      `;
    },
  };
}

export function createPostgresAppConfigRepository(db: PostgresDb): AppConfigRepository {
  return {
    async getAll(session) {
      const sql = sessionSql(db, session);
      // Constant query count regardless of entry count (no N+1): one query
      // for the counter, one for every base-scope entry.
      const [counter] = await sql<{ revision: number }[]>`
        SELECT revision FROM app_config_revision
      `;
      // Only base-scope rows for now; platform / min_app_version overrides
      // are a schema-ready extension (see migrations/0001_init.sql).
      const rows = await sql<{ key: string; value: unknown }[]>`
        SELECT key, value FROM app_config
         WHERE platform IS NULL AND min_app_version IS NULL
      `;
      return {
        revision: counter?.revision ?? 0,
        entries: Object.fromEntries(rows.map((row) => [row.key, row.value])),
      };
    },

    async set(key, value, session) {
      const sql = sessionSql(db, session);
      await sql`
        INSERT INTO app_config (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value ?? null)}::jsonb, now())
        ON CONFLICT (key, COALESCE(platform, '*'), COALESCE(min_app_version, '*'))
        DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `;
      const rows = await sql<{ revision: number }[]>`
        UPDATE app_config_revision SET revision = revision + 1 RETURNING revision
      `;
      return rows[0]?.revision ?? 0;
    },
  };
}

interface PushTokenRow {
  token: string;
  platform: Platform;
  app_version: string | null;
  created_at: Date;
  updated_at: Date;
}

export function createPostgresPushTokenRepository(db: PostgresDb): PushTokenRepository {
  return {
    async upsert(row, session) {
      const sql = sessionSql(db, session);
      await sql`
        INSERT INTO device_push_tokens (token, platform, app_version, created_at, updated_at)
        VALUES (${row.token}, ${row.platform}, ${row.appVersion}, ${row.createdAt}, ${row.updatedAt})
        ON CONFLICT (token) DO UPDATE SET
          platform = EXCLUDED.platform,
          app_version = EXCLUDED.app_version,
          updated_at = EXCLUDED.updated_at
      `;
    },

    async deleteByToken(token, session) {
      const sql = sessionSql(db, session);
      const rows = await sql<{ token: string }[]>`
        DELETE FROM device_push_tokens WHERE token = ${token} RETURNING token
      `;
      return rows.length > 0;
    },

    async listAll(session) {
      const sql = sessionSql(db, session);
      const rows = await sql<PushTokenRow[]>`
        SELECT token, platform, app_version, created_at, updated_at FROM device_push_tokens
      `;
      return rows.map((row): DevicePushToken => ({
        token: row.token,
        platform: row.platform,
        appVersion: row.app_version,
        createdAt: toUtcIso(row.created_at),
        updatedAt: toUtcIso(row.updated_at),
      }));
    },
  };
}
