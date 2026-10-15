import { WebSocket } from "ws";
import type { ListedRoom } from "../src/shared/lib/room-list/room-list";

/**
 * The query parameter that points a page at this run's own relay
 * (relay/main.ts, started by playwright.config.ts), so the multiplayer suites
 * never touch the real one. Playwright reads the relay's port from its
 * startup line into E2E_RELAY_PORT.
 */
const port = process.env.E2E_RELAY_PORT;
if (port === undefined) throw new Error("E2E_RELAY_PORT is unset: the e2e relay didn't start");

export const LOCAL_RELAY = `relay=local:${port}`;

/**
 * The query parameters for this run's relay and a room list of the test's
 * own, on the relay's local stand-in for Supabase presence (relay/room-list.ts):
 * no spec reaches Supabase, and no test sees another's rooms. Pages sharing a
 * list share one `name`.
 */
export function localRoomList(name: string = crypto.randomUUID()): string {
  return `${LOCAL_RELAY}&room-list=local:${name}`;
}

/**
 * Lists `room` on a game's local room list, as a host would, with no host
 * behind it; resolves once it is listed, with the way to take it down.
 */
export async function listRoom(game: string, name: string, room: ListedRoom): Promise<() => void> {
  const socket = new WebSocket(`ws://localhost:${port}/room-list`, { origin: "http://localhost" });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const listed = new Promise<void>((resolve) => {
    socket.on("message", (raw) => {
      const { rooms } = JSON.parse(String(raw)) as { rooms: ListedRoom[] };
      if (rooms.some((r) => r.code === room.code)) resolve();
    });
  });
  socket.send(JSON.stringify({ type: "watch", channel: `${game}:${name}` }));
  socket.send(JSON.stringify({ type: "track", room }));
  await listed;
  return () => socket.close();
}
