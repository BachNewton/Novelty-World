# Online Co-op via PeerJS (2–4 players)

Status: idea / not implemented.
Date: 2026-09-22.

## Goal

2–4 players share one RPG session: everyone plays on the same map and edits
it together in real time (play mode + edit mode, toggled with `~`).

## Decision

Use **PeerJS**, not the repo's home-grown multiplayer framework
(`src/shared/lib/multiplayer`, `src/shared/lib/webrtc`). The existing stack
works, but it is a from-scratch lobby/mesh/signaling system with its own
operational surface (Supabase Realtime signaling, no host migration). PeerJS
gives us managed handshake + WebRTC connections for free, which is all this
game needs at 2–4 peers.

## Transport

- One global room for all users — no room codes, no lobby, no invites.
- Fixed PeerJS ID, e.g. `novelty-rpg-world`. Join flow: try to claim it;
  whoever holds it is the host. `ID-taken` error means a host exists, so
  connect to it as guest. Claim-or-join doubles as host election for free.
- Star topology: guests hold one connection to the host; the host
  rebroadcasts.
- No signaling server to operate (PeerJS cloud). No extra API keys today.
- NAT caveat: PeerJS cloud defaults to Google STUN only, so symmetric-NAT
  home networks (~10–20%) may fail to connect. Fix if it bites: add a TURN
  provider (e.g. Metered free tier) through PeerJS `config` — one-line
  change, no architecture impact.

## Player sync

- Local sim stays 60 Hz rAF, untouched.
- Send position only when dirty (moved > 2px or facing/anim changed) at
  ~12 Hz, plus a 1 Hz heartbeat.
- Message ≈ `{x, y, dir, flip, moving}`, ~140 bytes → ~1.7 KB/s up per
  client at 4 players. Noise-level for a DataConnection.
- Remote avatars render with lerp (`render += (net - render) * min(1, dt*10)`),
  which hides 66–100 ms update granularity. No dead reckoning needed.
- Join: host sends current spawn positions of all peers.
- Leave: despawn the avatar. Camera stays local per peer.

## Shared map editing

- Map is 40×28 cells of `{src, sx, sy}` (see `STORAGE_KEY` in
  `src/projects/rpg/map-editor.tsx`).
- Conflict resolution: **cell-level last-write-wins** with a `(seq, peerId)`
  tiebreak. Each client keeps a monotonic seq; every paint carries
  `{c, r, tile|null, seq, author}`. Receivers apply iff the incoming
  `(seq, author)` beats the stored one per cell. Concurrent paints to
  different cells never conflict; same-cell races resolve identically on
  all peers. No CRDT library justified at 1120 cells.
- Drag paints batch into one array message per frame (~100 B + ~15 B/cell).
- Join snapshot: sparse list of non-null cells (a few KB typical) sent
  point-to-point; chunk at ~16 KB if ever large.
- `Clear All` must broadcast (otherwise LWW resurrects old cells on peers).
- Trust peers, validate bounds: `0 ≤ c < 40`, `0 ≤ r < 28`, `tile.src`
  against the `TILE_SHEETS` manifest, finite clamped positions. Friends-only
  room codes; no anti-cheat beyond that.

## Host leaves

With one global room, host loss just triggers re-election: every guest
retries claiming the fixed ID; whoever wins becomes host and the rest
reconnect to it. Peers already hold the merged map (LWW state), so nothing
is lost — the only gap is a brief reconnect window. Show a small
"reconnecting…" indicator while no host is reachable. No separate
migration protocol needed beyond claim-or-join retry.

## Touchpoints (when implemented)

- `src/projects/rpg/game-world.tsx` — 12 Hz pos sampler beside the rAF
  loop; remote-avatar render pass reusing the existing strips; incoming
  `tiles` batches feed the same grid store `refreshMap` reads.
- `src/projects/rpg/map-editor.tsx` — `paintAt` emits tile batches;
  remote batches apply through the same `setGrid` updater + seq map;
  persistence effect stays the single writer.
- New `src/projects/rpg/coop/` module — PeerJS wiring, wire types,
  seq map, snapshot logic.
- E2E in the repo's Playwright style: join + move + leave, concurrent
  paint convergence, joiner snapshot, 4-player smoke.

## Sequencing

1. Presence + remote avatars (12 Hz pos + lerp) + join/leave.
2. Map sync (LWW edits, clear broadcast, join snapshot).
3. Hardening (4-player e2e, TURN evaluation if connects fail).
4. Polish (names/colors on avatars, reconnecting indicator).
