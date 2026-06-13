# Monopoly — Project Guide

This file is loaded into Claude's context for any work inside `src/projects/monopoly/`. Read it before touching code here.

## Philosophy: built for pros

This is Monopoly for players who know the game cold. They don't need explanations, animations, or confirmations — they need fast, dense access to the few decisions the game actually presents.

**The whole game collapses to a small set of real decisions:**
- Buy a landed-on property at face price, or send it to auction.
- During auction: when to bid, when to stop.
- Build / sell houses and hotels.
- Mortgage / unmortgage.
- Propose, accept, decline trades — what, with whom, how much.
- Jail: leave ASAP or stay (typically a stance, not a per-turn prompt).

**Everything else is mechanical and should run on its own:**
- Rolling dice, moving the token, passing GO, paying rent, paying tax, drawing and resolving Chance/Community Chest, going to jail on three doubles, busting at the end of a turn — none of this is a decision. The engine does it automatically.

**Auto-play is a spectrum, set by the player:**
- Default: pause only at real decision points.
- Opt-in pauses: a player can request a pause **before their roll** (to mortgage or trade) or **after their roll** (to buy, trade, or send to auction).
- Threshold policies (later): "auto-buy until cash < $X", "stay in jail while late-game", etc. The engine should not preclude these; per-player preferences live in state.
- Other players can interrupt the active turn by proposing a trade. The active turn blocks until the trade resolves (accept / decline / counter).

**UI consequence:** no "press to roll" button by default. No "you landed on Boardwalk, pay $50 rent — click to continue." The screen updates, the event log scrolls, the turn advances. Buttons exist only for actual decisions (and for explicitly requesting a pause).

## Engine model: hybrid, state-authoritative

State is the single source of truth (one Supabase row per game). Events are folded into state as they happen; the log is derived, not authoritative.

**Two entry points to the engine — and only two:**

```ts
// External decisions only — humans, bots, future RL agent.
apply(state, intent, rng): { ok: true, state, newEvents } | { ok: false, reason }

// Mechanical transitions — runs until the next decision point or opt-in pause.
autoStep(state, rng): { state, newEvents }
```

The authoritative route applies **one unit per call**: an `apply` for an external intent (no auto-drain), or a single `autoStep` per `step` request. Clients subscribe to the row and re-render as each unit lands. See the "Multiplayer / networking" section below.

### Intents vs mechanics — the line

**Intents (external API, small surface):**
- `buy`, `decline-buy` (declining sends to auction)
- `bid`, `pass-bid` (during auction)
- `build`, `sell-building`
- `mortgage`, `unmortgage`
- `propose-trade`, `accept-trade`, `decline-trade`, `counter-trade`
- `pay-to-leave-jail`, `use-jail-card`
- `request-pause` (active player flags pre-roll or post-roll pause)
- `end-turn`

**Mechanics (internal to `autoStep`, never an intent):**
- Roll dice, move token, pass-GO credit
- Pay rent, pay tax
- Draw card, apply card effects (including recursive move + tile resolution)
- Go-to-jail (tile / card / three doubles)
- Detect bankruptcy, transfer assets to creditor or bank
- Detect winner

If something feels borderline (e.g. is "leave jail by paying $50" an intent or a mechanic?) — if the player could rationally choose either way, it's an intent. If the only "choice" is the obvious one, it's a mechanic gated by player preferences.

### State shape

Extend `GameState` with a `turn` block that captures **whose turn it is, what we're waiting on, and any in-flight sub-game** (auction, trade):

```ts
interface TurnState {
  playerId: string;
  phase:
    | "pre-roll"             // can roll or take pre-roll actions
    | "post-roll"            // moved + tile resolved; can build/trade/end
    | "buy-decision"         // landed on unowned ownable; buy or auction
    | "auction"              // auction in progress (see `auction` field)
    | "jail-decision"        // active player in jail, deciding pay/card/roll
    | "trade-pending"        // a propose-trade is awaiting accept/decline
    | "game-over";
  doublesStreak: number;     // 0-3
  paused: boolean;           // active player has requested a pause point
  pendingBuy?: number;       // position of property awaiting buy decision
  auction?: AuctionState;
  pendingTrade?: PendingTrade;
}

interface GameState {
  ...existing fields,
  status: "lobby" | "active" | "finished";  // lifecycle (see "Lobby")
  turn: TurnState;
  preferences: Readonly<Record<string, PlayerPreferences>>;
  rngSeed: string;           // for deterministic replay + RL training
}
```

`autoStep` only progresses when `turn.phase` allows it and `turn.paused === false`. It exits the moment it lands on a real decision phase.

### RNG: always injected, never `Math.random()`

Every randomness call goes through an injected RNG. Engine functions take an `rng` argument; the host advances it. This is non-negotiable — it's what makes deterministic replay, regression tests, and future headless RL training possible.

### Bot interface

```ts
type Bot = (state: GameState, playerId: string) => Intent;
```

The bot is given the full state (Monopoly is open-information) and returns one intent. The engine handles everything else. The same shape works for the dumb early bot, the rule-based bot, and an eventual learned policy.

The baseline lives in `bots/policy.ts` as `botIntent(state, playerId): Intent | null` — pure, returning an intent for the two proxy-only decision phases (`buy-decision`: buy when affordable; `must-raise-cash`: mortgage the cheapest free property) and `null` when there's nothing to decide. The store's auto-pacer calls it **only as a "proxy" driver** (a bot seat or an absent human — see `driver.ts`); the universal mechanical beats (`pre-roll` → step, `post-roll` → end-turn) stay in the pacer because they apply to "self" drivers too. Swap in a smarter policy here without touching the pacer.

## Lobby

A game row carries a `GameState.status` of `lobby` | `active` | `finished`. The lifecycle:

- `createLobby(host, rngSeed)` seeds a `lobby` row seating the host alone. Other clients `joinLobby` (auto-assigned the first free color + icon), `addBot`, `removePlayer`, and tweak seats via `setPlayerColor` / `setPlayerIcon` / `setPlayerName`. `startGame` validates the roster (≥2 players, ≥1 human) and flips `status` to `active`.
- These **lobby ops live in `lobby.ts` and are pure** (same discipline as the engine: no side effects, no `Math.random`/`Date.now` — the rng seed and any ids are injected or derived from the roster). Color/icon uniqueness is enforced on every seat and edit. Stage 4 wires them through the authoritative route + UI.
- The auto-pacer only runs while `status === "active"`, so a lobby (or a finished game) sits at rest. The immediate-play seed (`freshGame`, used by the local `dev` sandbox and the current online seed) skips the lobby and starts `active`; the engine flips `status` to `finished` when a winner is declared.

## Multiplayer / networking

**This project does not use the shared multiplayer stack.** Do **not** import from
`src/shared/lib/webrtc/` or `src/shared/lib/multiplayer/`, and do not use
`useLobbyRoom` / `useWorldRoom`. Those are peer-to-peer WebRTC meshes built for
real-time co-presence; Monopoly is turn-based and runs on a single authoritative
server row instead. (The shared **profile** helper, `@/shared/lib/profile`, is
fine — that's just local player identity, not networking.)

**How networking actually works here — server-authoritative, one row per game:**

- **State is a single Supabase row** in `monopoly_games` holding the entire
  authoritative `GameState` plus an optimistic-concurrency `version`. Events
  live inline in `state.turns` (`TurnGroup[]`); the log is derived, not a
  separate table. Revisit if rows get fat over very long games.
- **The only writer is a Next.js Route Handler** — `src/app/api/monopoly/route.ts`
  — using the service-role client (`@/shared/lib/supabase/server-admin`). RLS
  locks the table to **read-only** for clients, so the route is structurally the
  sole writer. It runs the engine itself (`apply` / `autoStep`), so the stored
  state can never be set to anything illegal. The request/response contract is
  `protocol.ts`.
- **Clients never touch the DB directly.** They POST actions
  (`create` / `submit` / `step` / `reset`) through `sync.ts:submitAction`, read
  the row via `loadGame`, and subscribe to changes via `subscribeGame`
  (Supabase Realtime postgres-changes on the anon key). Incoming state is folded
  in through the store's `applyStateUpdate`. There is **no client-to-client
  channel** — every message is an HTTPS call to the route plus the read-only
  subscription.
- **Writes are version-guarded** (optimistic CAS: `update … where version =
  fromVersion`). A stale write is rejected as a `conflict` no-op and the client
  resyncs from the subscription. This is what makes it safe for more than one
  client to drive the same game at once: duplicate requests collapse to no-ops.
- **No server timer; the backend is delay-agnostic.** The route applies exactly
  **one unit of progress per call** — an intent `apply` (no auto-drain) or one
  `autoStep` per `step`. Pacing and animation are entirely client-side; the
  engine only advances when a client asks it to.
- **No host.** Every client POSTs actions to the route. The active player's own
  client drives its turn; **bot or disconnected-player turns are driven by any
  connected client** (the version guard dedupes the redundant writes). Whether a
  seat is a bot is read from `Player.isBot` in the state — no presence/online
  tracking. A turn belonging to a *disconnected human* simply waits until they
  return (AFK timers are out of scope).

`?game=<id>` connects a client to that row; `?game=dev` is a local-only sandbox
that never touches the DB; no param is the lobby (Stage 4).

## File layout

```
src/projects/monopoly/
  CLAUDE.md            ← this file
  index.tsx            ← re-export of the root component
  types.ts             ← GameState, Intent, GameEvent, TurnState, GameStatus, etc.
  data.ts              ← static board data (SPACES, cards, PLAYER_COLORS/ICONS palette)
  theme.ts             ← color tokens, theming
  logic.ts             ← pure helpers (hasMonopoly, rentAt, isLegal*, ...)
  lobby.ts             ← pure lobby ops (createLobby, joinLobby, addBot, startGame, ...) + setup constants
  lobby.test.ts        ← unit tests for lobby ops (uniqueness, start validation)
  engine.ts            ← apply(intent), autoStep, applyXxx per-intent reducers
  engine.test.ts       ← unit tests for apply / autoStep
  logic.test.ts        ← unit tests for pure helpers
  driver.ts            ← driverRole(connection, state, myId): self | proxy | none
  driver.test.ts       ← unit tests for driver role
  store.ts             ← Zustand store, "use client", wraps engine + auto-pacer for the UI
  mocks.ts             ← MOCK_STATE + freshGame (immediate-play seed) for visual development
  dev.ts               ← debug-only helpers (slice state, randomize ownership, debug keys)
  bots/
    policy.ts          ← botIntent baseline policy (+ policy.test.ts)
  components/          ← React components, dumb where possible
```

**Engine code (`engine.ts`, `logic.ts`) must be pure and free of React, side effects, and `Math.random`.** Components consume state via the store; they do not mutate it.

## Things to keep right

- **No hidden state in components.** All gameplay state lives in `store` or props derived from it. Local `useState` is fine for transient UI (open menus, hover) only.
- **Don't add buttons for non-decisions.** A button for "pay rent" or "continue" is a philosophy violation. If you're tempted to add one, the engine probably needs to take that step on its own.
- **The intent surface is small on purpose.** Resist growing it. New mechanics belong inside `autoStep`.
- **Events are derived.** Don't write code that synthesizes an event without the corresponding state change — that's how state and log drift apart.
- **Debug helpers stay in `dev.ts`.** Never in the component. The component is for production play; debug keys (`2`/`4`/`8` for player count, etc.) and mock slicing live in `dev.ts` and are imported only behind a dev guard.

## Testing

- `logic.test.ts` for pure helpers (`hasMonopoly`, `rentAt`, legality checks).
- `engine.test.ts` for `apply` and `autoStep` — feed a state + intent, assert the new state and event list. Use a seeded RNG. These tests are the regression net for the rules.
- E2E tests (Playwright) live in `e2e/`, exercise the multiplayer flow end-to-end, and assume the dev server on :3001.

When fixing a rule bug, add a failing engine test first. The bug + fix should be one PR.
