/**
 * Local PeerJS signalling server for e2e tests, so the RPG co-op suite never
 * depends on the public PeerJS cloud (rate limits, outages). Pages opt in
 * with `?coop-signal=local`.
 */
import { PeerServer } from "peer";

const PORT = 3003;

PeerServer({ port: PORT, path: "/" }, () => {
  console.log(`PeerJS server listening on port ${PORT}`);
});
