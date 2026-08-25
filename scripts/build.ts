/**
 * Production build (`bun run build`).
 *
 * Produces ONE deployable unit in ./dist:
 *   - dist/index.js       — the server, with the built client (hashed assets)
 *                           bundled in via the HTML import (Bun fullstack build)
 *   - dist/migrate.js     — standalone migration runner for the container
 *   - dist/public/        — files the server reads from disk at runtime
 *   - dist/BUILD_INFO.json
 *
 * The build version (git SHA) is compiled into BOTH server and client through
 * the APP_BUILD_VERSION define — the basis of the rolling-deploy version
 * handshake (@shared/api/version).
 */
import { cp, rm } from 'node:fs/promises';

import { $ } from 'bun';

const version =
  process.env.APP_BUILD_VERSION ??
  (await $`git rev-parse --short HEAD`.text().catch(() => `local-${Date.now()}`)).trim();

await rm('dist', { recursive: true, force: true });

const define = { APP_BUILD_VERSION: JSON.stringify(version) };

// Separate builds keep the output flat: dist/index.js + dist/migrate.js.
for (const entrypoint of ['src/server/index.ts', 'scripts/migrate.ts']) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: 'dist',
    target: 'bun',
    minify: true,
    sourcemap: 'linked',
    define,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

// Runtime-read static files (currently public/sitemap.json). They are NOT
// bundled: the point is that they can be edited without a rebuild. `bun run
// start` runs from dist/, so they have to sit next to the server bundle.
await cp('public', 'dist/public', { recursive: true });

await Bun.write(
  'dist/BUILD_INFO.json',
  JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2),
);

console.log(`Built dist/ (version ${version}).`);
