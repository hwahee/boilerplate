/**
 * Metro config for a Bun-workspaces monorepo.
 *
 * `@app/shared` ships raw TypeScript (its package.json `exports` point at
 * .ts sources); Metro compiles it like app code. The two tweaks below make
 * module resolution work when dependencies are hoisted to the repo root.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits in packages/shared hot-reload the app.
config.watchFolders = [workspaceRoot];

// Resolve modules from the app first, then from the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
