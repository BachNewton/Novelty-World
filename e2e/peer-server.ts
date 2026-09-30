/**
 * Local PeerJS signalling server for e2e tests, so the multiplayer suites
 * never depend on the public PeerJS cloud (rate limits, outages). Pages opt
 * in with `?peer-signal=local` (see `src/shared/lib/peer`).
 */
import { PeerServer } from "peer";

const PORT = 3003;

PeerServer({ port: PORT, path: "/" }, () => {
  console.log(`PeerJS server listening on port ${PORT}`);
});
