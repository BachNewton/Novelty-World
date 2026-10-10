/**
 * The query parameter that points a page's PeerJS at this run's own local
 * signalling server (e2e/peer-server.ts), so the multiplayer suites never
 * touch the public PeerJS cloud. Playwright reads the server's port from its
 * startup line into E2E_PEER_PORT (webServer.wait in playwright.config.ts).
 */
const port = process.env.E2E_PEER_PORT;
if (port === undefined) throw new Error("E2E_PEER_PORT is unset: the e2e PeerJS server didn't start");

export const PEER_SIGNAL = `peer-signal=local:${port}`;
