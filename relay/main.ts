/**
 * Runs the relay: `PORT` (default 8080; 0 lets the OS pick, as e2e runs do)
 * on `HOST` (default every interface; the server binds it to 127.0.0.1, behind
 * Caddy). Prints its port once listening, which Playwright waits for.
 * `ROOM_LIST=local` (e2e runs only) also serves the room list's local
 * stand-in (`room-list.ts`), so no test reaches Supabase.
 */

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { allowOrigin } from "./origins";
import { LOCAL_ROOM_LIST_PATH } from "../src/shared/lib/room-list/local-protocol";
import { createRelay } from "./relay";
import { createLocalRoomList } from "./room-list";
import { serveWebSockets } from "./serve";

const server = createServer((req, res) => {
  const health = req.url === "/health";
  res.writeHead(health ? 200 : 404, { "content-type": "text/plain" });
  res.end(health ? "ok\n" : "not found\n");
});
const relay = createRelay({ allowOrigin });
const roomList = process.env.ROOM_LIST === "local" ? createLocalRoomList({ allowOrigin }) : null;
serveWebSockets(server, (path) => (roomList !== null && path === LOCAL_ROOM_LIST_PATH ? roomList : relay));
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST, () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("relay is not on a TCP port");
  console.log(`relay listening on port ${address.port}`);
  // Under systemd (Type=notify), report ready, so `systemctl restart` returns only once the relay is listening.
  if (process.env.NOTIFY_SOCKET !== undefined) {
    execFile("systemd-notify", ["--ready"], (err) => {
      if (err !== null) throw err;
    });
  }
});
