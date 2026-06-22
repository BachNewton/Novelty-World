# Claude Bot — Deep Guide

Read this before touching any version's `policy.ts`, `valuation.ts`, or
`trades.ts`. The policy code lives in the version archive
(`bots/versions/<label>/`), not at the top level — there is no `bots/policy.ts`.
A seat fields a **concrete version label** (`Player.botStrategy`); the lobby's
"best" picks are simply the **highest-Elo** labels, derived from the measured
ladder (`bots/ratings.ts` → `bots/roles.ts`), not hand-picked pointers (see
"Lobby strength ratings" below and EVOLUTION.md "Coexistence & promotion"). The
main
`monopoly/CLAUDE.md` "Bots" section owns the shared **infrastructure** (the `Bot`
contract, the registry, BOT-note mechanics, and how the pacer drives proactive
play). This file owns the **`claude` strategy itself** — its purpose, its
strategic model, why each knob is where it is, and the refinement roadmap. It is
deliberately reasoning-dense: the Claude Bot is the most thought-heavy part of
the project, and that thinking deserves a home of its own.

As always: capture the *why* and the invariants — the things the code can't tell
you. Don't re-narrate what a function does; read the code for that.

## Charter — what Claude Bot is for

**Claude Bot is authored by Claude Code.** That is the namesake: it is called
"Claude" because *Claude Code* is the one who defines and writes its logic, to
the best possible degree. The name is a standard to live up to, not decoration —
this bot should be the best work we can produce.

- **Best of the best.** It plays Monopoly at the highest level — a genuine
  challenge to pros. Fast, tactical, strategic, optimal, super-rational.
- **No fixed personality — it can be anything it needs to be to win.** Winning is
  the only loyalty. The opponents it's built to beat are themselves ruthless pros:
  fast, optimal, merciless, and willing to exploit the fact that a seat is a bot.
  Claude Bot must out-play exactly that.
- **Lineages are provenance OR paradigm — never loyalty.** A prefix labels what a
  family *is about*: usually the machine a version was *discovered on* (`claude` /
  `jane` / `gemini`), but it can also name a **system/paradigm** a line explores
  (`trade-v` — an asymmetric-valuation trade engine, authored on Jane but filed under
  the idea). Either way the family is **not** a walled-off codebase. Borrowing or
  stealing a rival lineage's idea wholesale to make a version stronger is encouraged
  — "winning is the only loyalty" applies to the code as much as to in-game play.
  When you evolve, look across ALL families and branch from whatever base you can
  most improve (see EVOLUTION.md "Two bests").
- **Proactive across the full surface.** It buys, trades, mortgages *and*
  unmortgages at the strategic moment — it does not sit on a winning position.
- **Transparency serves insight, never at the cost of winning.** Every decision
  carries a BOT note that gets you *into the bot's head* — why it did what it did.
  But making its thinking legible must never blunt its play. The narration rides
  along with the win; it never steers it.
- **Deterministic today; determinism is not sacred.** There is no live model — the
  policy is hand-authored heuristics. If a stronger strategy needs randomness,
  that is fair game (see "Randomness & the RNG seam").
- **Not a test harness.** It will shake out engine bugs as a *side effect* of
  exercising the full surface, but that is not its purpose. Its purpose is to win.

When a refinement trades legibility, simplicity, or determinism against a higher
win rate — **win rate wins.** Note the tradeoff here when you make it.

## The yardstick: `positionValue`

The whole policy flows from a single number, `positionValue(state, pid)`
(`valuation.ts`): the dollar-equivalent worth of a seat's *entire* position —
cash, every deed at its `assetBase` (printed price, halved if mortgaged), the
tuned `monopolyBonus` for each completed set, and railroad/utility synergy.

**Every decision reduces to one question: does this raise my `positionValue`?**

- A property is worth its position-value *delta* (`acquisitionValue`), which makes
  set-completion and railroad synergy fall out for free, plus a `DENY_FACTOR`
  premium for taking a rival's last open lot.
- A trade is good for a player exactly when it lifts *their* `positionValue` — the
  same function scores both sides, which is what lets construction model the
  counterparty (would *they* accept?).
- A build is worth doing when it nets out positive after the spend.

One yardstick keeps the bot coherent: there is no separate "buy heuristic" that
can disagree with the "trade heuristic." When you add behavior, express its payoff
in `positionValue` terms rather than inventing a parallel score.

## Tuning constants — and why they sit where they do

These are the levers. They are tuned to make the *resulting behavior* rank the way
a pro ranks things; they are not raw prices. Change them only with a reason, and
record the reason.

- **`GROUP_WEIGHT` / `monopolyBonus`** — the strategic premium per color set. Tuned
  so monopoly *values* land orange > red > yellow > green > dark-blue > pink >
  light-blue > brown, correcting for the fact that the expensive sets have big
  printed prices but worse traffic/ROI. The cheap-but-high-traffic sets
  (orange/red/light-blue) carry weight beyond their price.
- **`COLORS_BY_WEIGHT`** — a *separate* axis from monopoly value: develop priority
  (the classic tier list, cheap high-traffic first). `planBuild` walks this order.
  Keep the two axes distinct; conflating them is a common way to get build order
  subtly wrong.
- **`RAIL_SYNERGY` / `UTIL_PAIR_BONUS`** — railroads compound ($25→$200 by count),
  utilities barely matter; the numbers reflect that.
- **`liquidityFloor`** (`BASE_FLOOR`, `FLOOR_RENT_FRACTION`, `FLOOR_CAP`) — the
  voluntary-spend reserve. Deliberately *not* the full worst-case rent (that would
  refuse to ever develop against a hotel — far too passive). A pro keeps a moderate
  buffer and leans on `must-raise-cash` for the rare big hit, so it can keep
  fighting by building. Forced charges ignore the floor entirely.
- **`HOUSE_SCARCE` / `desiredLevel`** — the housing-shortage lever. When the
  32-house bank runs low and a rival could use houses, hold at 4 rather than going
  to a hotel (which hands four houses back to the bank for an opponent to buy).
- **`RIVAL_TOLERANCE` (1.25)** — a trade is rejected only when the monopoly it
  hands a rival is *substantially* stronger than the one I get. A balanced
  mutual-completion swap is good for both and must pass.

## Per-phase policy (`policy.ts` dispatcher)

`policy` is one `switch (state.turn.phase)`. Each handler reads the model and
returns an intent + note. The shape to preserve:

- **buy / raise-to-buy** — buy almost everything affordable above the floor; dip
  below it only for clear value (`DIP_WORTH_MULT`); when short, *mortgage other
  lots to buy* something worth owning (`RAISE_WORTH_MULT`). This is the one
  raise-to-spend path that exists today.
- **auction** — bid to `min(acquisitionValue, auctionBidCap)`; bids silent, the
  drop-out carries the note.
- **must-raise-cash** — value-preserving liquidation (`raiseCashStep`):
  least-essential building-free lot mortgaged first, monopolies and their houses
  protected; sell down the *weakest developed* set only when nothing's left to
  mortgage.
- **managing** — commit `planBuild`. When flush, the plan also **lifts the
  mortgages on a dead (mortgaged) monopoly and develops it in the same atomic
  commit** — reclaiming idle capital a set can't earn while mortgaged. Gated on
  being comfortably above the rent reserve (unmortgaging pays 10% interest); a
  locked set is worth reclaiming even bare (level 0), which restores its monopoly
  double-rent and unfreezes it for later building.
- **trade-building / trade-pending** — propose the best constructed trade; vote via
  `evaluateTrade`.
- **jail** — leave on safe boards (card → cash → roll); **sit as a haven** when a
  developed board is out there (`boardIsDangerous`).

**Note discipline:** reactive phases note on the decision; the
arm→intermission→commit flows note on the **arm** (it explains the plan) and commit
silently, so the log reads the reasoning once. **And the note must track the
logic:** when you change what a decision does, update its note to match — a note
that explains the *old* behavior is a defect, not cosmetic (it's the bot
misrepresenting its own head). The mismatch surfaces the moment you read
`npm run sim --log`.

## Trades (`trades.ts`)

Trades are the **mid-game engine** — the way a bot turns a near-monopoly into a
completed one. Two principles:

1. **Only propose deals the other side will plausibly take.** Construction models
   the counterparty with the same `evaluateTrade` used to answer offers, and
   *sweetens* with the minimal cash that clears their break-even by `ACCEPT_MARGIN`.
2. **Always terminate.** A declined trade leaves state unchanged, so a naive
   proposer loops forever. Two guards prevent it: **one proposal per turn group**
   (`proposedThisTurn`) and **decline-memory** (`declinedWithoutImprovement` — don't
   re-pitch identical asset terms unless the offer was sweetened *for the
   decliner*, or the board has shifted). `isProposable` mirrors the engine's
   validation so a built draft is never route-rejected (a rejected drive would
   latch the pacer's once-per-version guard and stall the phase).

### Denial is a premium game, not a wall — price BOTH sides of it (claude-v35)

A completer held against a one-short rival is **not** a wall that keeps the rival
off its set. Instrumentation (`EVOLUTION.md` Finding 2 diagnostic) showed the rival
**completes the set ~86% of the time anyway**, paying a **~$254 median premium** over
book to whoever holds the completer at cash-out. So a held completer is a
**premium-extraction option**, and "trade-to-deny" is really a competition to be the
one holding it when the rival caves.

The trap this creates: if you price denial **asymmetrically** — a *buyer* books the
full `DENY_FACTOR` premium (via `acquisitionValue`) but a *holder* values its lot at
only printed price — then every bot→bot hop clears at break-even and the completer
**hot-potatoes** in a value-less ring (observed: 21–42 hops on one lot). The two
abstain-from-denial fixes (claude-v33 price gate, claude-v34 time cooldown) both **regressed −15
Elo**, because a bot that stops denying still *pays* the premium as the rival but
never *collects* it as a holder.

The fix (`denialPositionCost`, folded into `evaluateTrade`): **price the holder's side
symmetrically.** Handing a held completer to anyone but the one-short rival forfeits
the premium you're positioned to extract, so charge it — now no hop clears, the
completer sits with its holder, and the holder collects the rival's payout directly
(same cash-out, **zero rotation**, win-EVEN). Selling *to* the rival is the cash-out,
priced by `rivalThreatCost` (mutually exclusive — recipient is the rival xor not — so
no double-count). It's **distress-scaled** (`distressThreatScale`): a near-bust holder
still sheds it cheap, preserving the genuinely protective grab off a seat about to
bust. **Invariant: keep buyer-side and holder-side denial pricing in lockstep** — if
you ever change `DENY_FACTOR` or `acquisitionValue`'s deny premium, `denialPositionCost`
must move with it, or the ring returns.

## Randomness & the RNG seam

The bot is a pure function `(state, playerId) => BotDecision | null` today — no
randomness, fully deterministic. The engine's hard rule is **deterministic
replay**, which holds because *all* randomness flows through a seeded RNG that
lives in `GameState.rngState`, never `Math.random`.

So bot randomization is **fully compatible with replay** — provided it draws from
that same injected RNG stream. The seam to be aware of: the current `Bot` contract
takes no RNG argument. A refinement that wants randomness (mixed strategies,
tie-breaking, bluff timing) must **thread the rng into the bot contract** and
consume `rngState`, not reach for `Math.random`. Doing so keeps replay intact.

## Refinement targets (roadmap)

Ordered by impact. Each is a place the *current* policy leaves value on the table.

1. **N-way trade construction.** Construction searches only 2-way deals
   (mutual-completion swaps + cash). The engine and `positionValue` model are both
   N-way-ready; the *search* isn't. **Tried in claude-v3 (`versions/claude-v3/`, see EVOLUTION.md)
   and found WIN-NEUTRAL:** it *eliminates the turn-cap deadlock* (0% draws) but
   does not beat claude-v2 head-to-head, because the residual deadlock cost *draws, not
   losses* — completing sets symmetrically is a wash. The claude-v3 work (N-way search +
   the apportioned rival-threat premium that makes it clear) is a proven, win-safe
   building block; the win only comes when it's paired with an *asymmetry* lever
   (tempo / denial). Fold it into the live bot when promoting such a version.
2. **Mortgage-to-fund a build / sweetener.** Raise-to-*buy* is wired, and
   redeploy mortgages-then-builds an idle set, but a *fresh* build/sweetener is
   still cash-funded only. A pro will mortgage a back-burner lot to hotel a prime
   set a turn sooner. **The BUILD half was tried in claude-v4 (`versions/claude-v4/valuation.ts`,
   see EVOLUTION.md) and found WIN-NEUTRAL:** `planBuild` now mortgages idle
   non-monopoly lots to develop a prize set a level sooner, but the one-level tempo
   nudge bought no win share even against opponents that lacked it (leverage cost ≈
   tempo gain). Like claude-v3's N-way, it's a win-safe, archived building block — the win
   only comes paired with an *asymmetry* lever (denial). **The sweetener half
   (mortgage to fund a *trade's* cash) was tried in claude-v32 (`versions/claude-v32/`, see
   EVOLUTION.md) and found WIN-NEUTRAL** — even hard-gated to the proven distress
   completion (mortgage an idle lot to fund a below-fair completer off a distressed
   seller the bot can't pay for in cash). It is in-machinery (cross-turn: arm a
   mortgage-only `manage`, then propose next turn — no engine change), fires cleanly,
   never bleeds interest (self-limiting gate), but adds no win share: it only pulls a
   few completions a turn or two sooner, and cash regenerates fast enough that Offer B
   reaches most of them anyway (leverage cost ≈ tempo gain — claude-v4's plain-mortgage-tempo
   wash, on the distress channel; and claude-v6's funding-reach wash). **Roadmap #2 is now
   fully closed — both halves washed.** Mortgage-to-fund is a win-safe building block,
   not an edge.

When you close one of these, move it out of this list and fold the resulting
behavior into the relevant section above.

(Closed: **unmortgage-and-redeploy idle capital** — the gap the 491-turn dev game
exposed, where the leader held $11k and five monopolies but only the one set it
had hotelled before mortgaging ever earned. Folded into `planBuild` / the
**managing** policy above.)

## Considered and rejected

**Cash-/affordability-scaled monopoly value.** A tempting idea from the same dev
game: discount a completed set's worth by the owner's ability to *develop* it now
— a broke player can't turn a bare monopoly into houses, so (the argument goes)
it's worth less to them, and the bot shouldn't accept a set it can't capitalize
on. We deliberately do **not** do this. The reasoning, for whoever revisits it:

- **Cash is a flow; a monopoly is a durable asset.** Over a full game a player
  regenerates cash (GO, rent) and will develop a set it holds. `positionValue`
  already credits *every* undeveloped monopoly — clean or mortgaged — at its full
  developed potential on exactly that premise, and the redeploy logic makes the
  premise true: the bot now lights up its sets as soon as it's flush. Discounting
  by current cash would contradict the behavior we just added.
- **It would inject losing timidity into foundational decisions.** `positionValue`
  is the single yardstick — `acquisitionValue` (buy) and the auction bid cap key
  off it. Cash-scaling would make a poor bot *under-value completing its own
  monopolies*: declining set-completers and under-bidding for them. Completing a
  set is correct even when broke (future rent + denial). A super-rational pro is
  **bold about acquiring sets and patient about developing them**; cash-timid
  acquisition is a classic blunder.
- **The magnitude is decision-irrelevant anyway.** Done *consistently* with how
  clean undeveloped sets are valued, the only honest discount for a mortgaged set
  is the interest to reactivate it (the principal returns as asset value) — ~$11
  per lot. That is swamped by `ACCEPT_MARGIN` ($30) and `RIVAL_TOLERANCE` (25%),
  so it would not flip any real decision. The dev-game trade that prompted this
  was in fact a *good* trade for the bot; the loss was purely the redeploy gap.
- **Tempo is real, but cash-scaling is the wrong tool.** Developing first genuinely
  matters — but that's a turn-order/board effect, addressed by developing ASAP
  (redeploy), not by discounting a durable asset's worth by a transient balance.

Where cash legitimately belongs in trade logic is **survival, not valuation**: the
evaluator already vetoes a deal that ends cash-negative unless the gain is
transformative. A graduated version (don't trade below the rent reserve for a
marginal gain) is a reasonable future *defensive* hardening — but it is a
liquidity guard, not a discount on what a monopoly is worth.

## Lobby strength ratings — the player-facing strength axis

**A bot's Elo IS its strength.** The lobby is a SINGLE-axis, player-facing view —
"which bot challenges me most right now?" — derived entirely from the measured Elo
ladder. It has **no** notion of "champion"/"crown": that is a separate *evolution*
concept with a different audience and a stricter (confidence-gated) bar — see
**"Two bests: strongest vs crown vs substrate"** in `EVOLUTION.md`. Keep them
apart; conflating them is the trap this model exists to avoid. Read this before
touching `roles.ts`, `ratings-cli.ts`, or `ratings.ts`.

What the ladder drives (all in `roles.ts` `LOBBY_BOTS`, recomputed from the
generated `BOT_RATINGS`):
- **Strongest** — highest Elo across all families. The lobby default and the
  `addBot`/`freshGame` seat (`DEFAULT_BOT_VERSION`). **No confidence gate** — it
  just follows the top of the ladder, so a within-noise tie may flip the label
  (fine: two bots within noise are genuinely ~equally hard).
- **Each family's best** — highest Elo within that family.
- **Deprecated** — any version with **no Elo** (struck through, "???", disabled).

Mechanics:
- **Generated, never hand-typed.** `npm run sim:ratings` (`ratings-cli.ts`) fits one
  Elo over the **whole archive** (every version except `dumb` and `RATING_EXCLUDED`)
  and writes `bots/ratings.ts` (`BOT_RATINGS`, raw Elo). Treat it as build output — a
  hand-edited rating would quietly lie to players about how hard each bot is.
- **The ANCHOR PANEL — why the default is NOT a full round-robin.** A complete
  round-robin is **O(N²)** pairings and a new version's marginal cost is its whole
  **O(N)** column — both grow without bound, and most of that work re-measures tiny
  distinctions between near-duplicate parameter siblings (34 of the first 35 versions
  share `DENY_FACTOR=0.6`). Elo only needs a **connected** comparison graph, not a
  complete one. So by default `sim:ratings` fits over the **anchor-panel graph**: a
  small fixed panel (`RATING_PANEL` in `ratings-cli.ts`) plays a full round-robin
  among itself, and every other version plays **only the panel** — making a new
  version **O(k)** (constant) and the whole archive **O(N·k)** (linear). The panel is
  chosen empirically (claude-v2/v5/v17/v35 + jane-v2 + claude-v36) to span the Elo
  range *and* the strategic axes (denial level, trade mechanism); vs a full
  round-robin it reproduces the overall Strongest and **both family bests exactly**,
  with ~6 Elo mean per-version error confined to the intra-family ordering of non-best
  siblings (which differ by 1–3 Elo — within the full ladder's own noise). **Re-examine
  the panel when a STRUCTURALLY different lineage lands** (e.g. the learned bot):
  parameter siblings are ~transitive so a small panel suffices, but a genuinely new
  engine can expose a matchup the panel doesn't represent.
- **Cached, and now cheap by default.** Games are deterministic in (versions, seed,
  count, turn-cap) and versions are frozen, so each pairing's tally is persisted to
  `ratings-cache.json` and reused. With the panel as the default, a no-arg
  `npm run sim:ratings` only ever plays a new version's **k panel pairings** (the rest
  cache hits) — seconds on a warm cache. `--full` forces the **complete O(N²)
  round-robin** (a high-precision recalibration): use it sparingly — on a cold cache
  it is *hours*, historically dominated by **gemini-v1's capped-game slogs** (now in
  `RATING_EXCLUDED`, so out of the default field).
- **Explicit list — a focused check (the panel does NOT apply here).** The default
  no-arg run already rates a new version cheaply (it plays only the k panel pairings),
  so you rarely need this. But `sim:ratings` still accepts an **explicit version
  list**, over which it does a full round-robin and fits Elo over *just those*
  (anchored at `claude-v2`), writing `ratings.ts` with **exactly that set** — handy
  for a tight head-to-head Elo among a hand-picked few. If you use it to publish the
  ladder, rate against **every version currently in `ratings.ts`**:
  ```
  npm run sim:ratings -- <new-version> <every-version-currently-in-ratings.ts>
  ```
  **Caveats:**
  (1) *Include every currently-rated version* — any you accidentally omit drops out
  of `ratings.ts` and its family deprecates. (Conversely, *deliberately* omitting a
  version is exactly how you deprecate it — that's how `gemini-v1` was retired: drop
  it from the rated set AND add it to `RATING_EXCLUDED`.) (2) The numbers differ
  slightly from a full-field fit (it's a smaller fit);
  the eventual full run overwrites with the complete joint Elo and **reuses** these
  cached pairings. (3) This does **not** fix `ratings.test.ts` coverage — versions
  outside the rated set stay unrated (that test is about full coverage, a separate
  concern from "is the new bot selectable").
- **Fixed anchor (`claude-v2 = 0`), permanently.** Elo is only defined up to a
  global offset, so one version is pinned to 0. We pin the field floor and **never
  move it** — keeping a saved number comparable across regenerations. The anchor
  need not be competitive; it just defines the scale.
- **Only relative gaps mean anything.** The friendly display offset
  (`RATING_DISPLAY_BASE`, +1000) lives in `roles.ts` (`ratingFor`), so the floor
  reads ~1000 instead of a discouraging 0; `BOT_RATINGS` stays the raw measurement.
- **Two hand-maintained eval knobs (both in `versions/index.ts`, both kept tiny).**
  (1) `RATING_EXCLUDED` — versions deliberately left unrated because they're too
  weak/slow to be worth the rating + gauntlet cost (`claude-v1` and `gemini-v1` — both
  real, runnable snapshots, excluded purely as a cost optimization; see EVOLUTION.md
  Decision 8). They render deprecated, and the gauntlet drops them from its default
  field too. (2) `RATING_PANEL` — the fixed opponents a version is measured against,
  shared by BOTH tools: the rater fits the ladder over the panel graph (above), and
  `sim:gauntlet --panel` uses it as the **crown-gate field** (a version is crowned only
  if it beats its base AND regresses against no panel member — the non-transitivity
  guard). Must include the anchor and no excluded member (asserted by both tools).
  **When you crown a new champion, add it to the panel** (and you may retire a
  now-redundant member) — that keeps the ceiling of the comparison graph current.
- **Regenerate after adding any version** (and any time you want to refresh the
  whole ladder). This sets the player-facing **Strongest/default** automatically —
  no pointer to bump. It does **not** by itself crown a champion or pick a
  substrate: those need SPRT confirmation (see EVOLUTION.md). A ladder-topper that
  isn't a confident win is the Strongest the lobby offers, yet still uncrowned.
- **Enforced by `ratings.test.ts`.** A test asserts every rateable version (all but
  `dumb` + `RATING_EXCLUDED`) has a rating, and that the excluded set has none. Add a
  version without regenerating and `npm run test` fails with a "run
  `npm run sim:ratings`" message. That's the guardrail.

## Testing

`claude` decision logic is unit-tested per version in
`versions/<label>/policy.test.ts` (pure, seeded) — each snapshot owns its own
tests, so promotion never churns a test. The pacer's drive paths live in
`pacing.test.ts`. The browser-only playback pump is
**not** unit-tested — verify end-to-end proactive behavior (off-turn trades,
raise-to-buy, and any new redeploy logic) by running the app. When you fix a
strategic bug, add a failing `policy.test.ts` case first and run it red.
