/**
 * `bun run db:seed` — development seed data. Idempotent: fixed UUIDs with
 * ON CONFLICT DO NOTHING, so re-running never duplicates rows.
 */
import { SQL } from 'bun';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required (copy .env.example to .env first).');
  process.exit(1);
}

const SEED_TODOS = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'Read the README', status: 'done' },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Explore the design system page',
    status: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Toggle dark mode and design B',
    status: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Run the test suite (bun test)',
    status: 'open',
  },
  { id: '00000000-0000-4000-8000-000000000005', title: 'Ship something great', status: 'open' },
] as const;

const sql = new SQL(databaseUrl);
try {
  for (const todo of SEED_TODOS) {
    await sql`
      INSERT INTO todos (id, title, status)
      VALUES (${todo.id}, ${todo.title}, ${todo.status})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`Seeded ${SEED_TODOS.length} todos (existing rows untouched).`);
} finally {
  await sql.close();
}
