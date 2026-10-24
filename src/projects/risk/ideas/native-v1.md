# native-v1: a planner in v6's class, designed in Rust for speed

The design of `native-v1` (`native/src/bots/native_v1/`), the first Risk bot designed in Rust (`native-port.md`, "The bots"). It is a turn planner in rule-v6's class, built from the ideas of rule-v1 to v6 rather than ported from their code, and engineered so that a turn costs a small fraction of what v6's costs. It is a bot of its own: it never stands in for v6 in a measurement of v6.

Its bar is fixed below, before any run. Until the gauntlet has measured it, it is registered in the crate and not seated.

## What it keeps from v6, and why

Every part of v6's play that a measurement showed paying is kept, because the bar is v6's strength and each of these carried some of it (`bot-log.md`):

- **The evaluation** (`rule-bot-v1.md` §3, as v4 left it). My equity is my power's share of everyone's, cut by my chance of being eliminated before my next turn, less my expected border losses, plus next turn's best kill, less idle armies, less the common threat's power past the leader bar (or a small penalty on my own lead when I am the threat). Power is armies, plus income over a horizon of turns (territories, continents, a card's worth a turn), plus the hand's worth by the solved hand model. Share of power is the right currency for a free-for-all: weakening the strongest raises my share as surely as growing does.
- **The opponent model**, v4's beliefs with v6's corrections. Before my next turn each opponent, in turn order, weighs the kills open to it best first and goes for each at a measured rate only if it passed over every better one (my kill exposure comes from this); a third player's death moves its cards and its territories' income to the killer. Each opponent's turn against me is the worse of its best single blow (an exchange, or a continent of mine broken through at most one territory) and its sweep (from its stacks beside me, its income on the biggest, every sure capture taken from any territory the stack holds, an army and a fraction a capture), or a sweep from its biggest stack through at most two of a third player's territories (`thirdParty`). Whom it hits is my share of what its turn could do to each neighbour, pulled halfway toward an even split, overridden while there is a common threat, and updated by this game's record of whom it has been capturing from. The border loss is each opponent's aim times its hit, summed.
- **The kill chance**: a screen walking the best launch stack's run through each group of the victim's land, then the capture planner's exact chance, the victim's groups costed cheapest first so a stack at a fork leaves its detachment for the cheap branch (`fork`).
- **The plans**: hold (stacked on the front, or spread where each chunk most cuts the expected loss), the eight best single captures, every continent missing at least two and at most half of its territories, every killable victim, and the two longest sweeps whole and by half (v5). Each capture plan in three placements: until 90% sure, until 99%, and every army that still helps. A plan is scored on its success board and its likeliest failure board, weighted by its exact chance; a kill is committed only when it beats the best plan that isn't one by the kill margin. Under a common threat the others are allies (their land only for the turn's card, never a continent break, a kill only when the cards force a trade); a card-less victim at a table of five or more alive is a buffer, never finished.
- **v6's fixes that the screens kept**: `fork`, `alive` (the table's preferences follow the seats still alive), `gather` (when an opponent's believed sweep takes a third of my territories, the fortify that most cuts the believed sweeps), `homeward` (a run's end stack isn't charged as idle: the turn's fortify is still to come), `thirdParty` and `reinforced` (next turn's kill weighed against the victim's income placed where my stack enters). `movein` is left out, as v6 left it: it leaned worse at both table sizes and cost most.
- **The small decisions**, each read off the planner so they never disagree: trade or hold is the turn planned both ways; the set is the one whose armies, the +2 where it lands on the front, and the kept cards' worth come to most; the +2 goes to the front's biggest pictured territory; placement takes the plan's biggest allocation; the next attack is the plan's next capture from my strongest territory beside it, a single battle with every die when the best play starts by rolling and otherwise a blitz committing the fewest armies as sure as all of them; the move-in weighs all, half, the minimum and the minimum plus two by the best plan from each; the fortify weighs every move whole and halved (never off the front into the interior), the forty biggest, by the evaluation against not moving.

The odds are the crate's exact ones (`odds.rs`): Balanced Blitz for a blitz, fair dice for a battle, the best mix of the two, path runs as convolutions along a path. They are read, never changed.

## What it does differently, and why

- **The small table's preferences up to five seats alive.** The rule bots play their small-table preferences (tuned at 3 and 4 players) while four or fewer are alive, a cutoff set before any 5-player measurement. Measured at 5 players, v6 on its small-table preferences beat v6 alone among four of it and was level four against one, +17 Elo a seat (`bot-log.md`, "Five players: the ladder, and the small table's cutoff"). native-v1 plays them while three to five are alive. A 6-player game keeps the large table's until a seat falls; that combination is unmeasured, and the gauntlet's 6-player pairings are what would show a cost.
- **The forecast is computed once per region, not once per board.** This is the engineering, below; it changes time, not what is believed.
- **Not decision-identical.** Where v6's arithmetic is a by-product of its code (the order of a float sum, which of two equal plans wins, a memo's eviction), native-v1 does what is natural in Rust. Its moves will differ from v6's in a few percent of decisions; the measurement decides whether that costs anything.

Nothing v6's measurements showed paying is cut. Sampled outcomes (v1's work knob) are not offered: they never earned a budget.

## Engineering

v6 costs about 2 ms a decision and 20 ms a turn on one core, and almost all of it is the opponent model run again for every board a plan ends on, memoised by a string of the whole board. native-v1's target is a twentieth of that.

**Where the forecast's time goes, and what a plan changes.** A plan changes only my territories and the ones it takes. The expensive parts of the forecast are pairwise: each opponent's kill chance against each seat, and each opponent's blows and sweep against each of its neighbours (the aim's share needs them all, not only mine). Each reads only a region of the board: a kill of v by q reads v's land, the territories beside it and the stacks a territory further out; q's turn against v reads q's land, v's land and what lies beside it, and the territories within two steps of q's biggest stack. So each pairwise term is remembered by the contents of its region (owners and armies of exactly the territories it reads, with the attacker, the victim and the armies to place) as a 128-bit hash. Across a decision's few dozen candidate boards, and across a turn's decisions, most opponents' terms against third players never change, and are computed once; only the terms that read my changed territories are recomputed. The cheap parts (power, incomes, the common threat, idle armies) are recomputed directly from the board's masks.

**The rest:**

- A board is a `Copy` struct of a few hundred bytes: owner and armies per territory, a territory mask per seat, hands, alive seats. Copying one for a candidate end of turn is a memcpy; there are no string keys anywhere.
- Ownership questions are mask operations: a seat's neighbours, a continent held, the territories beside a set, a group's flood fill.
- Battle odds come from `odds.rs`, with a dense table of capture chances and expected arrivals for the small fights the sweeps and screens ask about most.
- The hand model is solved once at load: the value and policy of every hand of up to five cards, a hidden hand's worth and expected trade by size, and a card's long-run worth.
- The best plan for a board is remembered by the board's hash with the seat, the armies to place and the preferences in force, so the trade decision's two plannings, the placement after it, and a move-in's four plannings share what they can.

**Memos never change an answer.** A remembered result is keyed by everything it reads, so it is the result a fresh computation gives. The memos are kept per thread and emptied when they grow past a bound; whether a result was remembered changes only the time.

## Preferences and the opponent model

The project's dual-parameter rule (`rule-bot-v1.md` §3): a parameter an optimiser may move has exactly one job, or every job it has is visible to the fitness. So the settings split in two.

**Preferences**, tunable (`risk:tune` may move them, in a tuned label), two sets by the seats alive: the income horizon (every player's power alike, and a continent of mine broken), my card weight and my continent weight (mine only; others' cards and continents are valued objectively), the kill commit margin, and the weights of my kill exposure, border loss, next turn's kill, idle armies, the common threat's excess and my own lead. Their values are v4's (the small table's, tuned against a mixed field) and v3's (the large table's), since the evaluation they weigh is the same.

**The opponent model**, pinned out of any search: the leader bar (1.3 at 4 players, 0.1 more a player), the kill bar and the chance of an unpaid kill below it, and v4's measured beliefs (the aim's pull toward even, the gang-up aims, the record's prior and decay, the kill rates for a third player and for me), the sweep's sure bar and its way in through a third player. They model other seats; tuned by self-play they would learn a convenient fiction. The hand model (an army next turn worth 0.9 of one now, a card drawn on 90% of turns) prices every player's cards, so it is pinned too.

## Determinism

native-v1 is a pure function of its input: the seat's view, its options and its redacted history (read for the opponents' record and nothing else). It draws nothing at random, so its seed is unused, and it does a fixed amount of work for a given input, never bounded by a clock. The same input gives the same move on any machine, and a game replays bit for bit.

## The bar, fixed before the runs

native-v1 is in v6's class only if all of these hold:

1. **Against rule-v6**, by `npm run risk:gauntlet -- native-v1 --base rule-v6 --field rule-v6,gd-defensive,gd-stacker,greedy` on `train` seeds: the verdict is `better` or `even` (not `worse`, not left inconclusive) in both mixtures at 3, 4, 5 and 6 players; then confirmed the same way with `--prefix holdout`.
2. **Against the field**, in the same gauntlets: `worse` against no one.
3. **Speed**: its mean time per turn, on 5-player tables on one core, at most a twentieth of v6's on the same machine.

The gauntlet runs on the TypeScript harness through the mixed-table seam (`native-port.md`, "How a Rust bot is measured"), asking before the heavy runs. Before that, native-v1 is developed on native-only tables (`risk-native games`) against greedy and GD's personas, which exist exactly in both worlds: its lone-seat win share against them is set beside what v6's ladder Elo predicts for v6 in the same seat, as a proxy for its class, never as a substitute for the bar.

## Open questions

- **The 6-player preferences.** As for v6: the large table's preferences were never tuned on v4's beliefs. Speed now makes a large-table tune cheap enough to run.
- **More thinking.** A turn costing a fraction of v6's leaves room for a search (`native-v2`); whether native-v1's own planning gains from more work (more single captures, more sweep launches, sampled outcomes) is a measurement, made only if a profile and a screen suggest it.
