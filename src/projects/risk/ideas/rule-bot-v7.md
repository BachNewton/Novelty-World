# Risk bot v7: v6 that plays its opponents' replies instead of believing them

v7 (`bots/rule-v7/`) is built, registered (`rule-v7`, and at any budget by a tuned label such as `rule-v7~{"replies":8}`), and not seated. Its budget curve is measured and its budget chosen: **8 replies**, about +150 win Elo a seat over v6 at 5 players, better than v6 both alone among v6s and four against one ("What the curve showed", below). Its full seating suite hasn't run. This doc fixed its seating bar and measurement plan before any run; `bot-log.md` has every measurement.

## The hypothesis

v6 (`rule-bot-v6.md`) does a fixed amount of work per decision. It makes a few dozen whole-turn plans, plays each on exact battle odds, and scores the end of the turn with a hand-written evaluation. Inside that evaluation an opponent model (`rule-v6/opponents.ts`) *believes* what each opponent does before v6's next turn: its sweeps, its kills and its gang-ups, at measured rates. That belief is the weakest link. In 9VFL it said a person's sweep would take none of v4's territories, and it took five.

v7 asks whether **thinking time buys strength**. For each of v6's best few plans it plays the round that follows, in imagined worlds, with real bots in the opponents' seats, and scores the board it faces when its next turn starts. Each round played is a **reply**, and the number of replies per plan is the work knob. Whether strength climbs with the knob is the result this version exists to measure (CLAUDE.md, "More thinking is earned, not assumed").

## How it plays

v7 is v6 everywhere but one decision: **where the turn's armies go.** That is where v6 commits to its plan, and the rest of the turn plays out from it (v6 replans every attack on the board its placement made), so it is where the thinking is spent: once a turn (CLAUDE.md, "Thinking time is spent once per turn"). Trading, attacking, moving in and fortifying are v6's calls, and so is the forced trade after an elimination mid-attack.

At the turn's first placement:

1. **Candidates.** v6's own choice, then its other plans by their value, at most `candidates` of them (4), one per placement: two plans that place alike are one candidate, since the rest of the turn is v6's either way.
2. **Replies.** For each reply, one world (`sim.ts`): the board and public facts as the seat sees them, the cards it can't see (the other hands and the deck's order) dealt by `sampleHidden` consistently with what it knows, and dice from the search's own seed. In that world each candidate is played:
   - its placement, as real moves;
   - the rest of my turn by v6, as v7 will really play it;
   - each opponent's turn, in turn order, by that reply's bot for the seat;
   - stopping at the start of my next turn, or where the game ends (1 if I won, 0 if not) or I am eliminated (0).
3. **Score.** Each end is scored (below), each candidate's score is its mean over the replies, and the best is played. A tie goes to the earlier candidate, so v6's own choice wins ties.

The phase's later placements play out the same placement, its biggest allocation first, as v6 places. A bot keeps no state, so each later placement rebuilds the search point from its own view and history (the board less what this phase has placed, and the history up to the first placement). The search's seed is read from that search point, so the rebuilt search gives the same answer; a memo only saves rebuilding it. With **0 replies v7 plays v6's moves exactly** (`parity.test.ts`). The registered `rule-v7` plays 8 replies over 4 candidates, a provisional default until the curve picks the budget.

## The design choices, and why

### Every reply starts from the real view

A reply starts from a world built from v7's own view at the search point, and plays v7's candidate as real moves, never from a board the planner imagined: one source of legality (the reference engine, through `sim.ts`) and no second rules path. The cost is that my own turn is played too, by v6 on the reference engine, and its dice are the world's, so a candidate's luck in its own attack is sampled rather than taken exactly as v6 takes it. That is honest. v6's exact odds cover one plan's captures; the reply also covers what v6 does with them, the move-ins and fortify included.

### Common random numbers

Reply `r` is one world, one guess at the hidden cards, one dice seed and one set of reply bots, and every candidate is played in it. So candidates are compared on the same luck, and a difference between two of them is the plans' and not the dice's. The dice still diverge once the plays do (they are drawn in order), as a gauntlet's rotation groups do.

### The reply bots: a mix, drawn per seat

Playing every opponent as v6 would believe the table plays like v6. That is exact against a field of v6s, and wrong against everyone else, the people who beat the bots above all. So each opponent seat in each reply is drawn from a mix, deterministic from the search's seed:

| Bot | Weight | Why |
|---|---|---|
| rule-v6 | 2 | the strongest model of a careful player, and the field the budget curve plays |
| gd-aggressive | 1 | attacks wherever it is bigger: the sweeping play v6's model underrates (9VFL) |
| greedy | 1 | the same pressure, cheaply, with a different shape of attack |

Drawn per seat, not per reply, so one reply can hold a sweeper beside a careful player, as a real table does. The mix is one list in `replies.ts`. The Sweeper persona being built on another branch joins it with one line once it is registered. The switch `mixed` (1) plays every opponent as v6 instead (0), so the budget curve can tell whether the mix costs anything against a field of v6s.

### What scores a reply's end

The replies play exactly the turns v6's opponent model forecasts, the opponents' turns before my next. Scoring their end with v6's whole evaluation would count those threats twice: the evaluation would forecast another round of sweeps and kills, against a board where I move first. So a reply's end is scored by v6's **standing** without its forecast: my share of everyone's power (armies, territory and continent income over the income horizon, and cards: mine as I know them, theirs as hidden hands, v6's own formula), less v6's charge for a runaway leader (the common threat, or my own lead). Kill exposure, expected border losses and next turn's kill opportunity, the forecast's terms, aren't counted: the reply has already played them. Elimination is 0 and a win 1.

The scorer is one function (`Leaf` in `replies.ts`), so a learned evaluation can replace v6's standing there without touching the search.

The one thing this gives up is what v6's evaluation says of the round after that: a board on which I am about to be swept is scored only by its present power. That is what a deeper search, more rounds per reply, would buy, and it is left out until one round has shown it pays.

### Cost control

- **Pruning to v6's top 4.** The bet is that v6's evaluation is a good filter even where its beliefs are wrong, so a plan it scores far down its list is rarely the one a better belief would pick. The cost is linear in the candidates as in the replies, and `candidates` is a knob of its own, so a screen can test the bet.
- **One search a turn.** The later placements of the phase reuse it, and the other decisions are v6's.
- **No search where there is nothing to choose.** With a single distinct candidate, v7 places v6's plan without replies.
- **One world per reply, shared by every candidate.** Worlds are immutable, so one built world serves every candidate, and the hidden guess and the world are built once a reply, not once a candidate.

### The seed

A bot's seed changes with every decision, and the phase's later placements must rebuild the same search, so the search's seed is read from its search point (the seat, the turn and the history's length there), never from the game's dice or deck. The same position always gives the same move on any machine, and a change only to what the seat can't see, the dice to come included, changes nothing (`bot.test.ts`).

## Left out, and why

- **Searching the attack phase.** The attacks are v6's, replanned on the board the placement made. A placement is the turn's commitment; searching each attack would multiply the cost by a turn's attacks for choices that mostly follow from where the stack stands. If the curve climbs, the next version may search a turn's first attack too.
- **More than one round per reply**, and a search tree (max-n MCTS, `risk-bot-ai.md`). One round is the cheapest test of the hypothesis: if replacing the belief with play doesn't pay, a deeper search of the same kind won't either.
- **Weighting the guess.** The hidden cards are dealt uniformly among what is consistent with the view (`sampleHidden`). Nothing infers a hand from its holder's trades or turns. The guess comes through one seam (`Guess` in `replies.ts`), so a source built on the card odds can replace it as a switch.
- **The small table's cutoff at 5.** `bot-log.md` found v6's small-table preferences better at 5 players. v7 keeps v6's cutoff so that 0 replies is v6 exactly, and every point of the budget curve differs from v6 only by the replies.
- **A cap on wall time.** The knob is a count of replies, never a clock (CLAUDE.md, "work budgets").

## Cost

Per decision and per turn for one v7 seat among four v6s at 5 players, on the laptop, one core: two games (`probe-a`, `probe-b`), the first 60 player-turns of each (the early and middle game). Each search plays candidates × replies rounds, fewer when v6's plans place alike.

| Budget | Rounds a search | Time a decision | A turn, mean | Median | 9 in 10 under | Longest |
|---|---|---|---|---|---|---|
| 0 replies (= v6) | 0 | 2.7 ms | 0.02 s | 0.02 s | 0.03 s | 0.06 s |
| 2 replies | up to 8 | 73 ms | 0.75 s | 0.81 s | 1.6 s | 1.8 s |
| 8 replies | up to 32 | 262 ms | 2.5 s | 2.5 s | 3.5 s | 6.4 s |
| 8 replies, 2 candidates | up to 16 | 110 ms | 1.1 s | 1.0 s | 2.2 s | 3.0 s |
| 8 replies, all v6 (`mixed` 0) | up to 32 | 1,186 ms | 8.8 s | 7.6 s | 15.8 s | 23.5 s |
| 32 replies | up to 128 | 1,441 ms | 9.8 s | 11.4 s | 15.3 s | 16.3 s |

The 32-reply row is the first 30 player-turns only (12 turns of v7), to keep the probe to two minutes; the others are 12 to 27 turns of v7 each. A round costs about 80 ms with the mix, and about 270 ms with every opponent v6: v6's own planning, four times over, is most of a round, and greedy and the GD persona plan far less. So the cost is linear in replies × candidates, and **a server turn of a few seconds holds about 8 replies over 4 candidates** with the mix. The late game wasn't probed: fewer seats alive make a round cheaper, bigger stacks make v6's plans dearer.

## The seating bar, decided before the runs

v7 is seated, at one budget chosen by the curve, only if all of these hold:

1. **The curve climbs.** Some budget's 5-player gauntlet against v6 comes out better, and on the 5-player ladder of the budget points its win Elo is above v6's by more than its error. Without it, v7 has shown that thinking time buys nothing, which is the result, and it stays unseated.
2. **Against v6**, at the chosen budget, on train seeds and then holdout: better at one table or more, worse at none (each pairing's SPRT at ±30 Elo a seat, 3, 4, 5 and 6 players, one-in and one-out).
3. **Against the weak bots** (gd-defensive, gd-stacker, greedy), in the same gauntlets: worse at none.
4. **On the seatable ladder**, with every seatable bot: v7's win Elo above v6's.
5. **It fits a real game's turn.** At the chosen budget, nine turns in ten take under 5 seconds on the laptop's one core, so the server's drive gives a bot turn the few seconds CLAUDE.md allows. A larger budget that is stronger but slower is recorded, as evidence for thinking on a player's device (CLAUDE.md, "Bots may later think on a player's device"), and not seated.

The chosen budget is the smallest whose 5-player win Elo is inside the best budget's interval and which passes rule 5.

## Measuring it

All on GitHub Actions (`docs/actions.md`), from this branch once it is pushed, which is the owner's call. The labels have no spaces, so the workflow passes them whole. Time estimates come from the measured cost above, assuming a 5-player game of about 115 player-turns (so 23 turns of each seat, as between v6s), an Actions core about as fast as the laptop's, and twenty 4-core runners, 80 games at once. None of them is started yet: the runners are shared, and starting them is the owner's call.

**1. The budget curve at 5 players, one-in, against v6.** One v7 among four v6s, train seeds, at most 2,000 decisive games each. Budget 0 isn't played: the parity test proves it is v6, and two copies of one bot take thousands of games to call even. The all-v6 arm at 8 replies says whether the mix costs anything against a field of v6s.

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f max_parallel=10 -f args='rule-v7~{"replies":2} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7'
```

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f max_parallel=10 -f args='rule-v7~{"replies":8} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7'
```

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f max_parallel=10 -f args='rule-v7~{"replies":32} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7'
```

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f max_parallel=10 -f args='rule-v7~{"replies":8,"mixed":0} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7'
```

A game of one v7 among four v6s costs about 23 turns of v7 and 92 of v6, so at the 2,000-game cap (about 2,100 games with the cap rate), on 80 cores:

| Run | A game | At the cap |
|---|---|---|
| 2 replies | 21 s | about 10 minutes |
| 8 replies | 61 s | about 30 minutes |
| 32 replies | 230 s | about 1 hour 45 minutes |
| 8 replies, all v6 | 206 s | about 1 hour 30 minutes |

Add each round's start-up (a few minutes) and an Actions core's speed against the laptop's, unmeasured. A pairing whose edge is large stops well before the cap. Run two at a time at `max_parallel` 10.

**2. The 5-player ladder of the budget points**, which is the curve itself: win Elo against replies.

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=ratings -f args='rule-v6 rule-v7~{"replies":2} rule-v7~{"replies":8} --anchor rule-v6 --groups 100 --players 5'
```

Six matchups of 500 games, each bot alone among the others' copies. Four v7s at 8 replies make the dearest games (about 4 minutes each), so the ladder is about 1 hour 20 minutes on 80 cores. 32 replies joins it only if its gauntlet came out above 8 replies': with it the ladder is about 8 hours.

**3. The full suite at the chosen budget** (here `rule-v7~{"replies":R}`), once the curve has chosen R, train first and holdout only once train passes rules 2 and 3:

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f args='rule-v7~{"replies":R} --base rule-v6 --field rule-v6,rule-v5,rule-v4,gd-defensive,gd-stacker,greedy'
```

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=gauntlet -f args='rule-v7~{"replies":R} --base rule-v6 --field rule-v6,rule-v5,rule-v4,gd-defensive,gd-stacker,greedy --prefix holdout'
```

```bash
gh workflow run risk-measure.yml --ref claude/exciting-sinoussi-24c292 -f tool=ratings -f args='rule-v7~{"replies":R} rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100'
```

These are the expensive runs, because one-out seats four or five v7s and a 6-player game among the rule bots runs about 250 player-turns. At 8 replies, a pairing against a bot as strong as v6 that plays to its cap costs about 9 hours of all 20 runners over its eight tables, most of it 6 players one-out; v5 and v4 may cost as much, and the weak bots decide in a few hundred games. So each gauntlet is about a day of the account's runners, and the ladder, with 11 v7 matchups at every table size, most of another. At 2 replies, each is about a third of that.

Each run's results come back with `risk:import`, and their entry goes in `bot-log.md`. If v7 clears the bar, it is seated as v6 was (`online/seat-roster.ts` at the chosen budget, the seatable ratings run, and its fingerprint in `frozen.test.ts`), and `V7_PARAMS.search.replies` becomes the chosen budget.

## What the curve showed

At 5 players against v6, on GitHub Actions (`bot-log.md` has each run):

| Budget | One v7 among four v6s | Four v7s against one v6 | Ladder win Elo (v6 = 0) |
|---|---|---|---|
| 2 replies | 30.4%, better | | +77 |
| 8 replies | 42.7%, better | 88.8%, better | +152 |
| 32 replies | 41.1%, better | | |

Strength climbs from 2 replies to 8 and is flat from 8 to 32: past about 8 replies, the noise averaging removes is small beside what the search can't see (four candidates, one round deep, bot opponents, v6's standing at the leaf). 8 replies is the chosen budget: head to head it beats 2 replies by about 72 Elo a seat, outside the error, and it fits a real game's turn (rule 5), where 32 doesn't. `V7_PARAMS.search.replies` is already 8.

Tables of many v7s run long and cap more often: 229 turns and 14% capped four against one, and 16 to 23% capped on the ladder's tables of v7s, against 4% with one v7 among v6s. Capped games are draws, so no verdict rests on them, but the full suite's 6-player tables are where it would show.

**What measuring v7 costs.** A v7 turn at 8 replies plays about a hundred imagined turns of v6, so a game of four v7s costs about 6 machine-minutes on Actions. The full suite (train and holdout gauntlets at 3 to 6 players, both mixtures, and the seatable ladder) is days of all twenty runners: rounds are now sized from the evidence, v6's planning is 1.3× cheaper, and the ladder's stopping rule is being made statistical in a session of its own. The suite runs once that lands.

## Open questions

- **Does the mix matter against people?** The gauntlets play bots. Two human games are fixtures (G4FR and 9VFL); replaying their positions with v7 shows whether the replies see the sweeps the belief missed.
- **Which part of the gain is the replies, and which the standing?** If the curve climbs, a screen of v7 at a budget scoring its ends with v6's whole evaluation tells whether counting the threat twice costs, as reasoned.
