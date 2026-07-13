/**
 * Server entrypoint.
 *
 *   bun --watch src/index.ts   # development (Bun watch = server HMR)
 *   bun dist/index.js          # production build
 *
 * API-only: the mobile app is built and delivered separately (Metro/EAS —
 * the server never serves the client bundle, unlike a web stack).
 */
import { bridgePubSubToWebSocket, buildApp } from './app';
import { loadServerConfig } from './config';
import { createContainer } from './container';
import { CHANNELS } from './pubsub';
import type { AppState } from './routes/health';

// Policy: the server process itself lives in UTC; time-zone conversion only
// happens at the client boundary (device time zone, @app/shared/time).
process.env.TZ = 'UTC';

const config = loadServerConfig();
const container = createContainer(config);
const { log } = container;
const state: AppState = { shuttingDown: false };

const stopHooks: (() => Promise<void>)[] = [];

// ── Web role ────────────────────────────────────────────────────────────────
if (config.serverRole === 'web' || config.serverRole === 'all') {
  const app = buildApp(container, state);

  const server = Bun.serve({
    port: config.port,
    routes: app.routes,
    fetch: app.fetch,
    websocket: app.websocket,
  });

  // Pub/sub → WebSocket fan-out (config + todo change events).
  const stopBridge = await bridgePubSubToWebSocket(server, container);

  // Cross-instance cache invalidation for the version policy (the 426 gate
  // serves from a per-process cache; see VersionPolicyService).
  const stopPolicyInvalidation = await container
    .pubsub()
    .subscribe(CHANNELS.versionPolicyChanged, () => container.versionPolicyService().invalidate());

  stopHooks.push(async () => {
    await stopBridge();
    await stopPolicyInvalidation();
    // Stop accepting new connections, then wait for in-flight requests to
    // finish (graceful; `server.stop(true)` would abort them instead).
    await server.stop();
  });

  log.info('server listening', { url: String(server.url), env: config.appEnv });
}

// ── Worker role ─────────────────────────────────────────────────────────────
if (config.serverRole === 'worker' || config.serverRole === 'all') {
  const { startWorker } = await import('./worker');
  const stopWorker = await startWorker(container);
  stopHooks.push(stopWorker);
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
// On SIGTERM/SIGINT: flip readiness to 503 so the load balancer drains this
// instance, wait for the drain window, finish in-flight requests and close
// WebSockets, then release every resource. A second signal force-exits.
let shutdownStarted = false;
async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) {
    log.warn('forced shutdown', { signal });
    process.exit(1);
  }
  shutdownStarted = true;
  state.shuttingDown = true;
  log.info('shutdown initiated', { signal, drainMs: config.shutdownDrainMs });

  await Bun.sleep(config.shutdownDrainMs);
  for (const stop of stopHooks) await stop();
  await container.dispose();

  log.info('shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
