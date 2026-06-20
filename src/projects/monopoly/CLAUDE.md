# Monopoly — Project Guide

Read this before touching code in `src/projects/monopoly/`. It captures the
*why* and the invariants — the things the code can't tell you. It is **not** a
walkthrough of what each function does; read the code for that. When you change
a decision recorded here, update this file; when you'd only be re-describing
code, don't add it.

## Philosophy: built for pros

Monopoly for players who know the game cold — fast, dense access to the few real
decisions, nothing else. The whole game collapses to: **buy or auction a landed
property; bid in auctions; build/sell/mortgage; propose/accept/decline trades;
leave or stay in jail.** Everything else (roll, move, pass GO, pay rent/tax, draw
and resolve cards, go to jail, bust, detect a winner) is **mechanical and runs on
its own** — no buttons, no confirmations.

Consequences:
- **No "press to roll" / "click to continue" buttons.** Buttons exist only for
  real decisions (and for arming a boundary action).
- **Auto-play is a spectrum** the player sets; the default pauses only at real
  decision points. Per-player preferences live in state (e.g. `jailStance`,
  reserved for a future jail toggle — v1 ships a per-turn jail prompt as a
  deliberate, owner-approved exception).
- **Trades and property management happen at a turn boundary, not mid-turn.** A
  player arms "trade" or "manage"; the game pauses at the next **pre-roll** — or,
  for a jailed player, at their **jail decision** — and opens their
  builder/intermission. Arms form one FIFO `boundaryQueue` (`{ playerId, kind }`),
  each resolved before play continues. This is the official "act between turns"
  window.

## Engine model: hybrid, state-authoritative

State is the single source of truth (one Supabase row per game). Events are
folded into state as they happen; the log is **derived**, not authoritative — so
never synthesize an event without the corresponding state change.

**Two entry points, and only two:**

```ts
// External decisions only — humans, bots, future RL agent.
apply(state, intent, rng): { ok: true, state, newEvents } | { ok: false, reason }
// Mechanical transitions — runs until the next decision point.
autoStep(state, rng): { state, newEvents }
```

The authoritative route applies **one unit per call** — one `apply` for an
intent (no auto-drain) or one `autoStep` per `step` request. `autoStep`
progresses at `pre-roll` **and at a jailed player's `jail-decision`**, where it
first **drains `boundaryQueue`** (opening a trade/manage intermission for the
head requester) before rolling; it exits the moment it hits a real decision
phase. A boundary opened from `jail-decision` resolves back to `pre-roll`, which
re-enters the same jail decision while the player is still jailed — so no
separate resume target is stored.

**Keep the intent surface small** (`engine.ts` `apply` dispatches them). New
mechanics belong inside `autoStep`, not as new intents. The line: if a player
could rationally choose either way it's an **intent**; if the only "choice" is
the obvious one it's a **mechanic** gated by preferences.

**Engine code (`engine.ts`, `logic.ts`) is pure** — no React, no side effects,
no `Math.random`. Every randomness call goes through an **injected RNG**; this is
non-negotiable (deterministic replay, regression tests, future headless RL).

### Turn phases

`turn.phase` is the state machine: `pre-roll` · `post-roll` · `buy-decision` ·
`raising-cash` · `must-raise-cash` · `auction` · `jail-decision` ·
`trade-building` · `trade-pending` · `managing` · `game-over`. See `types.ts` for
the full `TurnState`/`GameState` shape — don't duplicate it here.

### Debt — one path, may go negative (`must-raise-cash`)

Every charge a player can't cover (rent, tax/fine, trade mortgage interest)
resolves the same way: the charge is applied **immediately** (cash can go
**negative**); if they couldn't recover even after liquidating everything
(`cash + maxRaisableCash < 0`) it's **bankruptcy**, otherwise the engine parks in
`must-raise-cash`. The settler is **whoever is below zero in seat order
(`firstNegativePlayer`) — not necessarily the active player.** So a trade can
force an *off-turn* player to settle; UI and bot policy key the settler off
`firstNegativePlayer`, never `turn.playerId`. `turn.raiseCash` records where play
resumes (`after-landing` vs `pre-roll`).

### Managing, raising-cash, must-raise-cash: one system, three tiers

All three drive the **same board surface** and the same commit core
(`applyManageCommit`, raise-first / spend-second, **all-or-nothing**). They differ
on two knobs: **allowed ops** (full build/sell/mortgage/unmortgage vs cash-in
only) and **how you leave** (free vs gated-until-solvent).

- **`managing`** (full): a queued boundary intermission for `turn.managerId` (who
  may be off-turn, like a trade proposer). Build planning is pure in
  `development.ts` (`planDevelopment`) and enforces the real rules — even-build,
  full-unmortgaged-monopoly requirement, finite bank supply (32 houses / 12
  hotels), hotel-breaks-down-through-four-houses, and the shortage liquidation
  escape — choosing the cheapest legal schedule.
- **`raising-cash`** (cash-in only, free exit): the buy-time cash-raise. It's a
  **real phase, not a `buy` payload** — a short buyer submits `raise-cash` to
  enter, stages sells/mortgages, then commits with a plain `buy` (the engine
  reads the staged raise from `turn.manageStaged`, applies it raise-first against
  pre-purchase holdings, gates `cash ≥ price`, buys — one atomic apply, never
  goes negative). A lot **can never fund its own purchase** (not owned yet, so
  the ownership check rejects it — structural, not a flag).
- **`must-raise-cash`** (cash-in only, gated until ≥ 0): the forced settler above.

Shared invariants:
- Staging lives in **synced `turn.manageStaged`**, edited via
  `update-manage-staging` snapshots, so **every player watches it take shape**.
  The phase transition on commit/cancel drops the staging.
- `isRaiseOnly(state)` (true for `must-raise-cash` *and* `raising-cash`) is the
  single predicate gating the board to sell/mortgage only. `manageActorId(state)`
  is the actor. A plain `buy-decision` is **inert** — no staging surface.
- **Unaffordable-even-after-raising** landings skip the prompt and go straight to
  auction (no button for a non-choice); the player can still bid up to net worth.
- **Bots CAN raise to buy.** The pacer drives `raising-cash` for a bot buyer (the
  `claude` policy enters it for a property it judges worth owning, stages a
  mortgage raise, then commits the `buy`); the `dumb` baseline still buys only
  when `cash ≥ price`.
- **TODO (v2):** auction scarce houses/hotels when demand exceeds supply; v1
  approximates with the arm-order FIFO.

### Trades

Permissive by design: a **proposer (who need not be a party)** reassigns owned
(building-free) properties and held Get-Out-of-Jail-Free cards between any
players, plus per-player **cash deltas that net to zero** (the bank is never a
party). The draft lives in synced `turn.tradeDraft` (everyone watches it live).
`propose-trade` validates and flips to `trade-pending` with an `approvals` map
over the **named** parties; **all approve → execute, any decline → cancel.**
Mortgaged properties **transfer still-mortgaged** and the receiver owes the bank
**10% interest** (charged through `must-raise-cash`). **Counters aren't built** —
decline and re-propose (the model is shaped to add them later).

### Auctions

One **shared sub-game** entered from two triggers (decline-buy; bank-estate
bust), resuming via an `AuctionResume` continuation. **Open-outcry — no turn
order:** any still-in player may `bid` anytime. A bid carries an **absolute
amount**, which is what makes it safely **rebaseable** through the optimistic
overlay (re-applying it just re-records the same number — no snap-to-zero, no
auto-escalation). Drops are permanent, so the active set only shrinks and it
always terminates. **Bid cap = what you can pay** (`auctionBidCap`): **net worth**
for both triggers, less the 10% interest owed on a still-mortgaged estate lot. A
winner over cash settles via `must-raise-cash` (possibly off-turn); on the estate
loop each lot is **settled before the next is auctioned** (`settleOrRaise` carries
a `bank-estate` resume that re-enters `resumeEstate` once solvent). The interest
subtraction keeps the cap *recoverable* — a bid above it would strand the winner
(or a bot, which bids straight to the cap) in an unsettleable `must-raise-cash`.
Player-to-player and bank bankruptcy follow the full official rules (buildings
sold to the bank at half, bare lots transferred, 10% interest on inherited
mortgaged lots).

### Jail

**Three ways in** (Go-to-Jail tile, three doubles, card) — all relocate, set
`inJail`, log `go-to-jail`, and **end the turn immediately**. A jailed player's
turn opens at `jail-decision`. **Four ways out:** roll a double (no extra roll),
pay $50, play a card (returns to deck bottom), or serve out (a failed third roll
forces the $50 fine via the debt model). The per-turn **pay/card/roll prompt is
the v1 exception** to "stance, not a prompt" (see Philosophy). Bots leave ASAP:
card → cash → roll.

The jail decision is **also a turn boundary**: the jailed player — or an off-turn
player — may arm trade/manage and open that intermission before the jail roll (the
same `boundaryQueue` drain as `pre-roll`), then return to the jail decision once it
commits/cancels, since the player is still jailed. This gives a human the "act
between turns" window at the jail prompt that they'd otherwise only get at a normal
turn start. A bot doesn't need it — it already arms at the `pre-roll` a beat earlier
— so a *staying* bot simply notes its reasoning as a `bot-note`, then rolls.

### Chance / Community Chest

A draw is **mechanical** (inside `autoStep`), never an intent — and **no card
introduces a new decision phase**; every effect funnels into machinery that
already exists (bank credit / `chargeToCreditor` / move-then-`resolveTile` /
`sendToJail`). A card landing on an unowned ownable opens the normal
`buy-decision`; an unaffordable charge drops into `must-raise-cash`. Decks live
in state (seed-shuffled once at start); cards are shown by shorthand `name`, not
flavor text.

### Bots

```ts
type Bot = (state: GameState, playerId: string) => BotDecision | null;
interface BotDecision { intent: Intent; note?: string }
```

A bot is one pure function: the move its seat should make now (an intent, plus
an optional reasoning `note`), or `null` when it has nothing to do. The contract
lives in **`bots/decision.ts`** (separate from the registry so the policies can
import the `move()` wrapper without an import cycle). Each seat's strategy is
`Player.botStrategy` (`BotStrategy | null` — `null` is a human), resolved through
**`bots/registry.ts`** (`BOTS`). Adding a strategy is a new `BotStrategy` member
plus a registry entry. Current strategies:

- **`dumb`** (`bots/dumb.ts`) — the reactive baseline; answers the proxy-driven
  decision phases and never initiates. Returns note-less decisions.
- **`claude`** — the strong, proactive, pro-level opponent and the **default**
  for added bots (`addBot`) and the `freshGame` seed. It is **not a fixed file**:
  the `claude` strategy is a **pointer** into the version archive (`bots/live.ts`
  → `LIVE_VERSION` — read that file for the version currently shipped), so the
  policy code lives in `bots/versions/<label>/{claude,valuation,trades}.ts`. Whatever version ships, it
  is a pure dispatcher over its `valuation.ts` (scoring, build planning,
  liquidation, jail) and `trades.ts` (counterparty-aware proposals + evaluation),
  everything keyed off `positionValue`, **noting its reasoning on every decision**.
  Its purpose, strategic model, tuning rationale, and refinement roadmap have
  their own deep guide: **`bots/CLAUDE.md`** — read that before touching a
  version's `claude.ts`, `valuation.ts`, or `trades.ts`.

**BOT notes.** A `bot-note` GameEvent (verb **BOT** in the log) records a bot's
reasoning. It is the lone log event with **no board change** — pure annotation —
and the one sanctioned exception to "no event without a state change": it always
rides in the same atomic submit as the decision it explains (the pacer prepends
it; `applyBotNote` is lenient — a note for a non-bot seat is a no-op, never a
rejection, so it can't stall a batch). Notes are generated deterministically by
the policy (no live model call), so replay is unaffected. Reactive decisions
note on the decision; the arm→intermission→commit flows note on the **arm**
(which explains the plan) and commit silently.

The pacer (`pacing.ts`) consults a policy in: the reactive decision phases (buy,
auction, **raising-cash**, must-raise-cash, trade-pending, jail — some wait on an
OFF-turn bot); `pre-roll`, where a bot may **proactively arm** a build (own turn)
or a trade (**own OR off-turn** — see below); and a `managing` / `trade-building`
/ `raising-cash` intermission whose actor is a bot, driven to a commit (the pacer
cancels as a fallback if the policy stalls). The engine is unchanged — proactive
play reuses the boundary-queue + intermission machinery a human uses.

**Proactive scope + invariants:**
- **Off-turn trades are enabled.** At any turn boundary the pacer consults every
  bot (not just the active one) for a trade arm; the engine already opens a
  queued intermission for whoever armed it, even off-turn, so a bot can negotiate
  between turns. Builds stay own-turn only. (The active player's client is the
  sole driver, so off-turn arms ride on it; the human-turn sync barrier holds.)
- A policy must (1) arm at `pre-roll` only when the commit will change state —
  the pacer skips a redundant arm, but a policy that keeps wanting a no-op spins;
  and (2) resolve any intermission it armed.
- **A *declined* trade leaves state unchanged**, so a proposing policy must guard
  against re-pitch loops, and its built drafts must be strictly proposable so the
  route never rejects a drive (a rejection would latch the once-per-version guard
  and stall the phase). How the `claude` policy satisfies both is in
  `bots/CLAUDE.md`.

The pacer's drive paths are covered in `pacing.test.ts` (with both injected mock
policies and the real default resolver); the `claude` decision logic in
`bots/claude.test.ts`. The browser-only playback pump is **not** unit-tested —
verify the end-to-end proactive flow (off-turn trades, raise-to-buy) by running
the app.

The `claude` strategy's own known limits and refinement roadmap (N-way trades,
mortgage-to-fund-a-build) live in `bots/CLAUDE.md`, along with the design
decisions behind it — including why monopoly value is deliberately *not* scaled
by cash/affordability.

## Lobby

`GameState.status` is `lobby | active | finished`. Lobby ops live in `lobby.ts`
and are **pure** (no side effects, no `Math.random`/`Date.now` — seeds/ids are
injected), enforce color/icon uniqueness, and are wired through the route. The
auto-pacer runs only while `active`. The immediate-play seed (`freshGame`, used
by `dev` and the current online seed) skips the lobby.

## Multiplayer / networking

**This project does NOT use the shared multiplayer stack.** Do not import from
`src/shared/lib/webrtc/` or `src/shared/lib/multiplayer/` — those are P2P meshes;
Monopoly is turn-based on a single authoritative server row. (`@/shared/lib/profile`
is fine — local identity, not networking.) There is **no local/in-process mode**;
every game, including `dev`, runs on the route against a Supabase row.

The model — **server-authoritative, one row per game:**
- **State is one Supabase row** (`monopoly_games`): the whole `GameState` plus an
  optimistic-concurrency `version`. Events live inline in `state.turns`.
- **The only writer is the route handler** (`src/app/api/monopoly/route.ts`) via
  the service-role client. RLS locks the table **read-only** for clients, so the
  route is structurally the sole writer and runs the engine itself — stored state
  can never be illegal. Transport contract is `protocol.ts`.
- **Clients never touch the DB directly.** They POST actions through
  `sync.ts:submitAction` and read/subscribe via the anon key (`loadGame`,
  `listGames`, `subscribeGame`). Incoming state is folded in via
  `applyStateUpdate`. There is no client-to-client channel.
- **Writes are version-guarded** (CAS: `update … where version = fromVersion`). A
  stale write is a `conflict`; the route hands back the **winning state +
  version** so the client rebases immediately. This is what makes concurrent
  drivers safe — duplicate writes collapse to no-ops.
- **No server timer; one unit of progress per call.** Pacing and animation are
  entirely client-side.
- **No host.** The active player's client drives its own turn; **bot or
  disconnected-player turns are driven by any connected client** (the CAS dedupes
  redundant writes). A disconnected human's turn simply waits. Bot-ness is read
  from `Player.botStrategy` (non-null = a bot) — no presence tracking.

**Optimistic reconcile (client) — rebase, never drop.** A local intent is applied
to the display head instantly (`predict`) and queued in an `outbox`, then flushed
version-guarded. **Invariant: a local action is never silently erased on
conflict** — the overlay is a *replay* of the outbox on the latest authoritative
head (`reconcile.ts` `rebuildOverlay`), recomputed whenever the head advances. On
a conflict the client folds the winner and replays the outbox onto it, dropping
only intents that no longer apply. Legality on the current head is the single
arbiter (no per-intent policy) — which is why **absolute** bids/arms matter (a
relative one would re-apply wrongly on every replay).

**Playback pump (`store.ts`).** The client trails the authoritative head through
a FIFO `buffer`, animating one snapshot per derived dwell (`pacing.ts`); when
caught up it drives the backend one more unit — *only if* `driveOp` says it may
(its own / a bot's turn). Another human's turn returns nothing, so every human
turn is a **hard sync barrier** where all clients reconverge. The pump won't
drive a mechanical beat while a local prediction is outstanding, so the auto-roll
can't race the user. The pump is fully guarded and idempotent, so it is woken on
**every** store change rather than a hand-picked field list — that list inevitably
drifts from what the pump actually reads (it once dropped `outbox` and can't see
the module-local `predictionInFlight` at all), which stalled the pacer when a
confirmation freed it without touching a watched field.

**URL / routing** (`components/monopoly.tsx`): no `?game=` shows the lobby
browser; `?game=<id>` connects (lobby → seat room, active/finished → board);
`?game=dev` connects the immediate-play dev row. The id is read via
`useSyncExternalStore` and changed with `history.pushState`.

**Dev sandbox.** The `dev` game accepts debug actions no other game does — the
route applies a `dev` action only when `gameId === "dev"`. Hotkeys (`dev.ts`)
submit them; pure transforms live in `dev-ops.ts`. Debug helpers stay in
`dev.ts` / `dev-ops.ts`, never in components.

## Database / state shape changes

**No legacy / back-fill handling (pre-launch).** Treat stored data as disposable:
a `GameState` may be assumed to match the *current* type exactly. Don't write
migration shims or default-fill new fields — **wipe the rows instead** (delete
from `public.monopoly_games` via the psql one-liner in the root CLAUDE.md, then
refresh). **Remove this allowance when the game goes live.**

## File layout

```
index.tsx     re-export of the root component
types.ts      GameState, Intent, GameEvent, TurnState, …
protocol.ts   route transport contract (MonopolyAction, DevCommand)
sync.ts       client DB access: submitAction, loadGame, listGames, subscribeGame
data.ts       static board data (SPACES, cards, color/icon palette)
logic.ts      pure helpers (hasMonopoly, rentAt, isLegal*, …)
lobby.ts      pure lobby ops + setup constants
engine.ts     apply(intent), autoStep, applyXxx reducers
development.ts pure build planner (planDevelopment)
manage.ts     manage preview math + manageActorId / isRaiseOnly
driver.ts     driverRole(state, myId): self | proxy | none
pacing.ts     playback buffer + drive decision (driveOp, paceTransition)
reconcile.ts  pure rebuildOverlay: replay/rebase the optimistic outbox
store.ts      Zustand store, "use client", route client + playback pump
mocks.ts      MOCK_STATE fixture + freshGame seed
dev-ops.ts / dev.ts   dev-only state transforms + hotkeys
bots/registry.ts      BOTS strategy map (botStrategy -> policy); re-exports the contract
bots/decision.ts      Bot / BotDecision contract + move() wrapper
bots/dumb.ts          dumb (reactive baseline) policy
bots/live.ts          LIVE_VERSION — which archived version ships as `claude` (promotion = this line)
bots/simulate.ts      headless self-play driver (per-seat Contenders / strategies)
bots/simulate-cli.ts  `npm run sim` — watch one game (roster, seed, --log)
bots/tournament.ts    head-to-head A/B between versions: win share vs the 50% null
bots/versus-cli.ts    `npm run sim:versus -- v2 v1` — run the A/B over many seeds
bots/parallel.ts      worker_threads pool: pure games distributed across cores
bots/worker.ts        worker entry — runs simulateGame, posts back compact results
bots/sprt.ts          SPRT in Elo (dual one-sided fishtest test) — pure, tested
bots/elo.ts           Bradley–Terry Elo fit across the field — pure, tested
bots/gauntlet.ts      candidate-vs-field gauntlet: parallel + SPRT + Elo + verdict
bots/gauntlet-cli.ts  `npm run sim:gauntlet -- v3` — run the gauntlet on the pool
bots/verify-cli.ts    `npm run sim:verify -- v2 v1` — prove parallel == single
bots/versions/        version archive (EVOLUTION.md): self-contained bot snapshots; the source of truth for all policy code, decoupled from what ships live
bots/versions/index.ts  VERSIONS map (v1=floor, v2, v3, …) + versionBot()
bots/versions/v1/     v1 snapshot: the original champion, frozen — the gauntlet FLOOR
bots/versions/v2/     v2 snapshot (rival-threat pricing) + its tests
bots/versions/v3/     v3 snapshot (N-way trades) — accepted as substrate (win-neutral vs v2)
bots/versions/v4/     v4 snapshot (mortgage-funded build tempo) — rejected, win-neutral; archived
bots/versions/v5/     v5 snapshot (trade-to-deny) — loop CHAMPION
bots/versions/v6/     v6 snapshot (deny-via-swap) — rejected, win-neutral; archived
bots/versions/v7/     v7 snapshot (two-short denial) — rejected, regression; archived
bots/versions/v8/     v8 snapshot (denial + tempo) — rejected, overfit (even on holdout); archived
(which version is LIVE is whatever bots/live.ts → LIVE_VERSION points to — a product call, see EVOLUTION.md)
components/           React board + lobby/seat UI
```

The Claude-bot **evolution** process (how versions are proposed, isolated, and
A/B-tested to a locked-in champion) lives in `bots/EVOLUTION.md`; read it before
adding a version or touching the simulator/tournament.

## Testing

- `logic.test.ts` — pure helpers. `engine.test.ts` — `apply`/`autoStep` with a
  seeded RNG; this is the regression net for the rules.
- When fixing a rule bug, **add a failing engine test first and run it red before
  the fix.** The bug + fix is one PR.
- The playback pump runs only in the browser (`typeof window`), so it isn't unit-
  tested in the node env; verify pump/pacing behavior by running the app.
</content>
</invoke>
