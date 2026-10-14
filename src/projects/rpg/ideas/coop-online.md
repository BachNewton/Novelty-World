# Online Co-op (2–4 players)

Status: implemented; unit tests and `e2e/rpg-coop.spec.ts` green.

Production rule: one global room, no codes/lobby/invites. `?coop-room=`
exists for testing/dev isolation only; `?relay=local:<port>` points the room
at the e2e suite's local relay.

## Design

- **Transport**: the shared star room on the relay (`src/shared/lib/peer`)
  in its claim mode. Every tab claims the room's fixed name; the relay gives
  it to the first tab to ask (the host), and the rest join the host as guests.
  When the host leaves, its guests race to claim the code again, so
  re-election is the same path as the first join. The RPG keeps only its
  own protocol and session on top.
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
  network is noticed when the relay's heartbeat drops its socket, within
  two heartbeats; its guests then re-claim the room.

## Remaining work

1. **Visible "reconnecting…" indicator** in play and edit mode. The session
   snapshot already carries `status`; only hidden e2e badges render it.
2. **Names/colours on avatars** so each remote player is identifiable at a
   glance. Decide whether identity rides on `characterId` or a new field.
