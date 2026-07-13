/**
 * SQL-file migration runner (Flyway-style, zero dependencies).
 *
 * - Migrations are plain SQL files in ./migrations, named `NNNN_name.sql`,
 *   applied in lexicographic order and recorded in `schema_migrations`.
 * - Schema history therefore lives in git; a fresh clone reaches the latest
 *   schema with a single `bun run db:setup`.
 * - A Postgres advisory lock makes concurrent runs safe (e.g. several
 *   instances starting at once during a rolling deploy).
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SQL } from 'bun';

const MIGRATION_LOCK_KEY = 727_274; // arbitrary app-wide advisory lock id

export interface AppliedMigration {
  version: string;
  name: string;
}

export async function migrate(sql: SQL, migrationsDir: string): Promise<AppliedMigration[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  try {
    const appliedRows = await sql<{ version: string }[]>`SELECT version FROM schema_migrations`;
    const applied = new Set(appliedRows.map((row) => row.version));

    const files = (await readdir(migrationsDir))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    const newlyApplied: AppliedMigration[] = [];
    for (const file of files) {
      const [version = ''] = file.split('_', 1);
      if (applied.has(version)) continue;

      const body = await Bun.file(join(migrationsDir, file)).text();
      const name = file.replace(/\.sql$/, '');
      // Each migration runs in its own transaction: it fully applies or not at all.
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (version, name) VALUES (${version}, ${name})`;
      });
      newlyApplied.push({ version, name });
    }
    return newlyApplied;
  } finally {
    await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
  }
}
