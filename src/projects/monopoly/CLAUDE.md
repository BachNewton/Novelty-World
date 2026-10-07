# Monopoly — Project Guide

Read this before touching code in `src/projects/monopoly/`. It captures the
*why* and the invariants — the things the code can't tell you. It is **not** a
walkthrough of what each function does; read the code for that. When you change
a decision recorded here, update this file; when you'd only be re-describing
code, don't add it.

## Philosophy: built for pros

Monopoly for players who know the game cold — fast, dense access to the few real
decisions, nothing else. The whole game collapses to: **buy or auction a landed
property; bid in auctions; build/sell/mortgage; propose/accept/decline/counter trades;
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
non-negotiable (deterministic replay, regression tests, future headless RL). The
RNG is the site's shared seeded generator (`createRng` in
`src/shared/lib/seeded-random.ts`), whose output stream is pinned by its tests.

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
**10% interest** (charged through `must-raise-cash`).

**Counters.** Any **named** party of a pending trade may `counter-trade` instead
of voting. A counter is a decline that answers: the proposal dies, logged as a
`trade-declined` with `countered` set, and `trade-building` opens **at once** for
the counterer as proposer — jumping the `boundaryQueue`, not joining it — with
the draft seeded from the rejected terms to edit. Trade ids are unique per
proposal within a turn, so a vote still aimed at the countered offer is stale and
rejected. **Bots never counter**; they vote on a counter like any proposal, and
their re-pitch guards read it as a plain decline of their offer (intended).

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
  decision phases and never initiates. Returns note-less decisions. Not offered
  in the lobby UI. **It is NEVER an evaluation opponent** — a null stub measures
  nothing about strength, so the gauntlet and `sim:versus` both hard-reject it
  (the field floor is `claude-v2`; both CLIs hard-reject it). It
  exists only as a wiring/pacing baseline (e.g. `pacing.test.ts`) and for `sim`
  playback.
- **Version policies (the archive)** — every other bot a seat can field is a
  concrete **version label** in the archive (`bots/versions/index.ts` `VERSIONS`),
  organized into **LINEAGES** (bot families, namespaced by label prefix —
  `claude-vN`, `jane-vN`, `gemini-vN`, `trade-vN`, `fable-vN`). A prefix names **either an
  authoring machine** (Claude, Jane, Gemini, Fable, any future ChatGPT) **or a PARADIGM** a
  line of versions explores (`trade-v` — an asymmetric-valuation trade engine,
  authored on Jane but filed under the idea it's about).
  `Player.botStrategy` stores the **exact label** it plays (or
  `dumb`); `registry.ts` `botFor` resolves it straight through `versionBot`. There
  are **no curated pointers** (champion / featured / live / latest) any more — a
  bot's measured **Elo is its rank**, so the lobby DERIVES its whole offering from
  the generated Elo ladder (`bots/ratings.ts`) in `bots/roles.ts` (`LOBBY_BOTS`):
  the **overall best** (highest Elo across families — also the `addBot`/`freshGame`
  default, `DEFAULT_BOT_VERSION`), each **family's best** (highest Elo within it),
  and every family's **full version list**. A version with **no Elo** (excluded or
  not-yet-rated — `RATING_EXCLUDED`, e.g. `claude-v1`, `gemini-v1`) renders **deprecated**
  (struck-through, disabled). The lobby is **Elo-only** — it shows the *strongest*
  bot, never a "champion": crowning a champion and picking an evolution *substrate*
  are separate, confidence-gated decisions that live in `bots/champion.ts` and
  `bots/docs/METHOD.md`, not the player UI (see METHOD.md "Two bests"). **Adding a
  lineage** is one row in `FAMILY_SPECS`
  (`bots/roles.ts`) plus its snapshots under `versions/<prefix>N/`; **adding a
  version** is just registering it in `versions/index.ts` — both need **no UI
  change** (the lobby re-derives) and **no pointer bump** (run `npm run sim:ratings`
  and the strongest/default follows the ladder; the gauntlet fields versions by
  opaque label, so `sim:gauntlet -- jane-v1 --base claude-v29` already works). The policy
  code for each version lives in `bots/versions/<label>/{policy,valuation,trades}.ts`:
  a pure dispatcher over its `valuation.ts` (scoring, build planning, liquidation,
  jail) and `trades.ts` (counterparty-aware proposals + evaluation), everything
  keyed off `positionValue`, **noting its reasoning on every decision**. Its
  purpose, strategic model, tuning rationale, and refinement roadmap have their own
  deep guide: **`bots/CLAUDE.md`** — read that before touching a version's
  `policy.ts`, `valuation.ts`, or `trades.ts`.

**BOT notes.** A `bot-note` GameEvent (verb **BOT** in the log) records a bot's
reasoning. It is the lone log event with **no board change** — pure annotation —
and the one sanctioned exception to "no event without a state change": it always
rides in the same atomic submit as the decision it explains (the pacer prepends
it; `applyBotNote` is lenient — a note for a non-bot seat is a no-op, never a
rejection, so it can't stall a batch). A rule-based policy's notes are
deterministic; an AI seat's come from a live model call, but every note is stored
in state like any event, so replay is unaffected either way. Reactive decisions
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
`bots/policy.test.ts`. The browser-only playback pump is **not** unit-tested —
verify the end-to-end proactive flow (off-turn trades, raise-to-buy) by running
the app.

The `claude` strategy's own known limits and refinement roadmap (N-way trades,
mortgage-to-fund-a-build) live in `bots/CLAUDE.md`, along with the design
decisions behind it — including why monopoly value is deliberately *not* scaled
by cash/affordability.

### AI seats (language models)

An AI seat is a bot seat played by a language model through an API, not by a
rule-based policy. It has **no synchronous `Bot`**: the registry never resolves
one, and the pacer never consults one for it. Everything lives in `bots/ai/`.

**Two axes, one `botStrategy`.** A seat names a **model profile** (which server
and model it reaches: `ai:local` or `ai:claude`) and an **AI version** (`llm-vN`), written
`<profile>@<version>` (e.g. `ai:local@llm-v2`). `bots/ai/strategy.ts` is the only
place that writes or parses it. The lobby lists every version under each
profile, newest first; a new seat takes the newest.

**AI versions are frozen, like the rule-bot archive.** A version
(`bots/ai/versions/llm-vN/`, registered in `versions/index.ts`) bundles
everything we control that shapes play: the prompt and the view it builds, each
decision's question, schema and answer-to-intent mapping (trade terms included),
which decisions think, the thinking budget, sampling, the notes' length limits,
the turn-start gate, and whether auction notes are held. **Change any of it:
register a new `llm-vN`; never edit a registered one**, so every game's record
names exactly what played it and versions can be compared on evidence. The
machinery around a version stays shared and unversioned: claim/ask/settle
(`decide.ts`), what a seat owes (`decisions.ts`), the adapters, the console, the
UI. A version may lean on shared engine helpers (and llm-v1 on the eval log
renderer); a change there is a change to every version that uses it.

**The model is the other axis, outside the bundle.** Which model answers is
whatever the profile's server is running; it is recorded with every decision,
never assumed.

- **The route decides for it.** When an AI seat owes a decision
  (`aiDecisionFor`, shared by pacer and route so they can't disagree), the pacer
  returns an `ai` drive op and the store posts `ai-decide`. The route writes a
  **thinking marker** into `state.ai` (version-guarded, so only one client's call
  wins), calls the model, then weighs the answer against the latest row and
  commits it in a second write. While any marker is set, **no client drives
  anything**: the table waits on the answer, and every client shows it.
- **One call per decision; the answer is a whole plan.** A debt settle is the
  full sell/mortgage plan; a short buyer names its mortgages; an **auction asks
  once for a maximum** and the pacer then bids for the seat in $10 steps
  (`auctionProxyIntent`), with no further calls. Answers are constrained to a
  per-decision JSON schema, and the engine is still the judge: every intent
  goes through `apply`. The one exception is a version's **follow-up**: a
  decision spec may ask a second, quick question (no thinking) that only some
  first answers need, such as a counter's terms once "counter" is chosen
  (llm-v5). Both answers settle as one decision, its record adds up both calls'
  cost, and the call record keeps the follow-up beside the first call.
- **No fallback, no retry.** An unreachable model, a timeout, a malformed or
  illegal answer, or a legal plan that doesn't finish the job (debt still owed,
  a trade whose stated cash doesn't add up) is committed as an `ai-failed` log
  event and `AiSeat.failure`. A failed seat is never driven again, so the game
  **stalls there, visibly**. An answer that was sound but overtaken by another
  seat's move is **stale**, not failed: the marker clears and the seat is asked
  afresh.
- **Every decision is measured.** Its bot-note (or its `ai-failed` event)
  carries an `AiDecisionRecord`: the version, the model as its server names it
  (llama.cpp's model file, from `/props`), total time, the thinking and answer
  passes' times, token counts, and whether thinking ran out of budget. The log's
  BOT row shows the time; `npm run game:review` prints every record plus
  per-seat timing (count, median, p90, by decision kind). This is the evidence a
  new version is judged on.
- **Every live call is kept in full** in `monopoly_ai_calls`
  (`supabase/monopoly-ai.sql`): the shared call record (`eval/record.ts`: the
  server as it described itself, the exact prompt, schema and sampling sent, the
  raw thinking and answer, what the settle step made of it), plus the decision's
  place in the log. The game row keeps only the small record above. A call row
  that can't be stored never fails the decision, but is never silent either: the
  route logs it and returns it as the response's `warning`, which the client
  logs too. `game:review -- <id> --prompts` prints each decision's call.
- **Notes and plan.** Every answer carries a `publicNote` (the existing
  `bot-note`, shown in the log), a `privateNote` (the bot-note's `privateText`)
  and a `plan` (stored in `state.ai`, shown to the model next time; it also rides
  on the bot-note). Private note and plan stay **off the log**: they reach every
  client's console, and a player reveals them on request in the review dialog
  (below). The good-faith model holds: all information is public, and players are
  trusted not to use what they weren't shown. An empty public note (llm-v2's turn
  start that does nothing) shows no BOT row. A version that **holds auction
  notes** keeps its auction note off the board, and out of llm-v2 seats'
  prompts, until that auction closes (`held.ts`), so it can't give its maximum
  away. Holding is the version's setting, never the UI's: the auction panel
  shows each AI bidder's note as soon as the game releases it
  (`liveAuctionNotes`), and once the auction closes the log shows every AI
  bidder's note under its result (`auctionNotesByResult`), held or not.
- **Players review AI decisions as they play** (`review.ts`,
  `components/ai-review.tsx`). This is how real games feed the AI's evaluation:
  an AI's BOT row (or its failure) has a reveal control, as does its note
  wherever else it is shown (a trade offer, an auction); opening it **pauses the
  whole table** and shows that decision's public note, private note, plan,
  version, model and time, with a flag to leave: categories from a fixed set
  (`AI_FLAG_CATEGORIES`, mirrored by a check constraint) and the player's own
  words. Every opening is logged (`monopoly_ai_reveals`), flagged or not; a flag
  (`monopoly_ai_flags`) snapshots what the dialog showed, read from the game by
  the route, never from the client, and joins to the decision's call row by its
  log place (`AiDecisionRef`). `game:review` prints both under the decision.
- **The pause is table-wide state** (`GameState.pause`: who opened it, which
  decision). While it is set the engine applies nothing and `autoStep` stays
  put, the pacer drives nothing for anyone, and no new AI claim is made. Every
  other player sees who is reviewing, and any seated player can **resume**, so an
  abandoned review can't freeze the game. `review`, `resume` and `flag` are route
  actions, not intents, and aren't version-guarded: pausing and resuming are
  idempotent and must land on whatever the game is now. A flag that can't be
  stored keeps the pause, so it can be sent again. **A model answer that arrives
  during a pause is held**, not applied (`AiSeat.held`, the seat stays
  "thinking"): it is weighed against what the model saw at once (an answer the
  game had already overtaken is stale and simply dropped) and settled when play
  resumes. Nothing moves during a pause, so it settles against the board it was
  held on. No timers anywhere: resume is the event.
- **The prompt is a pure function** of the state, the seat and the question:
  rules first as a fixed system message (a stable prefix the model server can
  reuse), then the seat's view, plan, recent log and question.
- **Model-agnostic.** `model/adapter.ts` is the provider interface;
  `openai-compatible.ts` serves `local-llm` (llama.cpp). `model/config.ts` maps
  each profile to its adapter from server env (`MONOPOLY_AI_LOCAL_URL`,
  `MONOPOLY_AI_LOCAL_MODEL`, `MONOPOLY_AI_LOCAL_KEY`, `MONOPOLY_AI_TIMEOUT_MS`).
  How the model is called (thinking budget, sampling) is the version's, not the
  server's. A client only ever names a profile, never an address. A new provider
  is a new adapter plus a profile.
- **Claude through the owner's subscription** (`ai:claude`, for the owner's
  own games). `npm run ai:claude-server -- --model sonnet` starts a local model
  server (`bots/ai/claude/`, 127.0.0.1:8091) that answers the same
  OpenAI-compatible requests by running `claude -p` clean, exactly as the
  scenario ceiling does: one shared invocation, no tools, settings, MCP or
  saved session. The profile reaches it through `openai-compatible.ts` with no
  adapter of its own (`MONOPOLY_AI_CLAUDE_URL`, `MONOPOLY_AI_CLAUDE_KEY`). Its
  differences from llama.cpp: a thinking decision is **one call**, thinking
  beside the structured answer (`thinksWithAnswer`), because Claude's
  safeguards can refuse the two-pass shape's answer pass, which feeds its own
  reasoning back as a turn (seen live, `reasoning_extraction`); the thinking
  switch is `--effort` (Haiku: its thinking budget), set per server
  (`--think`, `--quick`; default high and low); sampling and the thinking
  budget can't be set through the CLI, so a version's aren't applied. Its
  `/props` names the model and thinking switch, and a run any other model
  answered fails, so the record names the model that answered. A few calls run
  at once (`--concurrency`, default 2) and the rest queue. A CLI failure is an
  HTTP error carrying the CLI's words: no fallback, no retry. If
  `MONOPOLY_AI_CLAUDE_KEY` is set, the server takes only callers that send it.
  Reaching it from the deployed site needs a tunnel, which is the owner's to
  set up.
- **Turn-start window.** At its own turn start (its `pre-roll`, or its
  `jail-decision` before the jail choice, which is then a second question) the
  seat may be asked once per turn-group: an optional full manage plan and an
  optional trade proposal, then it rolls. The route carries both out in one
  write through the same boundary machinery a human uses (arm, open the window,
  commit or propose), so the one-manage/one-trade window per turn-group holds;
  it never arms at anyone else's boundary. **When it is asked is the version's
  gate**, skipping the call with no model when there is nothing worth asking
  (llm-v1: the board unchanged since last asked and nothing to build or lift;
  llm-v2: only when it could build or lift a mortgage, or shares a color set
  with another player and the board changed).
- **Trades and counters.** A vote is accept, decline, or counter with a full
  trade, carried out as one submit (`counter-trade`, the terms, `propose-trade`).
  From llm-v5 the vote is asked alone, beside what each side holds, and a
  counter's terms are its follow-up, one choice per lot or card each side holds.
  There is **no cap on counter rounds** (owner's call; add one only if AI-to-AI
  ping-pong becomes a problem). Every trade question shows the negotiation so
  far (this turn's offers and counters from the log, with what each side said),
  and asks the model to meet the other side partway or decline to end it. On a
  proposal or counter, the public note is the seat's message to the other side,
  and it rides with the offer as its **pitch**: `tradePitch` (engine) derives it
  from the log, never stored (the proposer's bot-note behind the proposal, whose
  place the pending trade's id records), and the trade panel shows it to the
  table, since the log is hidden while a trade is up, beside the note each
  party approved with (`tradeVoteNotes`). A version's trade-vote question may
  read the pitch too; llm-v5 sees it only as a line of the negotiation.
  From llm-v2 a trade is written from the seat's own side (you give, you get,
  cash you receive, with one counterparty) and states the cash it leaves the
  seat with; the code builds the engine's terms and fails a mismatch, so a sign
  slip can't go out as an offer.
- `raise-to-buy`, `manage` and `trade-build` are named decisions with no spec:
  the seat opens and closes every intermission it uses within one write, so
  reaching one fails loudly. The headless sim and RL tooling play rule-based
  seats only and throw on an AI seat.

## Lobby

`GameState.status` is `lobby | active | finished`. Lobby ops live in `lobby.ts`
and are **pure** (no side effects, no `Math.random`/`Date.now` — seeds/ids are
injected), enforce color/icon uniqueness, and are wired through the route. The
auto-pacer runs only while `active`. The immediate-play seed (`freshGame`, used
by `dev` and the current online seed) skips the lobby.

## Multiplayer / networking

**This project does NOT use the shared peer-to-peer rooms.** Do not import from
`src/shared/lib/peer/` — that is a PeerJS host/guest star for real-time games;
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

**Every state carries its shape version; old games go read-only, not migrated.**
`GameState.stateVersion` stamps the shape a row was written under, and
`STATE_VERSION` (`state-version.ts`) is the current one. **Bump it in the same
change that alters `GameState`'s shape.** A row stamped otherwise (or unstamped,
from before versioning) is **outdated**: the lobby browser still lists it, greyed
out and unopenable but deletable; opening it by URL shows an "outdated version"
screen and never folds it into the store; and the route refuses every action on
it except `delete`. So code may assume a loaded `GameState` matches the current
type exactly: no migration shims, no default-filling, and no wiping rows.

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
trade-cash.ts pure trade-builder cash entry: keypad reducer
driver.ts     driverRole(state, myId): self | proxy | none
pacing.ts     playback buffer + drive decision (driveOp, paceTransition)
reconcile.ts  pure rebuildOverlay: replay/rebase the optimistic outbox
store.ts      Zustand store, "use client", route client + playback pump
mocks.ts      MOCK_STATE fixture + freshGame seed
state-version.ts  STATE_VERSION + isOutdated: the GameState shape stamp
dev-ops.ts / dev.ts   dev-only state transforms + hotkeys
bots/                 THREE GROUPS. Flat top level = what a SEAT PLAYS (the contract,
                      the registry, the lobby derivation, the crown pointer, the
                      generated ladder) plus versions/ and optimize/. bots/eval/ =
                      how we MEASURE bots (sim, tournament, SPRT/Elo, gauntlet,
                      ratings, leakage, the CLIs). bots/rl/ = the LEARNED-BOT
                      experiment, self-contained. bots/docs/ = the loop docs.
                      CLAUDE.md files stay at their directory root (auto-loaded).
bots/registry.ts      botFor(botStrategy) -> policy ("dumb" or a version label); re-exports the contract
bots/decision.ts      Bot / BotDecision contract + move() wrapper
bots/dumb.ts          dumb (reactive baseline) policy
bots/ai/              AI SEATS — a language model plays the seat through the route (see "AI seats"): strategy (profile@version encoding), spec (the version contract), decisions (what a seat owes + auction proxy bids), decide (claim / ask / settle), held (auction notes held back), review (players' reviews: pause, resume, held answers, flag categories), calls (the live call row), console (private notes), model/ (provider adapters + server config), versions/ (the frozen llm-vN bundles + their registry), eval/ (the scenario suite: `npm run ai:scenarios -- <version>`; error scenarios gated, judgment ones recorded; runs/ ignored, scoreboards/ committed; `--model claude-cli:<model>` runs it on Claude through the `claude` CLI as a ceiling, eval only, never reachable from the route), claude/ (the `ai:claude` model server, `npm run ai:claude-server`, and the `claude -p` invocation it shares with the ceiling), servers/ (local-llm server configs: `npm run ai:llm -- <config>`)
bots/rl/features.ts      PURE seat-relative state encoder for a learned bot — encode(state, playerId) -> fixed-width Float32Array (FEATURE_COUNT / FEATURE_NAMES). Phase 1 of the ML path; input half
bots/rl/candidates.ts    PURE legal-action enumerator + applyCandidate (1-ply lookahead) for a learned bot — legalCandidates(state, playerId). Phase 1 of the ML path; action half (combinatorial trade/manage construction is a documented heuristic seam)
bots/rl/value-net-stub.ts  the hybrid loop wired end-to-end — valueNetBot(value) picks argmax over legalCandidates by 1-ply lookahead; heuristicValue + valueNetStubBot bind it to a hand-written value (swap in V(encode(...)) to get the learned bot). Field it via the `value-stub` sim token. NOT a registry/ladder strategy — a prototype
bots/rl/value-policy.ts  the full-capability agent — valuePolicyBot(value) = valueNetBot + opening intermissions: arm `trade` (drive trade-search → propose) and `manage` (develop monopolies), preferring trade-then-build in one turn-group. Field via the `value-policy` sim token. Next slices: raise-to-buy/auction willingness
bots/rl/trade-search.ts  value-guided TRADE CONSTRUCTION — bestTrade(state, pid, value) builds the best monopoly-completing draft the counterparty would accept (mutual-completion swap / cash purchase, sweetener solved by binary search on the opponent's value). Same search the rule-based bots do, scored by any ValueFn
bots/docs/RL-DESIGN.md     LEARNED-BOT design & handoff — the goal (ML bot to beat the rule-based archive), the target architecture (policy+value+MCTS, factored atomic action vocabulary), what's built vs needed, and the ordered next steps. READ THIS before any learned-bot/ML/training work (it's self-contained for a fresh session). §8 records the BUILT learner (below)
bots/rl/actions.ts       ATOMIC ACTION VOCABULARY (RL phase 2) — fixed token set + legalActions/legalMask. The capability core: every legal move is one masked token; complex actions are token SEQUENCES across the engine's intermissions. Mask sound by construction (isLegal === apply().ok)
bots/rl/token-bot.ts     greedy-over-heuristicValue bot on the atomic layer (RL phase 3 wiring proof). Sim token `token-stub`
bots/rl/net.ts           MonoNet — tfjs-node policy+value net (RL phase 4): softmax policy head over the vocabulary + softmax value head over MAX_SEATS seat-relative win-probs. Batched predict, train, disk save/load, maskPolicy
bots/rl/mcts.ts          MCTS over applyCandidate guided by the net (RL phase 5): deterministic intent edges + chance ROLL edges (reseed dice per visit), N-player backup. Pure in (state,net) → replay-safe mctsBot
bots/rl/selfplay.ts      self-play recorder + value bootstrap (RL phase 6): playSelfPlayGame (visit-dist policy + outcome value targets) and collectRuleGame (warm-start)
bots/rl/train-cli.ts     `npm run train:rl` — the self-play training loop (RL phase 6): self-play → train → checkpoint → eval, resumable, Ctrl-C-safe. All-CPU tfjs-node; eGPU optional. Needs Node 22 (worktree .node-version)
bots/rl/tfjs-setup.ts    side-effect import (FIRST, before tfjs loads): places the Windows tensorflow.dll next to the binding + shields process.argv from tfjs-node's node-pre-gyp
bots/roles.ts         LOBBY_BOTS — the lobby offering DERIVED from the Elo ladder (overall best, per-family best, full lists, deprecation) + DEFAULT_BOT_VERSION; only hand-maintained data is FAMILY_SPECS
bots/eval/simulate.ts      headless self-play driver (per-seat Contenders / strategies)
bots/eval/simulate-cli.ts  `npm run sim` — watch one bot self-play game (roster, seed, --log)
bots/eval/render-log.ts    shared per-event log renderer (one line per GameEvent); used by sim --log AND game:review
bots/eval/ai-metrics.ts    AI decision records out of a game's log + per-seat timing (median / p90 by decision kind); used by game:review
bots/eval/review-cli.ts    `npm run game:review` — pull a REAL (human+bot) game from the DB and print its play-by-play / standings / holdings / money-flow for analysis (read-only, anon key). See the `/monopoly-game-review` command
bots/eval/adversary.ts     PURE human-facing LEAKAGE scorer — probeLeakage(label) runs a version's policy on hand-built exploit boards (wallet X-ray ask, complete-into-illiquidity auction, distress fire-sale) and returns a per-scenario leak score (higher = more exploitable by a human). Turns the recurring hand-played probe exploits into a deterministic regression number; no RNG, no game played
bots/eval/probe-gate-cli.ts  `npm run sim:probe-gate -- <labels…>` — the human-facing leakage SCOREBOARD over adversary.ts. A candidate must not raise its total leakage above its base's; the automated complement to the hand-played `/monopoly-probe` fleet
bots/eval/tournament.ts    head-to-head A/B between versions: win share vs the 50% null
bots/eval/versus-cli.ts    `npm run sim:versus -- claude-v2 claude-v1` — run the A/B over many seeds
bots/eval/parallel.ts      worker_threads pool: pure games distributed across cores
bots/eval/worker.ts        worker entry — runs simulateGame, posts back compact results
bots/eval/sprt.ts          SPRT in Elo (dual one-sided fishtest test) — pure, tested
bots/eval/elo.ts           Bradley–Terry Elo fit across the field — pure, tested
bots/eval/gauntlet.ts      candidate-vs-field gauntlet: parallel + SPRT + Elo + verdict
bots/eval/gauntlet-cli.ts  `npm run sim:gauntlet -- claude-v3` — run the gauntlet on the pool
bots/eval/verify-cli.ts    `npm run sim:verify -- claude-v2 claude-v1` — prove parallel == single
bots/eval/ratings-cli.ts   `npm run sim:ratings` — cached round-robin Elo over the whole archive → writes ratings.ts
bots/ratings.ts       GENERATED strength ladder (BOT_RATINGS, claude-v2=0); the lobby derives from this; see bots/CLAUDE.md "Lobby strength ratings"
bots/eval/probe-games/  SAVED /monopoly-probe transcripts — finished played-cli games (human-marked seat vs bots) + the fleet scoreboard that is the tracked benchmark. Evidence you can re-read after the agent summaries are gone; see its README
bots/eval/ratings-cache.json  GENERATED pairwise-result cache for sim:ratings (so each new version only plays its own column)
bots/champion.ts      CROWN / SUBSTRATE — the evolution loop's mutable state, as code so a stale label fails loudly (NOT the player-facing default; see METHOD.md "Two bests")
bots/docs/METHOD.md        the RULES of the evolution loop — how a version is proposed, measured, and promoted; the crown/substrate bar; the locked decisions. Read before running a version step
bots/docs/EVOLUTION.md     the RECORD — append-only: every version's hypothesis + what it measured, plus the paradigm-shift session narratives. Search it before re-walking an idea
bots/versions/        version archive: self-contained frozen bot snapshots; the source of truth for all policy code. Labels are namespaced per lineage (claude-vN, jane-vN, fable-vN, …) — a prefix names an authoring machine OR a paradigm
bots/versions/index.ts  VERSIONS map + versionBot() + RATING_EXCLUDED (unrated → deprecated) + RATING_PANEL (the anchor panel: the rater's graph AND the crown gate's field)
bots/versions/conformance.test.ts  the archive-wide Bot contract, table-driven over VERSIONS: determinism + legality at every decision phase. A new snapshot is covered the moment it's registered
bots/versions/<label>/  one frozen snapshot + its own tests. Which exist is `VERSIONS`, not a list here — read the registry. Culled snapshots are recoverable at the `bot-archive-full` tag
(which version is "best" is whatever tops the Elo ladder in bots/ratings.ts — measured, not a product call)
components/           React board + lobby/seat UI
```

The **rules** of the bot-evolution loop (how versions are proposed, isolated, and
A/B-tested to a crowned champion) live in `bots/docs/METHOD.md` — read it before adding
a version or touching the simulator/tournament. What each version actually tried
and measured is the record in `bots/docs/EVOLUTION.md`.

## Testing

- `logic.test.ts` — pure helpers. `engine.test.ts` — `apply`/`autoStep` with a
  seeded RNG; this is the regression net for the rules.
- When fixing a rule bug, **add a failing engine test first and run it red before
  the fix.** The bug + fix is one PR.
- The playback pump runs only in the browser (`typeof window`), so it isn't unit-
  tested in the node env; verify pump/pacing behavior by running the app.
</content>
</invoke>
