# Online Co-op via PeerJS (2–4 players)

Status: implemented; unit tests and `e2e/rpg-coop.spec.ts` green.

Production rule: one global room, no codes/lobby/invites. `?coop-room=`
exists for testing/dev isolation only; `?coop-signal=local` points PeerJS at
the e2e suite's local PeerServer.

## Design

- **Transport** (`coop/transport.ts`): a PeerJS star. Every tab claims the
  room's fixed peer id; the server grants it to one tab (the host) and
  refuses the rest, who join the host as guests. When the host leaves, its
  guests race to claim the id again, so re-election is the same path as the
  first join. Everything is event-driven — no timers, no polling. Handlers
  are bound to the Peer/connection they were registered on and ignore
  events once it has been replaced; that is what keeps teardown and
  re-election race-free.
- **Session** (`coop/session.ts`): one per page, shared by play and edit
  mode, owning the map store, remote avatars and the local avatar. The host
  is authoritative: guests apply their own paints optimistically, the host
  applies ops in arrival order and echoes them to every guest, so all peers
  converge on the host's op order. A joiner receives one `welcome` holding
  the host's map and avatar table, which replaces its own map — the room
  shares one world.
- **Protocol** (`coop/protocol.ts`): guest→host and host→guest message
  unions; every inbound payload is parsed before use.
- **Map** (`world-map.ts`): the one store both canvases read, persisted to
  localStorage on every change.

## Known limits

- **Unclean host loss.** A tab that closes normally tells its peers at once
  (`pagehide` stops the session). A host that crashes or drops off the
  network is noticed only when WebRTC gives up on the channel (~30 s). A
  guest re-claiming during that window may dial a host id the signalling
  server hasn't expired yet; if the offer is never answered, PeerJS emits
  nothing and the guest sits in `reconnecting`. Fixing that needs a
  connect timeout — the one timer this design would admit.
- **Public PeerJS cloud.** It rate-limits per IP (HTTP 429 for about an hour
  after bursts of connections) and is STUN-only, so symmetric-NAT users
  (~10–20%) may fail to connect. A self-hosted PeerServer (the `peer`
  package, already used by e2e) and a TURN entry in the PeerJS `config` fix
  both without touching the architecture.

## Remaining work

1. **Visible "reconnecting…" indicator** in play and edit mode. The session
   snapshot already carries `status`; only hidden e2e badges render it.
2. **Names/colours on avatars** so each remote player is identifiable at a
   glance. Decide whether identity rides on `characterId` or a new field.
