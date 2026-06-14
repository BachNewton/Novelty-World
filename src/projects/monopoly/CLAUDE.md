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
- Jail: leave ASAP or stay. The long-term aim is a set-and-forget *stance*, not
  a per-turn prompt — but **v1 ships the per-turn prompt** (pay / card / roll
  each jail turn), a deliberate, owner-approved exception. The `jailStance`
  preference stays in the type, reserved for the future stance toggle. See the
  "Jail" section below.

**Everything else is mechanical and should run on its own:**
- Rolling dice, moving the token, passing GO, paying rent, paying tax, drawing and resolving Chance/Community Chest, going to jail on three doubles, busting at the end of a turn — none of this is a decision. The engine does it automatically.

**Auto-play is a spectrum, set by the player:**
- Default: pause only at real decision points.
- Threshold policies (later): "auto-buy until cash < $X", "stay in jail while late-game", etc. The engine should not preclude these; per-player preferences live in state.
- **Trades and property management happen at a turn boundary, not mid-turn.** A player arms "I want to trade" or "I want to manage" (the action-bar Trade / Manage toggles) at any time; the game pauses at the next **pre-roll** — the single point that is both "right after a turn ends" and "right before the next begins" — and opens that player's trade builder or manage intermission. Armed requests form one FIFO `boundaryQueue` (`{ playerId, kind: "trade" | "manage" }`), each resolved in turn before the roll. This is the official "act between turns" window for trading, building/selling, and mortgaging alike. See "Trades" and "Managing properties" below. (Supersedes an earlier mid-move-interrupt idea — the boundary model is simpler and deterministic. The earlier per-turn "armed pause" checkboxes are gone — arming a Trade/Manage queue slot now does that job.)

**UI consequence:** no "press to roll" button by default. No "you landed on Boardwalk, pay $50 rent — click to continue." The screen updates, the event log scrolls, the turn advances. Buttons exist only for actual decisions (and for arming a boundary action).

## Engine model: hybrid, state-authoritative

State is the single source of truth (one Supabase row per game). Events are folded into state as they happen; the log is derived, not authoritative.

**Two entry points to the engine — and only two:**

```ts
// External decisions only — humans, bots, future RL agent.
apply(state, intent, rng): { ok: true, state, newEvents } | { ok: false, reason }

// Mechanical transitions — runs until the next decision point.
autoStep(state, rng): { state, newEvents }
```

The authoritative route applies **one unit per call**: an `apply` for an external intent (no auto-drain), or a single `autoStep` per `step` request. Clients subscribe to the row and re-render as each unit lands. See the "Multiplayer / networking" section below.

### Intents vs mechanics — the line

**Intents (external API, small surface):**
- `buy`, `decline-buy` (declining sends to auction)
- `bid`, `pass-bid` (during auction)
- `manage` (one atomic build/sell + mortgage/un-mortgage commit; see "Managing properties")
- `mortgage` (forced raise-cash only — the bot / `must-raise-cash` path; voluntary mortgaging goes through `manage`)
- `toggle-queue` (arm/disarm this player's `boundaryQueue` slot for `"trade"` or `"manage"`), `update-trade-draft` (proposer edits the live draft), `cancel-trade`, `propose-trade`, `accept-trade`, `decline-trade`, `cancel-manage` (manager abandons their intermission) (`counter-trade` is a documented TODO, not wired)
- `pay-to-leave-jail`, `use-jail-card`
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
    | "post-roll"            // moved + tile resolved; can build/end
    | "buy-decision"         // landed on unowned ownable; buy or auction
    | "must-raise-cash"      // someone is in the red; settle before continuing
    | "auction"              // auction in progress (see `auction` field)
    | "jail-decision"        // active player in jail, deciding pay/card/roll
    | "trade-building"       // a queued player is assembling a proposal
    | "trade-pending"        // a proposal is awaiting approval votes
    | "managing"             // a queued player's build/sell/mortgage intermission
    | "game-over";
  doublesStreak: number;     // 0-3
  pendingBuy?: number;       // position of property awaiting buy decision
  raiseCash?: "after-landing" | "pre-roll";  // where to resume after must-raise-cash
  auction?: AuctionState;
  managerId?: string;        // present during "managing" — the queued manager (may be off-turn)
  tradeDraft?: TradeDraft;   // present during trade-building
  pendingTrade?: PendingTrade;  // present during trade-pending
}

interface GameState {
  ...existing fields,
  status: "lobby" | "active" | "finished";  // lifecycle (see "Lobby")
  turn: TurnState;
  boundaryQueue: readonly { playerId: string; kind: "trade" | "manage" }[];  // FIFO of armed between-turns actions
  preferences: Readonly<Record<string, PlayerPreferences>>;
  rngSeed: string;           // for deterministic replay + RL training
}
```

`autoStep` only progresses when `turn.phase === "pre-roll"`. It exits the moment it lands on a real decision phase. At a `pre-roll` it first drains `boundaryQueue` — opening a `trade-building` or `managing` phase for the head requester instead of rolling if anyone is queued.

### Debt — one path, may go negative (`must-raise-cash`)

Every charge a player can't cover from cash on hand resolves the same way, whether it's rent, a tax/fine, or the 10% mortgage interest from a trade:

- The charge is applied **immediately** — the debtor's cash can go **negative**.
- If `cash + raisable < 0` (raisable = mortgaging building-free properties; later also selling buildings at half), they can't recover → **bankruptcy** at charge time.
- Otherwise the engine parks in `must-raise-cash` and the **current debtor — whoever is below zero, in seat order (`firstNegativePlayer`), not necessarily the active player** — must mortgage back to ≥ 0. Multiple debtors (from a trade) settle one at a time. `turn.raiseCash` records where play resumes: `after-landing` (rent/tax — continue the active player's landing) or `pre-roll` (a trade — return to the boundary and re-check the queue).

This is why a trade can put an off-turn player into `must-raise-cash`: the UI (board-tap mortgage, mortgage panel) and the bot policy key the forced settler off `firstNegativePlayer`, not `turn.playerId`.

### Trades

Permissive by design: a **proposer (who need not be a party)** reassigns any **owned** (building-free) properties and held Get-Out-of-Jail-Free cards between any players, plus per-player **cash deltas that must net to zero** (money only moves between players; the bank is never a party). Shape is `TradeTerms` (`propertyTo` / `gojfTo` / `cashDelta`, storing only entries that change).

- **The draft lives in synced `GameState`** (`turn.tradeDraft`), edited via `update-trade-draft` snapshots, so **every player watches it take shape in real time** — a deliberate departure from mortgage staging, which is local-only client state. The board rows are the property surface (tap to cycle the recipient); cash steppers + card rows live in the trade panel; the log is hidden while a trade is up to make room.
- `propose-trade` validates (moves something, ≥2 named parties, cash balances, and every resulting debtor could recover) and flips to `trade-pending` with an `approvals` map over the **named** parties (the proposer auto-approves iff named). **All approve → execute; any decline cancels.**
- **Mortgaged properties transfer still-mortgaged**, and the receiver owes the bank **10% interest** on each (official rule), charged through the `must-raise-cash` path above.
- **Counters are not built** — decline and re-propose. The `TradeTerms` model + `update-trade-draft` are shaped so a counter can be added later (see the `counter-trade` TODO on `Intent`).

### Managing properties (build / sell / mortgage)

A queued `manage` request opens a **`managing`** intermission at the pre-roll boundary for `turn.managerId` (who may be off-turn, exactly like a trade proposer). The player stages changes **locally** (client-side, like mortgage staging — *not* synced like a trade draft) and commits them as **one atomic `manage` intent**, or abandons via `cancel-manage`; either returns to the active player's pre-roll, re-checking the queue.

- **One commit carries both** a `build` target (`position -> 0-5`, where 5 is a hotel) and `mortgage` flags (`position -> bool`). The engine applies it **raise-first / spend-second, all-or-nothing**, so a single commit can sell a property's houses *then* mortgage the bare lot, or mortgage one property to fund building another. It can never leave the board uneven or half-applied even if the bank shifted underneath.
- **The build planner is pure, in `development.ts`** (`planDevelopment`). It enforces the real rules: even-build across a color set, the full-unmortgaged-monopoly requirement, finite bank supply (**32 houses / 12 hotels**, derived from the board — no stored counter), the hotel-breaks-down-*through*-four-houses rule, and the official house-shortage **liquidation escape** (a hotel that can't be broken down evenly is sold straight to a bare lot). It returns an ordered, supply-safe step list + net cash, choosing the **cheapest** legal schedule (an exhaustive memoized search over color-group order; liquidation only when genuinely forced). Per-tier `build` / `sell-building` and `mortgage` / `unmortgage` events are emitted so the log replays the transaction.
- **`must-raise-cash` reuses the same `manage` reducer** (forced branch): the current debtor (`firstNegativePlayer`, possibly off-turn) raises by selling buildings and/or mortgaging — no builds, no un-mortgages — and `settleOrRaise` resumes play once they're back to ≥ 0. `maxRaisableCash` counts building sale value so a debtor with only built property settles instead of busting.
- **Board UI:** the manage panel uses the board rows as its surface — tapping a property's **color strip** cycles its build level (`square-row.tsx` splits the row into two tap zones), tapping the **row body** toggles its mortgage. The `ManagePanel` summary bar shows the combined net cash, the **remaining bank supply** (houses/hotels — surfaced only here), and a shortage-liquidation note when one is forced. Staging is local client state (`store.ts` `manageStaged`); the pure preview math is in `manage.ts` (`manageSummary` = build plan with staged mortgages applied + the mortgage cash deltas). The **same panel serves `must-raise-cash`** (forced "Pay" mode: sell down / mortgage only), so a human debtor can sell buildings, not just mortgage. The log is hidden during `managing`, as for trades.
- **TODO (building auction — deferred to v2):** the official rule auctions scarce houses/hotels to the highest bidder when demand exceeds supply; v1 approximates with the arm-order FIFO. The agreed v2 design reuses the property-auction sub-game: a **batched build window** (collect all armed managers' commits at the boundary before executing builds) + **returns-first reconciliation** (apply every sell/hotel-upgrade that *adds* to the bank, then compare net house/hotel demand against supply) + the **single-unit auction run in a loop** over the contested tier. The key simplifier — players never contend for *placement* (a monopoly is single-owner, so even-build is independent per player), only for the shared integer house/hotel count — so contention is purely numeric and the auction unit is a fungible house. Collapses to today's FIFO whenever demand ≤ supply or there's ≤1 armed builder.

### Auctions

One **shared sub-game** (`engine.ts`: `enterAuction` / `applyBid` / `applyPassBid` / `resolveAuction`), entered from two triggers and resuming via an `AuctionResume` continuation (the same pattern as `RaiseCashResume`):

- **Decline-buy** (`resume: { kind: "landing" }`): the active player declines a landed-on property (`applyDeclineBuy`). The auction resumes their landing through `afterLanding` / `settleOrRaise` when it ends.
- **Bank bankruptcy** (`resume: { kind: "bank-estate", debtorId, remaining }`): a player busts to the bank, and `goBankrupt` returns their buildings to the bank then auctions each bare lot. The lots resolve through `resumeEstate`, which auctions the next `remaining` lot, and when the estate is empty hands control onward. Skipped when the bust leaves a single survivor (game over) or the debtor owns nothing.

**Bidding is open-outcry — no turn order.** Any still-in player may `bid` at any time, which raises `highBid` by one fixed **+$10** increment *computed at apply time* (the `bid` intent carries no amount, so a tap is always coherent against the latest authoritative high). The standing `leaderId` **may bid again** to jam the price up; only thing they can't do is `pass-bid` (no retracting a winning bid). `AuctionState` holds `active` (still-in players, seat-ordered for display — membership is what matters, there's no rotation), `highBid`, `leaderId`, per-player `bids` (for the panel), and `resume`. The auction resolves (`auctionDecided`) once every non-leader has dropped — the **leader wins** — or everyone drops with no bid → **unsold, lot stays with the bank** (`auction` event with `winnerId: null`). Because drops are permanent the active set only shrinks, so it always terminates (the lone AFK-never-acts case is the same as any other phase — out of scope).

**Races are handled by the existing version-guarded CAS, no new machinery.** Concurrent bids/drops are ordinary intents on the single authoritative row: one write wins, the other is a `conflict` no-op and resyncs from the realtime subscription. Bids/drops are fully **optimistic** (same `submit`→`predict`→pure-`apply` path as buy/trade), so a tap updates the panel instantly; apply-time +$10 means the local prediction matches the confirmed result exactly when there's no conflict.

**Bid caps = what you can pay** (`auctionBidCap`, enforced in `applyBid`):
- Decline-buy → **net worth** (`cash + maxRaisableCash`), the binding-bid rule. A winner who bids above cash drops into `must-raise-cash` (resume `after-landing`) and settles, possibly **off-turn** (the winner need not be the active player — exactly like the trade debtor path).
- Estate → **cash on hand** less the 10% interest on a still-mortgaged lot, so the winner pays immediately and never goes negative. **v1 simplification** (flagged): keeps the multi-lot loop free of nested settlement; a still-mortgaged estate lot transfers mortgaged and charges the receiver the official 10% interest (reusing the trade rule), an unsold one reverts clean.

**Player-to-player bankruptcy is now fully official** (no longer simplified): `goBankrupt`'s player-creditor branch sells the debtor's buildings back to the bank at **half price with that cash to the creditor**, transfers **bare lots** (mortgage status intact), and charges the creditor the **10% interest** on each inherited mortgaged lot — which can rarely tip an (off-turn) creditor into the red, so the rent path advances then `settleOrRaise(..., "pre-roll")`.

**Pacing / bots / UI:** `pacing.ts` `turnOp` lists `auction` among the off-turn decision phases, so any bot bidder is driven (no `driverRole` change). The bot policy bids `+$10` up to `min(printed price, cash)` then passes — a conservative v1 placeholder (TODO: net-worth bidding + real valuation). The **`AuctionPanel`** (`components/auction-panel.tsx`) is synced state shown to **everyone** (like a trade): it renders the lot, every player's standing (leading / bidding / in / out), and gates `Bid $<high+10>` / `Drop` on whether this client is the current bidder. `prompt-section.tsx` renders it before the `myPlayerId` gate; `footer.tsx` hides the log during `auction`. The `auction` event already renders in the log (winner + price, or "unsold").

### Jail

**Three ways in** — landing on the "Go to Jail" tile, rolling three consecutive doubles, and (deferred with the card system) drawing a "Go to Jail" card. All three relocate the player to the Jail cell, set `inJail` + `jailTurns: 1`, log `go-to-jail`, and **end the turn immediately** — going to jail forfeits the rest of the turn even if the move was a double, and never pays GO. `sendToJail` is the single entry helper.

**A jailed player's turn opens at `jail-decision`.** `autoStep` at `pre-roll` resolves the boundary queue first (so others' trade/manage arms still fire), then — if the active player is jailed — flips to `jail-decision` and stops. From there:

- **Human:** the prompt (`prompt-section.tsx` `JailPrompt`) offers **Pay $50 / Use card / Roll** each jail turn. Pay and card are intents; "Roll" fires the mechanical jail roll via the store's `step`. This per-turn prompt is the v1 exception to the "stance, not a prompt" philosophy (see Philosophy above).
- **Bot:** the policy leaves ASAP — **card → cash → roll**: spend a held Get-Out-of-Jail-Free card first (free), else pay the $50 fine if affordable, else return `null` so the pacer steps the jail roll. `turnOp` drives only a proxied seat here; a human's own jail turn waits for their UI.

**Four ways out:**
- **Roll a double** (`jailRoll`): leave and move out by the roll. Escaping on a double does **not** grant another roll (official) — `doublesStreak` stays 0, so the turn settles after the landing.
- **Pay $50** (`pay-to-leave-jail`, only when affordable) or **play a card** (`use-jail-card`, returns the card to the bottom of its deck): leave, then resume at `pre-roll` so the normal auto-roll moves them this turn — a double rolled *after* paying/carding *does* grant another roll (they're a free player again).
- **Serve the sentence:** a failed roll on jail turns 1–2 advances `jailTurns` and ends the turn; a failed **third** roll forces the $50 fine, then moves out.

**The $50 fine is a bank charge.** Voluntary pay is gated on cash ≥ $50 (no debt path). The forced third-turn fine routes through the unified debt model: `goBankrupt` is generalized to a **null (bank) creditor** — and a bank bust now **auctions the estate lot by lot** (see "Auctions"), with cards returning to their decks. v1 simplification flagged in code: if the forced fine alone pushes the player into the red, they settle (`must-raise-cash`) before the turn ends and the landing's *rent* is skipped for that rare case.

**All three jail entries are live**, including the card path: a "Go to Jail" card routes through `sendToJail(state, "card")`, and a Get-Out-of-Jail-Free card is acquired by drawing the `jail-free` card (held in `jailFreeCards`, returned to its deck bottom when used). `jailStance` is reserved in the type for the future stance toggle. See "Chance / Community Chest decks" below.

### Chance / Community Chest decks

A card draw is **mechanical** — it runs inside `autoStep` via `resolveTile` when a player lands on a card tile, never as an intent. The 32 official cards (`CHANCE` / `COMMUNITY_CHEST` in `data.ts`) are modeled as a `CardEffect` union; the engine resolves each into machinery it already has, so **no card introduces a new decision phase**. Built for pros: a card is shown by its **shorthand `name`** ("Boardwalk", "Chairman", "Nearest RR"), not flavor text. The `card-drawn` event stores only `{ source, cardId, cash? }`; the log maps `cardId` → the shorthand.

- **Piles live in state.** `decks: { chance, communityChest }` are index lists into the static decks (front = next to draw), **seed-shuffled once at game start** (`initialDecks`, fed the injected RNG via the shared `shuffleArray`). A draw pops the front and rotates it to the bottom; a `jail-free` card instead **leaves the pile while held** (tracked in `jailFreeCards`) and is re-appended when used (`use-jail-card`) or when its holder busts to the bank (`goBankrupt`). Adding `decks` was a `GameState` field change → rows were wiped per the pre-launch rule.
- **Effects funnel into existing helpers.** `collect`/`pay`/`repairs` → a bank credit / `chargeToCreditor` (the same terminal-charge pattern as the tax tile, so debt routes through `must-raise-cash`). `pay-each` (Chairman) / `collect-each` (Birthday) → one `card-transfer` line per opponent through the debt model. `advance-to` / `back-three` → move, then **normal `resolveTile`** (so a card move onto a property charges normal rent, and Chance "back 3" from tile 36 chains a Community Chest draw). `go-to-jail` → `sendToJail`. `jail-free` → set the holder.
- **The only card-specific rent overrides** are the two "advance to nearest" cards: a railroad pays **2× the owner's normal rent**, a utility pays **10× a fresh dice throw** regardless of how many utilities the owner holds (`advanceNearestCard`).
- **Card movement that wraps GO** emits a standalone `pass-go` event for the $200 (the roll path encodes it inline on the `roll` event instead; cards have no roll).
- **Decisions a card can reach** are only the *existing* ones: an `advance`/`back` card that lands on an **unowned ownable opens the normal `buy-decision`** (buy or auction — this is the cards' "you may buy it from the Bank"), and any unaffordable charge drops into `must-raise-cash`. Both are pre-existing flows; the bot pacer and UI handle them unchanged.
- **v1 simplification (flagged in code):** a Chairman drawer who can't cover the full payout even after liquidating busts to the bank rather than paying each opponent as far as their cash stretches — vanishingly rare at $50/head. Birthday's opponent-can't-pay case is handled fully (they bust to the drawer).

### RNG: always injected, never `Math.random()`

Every randomness call goes through an injected RNG. Engine functions take an `rng` argument; the host advances it. This is non-negotiable — it's what makes deterministic replay, regression tests, and future headless RL training possible.

### Bot interface

```ts
type Bot = (state: GameState, playerId: string) => Intent;
```

The bot is given the full state (Monopoly is open-information) and returns one intent. The engine handles everything else. The same shape works for the dumb early bot, the rule-based bot, and an eventual learned policy.

The baseline lives in `bots/policy.ts` as `botIntent(state, playerId): Intent | null` — pure, returning the intent bot `playerId` should submit **right now**, or `null` if it isn't this bot's move. It covers the proxy-driven decision phases: `buy-decision` (buy when affordable), `must-raise-cash` (if this bot is the current debtor — `firstNegativePlayer`, possibly off-turn — mortgage the cheapest building-free property, then sell off a built set's buildings via `manage` once nothing's left to mortgage), and `trade-pending` (if this bot is an un-voted named party, **accept** — a permissive v1 placeholder; `TODO` real valuation). The store's auto-pacer **iterates the bot seats** for decision phases and submits the first non-null intent (a human's own decisions are left to their UI); the universal mechanical beats (`pre-roll` → step, `post-roll` → end-turn) run for whoever drives the active seat (`driver.ts`). **Bots never *initiate* trades** — nothing queues a bot, so the proposer is always human. Swap in a smarter policy here without touching the pacer.

## Lobby

A game row carries a `GameState.status` of `lobby` | `active` | `finished`. The lifecycle:

- `createLobby(host, rngSeed)` seeds a `lobby` row seating the host alone. Other clients `joinLobby` (auto-assigned the first free color + icon), `addBot`, `removePlayer`, and tweak seats via `setPlayerColor` / `setPlayerIcon` / `setPlayerName`. `startGame` validates the roster (≥2 players, ≥1 human) and flips `status` to `active`.
- These **lobby ops live in `lobby.ts` and are pure** (same discipline as the engine: no side effects, no `Math.random`/`Date.now` — the rng seed and any ids are injected or derived from the roster). Color/icon uniqueness is enforced on every seat and edit. They are wired through the authoritative route (the `join` … `start` actions in `protocol.ts`, applied version-guarded in `route.ts`) and surfaced by the seat-room UI (`components/seat-room.tsx`).
- The auto-pacer only runs while `status === "active"`, so a lobby (or a finished game) sits at rest. The immediate-play seed (`freshGame`, used by the local `dev` sandbox and the current online seed) skips the lobby and starts `active`; the engine flips `status` to `finished` when a winner is declared.

## Multiplayer / networking

**This project does not use the shared multiplayer stack.** Do **not** import from
`src/shared/lib/webrtc/` or `src/shared/lib/multiplayer/`, and do not use
`useLobbyRoom` / `useWorldRoom`. Those are peer-to-peer WebRTC meshes built for
real-time co-presence; Monopoly is turn-based and runs on a single authoritative
server row instead. (The shared **profile** helper, `@/shared/lib/profile`, is
fine — that's just local player identity, not networking.)

**There is no local/in-process mode.** Every game — including the `dev` sandbox —
runs on the authoritative route against a Supabase row. `dev` is just a reserved
game id that additionally accepts the debug actions (see "Dev sandbox" below);
it is otherwise a normal backend game.

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
- **Clients never touch the DB directly.** They POST actions through
  `sync.ts:submitAction` — `create` (seed a lobby on first open), the lobby ops
  (`join` / `addBot` / `removePlayer` / `setColor` / `setIcon` / `setName` /
  `start`), the play ops (`submit` / `step`), and the dev-only `reset` — read
  the row via `loadGame`, list joinable games via `listGames`, and subscribe to
  changes via `subscribeGame` (Supabase Realtime postgres-changes on the anon
  key). Incoming state is folded in through the store's `applyStateUpdate`.
  There is **no client-to-client channel** — every message is an HTTPS call to
  the route plus the read-only subscription. The route shares one
  version-guarded write path (`mutate`) across every lobby and play op; only
  `create` (insert-only) and `reset` (upsert) seed without a version.
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

**URL / routing** (`components/monopoly.tsx`): no `?game=` param shows the lobby
browser (`components/lobby-browser.tsx`); `?game=<id>` connects to that row —
while it's a `lobby` the seat room renders, once it's `active`/`finished` the
board does. `?game=dev` is the same path: it connects to the `dev` row (seeded
as an immediate-play game, so it lands on the board). The id is read from the
URL via `useSyncExternalStore` and changed with `history.pushState`, so browser
back/forward works. In the store, `gameId` is `null` while parked (the lobby
browser — the pacer is idle), or the row id (including `"dev"`) once connected.

**Dev sandbox.** The `dev` game accepts debug actions that no other game does:
the route only applies a `dev`-type action when `gameId === "dev"` (otherwise it
ignores it). The hotkeys (`dev.ts`) submit these like any move; the route runs
the pure transforms in `dev-ops.ts` (`restart` N-player, `own-all`,
`random-own` — randomness from `rngState`, never `Math.random`) and writes the
result, so they round-trip through the same version-guarded path + subscription.
`?game=dev`'s seed is `freshGame` (1 human + 3 bots, immediate play).

## File layout

```
src/projects/monopoly/
  CLAUDE.md            ← this file
  index.tsx            ← re-export of the root component
  types.ts             ← GameState, Intent, GameEvent, TurnState, GameStatus, PlayerCount, etc.
  protocol.ts          ← route transport contract (MonopolyAction incl. lobby + dev ops, DevCommand)
  sync.ts              ← client DB access: submitAction, loadGame, listGames, subscribeGame
  data.ts              ← static board data (SPACES, cards, PLAYER_COLORS/ICONS palette)
  theme.ts             ← color tokens, theming
  logic.ts             ← pure helpers (hasMonopoly, rentAt, isLegal*, ...)
  lobby.ts             ← pure lobby ops (createLobby, joinLobby, addBot, startGame, ...) + setup constants
  lobby.test.ts        ← unit tests for lobby ops (uniqueness, start validation)
  engine.ts            ← apply(intent), autoStep, applyXxx per-intent reducers
  engine.test.ts       ← unit tests for apply / autoStep
  logic.test.ts        ← unit tests for pure helpers
  driver.ts            ← driverRole(state, myId): self | proxy | none
  driver.test.ts       ← unit tests for driver role
  store.ts             ← Zustand store, "use client", route client + auto-pacer for the UI
  mocks.ts             ← MOCK_STATE (test fixture) + freshGame (immediate-play seed)
  dev-ops.ts           ← pure dev state transforms (own-all, random-own, restart) (+ dev-ops.test.ts)
  dev.ts               ← debug-only hotkeys that submit dev commands to the route
  bots/
    policy.ts          ← botIntent baseline policy (+ policy.test.ts)
  components/          ← React components (monopoly root, lobby-browser, seat-room, board)
```

**Engine code (`engine.ts`, `logic.ts`) must be pure and free of React, side effects, and `Math.random`.** Components consume state via the store; they do not mutate it.

## Things to keep right

- **No legacy / back-fill handling (pre-launch).** The game is still in dev, so treat all stored data as disposable: a `GameState` may be assumed to match the *current* type exactly. Do **not** write migration shims, default-filling of newly added fields, or any code that tolerates an old row shape — when a field is added, wipe the rows instead (delete from `public.monopoly_games` via the psql one-liner in the root CLAUDE.md, then refresh). **Remove this allowance once the game goes live** — at that point real rows must be migrated, not deleted.
- **No hidden state in components.** All gameplay state lives in `store` or props derived from it. Local `useState` is fine for transient UI (open menus, hover) only.
- **Don't add buttons for non-decisions.** A button for "pay rent" or "continue" is a philosophy violation. If you're tempted to add one, the engine probably needs to take that step on its own.
- **The intent surface is small on purpose.** Resist growing it. New mechanics belong inside `autoStep`.
- **Events are derived.** Don't write code that synthesizes an event without the corresponding state change — that's how state and log drift apart.
- **Debug helpers stay in `dev.ts` / `dev-ops.ts`.** Never in the component. The hotkeys (`2`/`4`/`8` restart with N players, `0`/`1` ownership overrides, `n` new game) live in `dev.ts` behind a dev guard and submit `dev` actions; the pure state transforms live in `dev-ops.ts` and are applied server-side, gated to the `dev` game id.

## Testing

- `logic.test.ts` for pure helpers (`hasMonopoly`, `rentAt`, legality checks).
- `engine.test.ts` for `apply` and `autoStep` — feed a state + intent, assert the new state and event list. Use a seeded RNG. These tests are the regression net for the rules.
- E2E tests (Playwright) live in `e2e/`, exercise the multiplayer flow end-to-end, and assume the dev server on :3001.

When fixing a rule bug, add a failing engine test first. The bug + fix should be one PR.
