/**
 * Runs the relay: `PORT` (default 8080; 0 lets the OS pick, as e2e runs do)
 * on `HOST` (default every interface; the server binds it to 127.0.0.1, behind
 * Tailscale Funnel). Prints its port once listening, which Playwright waits for.
 */

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { allowOrigin } from "./origins";
import { startRelay } from "./relay";

const server = createServer((req, res) => {
  const health = req.url === "/health";
  res.writeHead(health ? 200 : 404, { "content-type": "text/plain" });
  res.end(health ? "ok\n" : "not found\n");
});
startRelay(server, { allowOrigin });
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
