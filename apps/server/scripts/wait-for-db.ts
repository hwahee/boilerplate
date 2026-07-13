/** Blocks until Postgres accepts connections (used by `bun run db:setup`). */
import { SQL } from 'bun';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required (copy .env.example to .env first).');
  process.exit(1);
}

const DEADLINE_MS = 30_000;
const started = Date.now();

while (true) {
  const sql = new SQL(databaseUrl);
  try {
    await sql`SELECT 1`;
    await sql.close();
    console.log('Database is ready.');
    break;
  } catch {
    await sql.close().catch(() => undefined);
    if (Date.now() - started > DEADLINE_MS) {
      console.error('Timed out waiting for the database.');
      process.exit(1);
    }
    await Bun.sleep(500);
  }
}
