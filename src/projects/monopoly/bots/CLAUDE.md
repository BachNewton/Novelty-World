# Claude Bot — Deep Guide

Read this before touching any version's `claude.ts`, `valuation.ts`, or
`trades.ts`. The policy code lives in the version archive
(`bots/versions/<label>/`), not at the top level — there is no `bots/claude.ts`;
the live bot is a pointer (`bots/live.ts` → `LIVE_VERSION`, today **v3**) into
that archive (see EVOLUTION.md "Coexistence & promotion"). The main
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

## Per-phase policy (`claude.ts` dispatcher)

`claudeBot` is one `switch (state.turn.phase)`. Each handler reads the model and
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
   N-way-ready; the *search* isn't. **Tried in v3 (`versions/v3/`, see EVOLUTION.md)
   and found WIN-NEUTRAL:** it *eliminates the turn-cap deadlock* (0% draws) but
   does not beat v2 head-to-head, because the residual deadlock cost *draws, not
   losses* — completing sets symmetrically is a wash. The v3 work (N-way search +
   the apportioned rival-threat premium that makes it clear) is a proven, win-safe
   building block; the win only comes when it's paired with an *asymmetry* lever
   (tempo / denial). Fold it into the live bot when promoting such a version.
2. **Mortgage-to-fund a build / sweetener.** Raise-to-*buy* is wired, and
   redeploy mortgages-then-builds an idle set, but a *fresh* build/sweetener is
   still cash-funded only. A pro will mortgage a back-burner lot to hotel a prime
   set a turn sooner. **The BUILD half was tried in v4 (`versions/v4/valuation.ts`,
   see EVOLUTION.md) and found WIN-NEUTRAL:** `planBuild` now mortgages idle
   non-monopoly lots to develop a prize set a level sooner, but the one-level tempo
   nudge bought no win share even against opponents that lacked it (leverage cost ≈
   tempo gain). Like v3's N-way, it's a win-safe, archived building block — the win
   only comes paired with an *asymmetry* lever (denial). The **sweetener** half
   (mortgage to fund a *trade's* cash) is still open and untried.

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

## Testing

`claude` decision logic is unit-tested per version in
`versions/<label>/claude.test.ts` (pure, seeded) — each snapshot owns its own
tests, so promotion never churns a test. The pacer's drive paths live in
`pacing.test.ts`. The browser-only playback pump is
**not** unit-tested — verify end-to-end proactive behavior (off-turn trades,
raise-to-buy, and any new redeploy logic) by running the app. When you fix a
strategic bug, add a failing `claude.test.ts` case first and run it red.
