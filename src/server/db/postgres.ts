/**
 * Postgres driver based on Bun's built-in SQL client (no external package).
 *
 * This module is the only place that knows how sessions map to connections:
 * a `DbSession` is a (transaction-scoped) Bun `SQL` instance behind an opaque
 * type, so repositories never leak driver details to services.
 */
import { SQL } from 'bun';

import type { DbSession, UnitOfWork } from '../repositories/types';

export interface PostgresDb {
  readonly sql: SQL;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createPostgresDb(databaseUrl: string): PostgresDb {
  const sql = new SQL(databaseUrl);
  return {
    sql,
    async ping() {
      try {
        await sql`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await sql.close({ timeout: 5 });
    },
  };
}

/** Wraps a Bun SQL handle (pool or transaction) as an opaque session. */
function asSession(sql: SQL): DbSession {
  return sql as unknown as DbSession;
}

/** Recovers the SQL handle for a session, defaulting to the shared pool. */
export function sessionSql(db: PostgresDb, session?: DbSession): SQL {
  return session ? (session as unknown as SQL) : db.sql;
}

/**
 * Postgres transaction boundary: `run` maps directly onto BEGIN/COMMIT with
 * rollback on throw (Bun's `sql.begin`).
 */
export function createPostgresUnitOfWork(db: PostgresDb): UnitOfWork {
  return {
    async run<T>(fn: (session: DbSession) => Promise<T>): Promise<T> {
      return db.sql.begin((tx) => fn(asSession(tx)));
    },
  };
}
