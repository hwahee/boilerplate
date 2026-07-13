/**
 * Production build (`bun run build`).
 *
 * Produces ONE deployable unit in ./dist:
 *   - dist/index.js       — the API server bundle
 *   - dist/migrate.js     — standalone migration runner for the container
 *   - dist/BUILD_INFO.json
 *
 * (The mobile app is NOT built here — JS bundles ship via EAS Update and
 * binaries via EAS Build; see docs/release-playbook.md.)
 */
import { rm } from 'node:fs/promises';

import { $ } from 'bun';

const version =
  process.env.APP_BUILD_VERSION ??
  (await $`git rev-parse --short HEAD`.text().catch(() => `local-${Date.now()}`)).trim();

await rm('dist', { recursive: true, force: true });

// Separate builds keep the output flat: dist/index.js + dist/migrate.js.
for (const entrypoint of ['src/index.ts', 'scripts/migrate.ts']) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: 'dist',
    target: 'bun',
    minify: true,
    sourcemap: 'linked',
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

await Bun.write(
  'dist/BUILD_INFO.json',
  JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2),
);

console.log(`Built dist/ (version ${version}).`);
