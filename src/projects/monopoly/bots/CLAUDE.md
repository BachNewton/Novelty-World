# Claude Bot — Deep Guide

Read this before touching `claude.ts`, `valuation.ts`, or `trades.ts`. The main
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
- **managing** — commit `planBuild`.
- **trade-building / trade-pending** — propose the best constructed trade; vote via
  `evaluateTrade`.
- **jail** — leave on safe boards (card → cash → roll); **sit as a haven** when a
  developed board is out there (`boardIsDangerous`).

**Note discipline:** reactive phases note on the decision; the
arm→intermission→commit flows note on the **arm** (it explains the plan) and commit
silently, so the log reads the reasoning once.

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

1. **Redeploy idle capital: unmortgage, then develop.** *(highest priority — the
   gap the 491-turn dev game exposed.)* `planBuild` skips any monopoly with a
   mortgaged member (`valuation.ts`: `if (positions.some(... mortgaged)) continue;
   // unmortgage first`) and **nothing ever unmortgages** — the only mortgage-map
   writers are the cash-*raising* paths. Result: a bot that wins monopolies via
   trade (often inheriting mortgaged lots) and then sits on a huge cash pile
   without ever turning it into rent. In the dev game, Jordan held $11k and five
   monopolies but only the one set it had hotelled *before* mortgaging ever earned.
   **The engine already supports the fix with no change:** a single `manage` commit
   can unmortgage *and* build atomically (`manageSummary` previews via
   `withStagedMortgage`; `applyManageCommit` plans the build against the
   post-unmortgage state). The work is purely in policy — when flush, stage an
   unmortgage of a monopoly's members and develop it, prioritized by
   `positionValue` gain per dollar.
2. **N-way trade construction.** Construction searches only 2-way deals
   (mutual-completion swaps + cash). The engine and `positionValue` model are both
   N-way-ready; the *search* isn't.
3. **Mortgage-to-fund a build / sweetener.** Raise-to-*buy* is wired, but builds and
   trade sweeteners are cash-funded only. A pro will mortgage a back-burner lot to
   hotel a prime set a turn sooner.

When you close one of these, move it out of this list and fold the resulting
behavior into the relevant section above.

## Testing

`claude` decision logic is unit-tested in `claude.test.ts` (pure, seeded). The
pacer's drive paths live in `pacing.test.ts`. The browser-only playback pump is
**not** unit-tested — verify end-to-end proactive behavior (off-turn trades,
raise-to-buy, and any new redeploy logic) by running the app. When you fix a
strategic bug, add a failing `claude.test.ts` case first and run it red.
