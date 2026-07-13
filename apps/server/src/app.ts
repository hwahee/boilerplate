/**
 * Assembles the HTTP surface (API routes + WebSocket) as plain data, separate
 * from `Bun.serve` so integration tests can boot the exact same app on an
 * ephemeral port.
 */
import type { Container } from './container';
import type { HttpDeps } from './http/respond';
import { createVersionGate, noVersionGate } from './http/version-gate';
import {
  adminAppConfigRoute,
  adminPushBroadcastRoute,
  adminVersionPolicyRoute,
} from './routes/admin';
import { appConfigRoute } from './routes/app-config';
import { livenessRoute, readinessRoute, type AppState } from './routes/health';
import { pushTokenRoutes, pushTokenUnregisterRoute } from './routes/push-tokens';
import { todoCollectionRoutes, todoItemRoutes } from './routes/todos';
import { versionPolicyRoute } from './routes/version-policy';
import { CHANNELS } from './pubsub';

/** Server-side WebSocket topics (fan-out via server.publish). */
const WS_TOPIC_CONFIG = 'ws.config';
const WS_TOPIC_TODOS = 'ws.todos';

export function buildApp(container: Container, state: AppState) {
  const deps: HttpDeps = {
    config: container.config,
    log: container.log,
    versionGate: createVersionGate(container.versionPolicyService()),
  };
  // The endpoints an OUTDATED app must still reach (to learn how to update /
  // whether maintenance is on) are exempt from the 426 gate.
  const ungatedDeps: HttpDeps = { ...deps, versionGate: noVersionGate };

  return {
    routes: {
      '/api/health/live': livenessRoute(),
      '/api/health/ready': readinessRoute(container, state),
      '/api/version-policy': versionPolicyRoute(container, ungatedDeps),
      '/api/app-config': appConfigRoute(container, ungatedDeps),
      '/api/todos': todoCollectionRoutes(container, deps),
      '/api/todos/:id': todoItemRoutes(container, deps),
      '/api/push-tokens': pushTokenRoutes(container, deps),
      '/api/push-tokens/unregister': pushTokenUnregisterRoute(container, deps),
      '/api/admin/version-policy/:platform': adminVersionPolicyRoute(container, deps),
      '/api/admin/app-config/:key': adminAppConfigRoute(container, deps),
      '/api/admin/push/broadcast': adminPushBroadcastRoute(container, deps),
      /** WebSocket endpoint: pushes config/todo change events (see bridge below). */
      '/ws': (req: Bun.BunRequest<'/ws'>, server: Bun.Server<undefined>) =>
        server.upgrade(req)
          ? undefined
          : new Response('WebSocket upgrade required', { status: 426 }),
    },

    websocket: {
      open(ws: Bun.ServerWebSocket<undefined>) {
        // Every socket joins both topics; bridgePubSubToWebSocket relays the
        // pub/sub bus into them, so this works across instances with the
        // redis driver.
        ws.subscribe(WS_TOPIC_CONFIG);
        ws.subscribe(WS_TOPIC_TODOS);
      },
      message() {
        // Inbound messages are not part of the protocol (yet).
      },
    },

    /** Fallback for anything no route matched. */
    fetch: () => new Response('Not Found', { status: 404 }),
  };
}

/**
 * Bridge: pub/sub bus → WebSocket clients connected to THIS instance.
 * With PUBSUB_DRIVER=redis this fans out across all instances. Returns a
 * cleanup function for graceful shutdown.
 */
export async function bridgePubSubToWebSocket(
  server: Bun.Server<undefined>,
  container: Container,
): Promise<() => Promise<void>> {
  const pubsub = container.pubsub();
  const unsubscribes = [
    await pubsub.subscribe(CHANNELS.configChanged, (message) =>
      server.publish(
        WS_TOPIC_CONFIG,
        JSON.stringify({ type: 'config.changed', ...(message as object) }),
      ),
    ),
    await pubsub.subscribe(CHANNELS.todosChanged, (message) =>
      server.publish(
        WS_TOPIC_TODOS,
        JSON.stringify({ type: 'todos.changed', ...(message as object) }),
      ),
    ),
  ];
  return async () => {
    for (const unsubscribe of unsubscribes) await unsubscribe();
  };
}
