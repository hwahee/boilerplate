/** `bun run db:migrate` — applies pending SQL migrations (see src/server/db/migrate.ts). */
import { SQL } from 'bun';

import { migrate } from '../src/server/db/migrate';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required (copy .env.example to .env first).');
  process.exit(1);
}

const sql = new SQL(databaseUrl);
try {
  const applied = await migrate(sql, new URL('../migrations', import.meta.url).pathname);
  if (applied.length === 0) {
    console.log('Database schema is up to date.');
  } else {
    for (const migration of applied) console.log(`applied ${migration.name}`);
  }
} finally {
  await sql.close();
}
