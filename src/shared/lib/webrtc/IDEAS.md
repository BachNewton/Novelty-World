# WebRTC Library Ideas

## Full Mesh Topology

Currently `usePeer` uses a star topology: the host connects to every guest,
guests only connect to the host. This makes the host a single point of failure.
If the host leaves, all guests lose their connections and host migration
requires reconnection + state transfer.

A full mesh topology (every peer connected to every other peer) eliminates this.
If any player drops, all remaining players still have live connections. Authority
(who validates game state) becomes a lightweight role that any peer can pick up
instantly — no reconnection needed.

### Scope of change

Isolated to `usePeer`. Replace host-initiates/guest-waits logic with symmetric
peer discovery where every peer connects to every other peer. Use a
deterministic rule (e.g., compare peer IDs) to decide who sends the offer and
who waits, avoiding duplicate offers.

`PeerConnection`, `signaling.ts`, `useGameRoom`, and all game code stay
unchanged — they already use `send`/`sendTo`/`onMessage` without knowledge of
the connection graph.

### Tradeoffs

- **Signaling**: Need an offer-initiation rule (higher peer ID offers). Small
  addition.
- **Partial mesh**: Two peers behind symmetric NATs may fail to connect even if
  both can reach a third peer. Star avoids this by funneling through one
  endpoint. A TURN server solves it.
- **Connection count**: N*(N-1)/2 total, but each client still maxes at N-1 —
  same as the host handles today in star. Fine for typical game sizes (4-8
  players).

## TURN Server

Currently `peer.ts` only configures Google STUN servers. STUN works when at
least one side has a permissive NAT, which covers most residential networks.
But it fails when both peers are behind symmetric NATs — common on mobile
carriers, corporate networks, and university WiFi. Two tabs on the same device
also fails because they share the same NAT.

A TURN server relays traffic when direct peer-to-peer isn't possible. Adding
one is a config change — just add a TURN entry to the `ICE_SERVERS` array in
`peer.ts`. No architectural changes needed.

### Options

- **Self-hosted**: Run `coturn` on a VPS. Free beyond server cost, full
  control, but requires maintenance.
- **Managed services**: Twilio Network Traversal, Cloudflare Calls, Metered
  TURN. No maintenance, usage-based pricing.

### When to add

Not urgent for a hobby project with friends on home WiFi. Add it if users
start reporting stuck connections, or before the mesh topology change (since
mesh increases the number of peer pairs that need to connect).
