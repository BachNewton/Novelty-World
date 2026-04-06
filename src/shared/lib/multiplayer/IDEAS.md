# Multiplayer Library Ideas

## Player Identity Framework ✅ Implemented

~~Currently the multiplayer layer provides `players: PeerState[]` with peer IDs
and connection status, but no concept of player ordering, seat assignment, or
stable identity. Each game must implement this itself — Tic-Tac-Toe assigns
X/O via a GAME_START message.

For N-player games (Euchre: 4 players with teams and seating, Poker: dealer
rotation), every game would need to reimplement player ordering from scratch.

### Possible approach

During the ready handshake, `useGameRoom` could assign each player a stable
index (0 through N-1) based on join order. The host would broadcast assignments
as part of the `__mp:start` message. `GameRoom` would then expose something
like:

```typescript
playerIndex: number;          // this client's assigned index
playerOrder: PlayerInfo[];    // all players in stable order
```

Games could map indices to roles (index 0 = dealer, indices 0+2 = team A) without
reimplementing discovery and ordering.

### Tradeoffs

- Adds opinion to the framework — not all games care about order.
- Simple games like Tic-Tac-Toe don't benefit much.
- But every game with 3+ players would use it.~~

`useGameRoom` now accepts a `profile: { id, name }` option (from the app-wide
`useProfile` store). During the ready handshake, the host collects profiles
from all guests and broadcasts a `playerRoster: PlayerInfo[]` with persistent
`playerId`, `playerName`, ephemeral `peerId`, and live connection `status`.
Games map player IDs to game roles (seats, teams) without reimplementing
discovery. The original "playerIndex" proposal was replaced with unordered
identity — games decide ordering, not the framework.
