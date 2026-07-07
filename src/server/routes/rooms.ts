/**
 * /api/rooms — the playroom lobby.
 *
 * Rooms are live sessions (see LiveRoomService), so the surface is small:
 * list what exists, create a new one. Everything that happens INSIDE a room
 * travels over the room WebSocket (`/ws/rooms/:roomId`), not REST. The list
 * is unpaginated on purpose — it is bounded by the process lifetime and the
 * lobby always shows every room.
 */
import { createRoomValidator, type RoomSummary } from '@shared/rooms/room';

import type { Container } from '../container';
import { apiRoute, json, type HttpDeps } from '../http/respond';

export function roomCollectionRoutes(container: Container, deps: HttpDeps) {
  return apiRoute<'/api/rooms'>(
    {
      /** GET /api/rooms → { items: RoomSummary[] } (newest first) */
      GET: () => {
        const items: RoomSummary[] = container.liveRoomService().listRooms();
        return Promise.resolve(json({ items }));
      },

      /** POST /api/rooms {name, emoji} → 201 RoomSummary */
      POST: async (req) => {
        const input = createRoomValidator.parse(await req.json());
        return json(container.liveRoomService().createRoom(input), { status: 201 });
      },
    },
    deps,
  );
}
