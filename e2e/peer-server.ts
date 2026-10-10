/**
 * Local PeerJS signalling server for one e2e run, so the multiplayer suites
 * never depend on the public PeerJS cloud (rate limits, outages). Pages opt
 * in with `?peer-signal=local:<port>` (see `src/shared/lib/peer`).
 *
 * Port 0: the OS picks a free port, so runs never race for one. Playwright
 * reads it from the line below (webServer.wait in playwright.config.ts).
 */
import { PeerServer } from "peer";

PeerServer({ port: 0, path: "/" }, (server) => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("PeerJS server is not on a TCP port");
  console.log(`PeerJS server listening on port ${address.port}`);
});
