import type { Server } from "node:http";
import type { WebSocketServer } from "ws";

/**
 * Hands each WebSocket upgrade on `server` to the socket server `route`
 * picks by the request's path. Several socket servers can't each listen on
 * one HTTP server: each would answer every upgrade.
 */
export function serveWebSockets(server: Server, route: (path: string) => WebSocketServer): void {
  server.on("upgrade", (req, socket, head) => {
    const wss = route(new URL(req.url ?? "/", "http://relay").pathname);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
}
