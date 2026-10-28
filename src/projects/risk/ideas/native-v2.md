# native-v2: a turn search in Rust, built to beat rule-v7.1

The design of `native-v2` (`native/src/bots/native_v2/`), a Rust bot built to beat rule-v7.1, the strongest seated bot. This doc fixes its bar before any run, as every bot's doc does. It says what the search starts from and which changes it tests, and why. The design below is the bot as built; `bot-log.md` has every measurement.

## Why

Two findings shape it.

- **v7.1's search stopped gaining from more work, and the reason is its candidates.** From 2 to 8 replies v7 gained about 75 win Elo; from 8 to 32 it gained nothing (`bot-log.md`, "v7 at 32 replies: the curve flattens"). The reviews of CZ7U explain why. The candidates are v6.1's best four placements, which are almost always four single-territory captures. Their scores sit within the replies' own noise, and the search overrode v6.1 in 31 of 50 turns, mostly on that noise. More replies sharpen a choice between near-copies. They can't add a better option.
- **People beat the bots on judgement, the same way every game.** Bot Killer won YUY4 (`rule-bot-v9.md`), 9PYK, YMS9 and CZ7U with fair dice. The bots don't carry out the turn they planned. They misjudge how a person kills. They don't contest the leader, because their leader test is a hard ratio that flickers. v7.1 repeats each of these where it was checked.

Rust is what makes the fix affordable. native-v1 plans a turn in a fraction of v6's time (`native-v1.md`), so the same turn budget pays for more candidates of more kinds, played out whole, and the measurements that pick among the changes run on the native fast path.

## The baseline

native-v2 with every switch off is **v7.1's search on native-v1 with v6.1's settings**:
- 4 candidates and 8 replies;
- v7's reply mix of v6.1, GD Aggressive and greedy, drawn per seat at v7's weights;
- common random numbers across candidates;
- one round of replies;
- v7.1's standing at the leaf.

It is not decision-identical to v7.1, as native-v1 isn't to v6. It is checked two ways:
- its agreement with v7.1 on recorded positions;
- a gauntlet against rule-v7.1 that should come out even.

Every switch is measured against this baseline, so a gain is the switch's and not the port's.

### As built

- **The base planner is rule-v6.1 natively**: native-v1 on v6.1's pick (`rule-bot-v6.1.md`, "The native map": armies priced past 16 rounds of income at 0.75, a rival's at 1.25, the price reaching the forecast, the border weight 1.2, from 5 players) with v6's small-table cutoff of 4 seats alive, the one native-v1 measured as deciding like TS v6.1. It makes every decision the search doesn't: trading, and with `execute` off the attacks, move-ins and fortifies; its plans are the candidates. With 0 replies native-v2 plays its moves exactly (a crate test). It is shared code: native-v2 reads native-v1's planner, evaluation and decisions and copies none of them.
- **Where the search runs**: the turn's first placement, once the base bot has decided whether to trade. Its search point is the reinforce phase as it stood before that placement; every later placement of the phase rebuilds it from its own view and history and places the next of the plan's allocations, biggest first. A search point and its answer are remembered by everything the search reads, so a remembered answer is the fresh one, sooner.
- **Candidates**: the base planner's choice, then its other plans by value, two that place alike counted once.
- **A reply** is one imagined world from the search point: the cards the seat can't see dealt by the crate's `sim` (the TS `sim.ts`'s rules: every hand's size, the seat's own hand, each card once, and a card traded back below the deck's top kept out of reach of the draws since), dice from a seed of the search's own, and a reply bot per opponent seat drawn from the mix (v6.1 twice the weight of GD Aggressive and of greedy). Every candidate is played in the same world: its placement as real moves on the native engine, the rest of my turn by the base bot, every opponent's turn by its reply bot, to the start of my next turn. Each seat in a reply sees only its own redacted history, grown as the reply plays.
- **The leaf** is v7.1's standing: my share of everyone's power (armies priced as v6.1 prices them where its settings are in force, income over the horizon, cards; mine as I know them, others' as hidden hands), less the charge for a runaway leader by the power ratio. A game won is 1, an elimination or a game lost 0. The candidate of the best mean is played, the earlier of equals.
- **Seeds and work**: the search's seed is read from the search point (seat, turn, the history's length there), never from the game's, so the same position gives the same move on any machine. The work is a count of replies, never a clock.
- **Knobs**: `native-v2~{"replies":16,"candidates":6,"mixed":0,"rounds":2}` moves the budget: replies per candidate, candidates, the mix (0 plays every opponent as v6.1), and rounds of the opponents' turns a reply plays before its leaf (my own turns between are the base bot's). The switches below are knobs of the same label. The plain `native-v2` label is the baseline, seatable at a mixed table through the native seat as native-v1 is, and so is any tuned label (`eval/native/bot.ts` sends a tuned label whose base only the crate knows to the crate).

### Checked so far

- **Agreement with v7.1** on CZ7U, at its three v7.1 seats (`risk-native agree-log`; a reinforce phase stops being asked once native-v2 leaves the path played): 91.5% of all decisions; every attack, move-in and fortify (the base bot's) as v7.1 played them; **17 of 46 turn-start placements**. The search's own choice is the one that differs, as expected: v7.1 itself overrode v6.1 in 31 of these 50 turns on noise, native v6.1 (0 replies) agrees with v7.1 on 16 of 46, and native-v2 at 32 replies on 20 of 46.
- **Against v6.1, natively at 5 players** (`bot-log.md`, "native-v2: the baseline matches v7's gain"): about +150 win Elo a seat one-in and one-out, as v7 at 8 replies measured over v6. The gauntlet against rule-v7.1 itself is still to run.
- **Turn time** on CZ7U's v7.1 seats, one core: median 0.16 to 0.26 s, nine turns in ten under 0.31 to 0.56 s, longest under 1 s (runs on a busy machine vary). In a 5-player native screen beside other runs: median 0.29 s, nine in ten under 0.62 s, longest 4.1 s. Far under the bar's 5 s.

## The switches

Each is a knob in a tuned label, off by default, measured alone against the baseline, then in the combinations that pass. Each names the positions from real games that it must change: these are tests that the switch does what it says, not evidence that it wins. The games are kept in `native/fixtures/online/` (the people's seats named only as people), and each position is a crate test.

| Switch | What it does | Positions it must change |
|---|---|---|
| `execute` | The chosen candidate's whole plan is carried out. Its attacks follow the plan's captures. The move-in is sized to what the plan's next captures need, scored over every total rather than four. A capture beyond the plan is made only if the board it ends on scores better, with `feed`'s charge. | YMS9 d380 (5 of 32 moved into a sure sweep); CZ7U d582; 9PYK turn 32 (1 planned capture became 10) |
| `kinds` | Candidates of different kinds, not v6.1's top four. The best of each kind: hold, a single capture, a sweep, taking a continent, breaking the leader's continent or gate, and a kill. Two that place alike are one. The count per kind is a knob. | CZ7U d268 (a +10 turn that took no card); CZ7U d557 (a 96% sweep through the runaway leader); YMS9 d349 (stopped short of the leader's Australia) |
| `margin` | The search leaves the base plan's choice only when the paired difference across replies exceeds a set number of its standard errors. | CZ7U d353, whose pick flips back to v6.1's at 32 replies |
| `feed` | The leaf charges a board for the kills it opens to another opponent, the victim's cards valued as the trade they force. A rival's death by another seat never raises my share. | 9PYK d290 to d308 (S2 left killable at 0.95) |
| `humans` | Seats a person plays are believed to take the kills open to them. Kill chances count several stacks and a kill paid for by a first kill's cards. In replies, a person's seat is played by vulture-v1 once it is registered (`vulture-v1.md`). | YMS9 d493 to d521 (29 of 30 territories believed lost, survival believed certain) |
| `threat` | The leader is named by what their next turn could do (their believed sweep, their continents), weighed on a smooth scale and decided once per turn, not by a power ratio. | YMS9 turns 60 and 61; 9PYK d290 and d292 |
| `hoard` | A stack beyond what the plan uses is priced down at any income. A fortify that strips a gate facing a bigger stack is charged. | CZ7U turn 61 (30 moved off Iceland facing 22) |

Once these are settled, the budget is measured again: candidates per kind, replies, and a second round of replies. The flat curve was measured on near-copies, so it may not hold here.

### What each switch does, as built

Every switch is built; each is a knob of the label (`"execute":1`, `"kinds":1`, `"margin":2`, `"feed":1`, `"humans":1`, `"threat":1`, `"hoard":1`). The ones that change the base planner's beliefs (`humans`, `threat`, `hoard`) do so through one set of extra beliefs native-v1's evaluation reads only when one is on; with all of them off native-v1 decides exactly as before (its recorded games replay decision for decision).

- **`execute`.** A bot keeps no state, so at each attack and move-in of the turn the turn's search point is rebuilt from the history (the public board replayed to the turn's first placement; the hand is the seat's own, unless it took an eliminated seat's cards this turn, whose faces the history doesn't hold, and then the base bot plays the rest of the turn) and the search's choice is read back; the same plan is carried out in the replies. The attacks take the plan's routes in order, each target from the latest of my territories on its run, a single battle with every die where the odds favour rolling, otherwise a blitz committing the fewest armies as sure as all. A run whose remaining route has less than an even chance is given up. Once the plan is done or given up, the base bot's replanned attack is made only if its value, less the feed charge (at `feed`'s weight, or 1 while `feed` is off) on its success and failure boards weighted by its chance, beats the board as it stands less the same charge. A move-in keeps for the run going on from the captured territory the least armies that come within 2% of the best chance it can have, and for the routes still to start from the source what they need the same way; among the totals that meet both (or the run's need alone when both can't be met), the one whose best plan scores most, every total when there are at most 12 and 12 evenly spaced otherwise. Under `execute`, two candidates that place alike but capture differently are two candidates, since the rest of the turn is theirs.
- **`kinds`.** The base planner's choice first, then the best `kinds` plans of each kind by value: hold, single capture, sweep, continent, break, kill. A break is planned for each continent the leader holds whole: the way in my stacks are likeliest to take, a territory of it beside me or one beside its gate (the leader's territory outside it that touches it), the gate taken first, planned by the base planner's capture planner at its three bars of sureness. The leader is `threat`'s when that is on, otherwise the opponent of the greatest power by the standing.
- **`margin`.** For each candidate its score minus the base plan's in every reply; a candidate may replace the base plan only when that paired mean is positive and exceeds `margin` standard errors of it, and the best mean of those that qualify is played.
- **`feed`.** At the leaf, each opponent after me is credited with its best kill of a rival (never of me: that is the replies' and the forecast's), at its chance, worth the victim's cards (the forced trade's armies when the two hands come to five, otherwise the hidden hand's worth) and the victim's land's income over the horizon; those gains are added to the opponents' powers and to the total, so the kills I open lower my share. A rival killed during the reply by a seat other than me keeps its power at the search point in the total, so its death by another seat never raises my share. The weight is the knob's value.
- **`humans`.** In the base planner's opponent model, a seat a person plays takes every kill open to it (no kill rate, no discount for an unpaid kill, and one kill doesn't pass over the next). Its kill chance is the best of the planner's own, a sweep from every one of its stacks beside the victim (its armies to place on the biggest, the likeliest capture first, each stack going on from what it takes, the chances multiplied), and a kill paid for by a first kill's cards (a first victim whose hand makes the person's five or more forces a trade, whose armies are added to the second kill's). The same chances price `feed`'s kills by a person. In the replies a person's seat is played by vulture-v1, looked up in the native registry, so it is in play now that vulture-v1 is registered; were it absent, the seat would be drawn from the mix like any other. The draw for every seat is made either way, so a person's seat changes no other seat's bot.
- **`threat`.** Each seat's reach is its public power (armies, board income with continents over the horizon, cards by their number) plus the most its believed sweep could take from one other seat next turn, in armies and broken income. The leader is the seat of the greatest reach; its weight runs from 0, level with the next seat, to 1 at the table's leader bar. It is named once a turn from the board at the turn's start, which every decision of the turn rebuilds from the history. In the base planner it replaces the power ratio's common threat: the charge is the leader's power over the next seat's times its weight, and the planner treats it as the common threat (allies, aims) while its weight is at least even. At the leaf, the leader is named the same way on the leaf's board and charged the same way.
- **`hoard`.** A front territory of mine needs twice what its strongest attacker could bring next turn (its stack less one and its owner's expected armies); my armies past that count at v6.1's price for armies past the cap (0.75 each) whatever my income, in the base planner's power (where v6.1's own pricing discounts more, that discount stands) and at the leaf. A fortify that leaves its source facing an enemy stack bigger than what it keeps is charged the rise in that stack's chance of taking it times the armies moved away, and is never the believed-sweep gathering move.

### What the positions show

Each is a crate test (`native_v2/tests.rs`), on the game as played up to the decision.

- **`execute`**: YMS9 d380 moves in at least 12 where the baseline moves 5; CZ7U d584 (the move-in of d582's turn) at least 20 where the baseline moves 3, and the turn sweeps on through Kyle's Asia; 9PYK turn 32 makes at most 2 captures where the baseline makes 7, and leaves Bot Killer's kill chance on S2 near 0 where the baseline leaves it at 0.59.
- **`kinds`**: with `execute`, CZ7U d557's 13-territory sweep through the runaway leader is a candidate of its own and the choice changes (to a capture from Ukraine; the sweep still scores below it); YMS9 d349 searches a way into the leader's Australia (Siam, then Indonesia), which the baseline never does. CZ7U d268 changes under `kinds` with `execute`, and under `margin` (the +15 goes to Siberia, v6.1's plan to take Mongolia), not under `kinds` alone: v6.1's top plans there are already single captures of different territories.
- **`margin`**: CZ7U d353 at 32 replies, where the baseline leaves v6.1's pick on a difference of 0.0005, keeps v6.1's pick at a margin of 2. At 8 replies native-v2 already keeps it there.
- **`feed`**: on the board the baseline leaves at 9PYK turn 32, Bot Killer's gain from S2's kill is priced above 10 armies and S3's standing falls by more than 0.01; with `execute`, S3 leaves S2 standing. Alone, `feed` doesn't change that turn: the replies play my own turn by the base bot, which still sweeps through S2.
- **`humans`**: on the board S4 leaves at YMS9 d521, its believed survival falls from 1.00 to 0.82 (Bot Killer's kill of S2 pays for the next); the choice at the turn's start (d494) changes. With vulture-v1 in the replies it changes to the all-in kill the game played, and with the beliefs alone to another capture; which is right is unsettled.
- **`threat`**: the base planner's own choice changes at YMS9 d468 (turn 60) and at 9PYK d291, where it becomes the review's better turn, 12 on Western US to retake Central America.
- **`hoard`**: CZ7U d414 keeps Iceland's 30 beside Kyle's 22.

### Untested

- The switches are screened only at 5 players, one-in among v6.1s, 500 games each (`bot-log.md`), and only two pairs (`execute` with `feed`, with `kinds`); none is measured head to head against the baseline, one-out, or at 3, 4 or 6 players.
- `humans` is untested at a real table and against vulture-v1 at a native one; its card-chain kill places the paid armies as if the first kill's stacks were fresh.
- `threat`'s scale (0 at level, 1 at the leader bar) and `hoard`'s need (twice the strongest attacker) are first choices, unscreened.
- `execute`'s thresholds (a run given up below an even chance, a move-in within 2% of the best chance, at most 12 totals scored) are first choices.
- The rebuilt turn point is checked against the placement's own search point on native games only; a game of the TypeScript runner's with a native seat sends the same history, so it should hold there too.
- Rounds past one, more candidates, and replies past 8 are knobs, unmeasured.

## The bar, decided before the runs

native-v2 at its chosen switches is a success only if all of these hold:

1. **Against rule-v7.1**, on train seeds and then holdout seeds: better at one table or more, worse at none. Each pairing's SPRT is at ±30 Elo a seat, at 3, 4, 5 and 6 players, one-in and one-out. Holdout counts here, unlike for v7.1: the switches are chosen on train seeds.
2. **Against the suite's field** (v6.1, GD Defensive, GD Stacker, greedy), in the same gauntlets: worse at none.
3. **On the seatable ladder**, with every seatable bot: win Elo above rule-v7.1's.
4. **Turn time**: nine turns in ten under 5 seconds on one laptop core, v7.1's own rule.
5. **No stall**: at most 1 capped game in 100 on each of the 5- and 6-player mirror tables.

**Reported beside the bar, not part of it:** native-v2's and rule-v7.1's win share alone among vulture-v1s at 5 players. It becomes a bar once vulture-v1 is shown to play like the person it is drawn from.

**Seating is a separate step.** A Rust bot can't yet play at a real table: the live game runs bots in TypeScript on the server. How it gets there (WebAssembly in the server function, or the Oracle machine) is decided before native-v2 is seated, not before it is measured.

## Measuring it

- **The fast path.** Screens of a switch against the baseline or native-v1 run wholly in the crate (`--native`).
- **The slow path.** Gauntlets against rule-v7.1 are mixed tables and run at v7.1's speed. They are long runs for GitHub Actions (`docs/actions.md`).
- **CPU.** Every run that holds most of the laptop's CPU for more than about ten minutes is asked for first (the repo's `CLAUDE.md`).
