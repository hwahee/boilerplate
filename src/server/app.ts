/**
 * Assembles the HTTP surface (API routes + WebSocket) as plain data, separate
 * from `Bun.serve` so integration tests can boot the exact same app on an
 * ephemeral port. The static client routes are added only by the real
 * entrypoint (src/server/index.ts).
 */
import { nicknameValidator } from '@shared/rooms/room';

import type { Container } from './container';
import type { HttpDeps } from './http/respond';
import { livenessRoute, readinessRoute, type AppState } from './routes/health';
import { roomCollectionRoutes } from './routes/rooms';
import { todoCollectionRoutes, todoItemRoutes } from './routes/todos';

/** Server-side WebSocket topic that todo change events are published to. */
export const WS_TOPIC_TODOS = 'ws.todos';

/**
 * Per-socket data attached at upgrade time. `undefined` marks the legacy
 * `/ws` todos socket; room sockets carry their room + requested nickname.
 */
export type SocketData = { kind: 'room'; roomId: string; nickname: string } | undefined;

export function buildApp(container: Container, state: AppState) {
  const deps: HttpDeps = { config: container.config, log: container.log };

  return {
    routes: {
      '/api/health/live': livenessRoute(),
      '/api/health/ready': readinessRoute(container, state),
      '/api/todos': todoCollectionRoutes(container, deps),
      '/api/todos/:id': todoItemRoutes(container, deps),
      '/api/rooms': roomCollectionRoutes(container, deps),
      /** WebSocket endpoint: pushes `{action, todoId}` on every todo change. */
      '/ws': (req: Bun.BunRequest<'/ws'>, server: Bun.Server<SocketData>) =>
        server.upgrade(req, { data: undefined })
          ? undefined
          : new Response('WebSocket upgrade required', { status: 426 }),
      /**
       * Playroom WebSocket: `?nickname=` is validated here, the join itself
       * happens in `open` (the socket must exist before it can be a member).
       */
      '/ws/rooms/:roomId': (
        req: Bun.BunRequest<'/ws/rooms/:roomId'>,
        server: Bun.Server<SocketData>,
      ) => {
        const nickname = nicknameValidator.safeParse(new URL(req.url).searchParams.get('nickname'));
        if (!nickname.ok) return new Response('Invalid nickname', { status: 400 });
        if (!container.liveRoomService().hasRoom(req.params.roomId)) {
          return new Response('Room not found', { status: 404 });
        }
        const data: SocketData = {
          kind: 'room',
          roomId: req.params.roomId,
          nickname: nickname.value,
        };
        return server.upgrade(req, { data })
          ? undefined
          : new Response('WebSocket upgrade required', { status: 426 });
      },
    },

    websocket: {
      open(ws: Bun.ServerWebSocket<SocketData>) {
        if (ws.data?.kind === 'room') {
          container.liveRoomService().join(ws.data.roomId, ws.data.nickname, ws);
          return;
        }
        // Every plain /ws socket joins the todos topic; index.ts bridges
        // pub/sub → server.publish, so this works across instances with the
        // redis driver.
        ws.subscribe(WS_TOPIC_TODOS);
      },
      message(ws: Bun.ServerWebSocket<SocketData>, raw: string | Buffer) {
        // Inbound messages are only part of the room protocol.
        if (ws.data?.kind === 'room') container.liveRoomService().handleMessage(ws, raw);
      },
      close(ws: Bun.ServerWebSocket<SocketData>) {
        if (ws.data?.kind === 'room') container.liveRoomService().leave(ws);
      },
    },

    /** Fallback for anything no route matched (API-only mode, e.g. tests). */
    fetch: () => new Response('Not Found', { status: 404 }),
  };
}
