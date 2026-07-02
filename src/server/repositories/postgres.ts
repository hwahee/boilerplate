/**
 * Postgres implementations of the persistence contracts.
 *
 * Column mapping: snake_case in SQL ⇄ camelCase in the domain. Timestamps are
 * `timestamptz` and always read/written as UTC (`UtcIsoString`).
 */
import type { Todo, TodoListQuery, TodoStatus } from '@shared/domain/todo';
import { toUtcIso } from '@shared/time';

import { sessionSql, type PostgresDb } from '../db/postgres';
import type { AuditLogEntry, AuditLogRepository, DbSession, TodoRepository } from './types';

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
    async list(query, session) {
      const sql = sessionSql(db, session);

      // Dynamic-but-safe query construction: the WHERE clause is built from
      // validated filters with positional parameters; ORDER BY only ever uses
      // whitelisted identifiers from SORT_COLUMNS.
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
      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

      params.push(query.pageSize, (query.page - 1) * query.pageSize);
      // N+1 avoidance: rows and the filtered total come back in ONE round trip
      // via the count(*) window function (see TodoRepository.list docs).
      const rows = await sql.unsafe<(TodoRow & { total_items: string | number })[]>(
        `SELECT id, title, status, created_at, updated_at, count(*) OVER () AS total_items
           FROM todos
           ${whereClause}
          ORDER BY ${SORT_COLUMNS[query.sortBy]} ${direction}, id ASC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const first = rows[0];
      return {
        items: rows.map(rowToTodo),
        totalItems: first ? Number(first.total_items) : 0,
      };
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
