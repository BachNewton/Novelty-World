# Risk bot log

What was tried on Risk's bots and what each measured, negative results included, so an idea is not walked twice. Append-only in spirit: a later finding gets its own entry rather than rewriting an old one. Dates appear only as the context of a measurement. The method is Monopoly's (`monopoly/bots/docs/METHOD.md`): reasoning proposes, measurement selects.

## v1, the rule-based bot (`bots/rule-v1/`)

v1 is the design in `rule-bot-v1.md`: a turn planner over expert-shaped plans, priced with the exact odds of Balanced Blitz, scored by one evaluation with a one-round threat model. Each correction below came from a scenario (`bots/rule-v1/scenarios.test.ts`) or a measurement, with the reasoning that fixed it.

### Built differently from the design's first sketch, and why

- **Re-planning.** A bot is a pure function of its view, so v1 keeps no plan between decisions: it plans afresh at every one (each placement, each attack, each move-in). Under Balanced Blitz a capture is one atomic fight, so there is nothing to stop part way: a blitz commits the sure amount or everything, and the next decision looks again.
- **Chains** are not rolled out. A kill whose cards force a mid-turn trade is scored with the trade's armies on the board; the next kill is planned when the bot is next asked. The one work knob is **outcomes sampled per plan** (0: a plan is scored on its success and its likeliest failure, both exact).
- **The hand model is solved, not estimated.** A small decision process over the hand's symbols, solved once at load by value iteration (about 120 hands of up to 5 cards), prices any hand and gives the trade policy: trade a 10, 8 or 6 at once; hold three infantry, and two of a kind with a wild. A card is worth 2.87 armies in the long run, in line with Conquer Club's flat-rate estimate of 2.82.
- **The attack odds include rolling.** The odds are those of the best mix of single fair battles and a balanced blitz, worked out exactly, so the bot slow-rolls where GD's Grandmasters do (and finds more: 10 against 10 is 61% blitzed, 66% rolled first).

### Corrections the scenarios forced

- **The common threat** was priced only through the evaluation, and that let v1 break a weaker player's continent while the leader held two: share of power counts any opponent's loss as my gain. The plan generator now treats everyone else as an ally while a common threat stands (their territory only for the turn's card, never a continent break, a kill only when its cards force a trade), as Domination's AI does. The leader ratio became Domination's fixed-card rule: 1.3 at 4 players, 0.1 more a player.
- **Near-sure kills.** Scenario 1 placed for a 93% run and spent the rest on defence; a few more armies make the run certain under Balanced Blitz. Placement now also offers a variant that places until the plan is 99% likely, and the evaluation takes it.
- **Hidden cards conditioned on mine.** Pricing my hand plus a victim's unseen cards drew the unseen ones from the whole deck, so a hand holding both wilds could "draw" a third. Unseen cards are drawn from the cards not in my hand.

### Speed

A blitz's exact balanced odds cost its two sides multiplied, and the commitment search tried every army count: with stacks of 800 a decision took 10 seconds, and one A/B game (a stalemate of giant stacks) ran 30 CPU-minutes before it was stopped. Fights past 300 armies in all are now worked out at the same ratio scaled down to 300, and the commitment is found by halving: a decision over stacks of 3,000 takes under a second.

Per decision, one core, 2026-10-16: 2.8ms mean (worst 33ms) over 3,000 decisions of six 6-player self-play games; 3.4ms mean (worst 47ms) over 1,400 decisions of 4-player games against greedy. With 8 sampled outcomes a plan: 9.2ms mean, worst 111ms.

### Income horizon (A/B, 2026-10-16)

v1 with H = 2 and H = 4 against v1 with H = 3, rotation groups on `ab:*` seeds, as per-seat Elo of the variant with a 95% interval that treats games as independent (so wider than the truth):

| Variant | 4p one-in | 4p one-out | 6p one-in | 6p one-out |
|---|---|---|---|---|
| H = 4 | −21 [−89, +35] (180 games) | −20 [−73, +42] (180) | −29 [−97, +24] (270) | −26 [−75, +33] (270) |
| H = 2 | −5 [−71, +50] (180) | −5 [−59, +59] (180) | not finished | not finished |

Neither is better; H = 4 leans worse at every table. H stays 3. The 6-player H = 2 run was stopped by the stalemate above.

### Sampled outcomes, the work knob (A/B, 2026-10-16)

v1 scoring each plan on 8 sampled ends against v1 scoring its success and likeliest failure exactly (the default), on the same harness, two runs pooled (25 rotation groups a pairing):

| Table | one-in | one-out |
|---|---|---|
| 4 players | +46 [+1, +87] (300 games) | +26 [−18, +77] (300) |
| 6 players | +4 [−43, +44] (448) | −6 [−46, +41] (449) |

A lean at 4 players and nothing at 6, at about three times the cost per decision (9.2ms against 2.8ms). Not enough to give v1 a work budget ("more thinking is earned"); it stays at 0. The 4-player lean is worth a proper gauntlet of its own, with the sampled bot registered as a candidate, and a look at 3 players, which this run left out.

### Against greedy and random (gauntlet, 2026-10-16)

`risk:gauntlet -- rule-v1 --field greedy --base greedy`, train seeds, 10 workers, ±30 Elo SPRT. Every pairing decided **better**, most within a hundred decisive games, which a 30-Elo test only does when the edge is far larger:

| Pairing | Win share (95%) | Par | Decisive games | Cap |
|---|---|---|---|---|
| 1 v1 vs 2 greedy (3p) | 58.7% [47.4–69.1] | 33.3% | 75 | 0% |
| 2 v1 vs 1 greedy (3p) | 84.7% [76.8–90.2] | 66.7% | 111 | 0% |
| 1 v1 vs 3 greedy (4p) | 54.4% [42.7–65.7] | 25.0% | 68 | 0% |
| 3 v1 vs 1 greedy (4p) | 89.7% [83.5–93.8] | 75.0% | 136 | 0% |
| 1 v1 vs 5 greedy (6p) | 58.3% [44.3–71.2] | 16.7% | 48 | 0% |
| 5 v1 vs 1 greedy (6p) | 97.7% [93.5–99.2] | 83.3% | 132 | 0% |

Win Elo +239 over greedy (finishing-order Elo +123). The SPRT stops as soon as it is sure, so the Elo is loose: the lone v1 seat's win shares, read through the Luce model, are +181 a seat at 3 players [+102, +260], +221 at 4 [+140, +304] and +338 at 6 [+240, +437]. `rule-v1 --field random`: every game won at every table (24 to 114 games a pairing, cap 0%).

## Every current bot head to head (ratings, 2026-10-16)

`risk:ratings -- greedy rule-v1 gd-defensive gd-continental gd-aggressive gd-stacker --groups 100 --anchor greedy` on `d99b065c`: every pair at 3, 4 and 6 players, each bot alone among copies of the other, 100 rotation groups a table, 39,000 games in 23 minutes on 14 workers (`eval/runs.jsonl`). Win Elo, greedy at 1000, with a 95% interval from a parametric bootstrap of the 90 matchups' counts (games treated as independent, which the rotation makes conservative):

| Bot | Win Elo | 95% | Finishing-order Elo |
|---|---|---|---|
| rule-v1 | 1348 | [1337, 1359] | 1177 |
| GD Stacker | 1103 | [1092, 1114] | 1121 |
| GD Continental | 1073 | [1062, 1083] | 1061 |
| greedy | 1000 | anchor | 1000 |
| GD Aggressive | 996 | [986, 1007] | 1050 |
| GD Defensive | 965 | [955, 975] | 1045 |

**rule-v1 beats every GD Expert persona, at every table, in both mixtures**, and by more than any interval. Alone among copies of a persona it wins 64 to 83% at 3 players (par 33%), 51 to 67% at 4 (par 25%) and 50 to 61% at 6 (par 17%); a lone persona among copies of rule-v1 wins 0.2 to 9%. Its hardest opponents are Continental and Stacker, which hold it to about half its games when it is alone among five of them. The persona order matches the earlier gauntlets against greedy (Stacker +112, Continental +71, Aggressive 0, Defensive −27). Aggressive and greedy are within noise of each other. Caps: 2 games in 39,000.

What the lobby now shows: every seatable bot (`online/seat-bots.ts`) by rank, name and version, with its strength among them as bars over its Elo, the strongest first by default. The Elo lives in `bots/ratings.json`, and a test holds it to exactly the seatable bots that can win. By Elo order: Random Baseline is Recruit, GD Defensive Private, GD Aggressive Corporal, Greedy Sergeant, GD Continental Staff Sergeant, GD Stacker Sergeant First Class, Rule v1 Master Sergeant.

Real games: `risk_games` holds none, so there is no human evidence yet; every judgement below is bot against bot.

## v2 candidate: a worse target than the neighbours (gauntlet, 2026-10-17): even, not crowned

`rule-v2` with one change from v1 (`rule-bot-v2.md`, "Tried and dropped"): each opponent's blow against me weighed by my share of the blows it could land on all its neighbours, instead of `1 / its number of neighbouring players`. `risk:gauntlet -- rule-v2 --base rule-v1 --field rule-v1,gd-defensive,gd-continental,gd-aggressive,gd-stacker`, train seeds, ±30 Elo:

| Pairing | Verdict | Decisive games |
|---|---|---|
| 1 v2 vs 2 v1 (3p) | better | 147 |
| 2 v2 vs 1 v1 (3p) | even | 954 |
| 1 v2 vs 3 v1 (4p) | even | 1,528 |

Stopped there: the crown needs better than the base at every table, so it could no longer be crowned. A lone v2 among v1 copies gains at 3 players, where being the worse target among two neighbours sends both v1s' attacks at each other, but a v2 majority, or a lone v2 at 4, gains nothing a 30-Elo test can see. The point tested: target share as proportional to the opponent's best blow on each neighbour, with v1's weights. Not refuted as an idea: a sharper model of whom an opponent hits (its whole plan, not one blow) is still open.

The first tuning run (`risk:tune`, 10 candidates of 208 games each) was stopped after one generation: a candidate's worst table rested on about 70 games, a standard error near 60 Elo, so its ranking was mostly noise; and weights tuned for v1 would be for the wrong bot if a structural change wins. The rerun uses 416 games a candidate.

## Reading v1's games (`risk:review`, 2026-10-17)

`risk:review` replays any measured game as a record (each turn's standings, every move, a rule bot's plans with their odds and scores). Three readers went through eight games: three 6-player losses of a lone v1 among five GD Continentals, three 4-player losses among three GD Stackers, and v1 against itself at 4 and 6. Their findings agree with each other and with the records:

- **Over-extension is the main loss.** After a good kill or trade v1 sweeps through five to eight territories on one army each and ends the income leader with the longest thin border; the next round each opponent takes back three to eight of them. Biggest stack 2 to 3 for fifteen turns in one game, armies 29 to 9; GD blitzes aimed at v1 44 to 70% of the time against an even 20 to 33%. The losses to Stackers were early collapses, not stalemates.
- **Cause, in the evaluation:** border exposure charges each opponent's single best blow, so thin territories past the first cost nothing; an opponent's neighbour on one army counts as no threat though its income lands there.
- **Planner faults it exposed:** a forked run pictured as one line (all armies on the last target), placed armies beyond a route's needs dropped from the success board (the same board scored differently placing and attacking), and one stack launching two groups beside two different stacks.
- **Also seen, not yet acted on:** kills started and abandoned, leaving a card-rich victim for the next seat; fortifies that pull a continent's only stack off its gate; no plan to strike an enemy stack; single captures admitted at 25%.

These became v2's candidate B (`rule-bot-v2.md`).

**Tuning, second run, stopped:** `risk:tune` with 8 candidates of 416 games took 25 minutes for one generation (the first run's 208-game generations took 4): some weight vectors stall games toward the turn cap. Tuning waits for the structure; a stalling candidate is a health signal the tuner should report.

## v2 candidate B: the sweep threat model (gauntlet, 2026-10-17): better at 6, even at 3 and 4

`rule-v2` with `rule-bot-v2.md` §1 and §4 (each opponent's turn priced as the larger of its best blow and its sweep of sure captures; forked runs, carried armies and launch stacks fixed), aim as v1. Train seeds, ±30 Elo, against v1 only:

| Pairing | Verdict | Win share vs par | Decisive games |
|---|---|---|---|
| 1 v2 vs 2 v1 (3p) | even | (stopped) | 1,757 |
| 1 v2 vs 5 v1 (6p) | **better** | 21.2% [17.9, 24.8] vs 16.7% | 534 |
| 5 v2 vs 1 v1 (6p) | **better** | 88.2% [85.0, 90.8] vs 83.3% | 468 |
| 1 v2 vs 3 v1 (4p) | even | 25.1% vs 25.0% | 1,144 |
| 3 v2 vs 1 v1 (4p) | even | 75.0% vs 75.0% | 1,100 |

Win Elo +19.5 a seat over v1 (finishing order +38.6), all from 6 players, where a thin player faces five sweeps a round. Not crowned: the gate needs every table. Candidate A (target share) was better alone at 3 and even elsewhere, so the two are complementary; candidate C combines them.

## v2 candidate C: the sweep, aimed (gauntlet, 2026-10-17): better at five tables of six

Candidate B plus each opponent's aim at me as my share of what its turn (the larger of best blow and sweep) could do to each of its neighbours, the common-threat overrides kept. Train seeds, ±30 Elo, against v1:

| Pairing | Verdict | Win share vs par | Decisive games |
|---|---|---|---|
| 1 v2 vs 2 v1 (3p) | even | 34.8% [33.2, 36.4] vs 33.3% | 3,386 |
| 2 v2 vs 1 v1 (3p) | **better** | 69.7% vs 66.7% | 1,546 |
| 1 v2 vs 3 v1 (4p) | **better** | 33.5% [28.0, 39.4] vs 25.0% | 263 |
| 3 v2 vs 1 v1 (4p) | **better** | 90.2% vs 75.0% | 132 |
| 1 v2 vs 5 v1 (6p) | **better** | 27.7% [21.8, 34.6] vs 16.7% | 184 |
| 5 v2 vs 1 v1 (6p) | **better** | 92.6% vs 83.3% | 215 |

Win Elo +30.8 a seat (finishing order +36.2). Not crowned: a lone v2 at 3 players leans ahead but isn't decided better. Cap rate 0 to 1.1%, game lengths in line with v1's.

**What decides 3 players, from reading 60 games:** whoever makes the first elimination won 55 of them. And v1's `killChance` returns 0 for a kill whose way in crosses a third player's territory, though its routes take that way: in 285 of v2's turns, 9 kills of 60% or better were invisible, one of them a 98.6% kill another seat took a turn later to win. The same reader measured the sweep model against what v2 actually lost before its next turn: the sweeps summed predict 16.7 armies against 17.2 lost, but the aim weights and `borderWeight` 0.5 cut what reaches the score to about a third of it. Candidate D adds the kill fix; the discount is the next lead.

## v2 crowned: candidate D (gauntlet, 2026-10-17)

Candidate C plus kills reached through a third player (`rule-bot-v2.md` §3). `risk:gauntlet -- rule-v2 --base rule-v1 --field rule-v1,gd-defensive,gd-continental,gd-aggressive,gd-stacker`, ±30 Elo per seat, α = β = 0.05: **better in all 30 pairings on the train seeds and all 30 on holdout.** Against v1:

| Pairing | Train | Holdout |
|---|---|---|
| 1 v2 vs 2 v1 (3p) | 42.2% [36.2, 48.4] vs 33.3% (249 games) | 39.6% [34.9, 44.4] (408) |
| 2 v2 vs 1 v1 (3p) | 73.9% vs 66.7% (333) | 71.1% (669) |
| 1 v2 vs 3 v1 (4p) | 32.3% [27.3, 37.8] vs 25.0% (304) | 35.7% [29.3, 42.6] (196) |
| 3 v2 vs 1 v1 (4p) | 88.8% vs 75.0% (144) | 84.4% (224) |
| 1 v2 vs 5 v1 (6p) | 31.7% [24.3, 40.3] vs 16.7% (126) | 28.9% [22.8, 35.9] (180) |
| 5 v2 vs 1 v1 (6p) | 94.8% vs 83.3% (174) | 93.4% (198) |

Gauntlet win Elo over v1: **+90 train, +71 holdout** (finishing order +71, +60). Against the GD personas a lone v2 wins 47 to 83% at every table (par 17 to 33%), and a lone persona among v2s wins 0 to 3%. Cap rates 0 to 1.8%, games no longer than v1's. The kill fix alone took the one table candidate C left even (3 players, alone) to better.

Before crowning, the three v1 scenarios v2 now plays differently were looked at and rewritten to v2's judgement with the reasons beside them (`rule-bot-v2.md`, "Expert scenarios that changed"): it declines a North America that would make it everyone's target, moves on only what a run needs, and calls covering a shell or keeping its stack a near tie.

## Ratings with v2 (2026-10-17)

`risk:ratings -- --seatable --groups 100` (which now writes `bots/ratings.json` itself): every seatable bot that can win, each alone among each other at 3, 4 and 6 players, 54,600 games in 106 minutes. Win Elo, greedy at 1000, 95% bootstrap intervals:

| Bot | Rank | Win Elo | 95% | Finishing-order Elo |
|---|---|---|---|---|
| Rule v2 | Sergeant Major | 1410 | [1401, 1421] | 1250 |
| Rule v1 | Master Sergeant | 1334 | [1325, 1344] | 1171 |
| GD Stacker | Sergeant First Class | 1097 | [1086, 1106] | 1115 |
| GD Continental | Staff Sergeant | 1069 | [1060, 1078] | 1060 |
| Greedy | Sergeant | 1000 | anchor | 1000 |
| GD Aggressive | Corporal | 997 | [986, 1006] | 1049 |
| GD Defensive | Private | 966 | [957, 975] | 1046 |
| Random | Recruit | none | | |

v2 against v1 head to head: alone among v1s it wins 40.3% at 3 players (par 33.3%), 32.7% at 4 (25%) and 29.6% at 6 (16.7%); a lone v1 among v2s wins 31.0%, 14.5% and 5.2%. The lobby now seats Rule v2 by default. The run's wall time was twice the first ratings' for 40% more games, with the machine half busy on average: a few long games hold up each matchup's batch, a tooling lead (work-stealing across matchups) for later.

## v3 probes (2026-10-17)

- **v2 with `borderWeight` 1** (the sweep charged at full weight, since it measured calibrated): **worse** than v2 alone at 3 players in 171 decisive games; stopped. Fearing the sweep more makes v2 too cautious. The point tested: 1.0, every other weight v2's.
- **Strike enemy stacks** (v3 candidate A: up to four enemy stacks of 5+ armies I am the favourite against offered as capture plans beyond the eight best singles): **even** with v2 at 3 players in both mixtures (1,029 and 1,353 decisive games); stopped, since the crown needs better everywhere. The evaluation already takes such a blow when it pays.
- **Direct ways in and last-territory kills** (v3 candidate B: a way in through a third player's territory costs 30 route-score points, so a direct one wins near ties; a victim's last territory is offered as a kill plan): **better than v2 at five tables of six**, even alone at 3 players (34.1% [31.7, 36.6] vs 33.3%, 1,452 games). Win Elo +23.7 a seat. Kept; not crowned. 6-player games among v2s run about 108 turns, the turtling a reader measured (7 to 16% of turns on 3 or fewer territories with most armies in one stack).
- **The gift priced as a forced trade** (v3 candidate C, on B: a card-rich victim left weakened for the next seat valued as the forced trade it hands over, not the cards' long-run worth): **even** with v2 alone at 3 players (1,584 decisive games); stopped, reverted. The point tested: forced-trade armies plus the kept hand, against v2's `hiddenCards`.
- **8 sampled outcomes a plan** on candidate B (the work knob, +46 for v1 alone at 4 players earlier): **even** with v2 alone at 3 players (975 decisive games); stopped. More work doesn't buy the 3-player lone seat either.
- **What decides 3 players** (a reader over 1,050 lone-v3 and 1,050 all-v2 games, with rollouts): the first elimination wins 86 to 90% of games, its victim the weakest player 95% of the time. The deal and turn order explain about 7% of the outcome; v3's kill timing is within 1 to 2 points of the best rollouts find, and picking the best of its top three plans at every mid-game decision would add little. What v2 leaves open is its opponent model: two v2s gang up on the common threat only mildly (+31% captures on it), and their ally rule leaves the leader the first kill, so a lone seat flagged as the leader went on to win 68 to 78%. v2 prices being the leader as every opponent aiming at it.
- **Tuning v3's preferences at 3 players** (`risk:tune -- --tunable rule-v3 --opponent rule-v2 --players 3 --gens 12 --pop 8 --groups 40`, 25,920 games, 41 minutes): the mean drifted steadily to a shorter income horizon (2.4), a lighter border weight (0.35) and common-threat weight (0.67), and a heavier continent (1.4) and vulnerability weight (1.2): the analysis's finding, from the other side. As a tuned label on candidate B: **better than v2 at 3 players in both mixtures and at 4 in both, even alone at 6** (1,490 games), where B's weights are better. So v3 keys its preferences to the table, as v1's design proposed ("tune per player count"): the tuned ones at 4 players or fewer while three or more are alive, v2's otherwise (candidate D). A two-player endgame keeps v2's: the tuned weights declined expert scenario 8's 66% fight.

## v3, not crowned: candidates D and E, and the night's summary (2026-10-17)

**Summary of the night.** Crowned: **rule-v2**, +71 Elo a seat over rule-v1 on holdout (+90 on train), better in all 30 gauntlet pairings on both seed streams, now the lobby's default (Sergeant Major). Every Elo now (greedy 1000): Rule v2 1410, Rule v1 1334, GD Stacker 1097, GD Continental 1069, Greedy 1000, GD Aggressive 997, GD Defensive 966; Random none. rule-v1 already beat every GD Expert persona at every table; v2 beats them by more (a lone v2 wins 47 to 83% among copies of any persona). **rule-v3** is measured but not crowned: better than v2 at most tables, never at all six at once. Tried and failed: target share alone, the sweep alone (each incomplete, then combined into v2); v2 with border weight 1 (worse); striking enemy stacks, the forced-trade gift, 8 sampled outcomes (each even at 3 players alone); tuned weights everywhere (even at 6 alone), and keyed to small tables (D: even at 3 alone and at 4; E: even at 4 alone). **Most promising next step:** the 3-player lone seat is near a ceiling set by the dice, so the next gain is the opponent model at small tables (two v2s gang up on a leader far less than v2 assumes), measured with more games per candidate than tonight's tuner gave; and, for speed, profiling v2/v3's threat model (the sweep runs again for every neighbour on every plan scored), now that the pool keeps every worker busy.

Candidates D and E, both v3-B (`rule-bot-v3.md` §1 and §2) with the 3-player tuned preferences keyed to tables of 4 or fewer. Train seeds, ±30 Elo, field v2, v1 and the four GD personas:

| Pairing vs v2 | D (v2's preferences in a 2-player endgame) | E (tuned preferences in the endgame too) |
|---|---|---|
| 1 v3 vs 2 v2 (3p) | even, 33.9% [31.4, 36.5] vs 33.3% (1,281 games) | **better** (2,552) |
| 2 v3 vs 1 v2 (3p) | **better**, 70.1% vs 66.7% (1,092) | **better** (708) |
| 1 v3 vs 3 v2 (4p) | even, 25.1% vs 25.0% (1,088) | even (2,015); stopped |
| 3 v3 vs 1 v2 (4p) | even, 75.8% vs 75.0% (2,296) | **better** (1,896) |
| 1 v3 vs 5 v2 (6p) | **better**, 18.9% [17.2, 20.9] vs 16.7% (1,728) | (B's preferences, as D) |
| 5 v3 vs 1 v2 (6p) | **better**, 85.8% vs 83.3% (1,392) | (as D) |

D: win Elo +18.1 over v2, better than v1 and every GD persona at every table. The tuned vector read better at 4 players alone in 407 games and not in 2,015: the tuner's samples (240 games a cell) were too small to trust at the margin, the lesson Monopoly's record already holds. `rule-v3` stays in the registry at candidate D, which passes every expert scenario; it is not seatable. The gauntlet record of candidate B is missing from `eval/runs.jsonl` (9,677 games, 3.4 games a second): the revert of candidate C removed it.

## The method changes: bots and rankings (2026-10-17)

The owner's call, after the night above: there is no crown and no lineage. Monopoly's loop, which this harness copied, carried each version forward from the last crowned one, a habit that suits human developers and constrains Claude for nothing. From here, there are bots and the Elo ladder; each new version may be written from scratch, copied from any bot, combined from several, retuned, or something entirely new, chosen from the ladder, the bots' code and their games. The gauntlet is an instrument for fast per-table verdicts while iterating, not a gate; a version worth seating is seated and the ratings rerun. Under this method v3, +18 Elo over v2 in the gauntlet and worse at no table, is seated and rated.

## Ratings with v3 seated (2026-10-17)

`risk:ratings -- --seatable --groups 100`: 72,800 games, 173 minutes, the pool's CPU at a mean of 32% of the machine (other work shared it for part of the run, but the ratings did not fill the machine on the new pool either: a lead for `sim-speed.md`). Win Elo, greedy at 1000, 95% bootstrap intervals:

| Bot | Rank | Win Elo | 95% | Finishing-order Elo |
|---|---|---|---|---|
| Rule v3 | Warrant Officer | 1445 | [1436, 1453] | 1257 |
| Rule v2 | Sergeant Major | 1406 | [1396, 1414] | 1247 |
| Rule v1 | Master Sergeant | 1329 | [1321, 1337] | 1168 |
| GD Stacker | Sergeant First Class | 1092 | [1083, 1099] | 1111 |
| GD Continental | Staff Sergeant | 1068 | [1059, 1077] | 1061 |
| Greedy | Sergeant | 1000 | anchor | 1000 |
| GD Aggressive | Corporal | 996 | [987, 1004] | 1049 |
| GD Defensive | Private | 965 | [956, 973] | 1047 |
| Random | Recruit | none | | |

v3 against v2 head to head: a lone v3 among v2s wins 36.5% at 3 players (par 33.3%), 26.3% at 4 (25.0%) and 19.8% at 6 (16.7%); a lone v2 among v3s wins 29.4%, 19.8% and 10.9%. The lobby now seats Rule v3 by default.

## v3's opponent model, measured (`risk:opponents`, 2026-10-17)

`risk:opponents` (`eval/opponent-model.ts`) scores an opponent model against the turns it predicts: at the end of every seat's turn, the model's belief about each opponent's coming turn is set beside what that turn did. The aim is scored against the share of the opponent's captures taken from me (squared error; "skill" is the improvement over v1's even split among the opponent's neighbours, negative when worse); the loss is the aim times the priced hit against the armies and income the turn cost me; kills against whether the named victim fell. 400 games a table size, seeds `opp-*`, three fields: every seat v3; v3 among v2s (`rule-v3,rule-v2×5` rotated); and a mixed field (`rule-v3,gd-stacker,rule-v2,gd-continental,rule-v1,gd-aggressive,gd-defensive` rotated).

v3's model:

| Field, table | Aim skill vs even split | Leader: believed / taken | Loss caused / priced (r) | Kills: believed / taken (Brier) | My kill exposure: believed / killed |
|---|---|---|---|---|---|
| v3s, 3p | −0.31 | 100% / 77% | 1.60 (0.65) | 85% / 27% (0.55) | 9.1% / 8.7% |
| v3s, 4p | −0.17 | 100% / 73% | 1.52 (0.64) | 78% / 24% (0.50) | 8.5% / 8.8% |
| v3s, 6p | −0.02 | 100% / 75% | 1.23 (0.50) | 69% / 6% (0.55) | 15.2% / 4.4% |
| v3 among v2s, 3p | −0.30 | 100% / 74% | 1.40 (0.28) | 80% / 18% (0.57) | 10.4% / 7.3% |
| v3 among v2s, 4p | −0.15 | 100% / 69% | 1.54 (0.64) | 76% / 15% (0.55) | 9.2% / 6.9% |
| v3 among v2s, 6p | −0.02 | 100% / 73% | 1.26 (0.52) | 71% / 6% (0.57) | 14.9% / 4.8% |
| mixed, 3p | −0.50 | 100% / 65% | 0.61 (0.11) | 85% / 13% (0.68) | 13.6% / 6.5% |
| mixed, 4p | −0.40 | 100% / 58% | 0.79 (0.52) | 81% / 16% (0.60) | 11.8% / 6.8% |
| mixed, 6p | −0.17 | 100% / 66% | 0.83 (0.43) | 78% / 18% (0.55) | 12.6% / 9.0% |

Read: (1) **kills are the worst belief**: v3 believes an opponent takes a 60%+ kill whether or not it pays; kills it rated near certain were taken 31% of the time at 3 and 4 players among v3s, 9% at 6, and 17 to 25% in the mixed field. (2) **The leader's gang-up is milder than believed**: 58 to 77% of opponents' captures, not all. (3) **The share aim is overconfident**: its reliability slope is about 0.4 to 0.65 (what it rated 8% lost 25% of captures at 3 players, 84% lost 58%), so as a prediction it is worse than an even split at every table but 6 players among rule bots, where it ties. (4) The ally case (25%) is about right (27 to 41%). A model that is calibrated isn't the same as a bot that plays better: v3's preferences were tuned on top of these beliefs.

Candidates scored on the mixed field, all with the aim pulled half way to the even split, leader aim 0.75, ally 0.3, kills at 0.3 of v3's chance (0.5 for my own): without the game's record ("cal") and with it (prior worth 3, 6 or 12 captures, decay 0.5 to 0.85 a turn). The record with a prior of 6 captures and decay 0.7 ("h6", v4's beliefs but for leader 0.7 and kill rate 0.25) scored best:

| Mixed field | Aim skill: v3 / cal / h6 | Leader skill: v3 / h6 | Loss MSE: v3 / h6 / even split | Kill Brier: v3 / cal | My exposure: believed by cal / killed |
|---|---|---|---|---|---|
| 3p | −0.50 / −0.11 / +0.03 | −1.18 / +0.01 | 1048 / 1019 / 1073 | 0.68 / 0.16 | 8.5% / 6.5% |
| 4p | −0.40 / −0.11 / +0.02 | −1.65 / −0.03 | 69.6 / 49.7 / 50.6 | 0.60 / 0.15 | 7.9% / 6.8% |
| 6p | −0.17 / −0.03 / +0.03 | −1.18 / +0.02 | 58.8 / 51.8 / 63.1 | 0.55 / 0.15 | 8.8% / 9.0% |

Whom an opponent hits is barely predictable beyond an even split (the best skill is +0.03 to +0.05), and the game's record is what lifts every candidate from below the even split to just above it, for every opponent bot alike. The calibrated beliefs became v4's (`rule-bot-v4.md`). The v4 model itself (leader 0.7, kill rate 0.25) has not yet been scored as a whole by the tool; its numbers should land between cal's and h6's.

## v4 first gauntlet, stopped early (2026-10-17)

`risk:gauntlet -- rule-v4 --base rule-v3 --field rule-v3`, train seeds, ±30 Elo. v4 here is v3's preferences with the beliefs above, untuned. **Stopped early when the work was paused; not a verdict except where noted.** Only one pairing resolved before the stop:

| Pairing | Result | Decisive games |
|---|---|---|
| 1 v4 vs 2 v3 (3p) | **worse** (SPRT decided: LLR improve −6.4, regress +3.0) | 510 |
| the other five | unresolved when stopped | — |

So calibrated beliefs on v3's preferences lose at the 3-player lone seat, the table v3's preferences were tuned for on v3's own beliefs. The likeliest reading: v3's small-table preferences (vulnerability 1.18, border 0.35, common-threat 0.67) compensate for v3's beliefs, and moving the beliefs under them double-counts; the preferences need retuning on the new beliefs before the beliefs can be judged. Not yet tested.

## v4's beliefs scored as a whole (`risk:opponents`, 2026-10-17)

`risk:opponents -- --games 400 --models v3,v4` on the three fields above (seeds `opp-*`, 10 workers; 389, 217 and 204 s). v3's model against v4's, the same turns:

| Field, table | Aim skill v3 / v4 | Leader: v4 believed / taken | Loss caused ÷ priced, v3 / v4 | Loss MSE v3 / v4 / even split | Kill Brier v3 / v4 | My kill exposure: v3 / v4 believed, killed |
|---|---|---|---|---|---|---|
| mixed, 3p | −0.50 / +0.03 | 63% / 65% | 0.61 / 0.74 | 1048 / 1018 / 1073 | 0.68 / 0.16 | 13.6% / 8.6%, 6.5% |
| mixed, 4p | −0.40 / +0.03 | 59% / 57% | 0.79 / 1.06 | 69.6 / 49.2 / 50.6 | 0.60 / 0.15 | 11.8% / 8.0%, 6.8% |
| mixed, 6p | −0.17 / +0.03 | 63% / 62% | 0.83 / 1.05 | 58.8 / 51.7 / 63.1 | 0.55 / 0.15 | 12.6% / 9.1%, 9.0% |
| v3s, 3p | −0.31 / +0.03 | 69% / 76% | 1.60 / 1.99 | 105 / 117 / 113 | 0.55 / 0.19 | 9.1% / 5.5%, 8.7% |
| v3s, 4p | −0.17 / +0.04 | 64% / 69% | 1.52 / 1.88 | 61.1 / 65.4 / 64.6 | 0.50 / 0.18 | 8.5% / 5.7%, 8.8% |
| v3s, 6p | −0.02 / +0.05 | 68% / 70% | 1.23 / 1.41 | 34.1 / 33.0 / 32.6 | 0.55 / 0.09 | 15.2% / 11.1%, 4.4% |
| v3 among v2s, 3p | −0.30 / +0.03 | 66% / 73% | 1.40 / 1.72 | 212 / 171 / 133 | 0.57 / 0.15 | 10.4% / 6.3%, 7.3% |
| v3 among v2s, 4p | −0.15 / +0.04 | 63% / 66% | 1.54 / 1.85 | 52.0 / 55.6 / 55.0 | 0.55 / 0.14 | 9.2% / 6.2%, 6.9% |
| v3 among v2s, 6p | −0.02 / +0.05 | 66% / 67% | 1.26 / 1.46 | 31.1 / 30.9 / 30.7 | 0.57 / 0.09 | 14.9% / 11.3%, 4.8% |

Read: the aim, the leader's gang-up and opponents' kills are better calibrated by v4 at every table of every field. Two beliefs are not, and both point the same way among the rule bots, the fields the gauntlet plays:

- **The loss is underpriced, and v4 underprices it more.** Among rule bots an opponent's turn costs me 1.2 to 1.6 times what v3 prices it at; v3's too-confident aim (every opponent at the leader) partly made up for a hit that is too small. v4 fixes the aim, not the hit, so its priced loss falls further below the truth (1.7 to 2.0 at small tables), and its loss MSE gets worse there, not better. In the mixed field, where GD's personas hit softly, v4's loss is about right (1.05).
- **My own kill exposure, at small tables among rule bots.** `myKillRate` 0.5 was measured on the mixed field; rule bots kill me nearer the rate v3 believed. Among v3s at 3 players v3 believed 9.1% and I was killed 8.7%; v4 believes 5.5%.

So among rule bots v4 believes its border and its survival are safer than they are, which would make it bolder exactly where it lost. The ablations test which belief does it.

## v4's beliefs one at a time (gauntlet, 2026-10-17)

Each label is v4 with one belief and v3's model otherwise (`BELIEF_VARIANTS` in `rule-v4/params.ts`), against v3 alone at 3 players, the table v4 lost: `risk:gauntlet -- rule-v4-<belief> --base rule-v3 --field rule-v3 --players 3 --formats one-in`, train seeds, ±30 Elo, 10 workers.

| Belief alone | Result | Win share vs par 33.3% | Win Elo a seat | Decisive games |
|---|---|---|---|---|
| kills (rate 0.25, mine 0.5) | even | 33.7% [30.9, 36.6] | +2.9 | 1,083 |
| leader (0.7, ally 0.3) | even | 33.3% [30.4, 36.4] | +0.0 | 918 |
| aim pulled half way to even | **worse** | 30.1% [27.6, 32.7] | −26.1 | 1,260 |
| the game's record (prior 6, decay 0.7) | even | 33.1% [30.4, 35.9] | −1.9 | 1,098 |

The aim's pull toward an even split is the belief that loses, by about as much as v4 as a whole did. It is the best-calibrated change of the four as a prediction of whom an opponent hits, and the worst for play: v3's lean, too confident as a prediction, puts defence where the big blows land, and the blows are underpriced among rule bots (caused ÷ priced 1.4 to 2.0 above), so the lean was doing the hit's work. The other three cost nothing on v3's preferences, and none pays alone either. Next: v4 with every belief but this one (`rule-v4-no-aim`), on all six tables.

## v4 without the aim's pull (gauntlet, 2026-10-17)

`risk:gauntlet -- rule-v4-no-aim --base rule-v3 --field rule-v3`, train seeds, ±30 Elo, 10 workers: 13,592 games in 95 minutes, almost all of it the 6-player tables (122 to 183 turns a game, against 23 to 35 at 3 and 4).

| Pairing vs v3 | Result | Win share vs par | Decisive games |
|---|---|---|---|
| 1 no-aim vs 2 v3 (3p) | even | 33.3% [30.4, 36.4] vs 33.3% | 921 |
| 2 no-aim vs 1 v3 (3p) | even | 67.6% [65.4, 69.7] vs 66.7% | 1,827 |
| 1 no-aim vs 3 v3 (4p) | **worse** | 23.0% [21.7, 24.3] vs 25.0% | 3,992 |
| 3 no-aim vs 1 v3 (4p) | even | 74.6% [72.2, 76.9] vs 75.0% | 1,352 |
| 1 no-aim vs 5 v3 (6p) | even | 17.0% [15.3, 18.7] vs 16.7% | 1,860 |
| 5 no-aim vs 1 v3 (6p) | **better** | 85.0% [83.7, 86.2] vs 83.3% | 3,570 |

Win Elo +1.3 a seat, finishing-order Elo +19.2. Dropping the aim's pull mends the 3-player lone seat, but a lone seat at 4 players still loses, about −28 Elo, on the small-table preferences tuned for v3's beliefs at 3 players only. Five of them among one v3 at 6 players win more, but those games run long (183 turns, 7.5% to the cap) and the cap discards the stalemates. Next: retune the small-table preferences at 3 and 4 players on v4's beliefs, with and without the aim's pull (`rule-v4-small`, `rule-v4-no-aim-small`, newly tunable: the plan's `--tunable rule-v4` moves only the preferences above 4 players, which 3-player games never read).

## v4's small-table preferences retuned (`risk:tune`, 2026-10-18)

`risk:tune -- --tunable rule-v4-small --opponent rule-v3 --players 3,4 --gens 10 --pop 8 --groups 40` (seeds `tune4a`), and the same for `rule-v4-no-aim-small` (`tune4b`), run side by side on 5 workers each: 50,400 games apiece, about 130 minutes each with the machine shared (other sessions held it at 92%). 3 and 4 players together, since the small-table preferences play both and v4-no-aim lost the lone seat at 4. The fitness is the worst of the four cells; each cell is 240 games a candidate, too few to trust the generation means (they swing ±50), so only the drift of the mean is read.

| Preference | v3's small table | Tuned on v4's beliefs | Tuned on v4 without the aim's pull |
|---|---|---|---|
| incomeHorizon | 2.44 | 2.06 | 2.63 |
| myCardWeight | 0.93 | 1.49 | 1.03 |
| myContinentWeight | 1.40 | 2.08 | 0.86 |
| killCommitMargin | −0.019 | −0.014 | −0.030 |
| vulnerabilityWeight | 1.18 | **2.25** | **2.69** |
| borderWeight | 0.35 | **1.12** | **0.91** |
| idleWeight | 0.25 | 0 | 0 |
| opportunityWeight | 0.57 | 0 | 0.44 |
| commonThreatWeight | 0.67 | **0.01** | **0.21** |
| leadPenaltyWeight | 0.10 | 0 | 0 |

Both runs moved the same three weights, steadily, from generation 1: fear of my own elimination up about two times, border losses up about three times, the common threat down to nearly nothing. That is the calibration finding (above) from the other side: v4's beliefs price my border losses and my kill exposure lower than v3's, and lower than the rule bots inflict, so the preferences that weigh them rise to put the worth back; and with the leader's gang-up and the record believed, the separate common-threat weight has little left to do.

## v4 on its retuned preferences (gauntlet, 2026-10-18)

The two tuned vectors above as labels, against v3 alone at 3 and 4 players, train seeds, ±30 Elo, 10 workers (about 2.5 minutes each):

| Pairing vs v3 | Tuned on v4's beliefs | Tuned on v4 without the aim's pull |
|---|---|---|
| 1 cand vs 2 v3 (3p) | even, 33.8% [31.2, 36.6] (1,197) | even, 34.2% [32.0, 36.6] (1,662) |
| 2 cand vs 1 v3 (3p) | **better**, 69.7% vs 66.7% (1,545) | **better**, 71.5% (582) |
| 1 cand vs 3 v3 (4p) | **better**, 34.5% [28.6, 41.0] vs 25.0% (220) | **better**, 31.3% (400) |
| 3 cand vs 1 v3 (4p) | **better**, 81.1% vs 75.0% (396) | **better**, 81.3% (364) |
| Win Elo a seat | +26.0 | +27.1 |

Indistinguishable. v4 takes the first: the calibrated beliefs whole, with no exception for the aim, and its retuned small-table preferences (`V4_PARAMS.smallTable`). Above 4 players it keeps v3's preferences, untuned on the new beliefs. The belief variants were dropped from the registry once measured.

**The full gauntlet against v3, train seeds** (`risk:gauntlet -- rule-v4 --base rule-v3 --field rule-v3`, 9,202 games in 42 minutes, 10 workers):

| Pairing vs v3 | Result | Win share vs par | Decisive games |
|---|---|---|---|
| 1 v4 vs 2 v3 (3p) | even | 34.3% [32.1, 36.6] vs 33.3% | 1,704 |
| 2 v4 vs 1 v3 (3p) | even | 67.9% [66.1, 69.7] vs 66.7% | 2,610 |
| 1 v4 vs 3 v3 (4p) | **better** | 33.3% [27.9, 39.2] vs 25.0% | 264 |
| 3 v4 vs 1 v3 (4p) | **better** | 80.5% [76.6, 83.9] vs 75.0% | 456 |
| 1 v4 vs 5 v3 (6p) | even | 17.1% [15.6, 18.7] vs 16.7% | 2,154 |
| 5 v4 vs 1 v3 (6p) | even | 83.5% [81.6, 85.1] vs 83.3% | 1,860 |

Win Elo +10.4 a seat, finishing-order Elo +24.0; better at two tables and worse at none. Two v4s among one v3 at 3 players, **better** in the 1,545 games of the label run, played on to even here (67.9% at 2,610): an edge near the margin, read both ways by where each SPRT stopped. The 4-player edge is large (+8 points of win share at the lone seat) and decided quickly.

**Confirmed on the holdout seeds** (`--prefix holdout`, 7,128 games in 84 minutes, 5 workers, sharing the machine with the ratings run):

| Pairing vs v3 | Result | Win share vs par | Decisive games |
|---|---|---|---|
| 1 v4 vs 2 v3 (3p) | even | 34.4% [32.2, 36.5] vs 33.3% | 1,874 |
| 2 v4 vs 1 v3 (3p) | **better** | 69.9% [67.3, 72.4] vs 66.7% | 1,251 |
| 1 v4 vs 3 v3 (4p) | **better** | 33.2% [27.8, 39.0] vs 25.0% | 268 |
| 3 v4 vs 1 v3 (4p) | **better** | 85.3% [79.8, 89.5] vs 75.0% | 204 |
| 1 v4 vs 5 v3 (6p) | even | 16.8% [15.0, 18.7] vs 16.7% | 1,583 |
| 5 v4 vs 1 v3 (6p) | even | 83.1% [81.2, 84.8] vs 83.3% | 1,731 |

Win Elo +11.3 a seat, finishing-order Elo +27.3; better at three tables, worse at none. The gate printed REJECT ("improves vs base: no"), as it did on train: its improvement test asks for **better** at every table against the base, and v4 is even at 3 of 6 (4 of 6 on train). Against the overnight plan's bar (better somewhere, worse nowhere, on both seed sets), v4 passes, so it is seated, and its standing is left to the ladder. Above 4 players it gains nothing yet: its preferences there are v3's, untuned on the beliefs.

## The ladder with v4, and v4 not seated (`risk:ratings`, 2026-10-18)

`risk:ratings -- --seatable --groups 100` with v4 on the roster: 48 new matchups played (20,800 games, 110 minutes, 5 workers), 168 from the cache.

| Bot | Win Elo (greedy = 1000) | Finishing-order Elo |
|---|---|---|
| rule-v3 | 1433.7 | 1255.8 |
| rule-v4 | 1428.8 | 1285.7 |
| rule-v2 | 1398.7 | 1246.2 |
| rule-v1 | 1314.3 | 1165.1 |
| gd-stacker | 1087.3 | 1108.6 |
| gd-continental | 1067.9 | 1061.2 |
| greedy | 1000 | 1000 |
| gd-aggressive | 996.5 | 1049.0 |
| gd-defensive | 966.6 | 1048.1 |

v4 beats v3 head to head at 3 and 4 players here too, but gives far more back against the weak bots at those tables, both as the field and as the lone seat (300 to 400 games a cell):

| Cell | v3 | v4 |
|---|---|---|
| 3p gd-defensive alone among X | 0.7% | 8.0% |
| 3p gd-stacker alone among X | 0.7% | 8.7% |
| 4p gd-stacker alone among X | 0.5% | 2.5% |
| 3p X alone among gd-defensive | 82.0% | 67.3% |
| 3p X alone among greedy | 68.3% | 58.7% |

At 6 players, where v4 plays v3's preferences, the two match. **Which part costs it**: a ladder at 3 and 4 players of v3, v4, v4's beliefs on v3's small-table preferences ("v4b", `rule-v4-small~{v3's smallTable.prefs}`), gd-defensive, gd-stacker and greedy (7,000 new games, 5 minutes, 8 workers): v4b crushes the weak bots as v3 does (gd-defensive alone among it 1.7%, it alone among gd-defensive 86.3%; gd-stacker alone 1.0%), and is even with v3 head to head (v4b alone among v3: 32.7% at 3p, 19.0% at 4p). So the beliefs are sound, and the loss is the retuned preferences: tuned against v3 alone, their doubled fear of elimination and tripled border weight buy caution that pays against v3 and costs against bots v4 should run over. Win Elo there: v4 +310.9, v3 +303.5, v4b +300.5 (greedy = 0).

**Decision: v4 is not seated.** The gauntlet's field was v3 alone, so it could not see this; the ladder did, and a seated bot is frozen. `ratings.json` stays as it was with v3 seated, v4's fingerprint is dropped, and the roster keeps its split from the ranking (`online/seat-roster.ts`) for the next bot seated. The night's new ratings-cache entries (v4's matchups and the diagnostic's) are not committed: any change to v4 replays them.

## v4 rebuilt: v3 on the beliefs, with G4FR's fixes (built, not yet measured, 2026-10-18)

The name rule-v4 now belongs to a new build (`rule-bot-v4.md`); the version above, with its small-table preferences tuned against v3 alone, is in git history and never seated. The new v4 is v3's planner, evaluation and preferences at both table sizes, on the measured beliefs above, with four faults fixed that the human game G4FR showed (a person beat v3, another person, gd-stacker and gd-continental). Its seed and move log are a committed fixture, `bots/rule-v4/g4fr.json`; replayed on `ENGINE`, it reaches the game's recorded end state, and v3 makes every one of its 255 recorded moves.

Read on G4FR's own positions (`bots/rule-v4/g4fr.test.ts`):

| Position | v3 | v4 |
|---|---|---|
| Turn 89's end: the person's sweep through v3's 17 territories | 8 captures (capped) | 14 (he took 13 of 14 two turns later) |
| Turn 26, after two of gd-stacker's last four territories fell: the kill on it | 0 (the 0.8 screen) | 0.37 |
| Turn 89, decision 873: the plan ranked first | the rest of Europe at no chance, on its failure board's free damage | a capture at 100%; the Europe plan below holding |
| Turn 62: moving the stack of 22 from Central America to Alaska | moves all | moves all; every smaller move scores lower, so partial moves were left out |

A dozen positions of turn 89, each v3's, asked of v4: it makes most of v3's captures, a sign the border weight (a preference, 0.35 to 0.5) still counts an expected loss at a fraction of itself. The retune sets it.

Speed: a v4 decision costs about 1.2 times a v3 decision (60 games at 3, 4 and 6 players, single-threaded), from the kills v3's screen called impossible. The first screen, every stack near the victim pooled into one `pathRun`, cost about 1.8 times v3: its runs pushed out the ones the planner remembers, and over half the kills it let through the capture planner then rated under 1%. Each group's best launch stack, walked forward on expected survivors, and no memo of kill chances (18% repeated, and building the key cost more than it saved) brought it to 1.2.

Smoke run, not a measurement (60 games, seeds `smoke-*`): v4 alone among v3s won 4 of 12 at 3 players, 2 of 12 at 4 and 2 of 6 at 6; alone among gd-defensive, 11 of 12 at 3 and 8 of 12 at 4. No errors, nothing capped.

`risk:tune` now takes a field of opponents and a baseline (`--opponent a,b,c --baseline rule-v3`): each table, an opponent at a size, is read as the candidate's edge over what the baseline scores there on the same seeds, and the fitness is the worst. Without the baseline the worst table would always be the strongest opponent's, and a tune against v3 plus weak bots would still be a tune against v3. `risk:opponents` scores v3's model as v3's evaluation holds it (`eval/v3-opponent-model.ts`, held to v3's breakdown by a test) beside v4's.

Queued, in order: `risk:opponents` (v3's model against v4's, on the three fields), the small table retuned against rule-v3, gd-defensive, gd-stacker and greedy with v3 as baseline, the gauntlet against v3 on train and holdout seeds with the weak bots in the field, and the ladder.

## v5: v4 with the winner's sweep (built, not yet measured, 2026-10-18)

v5 (`rule-bot-v5.md`, `bots/rule-v5/`) is v4 whole, its beliefs, fixes and preferences, with one new kind of plan from how the person who won G4FR attacked: every army to place on one stack, which takes the thinnest territory beside it that it is sure of, moves all but one in, and goes on while the next capture is sure. Offered from the two stacks whose sweeps run longest, whole and by its first half, scored by v4's evaluation. v5 adds no setting, so v4's retune is v5's. Registered, not seated.

Played over v3's own turns of G4FR from v3's positions, on the game's dice: at turn 62 v5 puts its 8 armies on one stack and takes 15 territories (v3: 8 armies onto Central America, 1 capture), at turn 71 8 (v3: 2); at turn 89 it ends on 13 territories with a stack of 8 (v3: 17 and 4; v4 alone: 13 and 9). It doesn't bring its stack home, and at turn 56 a sweep left it thinner than v3 (20 territories, biggest stack 3, against 14 and 7).

**Tried and dropped: next turn's sweep as part of a stack's worth.** The first build also counted, beside v4's next-turn kill and at the same opportunity weight, the sweep a stack could make next turn, believed as the opponent model believes an opponent's sweep against me. It made v5 keep its stack and bring it home on G4FR's positions, and lost badly. Screens, v5 alone among two copies at 3 players, train seeds, ±30 Elo, each decided by its SPRT:

| v5 built with | vs | Result | Win share vs par 33.3% | Win Elo a seat | Decisive games |
|---|---|---|---|---|---|
| sweep + next turn's sweep (priced at its victim's cost) | rule-v3 | worse | 22.2% [16.9, 28.7] | −97 | 189 |
| sweep + next turn's sweep (priced at its victim's cost) | rule-v4 | worse | 24.5% [19.6, 30.2] | −75 | 249 |
| sweep + next turn's sweep (priced at its victim's cost) | gd-defensive | better | 93.3% [78.7, 98.2] | | 30 |
| next turn's sweep alone | rule-v3 | worse | 14.1% [8.6, 22.3] | −193 | 99 |
| sweep + next turn's sweep (priced at my own income gain) | rule-v3 | worse | 9.9% [5.1, 18.3] | −264 | 81 |
| next turn's sweep alone (priced at my own income gain) | rule-v3 | worse | 6.9% [3.0, 15.2] | −330 | 72 |
| **sweep alone, v5 as built** | rule-v3 | better | 40.3% [35.2, 45.5] | +52 | 345 |
| **sweep alone, v5 as built** | rule-v4 | better | 41.0% [35.7, 46.6] | +57 | 312 |
| **sweep alone, v5 as built** | gd-defensive | better | 100% [87.5, 100] | | 27 |

Screens rule out big losers and nothing more: the built v5's three are not losers, and its "better" verdicts at 3 players, a few hundred games each, are where the night starts, not what it confirms. The run log keeps the three screens of the built v5; the variants' screens ran builds that no longer exist, so their records were dropped.

Smoke run of the built v5, not a measurement (54 games, seeds `smoke-*`, a 400-turn cap): alone among v3s it won 5 of 12 at 3 players, 7 of 12 at 4 and 1 of 6 at 6, one 6-player game reaching the cap; alone among gd-defensive, 12 of 12 at 3 and 11 of 12 at 4. No errors.

Speed: a v5 decision costs 1.30, 1.23 and 1.43 times a v4 decision at 3, 4 and 6 players, both asked the same decisions of v4's games among v3s. Nearly all of it is scoring the sweeps' success boards. Measured the same way (each alone among v3s on the same seeds), v4 costs 2.6, 2.1 and 1.4 times v3, not the 1.2 above.

Queued, after v4's night: the gauntlet against rule-v3, rule-v4, gd-defensive, gd-stacker and greedy on train seeds, then holdout if train passes, then the ladder with v4 and v5 beside every seatable bot (`rule-bot-v5.md`, "Measuring it", with the seating bar written in advance).

## v4's beliefs checked before the retune (2026-10-18)

`risk:opponents` scored v3's model against the rebuilt v4's on the three queued fields, 400 games a table size each (3,600 games, about 15 minutes, 10 workers, no errors). The tool publishes nothing and writes no run-log record, so the figures live here.

| Field, table | Aim skill v3 / v4 | Kill Brier v3 / v4 | Hit caused/priced v3 / v4 | My kill exposure, believed v4 / actual |
|---|---|---|---|---|
| Mixed, 3p | −0.50 / +0.04 | 0.68 / 0.06 | 0.61 / 0.53 | 10.1% / 6.5% |
| Mixed, 4p | −0.40 / +0.04 | 0.60 / 0.05 | 0.79 / 0.72 | 10.4% / 6.8% |
| Mixed, 6p | −0.17 / +0.04 | 0.55 / 0.05 | 0.83 / 0.70 | 12.3% / 9.0% |
| v3 only, 3p | −0.31 / +0.03 | 0.55 / 0.08 | 1.60 / 1.09 | 7.5% / 8.7% |
| v3 only, 4p | −0.17 / +0.05 | 0.50 / 0.06 | 1.52 / 1.02 | 8.2% / 8.8% |
| v3 only, 6p | −0.02 / +0.06 | 0.55 / 0.04 | 1.23 / 0.55 | 14.2% / 4.4% |
| v3 + five v2, 3p | −0.30 / +0.04 | 0.57 / 0.07 | 1.40 / 0.78 | 8.0% / 7.3% |
| v3 + five v2, 4p | −0.15 / +0.06 | 0.55 / 0.04 | 1.54 / 0.94 | 8.7% / 6.9% |
| v3 + five v2, 6p | −0.02 / +0.06 | 0.57 / 0.04 | 1.26 / 0.60 | 15.0% / 4.8% |

v4's aim beats an even split at every table, its kill predictions are an order of magnitude better than v3's, and among rule bots at 3 and 4 players it now prices the hit about right (0.94 to 1.09 of what lands; v3 priced 1.4 to 1.6 too little). Where it errs it errs cautious: it believes kills more often than bots take them, and against weak bots and at 6 players it overprices the hit and its own death (14 to 15% believed at 6 players, under 5% taken). The one cell the other way is my own death among v3s at 3 players, 7.5% believed against 8.7%, near enough. **Decision: no belief is reset before the retune.** Caution is the side to err on, since people take kills bots don't. At 6 players, where v4 plays v3's preferences, the overpricing is the likely cost to watch in the gauntlet.

## The small table retuned against a mixed field (2026-10-19)

`risk:tune -- --tunable rule-v4-small --opponent rule-v3,gd-defensive,gd-stacker,greedy --baseline rule-v3 --players 3,4 --gens 10 --pop 8 --groups 40 --prefix tune-v4mix --workers 15`: 218,400 games, 3.7 hours. The fitness, the worst table's edge over what v3 scores there, rose from −81 at the first generation to −13 at the tenth, never clearly above zero: against this field the search found no vector that beats v3's own margin at every table, only one that comes close. Three preferences ended on their bounds (`incomeHorizon` 1.5, `opportunityWeight` 0, `killCommitMargin` −0.03), so the search wanted to go further than it may. The mean moved most in `commonThreatWeight` (up to 1.93), `myContinentWeight` (1.83) and `vulnerabilityWeight` (down to 0.43): less fear of my own death, more weight on a common threat and on my continents, the reverse of the old v4's tune against v3 alone.

The tune proposes; a gauntlet of the tuned vector against v4 on v3's preferences decided (`--base rule-v4 --field rule-v4,rule-v3,gd-defensive --players 3,4 --prefix tunecheck`, 8,820 games, 9 minutes):

| Opponent | 3p one-in | 3p one-out | 4p one-in | 4p one-out |
|---|---|---|---|---|
| rule-v4 (v3's preferences) | even | better | better | better |
| rule-v3 | better | better | better | better |
| gd-defensive | better | better | better | better |

Win Elo (rule-v4 = 0): tuned +25.9, rule-v3 −10.1. The gauntlet's own gate printed REJECT (one table even), but by the seating bar (better somewhere, worse nowhere) it wins, and the weak bot is beaten everywhere, so the old v4's give-back isn't there. **Decision: the tuned vector is v4's small-table preferences**, and so v5's, which reads v4's.
## v4 and v5 gauntleted against v3 and the weak bots (2026-10-19)

Both on the retuned small-table preferences above, 15 workers. Verdicts against v3 at each table (±30 Elo, α = β = 0.05):

| Table | v4 train | v4 holdout | v5 train |
|---|---|---|---|
| 3p one-in | even (33.1%) | better (36.2%) | better (42.2%) |
| 3p one-out | better (69.6%) | better (69.7%) | better (76.7%) |
| 4p one-in | better (32.5%) | better (31.0%) | better (34.9%) |
| 4p one-out | better (78.9%) | better (78.9%) | better (82.2%) |
| 6p one-in | better (27.5%) | better (27.1%) | better (24.4%) |
| 6p one-out | better (92.3%) | better (94.4%) | better (88.2%) |

v5 against v4: better at both 3- and 4-player tables in both mixtures, even at 6 players (16.7% and 83.1%, on par to the decimal). Every pairing against gd-defensive, gd-stacker and greedy, at every table and in both mixtures, was better for both bots, so neither gives back to the weak bots what the old v4 did.

| Run | Games | Wall time | Win Elo (v3 = 0) | Finishing-order Elo (v3 = 0) | Gate |
|---|---|---|---|---|---|
| v4, train | 13,980 | 35 min | v4 +36.7 | v4 +24.4 | REJECT (one table even) |
| v4, holdout | 14,580 | 32 min | v4 +39.8 | v4 +22.0 | ACCEPT |
| v5, train | 15,520 | 3.4 h | v5 +88.5, v4 +74.9 | v4 +51.2, v5 +33.3 | ACCEPT |

v5's run took six times v4's: its 6-player pairings against v4 needed over 1,400 decisive games each to call even, and over 850 games of one of them hit the turn cap. v5 ranks above v4 by who wins but below it by finishing order, the mark of an all-or-nothing style: it wins more and, when it loses, goes out earlier. The two runs' Elo for v4 differ (+37 against +75) because each fit is anchored by its own field's games; only the ladder puts them on one scale.

**By the seating bar** (better than v3 at some table, worse at none, and no lower than v3 on the ladder), v4 passes the gauntlet half on both seed sets. v5 passes it on train, and beats v4 where the two differ. Not yet run: v5's holdout gauntlet (started and stopped part way, so it left no record) and the ladder, which decides the bar's last part for both and whether v5 is worth keeping over v4.

## v5's holdout gauntlet, paused at 28 of 30 pairings (2026-10-19)

The same gauntlet as v5's train run, on `holdout:*` seeds, 15 workers, stopped after 1 h 50 min so the owner could use the laptop. A stopped run writes no run-log record and no Elo fit, so what stands is each finished pairing's SPRT verdict, read off the console:

| Opponent | 3p one-in | 3p one-out | 4p one-in | 4p one-out | 6p one-in | 6p one-out |
|---|---|---|---|---|---|---|
| rule-v3 | better | better | better | better | better | better |
| rule-v4 | better | better | better | better | not finished | not finished |
| gd-defensive, gd-stacker, greedy | better | better | better | better | better | better |

Every finished pairing agrees with the train run. The two left are the ones that took most of the train run's time and came out even there. They can be played alone, without replaying the other 28:

    npm run risk:gauntlet -- rule-v5 --base rule-v3 --field rule-v4 --players 6 --prefix holdout --workers 15

v5 passes the seating bar's gauntlet half on holdout seeds against v3 already; the two pairings left only say whether v5 is worse than v4 at 6 players on unseen deals.

## The ladder with v4 and v5 (2026-10-19)

`risk:ratings -- rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100`, the first run on GitHub Actions: 117,000 games over 60 machines in one round, 1 h 40 min from start to report, sharing the account's twenty runners with a gauntlet.

| Bot | Win Elo (greedy = 0) | Finishing-order Elo (greedy = 0) |
|---|---|---|
| rule-v5 | +538.0 | +284.5 |
| rule-v4 | +499.5 | +292.7 |
| rule-v3 | +440.7 | +245.3 |
| rule-v2 | +405.2 | +234.5 |
| rule-v1 | +322.1 | +159.5 |
| gd-stacker | +90.3 | +102.7 |
| gd-continental | +69.3 | +59.3 |
| gd-aggressive | +2.7 | +51.4 |
| greedy | 0 | 0 |
| gd-defensive | −33.3 | +50.4 |

Both new bots sit above v3, by about 60 and 100 Elo of wins, and above it by finishing order too. Neither gives anything back to the weak bots: each wins at least 65% alone among any of GD's personas or greedy at every table, more than v3 does in nearly every matchup, and the weak bots win at most 5% alone among either of them. That was what sank the old v4.

v5 against v4 head to head agrees with the gauntlets: v5 alone among v4s wins 40.7% at 3 players (par 33.3%), 29.5% at 4 (par 25%) and 18.9% at 6 (par 16.7%, inside its interval), and v4 alone among v5s wins 29.0%, 17.0% and 17.1%. Better at 3 and 4 players, even at 6. By finishing order the two are level (v4 +8), the same all-or-nothing mark as in the train gauntlet: v5 wins more and, losing, goes out sooner.

6-player games between strong bots stall: 225 of 600 games of v5 alone among v4s hit the 600-turn cap, and so did 311 of 600 of gd-defensive alone among v4s. A capped game counts for nothing in a gauntlet's SPRT, so these are the costliest games we play for the least information.

**By the seating bar,** v4 clears it outright: better than v3 at some table and worse at none on train and holdout seeds, and above v3 on the ladder. v5 clears it on train seeds and on the ladder, beats v4 on the ladder, and has beaten v4 or matched it in every pairing so far; its two 6-player holdout pairings against v4 are still playing.

## v5's holdout gauntlet, finished (2026-10-19)

The two pairings left from the paused run, `risk:gauntlet -- rule-v5 --base rule-v4 --field rule-v4 --players 6 --prefix holdout`, played twice at once: on the laptop (15 workers, Node 24) and on GitHub Actions (100 shards over 5 rounds, Node 22).

| Pairing (6p, holdout) | Laptop | GitHub Actions |
|---|---|---|
| 1 v5 among 5 v4s | better: 20.2% vs par 16.7%, 1,362 games, cap 38% | better: 18.3% vs par 16.7%, 6,852 games, cap 37% |
| 5 v5s against 1 v4 | even: 83.5% vs par 83.3%, 2,550 games, cap 28% | even: 83.1% vs par 83.3%, 2,322 games, cap 28% |
| Wall time | 2 h | 2 h 50 min, an hour of it queued behind the ladder |

Both agree, and with the 28 pairings from the paused run, v5's holdout gauntlet is complete: better than v3 at every table, better than v4 or even with it everywhere, worse nowhere, and better than every weak bot. With the ladder, v5 clears all three rules of its seating bar (`rule-bot-v5.md`).

**The two runs played different games.** The test stops at the same game whatever the batching, so identical game streams would have stopped both at the same point; these stopped at 1,362 and 6,852 games. Replaying one of GitHub's shards (60 games) on the laptop: under Node 24, 59 of 60 games came out different, with the same seeds and seats; replayed twice under Node 24 they matched each other exactly; under Node 22, the version `.node-version` pins and the runners use, all 60 matched GitHub's. A game is a pure function of its seed and the Node version: something the bots compute in floating point comes out a hair differently between the two versions' engines, and one changed decision sends the game elsewhere. The laptop's default Node is 24, so every laptop measurement in this log played Node 24's games. Neither stream is wrong, and each verdict stands on its own, but runs on different Node versions don't replay each other, and the ratings cache mixes them unless its key says which.

## How 6-player games end (2026-10-19)

Read from the 12,000 games of v5's last two holdout pairings against v4 on GitHub Actions (every game's turns and winner are kept), to see whether the 600-turn cap wastes time. 34% of the games reached the cap, and they took 56% of the turns played and 49% of the decisions.

- **Games end at a steady rate.** Of the games still going at any point from turn 150 to 600, about 8% end within the next 50 turns, the same at turn 550 as at turn 200. There is no turn past which a game has stalled for good: decisive games have a long, flat tail (median 211 turns, 9% past turn 500).
- **So a lower cap saves almost nothing.** Decisive games per 1,000 turns played: 1.84 with a cap of 200, 1.83 at 300, 1.81 at 400, 1.80 at 500, 1.78 at 600. A lower cap ends long games sooner and loses their results in the same proportion, about 3% better at most.
- **Long games aren't won differently.** A lone v5 among v4s wins 18.7% of the games decided by turn 250 and 17.8% of those decided later; a lone v4 among v5s, 16.8% and 17.2%. Cutting the long games wouldn't bias a verdict either, only cost results.
- **At the cap, most tables are still full.** Of the 4,130 capped games, all six players were alive in 1,209, five in 1,131, and four in 1,221. These aren't decided games waiting for a mop-up; nobody has eliminated anybody.

The cost is in how the bots play six-handed, not in the measuring: among themselves, v4 and v5 rarely knock anyone out. Not run: the turns spent after a game's result is clear, which needs each game's state turn by turn, not only its end.

## v4 and v5 seated (2026-10-19)

Both cleared their seating bars on the full suite, so both are seated (`online/seat-roster.ts`), and v5 is the lobby's default. The seatable ratings run played nothing: all 270 matchups came from the cache, from the Actions ladder's games.

| Bot | Win Elo (greedy at 1000) |
|---|---|
| rule-v5 | 1538 |
| rule-v4 | 1500 |
| rule-v3 | 1441 |
| rule-v2 | 1405 |
| rule-v1 | 1322 |

Both bots' moves over the two frozen games are now pinned in `bots/frozen.test.ts`, so neither changes again: a change to either one's play is a new version.

## v6: v5 with seven switchable fixes from 9VFL (built, screened at 3 players, 2026-10-19)

v6 (`rule-bot-v6.md`, `bots/rule-v6/`) is v5 with seven fixes for what 9VFL showed (a 5-player game the winner of G4FR won again, over Kyle, v3, v4 and v5; its seed and 821 moves are a fixture), each a switch so a screen can seat v5 with one of them (`rule-v6~{"fork":1,...}`): `fork` (a kill whose victim splits at the stack, costed cheap group first), `movein` (a single capture scored on the move-in that keeps the stack home), `alive` (preferences by the seats still alive), `gather` (when a big sweep against me is believed, the fortify that most cuts it), `homeward` (the stack at a run's end isn't charged as idle: the turn's fortify is still to come), `thirdParty` (an opponent's sweep may break through a third player to reach me) and `reinforced` (next turn's kill weighed with the victim's income on its defence). With every switch off v6 plays v5's moves exactly (a parity test, deleted once v5 and v6 were both frozen). Registered with every fix on; not seated.

On 9VFL's positions (`9vfl.test.ts`): at turn 57, after v4's 42 armies moved into Venezuela, the kill of Kyle reads 0.957 where v4 read 0, and v5 with `fork` goes for it Peru first; at turn 78 v5 with `movein` takes the 1-army Brazil it turned down; at turn 68 v5 on Egypt alone sweeps with `homeward` and captures with `reinforced`, where it held and died; at turn 57's end v6 believes Kyle's sweep takes 6 of v4's territories (he took 5; v4 believed none). `gather` changes nothing at turn 87: the spread was made in the attack phase, a preference. On G4FR's turns (`rule-bot-v6.md` has the table) `alive` spreads v5 thin at turn 89 (20 territories, biggest stack 3, against 13 and 8).

Cost: a v6 decision with every fix costs 1.33, 1.35 and 1.41 times a v5 decision at 3, 4 and 6 players on the same decisions; `movein` is most of it.

Screens, one v6 among two v5s at 3 players, train seeds `screen-v6:*`, capped at 600 decisive games, about 70 seconds each:

| v5 with | Win share vs par 33.3% | Win Elo a seat | Verdict |
|---|---|---|---|
| every fix | 32.8% [29.2, 36.7] | −4 | inconclusive |
| `fork` | 34.0% [30.3, 37.9] | +5 | inconclusive |
| `movein` | 31.2% [27.6, 35.0] | −17 | inconclusive |
| `homeward` | 31.7% [28.1, 35.5] | −13 | inconclusive |
| `reinforced` | 33.8% [30.2, 37.7] | +4 | inconclusive |

No big loser, nothing separated: each fix changes a few decisions a game. No game hit the cap. The faults were seen at 5 players, so the screens that choose v6's set are at 6 players, queued for GitHub Actions with the full suite after them (`rule-bot-v6.md`, "Measuring it", with the seating bar written in advance).

## v6's screens at 6 players, and the set kept (2026-10-20)

On GitHub Actions, one v6 variant among five v5s, train seeds `screen-v6:*`, at most 2,000 decisive games each, eight runs at once on 5 machines each:

| v5 with | Win share vs par 16.7% | Win Elo a seat | Games | Cap rate | Verdict |
|---|---|---|---|---|---|
| `alive` | 20.1% [17.5, 23.0] | +40 | 1,074 | 25.0% | better |
| `gather` | 17.2% [15.6, 18.9] | +6 | 2,694 | 25.6% | inconclusive at the cap |
| `fork` | 17.0% [15.4, 18.7] | +4 | 2,562 | 25.8% | even |
| `homeward` | 16.9% [15.1, 18.7] | +3 | 2,226 | 24.6% | even |
| `thirdParty` | 16.8% [15.0, 18.7] | +2 | 2,082 | 24.3% | even |
| `reinforced` | 16.7% [14.9, 18.7] | +1 | 1,914 | 24.3% | even |
| `movein` | 15.9% [14.4, 17.6] | −9 | 2,616 | 23.5% | inconclusive, leaning worse |
| every fix | 17.9% [16.3, 19.6] | +15 | 2,604 | 23.1% | inconclusive |

Only `alive` pays: the large table's preferences played down to three survivors cost v5 about 40 Elo a seat. The fixes for single positions change too few decisions to show. `movein` leaned worse at 3 and 6 players and was most of the cost, so it was dropped. Every fix together scored below `alive` alone, so two sets had a last screen, the rule for choosing written into `rule-bot-v6.md` before they reported (the larger set inside `alive`'s interval):

| v5 with | Win share vs par 16.7% | Win Elo a seat | Games | Cap rate | Verdict |
|---|---|---|---|---|---|
| `alive` and `fork` | 20.3% [17.5, 23.4] | +42 | 966 | 26.1% | better |
| every fix but `movein` | 19.4% [17.2, 21.7] | +32 | 1,608 | 25.2% | better |

**Decision: v6 is every fix but `movein`.** The cap rate was about 24% in every screen (v5 among v4s: 34 to 38%); no fix moved it.

## v6's ladder and train gauntlet (2026-10-20)

Both on GitHub Actions, 10 machines each, at once. The ladder (`risk:ratings -- rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100`, 26,000 new games, 1 h 21 min of play):

| Bot | Win Elo (greedy = 0) | Finishing-order Elo (greedy = 0) |
|---|---|---|
| rule-v6 | +558.9 | +287.9 |
| rule-v5 | +537.7 | +282.9 |
| rule-v4 | +500.6 | +292.9 |
| rule-v3 | +439.4 | +241.9 |

Head to head, v6 alone among v5s wins 34.7%, 24.8% and 20.4% at 3, 4 and 6 players (par 33.3, 25 and 16.7), and v5 alone among v6s 29.0%, 23.3% and 14.9%: level at the small tables, better at 6, where `alive` acts.

The train gauntlet (`rule-v6 --base rule-v5 --field rule-v5,rule-v4,gd-defensive,gd-stacker,greedy`, 44,200 games, 5 rounds):

| Opponent | 3p one-in | 3p one-out | 4p one-in | 4p one-out | 6p one-in | 6p one-out |
|---|---|---|---|---|---|---|
| rule-v5 | even (33.3%) | even (66.6%) | better (30.7%) | even (75.5%) | better (19.3%) | better (85.5%) |
| rule-v4 | better (42.5%) | better (77.3%) | better (31.0%) | better (78.9%) | better (18.9%) | better (86.1%) |
| gd-defensive, gd-stacker, greedy | better | better | better | better | better | better |

Win Elo (rule-v5 = 0): v6 +14.9, v4 −28.7. Finishing order puts v6 at −10: the all-or-nothing mark v5 showed against v4, one step further. The tool's own gate printed REJECT (some tables even); by v6's seating bar (better than v5 somewhere, worse nowhere, no weak bot worse, above v5 on the ladder) train and the ladder both pass. The holdout gauntlet is next.

## v6's holdout gauntlet, and v6 seated (2026-10-20)

The train gauntlet's command with `--prefix holdout`, on GitHub Actions, 20 machines, 47,800 games over 5 rounds, 1 h 22 min of play:

| Opponent | 3p one-in | 3p one-out | 4p one-in | 4p one-out | 6p one-in | 6p one-out |
|---|---|---|---|---|---|---|
| rule-v5 | even (34.8%) | even (67.9%) | even (25.8%) | better (77.6%) | better (20.3%) | better (86.2%) |
| rule-v4 | better (42.4%) | better (75.3%) | better (34.5%) | better (82.4%) | better (19.2%) | better (87.2%) |
| gd-defensive, gd-stacker, greedy | better | better | better | better | better | better |

Win Elo (rule-v5 = 0): v6 +15.8, v4 −41.0; by finishing order v6 +1.5. The 3-player pairings against v5 took 3,990 and 2,898 games to call even: at 3 players v6 and v5 are nearly the same bot, as the screens said. Cap rates: 26% and 18% for v6 against v5 at 6 players, 37% for one v6 among five v4s.

With train and the ladder, v6 clears all three rules of its seating bar (`rule-bot-v6.md`), so it is seated (`online/seat-roster.ts`) and, as the strongest, the lobby's default. The seatable ratings run played nothing: all 330 matchups came from the cache.

| Bot | Win Elo (greedy at 1000) |
|---|---|
| rule-v6 | 1559 |
| rule-v5 | 1538 |
| rule-v4 | 1501 |
| rule-v3 | 1439 |

v6's moves over the two frozen games are pinned in `bots/frozen.test.ts`.

## Five players: the ladder, and the small table's cutoff (2026-10-20)

Every measurement so far played 3, 4 and 6 players, the default since the first gauntlet, though both human games the bots lost (G4FR and 9VFL) were 5-player games. Two runs on GitHub Actions, 10 machines each:

**The ladder at 5 players**, `risk:ratings -- rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100 --players 5`: 55,000 games, 110 matchups.

| Bot | Win Elo at 5p (greedy = 0) | Seatable ladder at 3, 4, 6 |
|---|---|---|
| rule-v6 | +569 | +559 |
| rule-v5 | +546 | +538 |
| rule-v4 | +537 | +501 |
| rule-v3 | +478 | +439 |
| rule-v2 | +437 | +406 |
| rule-v1 | +326 | +320 |
| gd-stacker | +116 | +90 |
| gd-continental | +86 | +69 |
| gd-aggressive | +23 | +7 |
| gd-defensive | +8 | −34 |

The rule bots keep their order, and v6 stays on top: alone among v5s it wins 21.7% against par 20%, and v5 alone among v6s 17.7%. The gaps differ: v4 sits 9 Elo under v5 at 5 players against 37 on the 3/4/6 ladder, and by finishing order it is first. The 3, 4 and 6-player ladder predicts the 5-player order; it doesn't predict the gaps.

**The small table's cutoff.** The rule bots play their small-table preferences at 4 players or fewer, a cutoff set from measurements at 3, 4 and 6 only. v6 with its large-table preferences replaced by its small-table ones (a tuned label, `rule-v6~{…smallTable.prefs}`), against plain v6 at 5 players, `--max 2000 --prefix screen-5p`, 3,000 games:

| Pairing (5p) | Win share vs par | Verdict |
|---|---|---|
| 1 small-table v6 among 4 v6s | 24.6% vs 20.0% | better |
| 4 small-table v6s against 1 v6 | 80.8% vs 80.0% | inconclusive at the 2,000-game cap |

Win Elo +17 a seat, finishing order +23. **At 5 players the small table's preferences are the better ones**: the cutoff belongs at 5, not 4. v6 is seated and frozen, so moving it is a new version. A 5-player game is also cheap: 105 to 127 turns on average and a 3 to 7% cap rate between v6s, against 25 to 37% at 6 players, so adding 5 to the default table sizes costs little.

## Five players in every default run (2026-10-20)

The measuring tools' default tables are now 3, 4, 5 and 6 players (`eval/cli-args.ts`), for the gauntlet, the ladder and the tuner alike. Until now no measurement played 5 by default, though it is the table people play. The seatable ladder at all four sizes played nothing: its 440 matchups came from the cache, the 5-player ones from the 5-player ladder above.

| Bot | Win Elo, 3/4/5/6 (greedy at 1000) | 3/4/6 before |
|---|---|---|
| rule-v6 | 1561 | 1559 |
| rule-v5 | 1540 | 1538 |
| rule-v4 | 1511 | 1501 |
| rule-v3 | 1450 | 1439 |
| rule-v2 | 1415 | 1406 |
| rule-v1 | 1322 | 1320 |

The order is unchanged. Every earlier verdict in this log played 3, 4 and 6 only.

## sweeper-v1: the winner's playbook as a style bot (2026-10-21)

`bots/sweeper-v1/`, designed in `sweeper-v1.md`: a persona of the person who won G4FR and 9VFL, not a candidate. It isn't seatable and has no seating bar; these runs say what it is.

**While it was built**, scratch games with the sweeper in one seat among copies of an opponent (games won; par 33% at 3 players, 20% at 5):

| sweeper-v1 built with | vs greedy, 3p | vs greedy, 5p | vs rule-v6, 5p |
|---|---|---|---|
| the size cut, fed wherever the sweep ran longest | 5 of 20 | 2 of 20 | |
| the biggest stack fed, Australia only when the stack stood beside it | 15 of 80 | 7 of 80 | 0 of 40 |
| the same, home where the next sweep would run longest | 22 of 80 | 13 of 80 | 1 of 40 |
| the same, no fortify home (idle piles onto the stack) | 12 of 80 | 17 of 80 | 0 of 40 |
| Australia first (as built) | 35 of 80 | 21 of 80 | 2 of 40 |

Taking Australia first is what made it a player; without a base it was the weakest seat and the rule bots finished it by about turn 20. Where home is didn't separate clearly at these sizes, so the reading closest to the record (back to where the sweep set out) was kept. As built it also won 1 of 40 alone among four rule-v3s and 0 of 40 among four rule-v5s at 5 players: the bots the winner beat don't lose to his rules without his judgement.

**Against random**, `risk:gauntlet -- sweeper-v1 --field random`: better at every table, 3 to 6 players, both mixtures. Alone among randoms it won all 100 games; random won 3 of the 347 decisive games where it sat alone among sweepers, which greedy never allows. Sweepers among themselves stall more: 19 to 43% of those games reached the turn cap.

**A 5-player screen**, `risk:gauntlet -- sweeper-v1 --base rule-v6 --field rule-v6,greedy --players 5 --max 300`, 1,040 games in 3 minutes on 14 workers:

| Pairing (5p) | Win share vs par | Verdict |
|---|---|---|
| 1 sweeper-v1 among 4 rule-v6s | 0.0% [0.0, 3.9] of 95 vs 20.0% | worse |
| 4 sweeper-v1s against 1 rule-v6 | 4.2% [0.7, 20.2] of 25 vs 80.0% | worse |
| 1 sweeper-v1 among 4 greedys | 28.4% [23.2, 34.3] of 250 vs 20.0% | better |
| 4 sweeper-v1s against 1 greedy | 31.6% [19.1, 47.5] of 40 vs 80.0% | worse |

Win Elo with rule-v6 at 0: sweeper-v1 −667, greedy −671; by finishing order sweeper-v1 −164, greedy −304. So at 5 players it is about greedy's strength by wins and well above it by finishing order, and v6 beats it every time it sits alone. It beats a table of greedys, and four sweepers lose to one greedy: their sweeps eat each other's trails while greedy keeps what it takes. As an opponent it is a style the rule bots already punish, which is the measure the hybrid bot would have to keep.

## Can a learned evaluation predict the winner better than v6's? (2026-10-21)

The kill test for a hybrid bot, v6's planner scoring its end-of-turn boards with a learned evaluation instead of its hand-tuned one. `risk:record` on GitHub Actions (run 39576264488, 20 machines): 10,000 five-player games, field rule-v6, rule-v5, rule-v4 and gd-stacker rotated through every seat, 8 capped. Every seat's board at the end of each of its turns, from its own view, with v6's evaluation terms and the game's winner: 524,628 positions from 9,992 decisive games. Fit offline on the laptop's CPU, a few minutes: held out by game (a fifth of the games), scored on the rule bots' seats only (83,924 test positions, 31.9% of them a winner's), each method's log-loss of "this seat wins", a 95% interval on each difference from a paired bootstrap over test games.

| Method | Log-loss |
|---|---|
| A constant (the win rate) | 0.626 |
| v6's power share alone | 0.550 |
| (a) v6's value, calibrated to a probability | 0.530 |
| (b) Texel: a logistic fit on v6's terms | 0.514 |
| (c) A small network (two hidden layers) on v6's terms and the board | 0.497 |

Texel beats v6's own weighting by 0.016 [0.014, 0.018], and the network beats Texel by 0.017 [0.014, 0.019]: both stop rules pass. The network on the board alone, without v6's terms, scored 0.499, nearly the same.

Every game seated gd-stacker, so a network reading the board could be learning who sits where (a rule bot beside a weak bot wins more), which would mean nothing against people. Controlled by telling both fits each seat's bot: who sits where helps both (Texel by 0.010), and the network still beats Texel by 0.021 [0.017, 0.026]. Its edge is in the positions, largest from turn 20 on; in the first 20 turns the methods are close. Two fits of the same network differ by about 0.005, well inside these gaps.

That a seat's chances move by about 0.01 log-loss with who the others are measures the self-play worry: what a position is worth depends on the opponents. A predictor that beats v6's scoring here is a necessary condition, not a sufficient one: the planner ranks sibling boards from one position, and an evaluation can predict winners better yet rank those worse, or be exploited on boards bots never reach. Only a gauntlet decides.

## rule-v8: v6's planner on the learned evaluation (built and trained, 2026-10-21)

v8 (`ideas/rule-bot-v8.md`) is v6 with every board it scores scored instead by a network's chance that the seat wins. The network reads v6's breakdown terms and the board, its seats in turn order from the scored seat, and never which bot or person sits where. It was trained on the kill test's recording: 524,628 positions from 9,992 decisive five-player games, features from v8's own feature function (`npm run risk:features`), held out by game as the kill test held them (a fifth of the games test, a tenth validation), and scored on the rule bots' seats (83,924 test positions). On the laptop's CPU each fit takes a minute or two, and a rerun reproduces its weights bit for bit.

| Model | Weights | Log-loss, rule seats | Every seat |
|---|---|---|---|
| v6's value, calibrated | 2 | 0.530 | 0.468 |
| Logistic on the same 293 features | 294 | 0.498 | 0.439 |
| Hidden layer of 8 | 2,361 | 0.494 | 0.431 |
| Hidden layers 16, 8 (**kept**) | 4,849 | 0.493 | 0.430 |
| Hidden layers 32, 16 | 9,953 | 0.496 | 0.431 |
| Hidden layers 64, 32 | 20,929 | 0.496 | 0.432 |
| Hidden layers 128, 32 | 41,793 | 0.492 | 0.432 |
| Hidden layers 256, 64 | 91,777 | 0.496 | 0.435 |

Every network scores within fit-to-fit noise of the others (about 0.005), and a little better than the kill test's network (0.497) on these features. The 16-and-8 network was kept: as good as any, and small enough that its weights are 25 KB in the repo. By game phase it gains on v6's value everywhere: 0.569 against 0.590 in turns 0 to 20, and 0.421 against 0.470 in turns 40 to 70.

**Cost per decision**, v8 against v6 asked the same decisions (a v6 seat among v6s, 12 games a table size capped at 150 turns, the two taking turns going first): 1.02 times v6 at 5 players, 1.10 at 4 and 1.14 at 6. The two chose the same move in 57% of decisions at 5 players, 58% at 4, and 80% at 6, where v8 plays v6 until a seat falls.

**A local screen at 5 players**, `risk:gauntlet -- rule-v8 --base rule-v6 --field rule-v6 --players 5 --formats one-in,one-out --max 600 --prefix screen-v8`, stopped at the ten-minute limit on the laptop's CPU. Five-player games of v6 are slow on 14 workers. Its one-in pairing (v8 alone among four v6s) had 102 decisive games and 13 capped, with the improvement test's log-likelihood ratio at 3.0 and the regression test's at −3.4. That leans well above par, but no verdict was printed before the stop, and one-out had not reported. It is a lean to confirm on Actions, not a result. The Actions commands are in the design doc's "Measuring it".

## v8's screen at 5 players: better alone, worse in numbers (2026-10-21)

On GitHub Actions (run 39641294131, 10 machines, 2 rounds, 1,200 games): `risk:gauntlet -- rule-v8 --base rule-v6 --field rule-v6 --players 5 --formats one-in,one-out --max 2000 --prefix screen-v8`.

| Pairing (5p) | Win share vs par | Games | Mean turns | Cap rate | Verdict |
|---|---|---|---|---|---|
| 1 v8 among 4 v6s | 38.2% [29.4, 47.9] vs 20.0% | 115 | 214 | 11.3% | better |
| 4 v8s against 1 v6 | 63.2% [54.0, 71.4] vs 80.0% | 145 | 421 | 21.4% | worse |

Win Elo (rule-v6 = 0): v8 −2; by finishing order −59. **v8 fails its seating bar**: worse at a table.

Both pairings decided fast, and they disagree. Alone among v6s, the table it was trained on, v8 wins nearly twice par. Four v8s with one v6 lose to it: the lone v6 wins 36.8% where par is 20%. Games run long: 214 turns with one v8, 421 with four, where five-player games among v6s run 105 to 127 and cap 3 to 7% of the time. The network learned what wins among v6s, and among v6s a seat that holds back while the others fight wins. A table of such seats stalls, and the one seat that attacks takes it. This is the population lesson `risk-bot-ai.md` cites from DORA, measured: strength among one population says nothing about another, and an evaluation fit to one population's games carries it in.

The ratings cache was not committed with this run's import: v8's refactor of v6 (an optional `score` in its params) changes v6's code hash, and the import dropped v6's 80 cached ladder matchups that this checkout's v6 no longer answers.

## v7 built: v6 that plays its opponents' replies (2026-10-21)

`rule-v7` (`rule-bot-v7.md`) chooses the turn's placement among v6's four best plans by playing each through the opponents' next turns in sampled worlds (`sim.ts`), with real bots in their seats (v6, gd-aggressive and greedy, drawn per seat), and scoring the start of its next turn. The knob is the replies per plan; at 0 it plays v6's moves exactly. Registered, not seated, and unmeasured: its seating bar and budget curve are in its doc, queued as Actions runs.

Its cost, one v7 among four v6s at 5 players, the laptop's one core, the first 30 to 60 player-turns of two games:

| Budget | Time a decision | A turn, mean | 9 in 10 under |
|---|---|---|---|
| 0 replies (= v6) | 2.7 ms | 0.02 s | 0.03 s |
| 2 replies | 73 ms | 0.75 s | 1.6 s |
| 8 replies | 262 ms | 2.5 s | 3.5 s |
| 8 replies, 2 candidates | 110 ms | 1.1 s | 2.2 s |
| 8 replies, every opponent v6 | 1,186 ms | 8.8 s | 15.8 s |
| 32 replies | 1,441 ms | 9.8 s | 15.3 s |

A round costs about 80 ms with the mix and 270 ms with every opponent v6, whose planning is most of it. A server turn of a few seconds holds about 8 replies over 4 candidates.

## v7's budget curve, one-in at 5 players: 2 and 8 replies (2026-10-21)

On GitHub Actions, 10 machines each, train seeds: `risk:gauntlet -- rule-v7~{"replies":R} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7`. One v7 among four v6s; par 20%. Five-player games among v6s run 105 to 127 turns and cap 3 to 7% of the time.

| Budget (run) | Win share vs par | Games | Mean turns | Cap rate | Win Elo a seat | Finishing-order Elo | Verdict |
|---|---|---|---|---|---|---|---|
| 2 replies (39641422943) | 30.4% [24.5, 37.0] | 215 | 126 | 5.1% | +97 | +47 | better |
| 8 replies (39641428856) | 42.7% [32.5, 53.5] | 85 | 119 | 3.5% | +190 | +135 | better |

**Thinking time buys strength against v6**, and more of it buys more: 8 replies wins about twice par and 2 replies half again par, with game length and cap rate those of v6's own games, so v7 wins by playing, not by stalling. The intervals overlap, so the ladder of the budget points says how far apart they are. One-in is the mixture v8 also passed; the one-out pairing (four v7s against one v6) is the test that v8 failed, and it is running.

Each round on Actions played 600 games whatever the stop point, so the 8-reply run took nearly two hours of 10 machines: an Actions core plays these games well below the laptop's speed the design doc assumed.

## v8 retrained: the stall mostly gone, still worse in numbers (2026-10-21)

v8 retrained in place (Kyle's ruling: a bot is frozen only once seated). Data: the kill test's 10,000 games plus a recording of 5,000 five-player games with three or four first-weights v8s and the rest v6s at each table (run 39645825049, `risk:record -- --games 5000 --field rule-v8,rule-v8,rule-v8,rule-v6,rule-v8,rule-v6 --prefix hybrid-v8`). Features by `risk:features -- --capped loss`, so a capped game counts as no win for every seat: 2,643,475 positions from 15,000 games, 672,000 of them from capped games. The recording itself showed the stall: a quarter of its positions came from capped games.

Held-out log-loss on rule seats (the new data's test games included, so not comparable with the first training's 0.493): v6's value 0.424; networks of 16-8, 32-16 and 64-32 units 0.4055, 0.4055 and 0.4078. The 16-8 network was kept.

The screen on GitHub Actions (run 39676510981, 1,200 games): `risk:gauntlet -- rule-v8 --base rule-v6 --field rule-v6 --players 5 --formats one-in,one-out --max 2000 --prefix screen-v8b`.

| Pairing (5p) | Win share vs par | Games | Mean turns | Cap rate | Verdict |
|---|---|---|---|---|---|
| 1 v8 among 4 v6s | 28.6% [23.3, 34.5] vs 20.0% | 250 | 126 | 2.0% | better |
| 4 v8s against 1 v6 | 74.2% [69.6, 78.2] vs 80.0% | 400 | 222 | 1.3% | worse |

Win Elo (rule-v6 = 0): v8 −3; by finishing order +14. Against the first weights (38.2% one-in; 63.2%, 421 turns and 21% capped one-out), counting a stall as a loss mostly cured the stall: one-out games are half as long and almost never capped. But four v8s still lose to one v6 more than par allows, and the one-in edge shrank.

**The rule fixed before the retraining applies: four v8s against one v6 is worse, so the hybrid line stops.** v8 stays registered and unseated, and the optional v7 with v8's network as its leaf scorer isn't built: it needed both bots to hold one-out. It is the next idea if a learned evaluation ever does.

## v7 one-out at 8 replies: better in numbers too (2026-10-22)

On GitHub Actions (run 39645219116, 10 machines, 2 rounds, 600 games, 6.2 hours): `risk:gauntlet -- rule-v7~{"replies":8} --base rule-v6 --field rule-v6 --players 5 --formats one-out --max 2000 --prefix budget-v7`. Four v7s against one v6; par 80%.

| Pairing (5p) | Win share vs par | Games | Mean turns | Cap rate | Win Elo a seat | Finishing-order Elo | Verdict |
|---|---|---|---|---|---|---|---|
| 4 v7s at 8 replies against 1 v6 | 88.8% [84.1, 92.2] vs 80.0% | 270 | 229 | 14.1% | +119 | +63 | better |

**v7 passes the test v8 failed.** A table of v7s beats the lone v6 by more than par allows, so its gain against v6 is strength, not exploitation of a table of v6s. The lone v6 also finishes below its par place (3.15 against 3.0).

**Its games run long.** 229 turns and 14% capped, against 105 to 127 turns and 3 to 7% among v6s at 5 players (and 119 turns, 3.5% capped, with one v7 among four v6s). It isn't v8's stall: v8's first weights ran 421 turns, 21% capped, and lost to the lone v6, where v7 beats it. But four careful searchers take about twice as long to finish each other, and the capped games are discarded as draws. Counted as games v7 didn't win, its share of all 270 games is 76%, under par. So the verdict rests on the decisive games, as every gauntlet's does, and the cap rate is a health flag to watch in the full suite: if a table of v7s caps far more at 6 players, where v6's own games cap 25 to 37%, that will show it.

## v7 at 32 replies: the curve flattens (2026-10-22)

On GitHub Actions (run 39696419497, 10 machines, rounds of at least 200 games, 1.7 hours): `risk:gauntlet -- rule-v7~{"replies":32} --base rule-v6 --field rule-v6 --players 5 --formats one-in --max 2000 --prefix budget-v7`, the same seeds as the 2- and 8-reply runs.

| Budget, one v7 among four v6s | Win share vs par 20% | Games | Mean turns | Cap rate | Win Elo a seat |
|---|---|---|---|---|---|
| 2 replies | 30.4% [24.5, 37.0] | 215 | 126 | 5.1% | +97 |
| 8 replies | 42.7% [32.5, 53.5] | 85 | 119 | 3.5% | +190 |
| 32 replies | 41.1% [31.5, 51.4] | 95 | 149 | 5.3% | +178 |

Four times the work of 8 replies buys nothing measurable: the one-in curve climbs from 2 to 8 and is flat from 8 to 32. 32 replies also fails rule 5 of the seating bar (about 10 s a turn on the laptop's core), so it was never a candidate budget; as the design doc set out, it is recorded rather than seated, and with no gain over 8 it is no evidence for thinking on a player's device either. By the doc's rule it stays off the budget ladder, which plays v6, 2 replies and 8 replies.

## v7's first budget ladder and full suite ran out of time (2026-10-22)

The budget ladder (run 39662270576, `risk:ratings -- rule-v6 rule-v7~{"replies":2} rule-v7~{"replies":8} --anchor rule-v6 --groups 100 --players 5`, 20 shards) lost 14 of its 20 machines to GitHub's six-hour job limit: each played a twentieth of 3,000 games, and tables of four v7s at 8 replies made that share take 4.5 to over 6 hours. With games missing, it had no report. v7's train gauntlet at 8 replies (run 39707156525, started early on idle runners) had all of its first 10 machines stopped the same way, so it was cancelled. No result from either. The ladder was relaunched at 60 shards (run 39745883687), each machine's share about two hours; `docs/actions.md` now says when to raise `shards`.

## v6's planning made cheaper, every move the same (2026-10-22)

rule-v7 spends about 83% of its time in v6's planner, run for its imagined replies, so a cheaper v6 makes v6, v7 and v8 cheaper to measure and to play. A profile (one v7 at 8 replies among four v6s, 5 players) put the cost in the capture planner, path runs, v6's kill chance and v4's sweep, with typed-array allocation a large hidden part of it: allocating a run's two distributions alone was about 6% of the time.

The changes, each leaving the moves bit-identical, every sum in its old order: path runs step between two reused distributions; the capture planner weighs each way in without building its path, and its cover order and v6's group ordering reuse their marks (a single group, or groups already cheapest first, skip the sort); v6's kill chance returns 0 once its screen passes when some victim group has no attacker stack in a route's reach, where the planner would have found no route (common: a victim group with no stack in reach still passes the screen on the armies to place alone); a fight's expected survivors are summed once with its outcome, and small fights' exchanges are remembered. Tried and dropped: a path-run memo ten times larger (3,000 to 30,000 runs), which cut its misses threefold and saved nothing.

Measured on GitHub Actions, one runner a job, two jobs: rule-v7's CPU over two games (`probe-a`, `probe-b`, 20 player-turns each, one v7 at 8 replies among four v6s), old and new alternated six times each. Old 27.2 s, new 21.2 s (1.29×) on one runner; old 19.7 s, new 15.0 s (1.31×) on the other, its six pairs within about 4% of each other. The laptop, shared with other work, swung ±20% run to run and couldn't resolve it. Moves were identical in every pair, and over both games to 60 player-turns on the laptop; the frozen fingerprints hold. The edits are in `rule-v1/odds.ts` and `rule-v3/routes.ts` as well as v6's own files, so every rule bot's and GD's ladder records replay once, not only v6's and those built on it.

The rest of the profile is spread thin, no function above about 11% of the time. The next real gain is structural: `forecast` recomputes every opponent's kill chances and sweeps for each plan's end board, though a plan changes only the territories it takes.

## v7's budget ladder: 8 replies it is (2026-10-22)

On GitHub Actions (run 39754675411, 60 shards, 3,000 games, 8 hours): `risk:ratings -- rule-v6 rule-v7~{"replies":2} rule-v7~{"replies":8} --anchor rule-v6 --groups 100 --players 5`. Six matchups of 500 games, each bot alone among copies of another; par 20%.

| Matchup (5p) | Lone seat's win share | Games capped |
|---|---|---|
| v6 alone among v7@2 | 17.4% [14.1, 21.1] | 10% |
| v7@2 alone among v6 | 28.3% [24.5, 32.5] | 4% |
| v6 alone among v7@8 | 5.7% [3.9, 8.3] | 16% |
| v7@8 alone among v6 | 36.5% [32.3, 40.9] | 4% |
| v7@2 alone among v7@8 | 17.4% [13.9, 21.5] | 23% |
| v7@8 alone among v7@2 | 27.4% [23.4, 31.7] | 13% |

| Bot | Win Elo (v6 = 0) | Finishing-order Elo |
|---|---|---|
| rule-v7, 8 replies | +152 | +91 |
| rule-v7, 2 replies | +77 | +48 |
| rule-v6 | 0 | 0 |

**The budget is 8 replies**, by the rule `rule-bot-v7.md` fixed before the runs (the smallest budget whose win Elo is inside the best one's interval, and which fits a real game's turn). Head to head, 8 replies alone among 2-reply copies wins 27.4% against par 20%: about +72 Elo a seat [+35, +108], so 2 replies is not inside 8's interval. 32 replies, no stronger than 8 in its gauntlet and about 10 s a turn, was out by the turn-time rule. Rule 1 of the seating bar, "the curve climbs", holds: v7 at 8 replies sits about 150 Elo above v6, far outside the error. 4 replies wasn't measured: a head-to-head of 4 against 8 is a close comparison of tables full of v7s, the most expensive test there is, and both fit a real turn, so it would only say whether measuring at 4 could be cheaper.

**Tables of many v7s stall more.** Capped games run 4% where one v7 sits among v6s, but 16% where one v6 sits among 8-reply v7s and 23% where a 2-reply v7 sits among 8-reply ones. The one-out gauntlet showed the same (14%). Capped games are draws and leave the tests, so the verdicts stand, but this is the health flag to watch in the full suite, above all at 6 players, where v6's own games cap 25 to 37%.

The run played on the code before v6's speed-up (c766718c), so its six matchups don't answer from this checkout's ladder cache: the import kept none, as expected.

## The seatable ladder played to a precision (2026-10-22)

The ladder now stops each pair once one win-Elo fit knows its gap to 18.2 Elo, margin / z(1 − α) at the gauntlet's 30 a seat and α = 0.05, instead of playing a fixed 100 groups a matchup (the project's CLAUDE.md, "Measuring bots"). The old cache held summed 100-group records the rule can't read, so the seatable ladder was played again from nothing, on GitHub Actions (run 39818343983, 20 machines, 4 rounds, 25 minutes): `risk:ratings -- --seatable`. 8,712 games in 3 to 7 groups a matchup, against 198,000 for the 100-group ladder.

| Bot | Before (100 groups) | After (to precision) | Change |
|---|---|---|---|
| rule-v6 | 1561.4 | 1560.3 | −1.1 |
| rule-v5 | 1539.5 | 1538.4 | −1.1 |
| rule-v4 | 1511.1 | 1510.5 | −0.6 |
| rule-v3 | 1450.2 | 1430.6 | −19.6 |
| rule-v2 | 1414.5 | 1418.1 | +3.6 |
| rule-v1 | 1321.8 | 1306.2 | −15.6 |
| gd-stacker | 1097.2 | 1078.4 | −18.8 |
| gd-continental | 1074.1 | 1074.6 | +0.5 |
| gd-aggressive | 1011.1 | 1004.4 | −6.7 |
| greedy | 1000 | 1000 | anchor |
| gd-defensive | 977.8 | 975.4 | −2.4 |

Every bot is within 20 Elo of its 100-group rating (10 Elo RMS), inside the precision the rule promises, and the order, so every lobby rank, is unchanged. Two neighbours sit closer than the margin now, v2 and v3 (12.5 apart, was 35.7) and gd-stacker and gd-continental (3.8, was 23.1): by the ladder's own standard those pairs are within its indifference, so a later rerun may order them either way.

## v7's train gauntlet: better at every table (2026-10-24)

On GitHub Actions (run 39838004145, from main at 5a9100a9, 100 shards on 20 machines, 7 rounds sized from the evidence, 11,791 games, 28.6 hours): `risk:gauntlet -- rule-v7~{"replies":8} --base rule-v6 --field rule-v6,rule-v5,rule-v4,gd-defensive,gd-stacker,greedy`, train seeds, 3 to 6 players, one-in and one-out, ±30 Elo a seat.

**All 48 pairings: better.** Against v6, v5 and v4 at every table size, alone and in numbers, and against GD Defensive, GD Stacker and greedy (several without losing a game).

| Against | 1 v7 alone (3p / 4p / 5p / 6p) | v7s against 1 (3p / 4p / 5p / 6p) |
|---|---|---|
| rule-v6 | 46.5 / 38.9 / 37.1 / 32.0% | 78.3 / 90.1 / 94.7 / 92.8% |
| rule-v5 | 44.3 / 48.2 / 47.1 / 33.3% | 83.8 / 84.1 / 92.9 / 94.0% |
| rule-v4 | 66.7 / 43.6 / 41.1 / 34.2% | 87.1 / 91.4 / 95.3 / 93.4% |
| par | 33.3 / 25.0 / 20.0 / 16.7% | 66.7 / 75.0 / 80.0 / 83.3% |

Win Elo (rule-v6 = 0): v7 +138, v5 −22, v4 −52, gd-stacker −483, greedy −563, gd-defensive −596. Finishing order: v7 +65.

**Rules 2 and 3 of the seating bar hold on train seeds**: better than v6 at every table, worse at none, and no weak bot does better against it. The holdout gauntlet and the seatable ladder are next.

**The health flag grew at 6 players.** Tables with five v7s against one rule bot capped 44 to 58% of their games (416 to 460 turns on average), and 23 to 41% with one v7 among five rule bots; v6's own 6-player games cap 25 to 37%. At 3 and 4 players nothing capped. Capped games are draws and leave the test, so the verdicts stand, but a table of v7s at 6 players finishes about half its games. That is a defect of v7's play to look at (likely its search valuing safety the way v8's network did), not a reason against seating it: it beats every bot at every table.

## student-v1's first screen: even alone, worse in numbers (2026-10-24)

On the laptop (14 workers, 24 minutes, from 6731b550): `risk:gauntlet -- student-v1 --base rule-v6 --field rule-v6 --players 5`, train seeds. student-v1 is v6 with the turn's placement chosen among v7's candidates by the pilot's best student (v6's breakdown terms, linear, fitted to v7's scores; it keeps 18% [2%, 33%] of v7's split-half edge, `distilled-v7.md`).

| Table | Result | Win share | Par | Games | Turns | Capped |
|---|---|---|---|---|---|---|
| 1 student among 4 v6s | even | 20.1% [18.0, 22.4] | 20% | 1,325 | 111 | 3.1% |
| 4 students against 1 v6 | **worse** | 74.9% [70.9, 78.6] | 80% | 510 | 142 | 4.5% |

Win Elo (v6 = 0): student −14. Rejected, as the bar says. The pilot student overrules v6 often but keeps little of v7's judgement, and among copies of itself it loses ground, the shape v8 had. It says nothing yet about a student trained on the 8,000-game recording; this run checks the pipe end to end (weights, bot, gauntlet) and sets the floor.

## v6.1's first screen: easing the border term ends the stall and loses (2026-10-24)

On the laptop, from 3a6f47d6 (Node 22, the repo's pin, not Risk's 24: v6's own moves differ slightly there, so these are screens, not the bar's measurements). `ideas/rule-bot-v6.1.md` has the candidates; `ideas/stalled-games.md` the stall.

| Candidate | Capped, 100 mirror games 5p / 6p | Decided mean turns 5p / 6p | Win Elo vs v6 (5, 6 players, both mixtures) | Same decision as v6 (5p / 6p) |
|---|---|---|---|---|
| `border:"max"` | 0 / 0 | 47 / 49 | −156, worse at all 4 tables | 79% / 76% |
| `border:"mean"` | 0 / 0 | 45 / 49 | −215, worse at all 4 | 80% / 79% |
| `border:"sum"`, weight 0.25 | 0 / 1 | 48 / 62 | −56, worse at all 4 | 92% / 94% |

All three end the stall by making thinness cheap, and all three lose to v6 everywhere: alone among v6s at 5 players they win 4.8%, 5.4% and 14.8% against a par of 20%. The border term carries v6's defence; the stall comes from the share of power once armies outgrow income (the design note's diagnosis, `rule-bot-v6.1.md`), so the next candidates re-price armies instead.

## v6.1's second screen: re-pricing armies trades stalls for strength (2026-10-24)

On the laptop under Node 24 (Risk's pin), from 76ef6f70, seeds `screen-v6.1`. 100-game mirror tables, then gauntlets vs rule-v6 at 5 and 6 players (`--max 2000`). Out at ≥2 capped at either table or decided games shorter than 70 turns at 5p or 90 at 6p (`rule-bot-v6.1.md`).

| Candidate | Capped 5p / 6p | Decided mean turns 5p / 6p | Board armies at turn 100, 6p | Screen |
|---|---|---|---|---|
| armies, 6 rounds, 25% beyond | 0 / 0 | 43 / 54 | 58 | out: short |
| armies, 4 rounds, 50% | 0 / 0 | 45 / 54 | 51 | out: short |
| armies, 8 rounds, 50% | 0 / 0 | 54 / 77 | 114 | out: short |
| armies, 10 rounds, 75% | 0 / 0 | 70 / 123 | 236 | **passes** |
| attrition k=3 | 0 / 0 | 55 / 72 | 72 | out: short |
| attrition k=4 | 0 / 2 | 58 / 93 | 136 | out: capped, short |
| attrition k=6 | 0 / 6 | 73 / 166 | 262 | out: capped |
| attrition k=9 | 1 / 31 | 106 / 170 | 297 | out: capped |
| sum at weight 0.4 | 0 / 4 | 66 / 118 | 254 | out: capped, short |

Gauntlets:
- **armies, 4 rounds, 50%** (a diagnostic of the "short" rule): worse at all four tables, win Elo −87. Short games are weak play, so the rule stands.
- **armies, 10 rounds, 75%**: 5 players alone 18.5% vs par 20% (inconclusive at the cap), in numbers 79.9% vs 80% (even); 6 players alone 11.6% vs 16.7% (worse), in numbers 78.9% vs 83.3% (worse). Win Elo −22. Rejected.

Every candidate sits on one curve: the more it discounts hoarded armies, the less it stalls and the more it loses to v6, and the gentlest that doesn't stall still loses about 22 Elo, at 6 players. Part of that may be the yardstick: a stall-free bot is measured among v6s that still stall (its lone seat among five v6s capped 9.3% of games).

Round two's gated candidates (same screen, gauntlets vs rule-v6 at 5 and 6 players, `--max 2000`):
- **R2b, armies 12 rounds, 75%**: win Elo −19. Rejected.
- **R2c, R2b plus attrition k=6, only with 5+ players and 6 alive**: 5 players inconclusive at the cap (alone 18.9% vs 20%, in numbers 78.8% vs 80%); 6 players worse (alone 14.5% vs 16.7%, capped 10.1%; in numbers 73.3% vs 83.3%). Win Elo −21. Rejected.

Round two ends where round one did: about even at 5 players, worse at 6.

## student-v1 on the wide recording beats v6 at 5 players, train seeds (2026-10-24)

On the laptop under Node 24, from 5a9c456f, seeds `train`. `student-v1~{"weights":"e6-256-64"}`: the 256,64 net trained on the 97,000-decision sweep (weight decay 1e-3), which keeps 21% of v7's edge on the 32-reply test set (`ideas/distilled-v7.md`).

| Table | Result | Win share | Par | Games | Turns | Capped |
|---|---|---|---|---|---|---|
| 1 student among 4 v6s | **better** | 24.8% [21.4, 28.5] | 20% | 565 | 98 | 1.4% |
| 4 students against 1 v6 | **better** | 82.1% [80.5, 83.7] | 80% | 2,265 | 105 | 2.6% |

Win Elo (v6 = 0): student +29.5 (finishing order +7.3). Accepted on train seeds at 5 players; the holdout suite (3 to 6 players, field rule-v6, gd-defensive, gd-stacker, greedy) decides it. 2,880 games in 31 minutes on 14 workers.

## v7's ladder: +115 Elo over v6 across 3 to 6 players (2026-10-25)

On GitHub Actions (run 40067953817, from main at 000b21d9): `risk:ratings -- rule-v7~{"replies":8} rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy`. 10,152 games in 2,256 seed groups (336 from the cache), 17 hours of wall time.

| Bot | Win Elo (greedy = 0) | Finishing-order Elo |
|---|---|---|
| rule-v7, 8 replies | **+662** | **+367** |
| rule-v6 | +548 | +290 |
| rule-v5 | +544 | +293 |
| rule-v4 | +515 | +304 |
| rule-v3 | +431 | +256 |
| rule-v2 | +422 | +244 |
| rule-v1 | +315 | +152 |
| gd-stacker | +86 | +114 |
| gd-continental | +77 | +77 |
| gd-aggressive | +13 | +60 |
| greedy | 0 | 0 |
| gd-defensive | −22 | +70 |

v7 tops the ladder by 115 win Elo over v6, and alone among copies of any weaker bot it wins 82 to 100% of games at every table size. Tables of v7s cap more at 6 players (10 to 25% of games with one weaker bot among five v7s), as the gauntlets showed. The holdout gauntlet (run 40067949285) is the last run of v7's suite; this run isn't `--seatable`, so seating reruns the ratings over the seatable bots. Its matchups weren't merged into the cache here: this branch's code hashes for the rule bots differ from main's, so the import kept none of them.

## net-v1 (m2a-50) against v6: it places, it doesn't win (2026-10-25)

On the laptop under Node 24, from 3ec5eeb6, seeds `early-v6`, an early read capped at 300 decisive games, 4 workers at below-normal priority beside other runs. `net-v1~{"weights":"m2a-50"}`: the GPU self-play transformer (128×4, 0.84M weights, 131M training decisions; `ideas/gpu-engine.md`, phase 3), trained on the placement reward, sampling its moves from its seed.

| Table | Result | Win share | Par | Games | Turns | Capped |
|---|---|---|---|---|---|---|
| 1 net among 4 v6s | **worse** | 7.1% [4.0, 12.3] | 20% | 160 | 202 | 3.8% |

Win Elo (v6 = 0): net −205; finishing order −3, its mean place 3.00 against par 3.0. It outlasts v6 as well as v6 outlasts itself and almost never takes the win: what the placement reward paid for (second place +0.5 at 5 players). The same style is why it beats other networks head to head. The next line trains on the win reward (+1 for the win, second place 0) and is measured against v6 the same way.

## v6.1's native map: the stall ends, and 6 players is still the cost (2026-10-25)

On the laptop under Node 24, 16 threads, from f337ac86, 6cacaf80 and 05e784cb, seeds `v61map`. `risk-native sweep` (`ideas/rule-bot-v6.1.md`, "The native map") plays v6.1's settings in native-v1 (`native-v1~{...}`) against **native-v6**, native-v1 with v6's small-table cutoff (`native-v1~{"smallTableSeats":4}`), at 5 and 6 players: one-in and one-out in seed groups with the lone seat rotated, and the mirror for the stall, every point on the same seeds. Elo is a seat's Luce strength from a mixture's win share; ± is 95%. 272,664 games over 201 points, in stages: 110 points at 12 groups and 60 mirror games a table; 86 to 48 groups and 200 mirror games; 29 and 14 refinement points at 48 groups, 9 at 120; the best 16 to 120 groups (600 games a mixture at 5 players, 720 at 6) and 500 mirror games; the best 5 to 300 groups at 6 players.

**The instrument measures the real thing.** native-v6 decides as TS rule-v6 on 99.9% of v6's own recorded decisions at 5 and 6 players (3,117) and 100% at 3 and 4 (3,933); plain native-v1, which keeps its small-table preferences up to five alive, only 95–97% at 5 and 6. At each of six v6.1 settings, native-v1 at the setting decides as TS rule-v6.1 at it on 99.89–100% of that setting's own recorded decisions, while the settings move 5–15% of decisions away from v6. Replayed on a TS gauntlet's own seeds, a native pairing lands within 5 wins of the TS one in 262 games.

**The families** (48 groups, 200 mirror games a table; ±27 on the overall Elo, ±55 on a single mixture):

| Family | Stall-free (≤1 in 200 capped at 6p) | Strength |
|---|---|---|
| Armies discounted alone, full or value, 4–30 rounds, 25–90% beyond | from about 12 rounds at 75% | round two's curve: best stall-free −8 (22 rounds, 60%), below 15 rounds −20 to −140 with short games; past 25 rounds or at 90% the 6-player mirror caps 2–5%; full beats value by about 10 |
| Attrition, k 2–12, alive-gated or not (12 groups) | k ≤ 4 only | k ≤ 4: −20 to −100; k ≥ 5 caps 4 to 25 in 60 at 6p |
| Border `max` or `mean`, weight ×1 to ×3 (12 groups) | all | −77 to −171 |
| Border `sum`, weight ×0.5 to ×0.9 (12 groups) | ×0.5 only | −56 to −128 |
| **Border `sum`, weight ×1.1 to ×1.3** | none: **3.5–9% capped at 5p, 17–22% at 6p** (native-v6: 2% and 20%) | **+6, +32, +33: the strongest settings measured**, better in all four mixtures at ×1.15 |
| Border ×1.15–1.3 plus attrition k 4–8 | k = 4 only | k ≥ 5 caps 14–71 in 200 at 6p, more than native-v6; k = 4 loses 27–45 in 6p one-out |
| **Discount plus border ×1.1–1.25** (14–25 rounds, 60–90% beyond) | at 75% beyond, 14–22 rounds, ×1.15–1.25 | +8 to +23 overall, but **every point gains at 5 players and gives some back at 6** (below) |

**v6's border weight is too low against v6, and raising it feeds the stall.** The border charge at 1.15 times v6's weight is +32, better in every mixture, and caps more games than native-v6 at both tables. The army discount ends the stall, and the two together keep most of the gain at 5 players.

**The frontier, pairing by pairing** (each a mixture: "in" is the candidate alone, "out" native-v6 alone among candidates):

| Armies past, beyond, border | Groups | Mirror capped 5p / 6p | 5p in | 5p out | 6p in | 6p out | 6p, fresh seeds only |
|---|---|---|---|---|---|---|---|
| **16 rounds, 75%, ×1.2** | 300 | 0/500, 1/500 | +30 ±21 | +11 ±22 | −6 ±22 | −5 ±22 | **−15 ±20** |
| 16 rounds, 75%, ×1.25 | 120 / 300 | 0/500, 1/500 | +25 ±33 | +20 ±36 | −12 ±23 | −12 ±22 | −14 ±20 |
| 22 rounds, 75%, ×1.15 | 120 / 300 | 2/500, 1/500 | +21 ±34 | +32 ±37 | 0 ±22 | −15 ±22 | −12 ±20 |
| 18 rounds, 75%, ×1.2 | 120 / 300 | 1/500, 2/500 | +46 ±32 | +9 ±35 | −9 ±23 | −17 ±22 | −20 ±20 |
| 20 rounds, 75%, ×1.15, `reprice` value | 120 / 300 | 0/500, 2/500 | +15 ±34 | +18 ±36 | −12 ±36 | −9 ±34 | −16 ±20 |
| 18 rounds, 75%, ×1.15 | 120 | 0/500, 0/500 | +14 ±34 | +44 ±38 | +20 ±34 | −33 ±33 | |
| 20 rounds, 75%, ×1.15 | 120 | 1/500, 2/500 | +17 ±34 | +42 ±38 | +20 ±34 | −23 ±34 | |
| 20 rounds, 75%, ×1.2 | 120 | 0/500, 3/500 | +48 ±32 | +12 ±36 | +22 ±34 | −33 ±33 | |
| 16 rounds, 90%, ×1.15 | 120 | 5/500, 18/500 | +9 ±34 | +64 ±39 | +39 ±33 | −27 ±34 | |

The last column is the 6-player Elo from groups 121–300 alone, after the five were picked on groups 1–120, so it carries no selection: every one of them is 12 to 20 Elo a seat below native-v6 at 6 players. Over the sixteen points at 120 groups, 6p one-out averages about −22. The points that hold their own at 6 players stall there (90% beyond: 18 and 22 in 500; the border alone: a fifth of games).

**The TS confirmation**, `gauntlet-cli.ts '<cand>' --base rule-v6 --field rule-v6 --players 5,6 --prefix screen-v6.1`, at normal priority beside the student-v1 holdout:

| Candidate (`rule-v6.1~{"border":"sum","power":"armies","reprice":"full",...}`) | 5p one-in | 5p one-out | 6p one-in | 6p one-out |
|---|---|---|---|---|
| `"armyRounds":20,"armyBeyond":0.75,"borderScale":1.15` | even (1,237 games) | stopped | stopped | **worse** (1,741) |
| `"armyRounds":18,"armyBeyond":0.75,"borderScale":1.15` | even (1,242) | stopped | stopped | **worse** (1,098) |
| `"armyRounds":18,"armyBeyond":0.75,"borderScale":1.2`, 6p one-out alone | | | | **worse**: 75.6% [70.0, 80.4] vs par 83.3% (264) |
| `"armyRounds":16,"armyBeyond":0.75,"borderScale":1.2` | even (1,237) | even (1,864) | undecided when stopped | **worse** (1,680) |

Each "worse" fails the bar, so a gauntlet was stopped once one came in. The 264-game "worse" was replayed natively on the gauntlet's own seeds: 77.5% (TS 75.6%), so the engines agree and that early stop drew a poor sample; native's own 720 games of the same pairing gave 82.8%. All four land where the native map put the family: 6-player one-out about 20 Elo a seat below v6, which the SPRT calls "worse" more often than not.

TS mirror surveys (`trace-cli --survey --mirror`, 200 games, `screen-v6.1` seeds): 18 rounds ×1.15, 0 capped at 5 and 6 players, decided games 120 and 218 turns, board armies at turn 100 241 and 327; 16 rounds ×1.2, 0 capped at both, 118 and 204 turns, 231 and 311 armies (people's games 100–250; v6's frozen table 449).

**Verdict.** The stall is solved inside v6.1's design space: at 75% beyond 16 to 22 rounds, fully re-priced, the border weight raised to 1.15–1.25, no table caps more than 3 games in 500 at either size (native-v6: 2% and 20%), and decided games run about 120 turns at 5 players and 190–220 at 6. That region is at least even with v6 at 5 players: +25 to +30 a seat on the native map, each interval clear of 0, and even in both 5-player mixtures in the TS gauntlet. It is not even with v6 at 6 players: every stall-free point there is 10 to 20 Elo a seat below v6, and the one-out mixture is the weak one (five candidates let the lone v6 win more than its share). At the gauntlet's ±30 margin a true −15 is a coin flip between "even" and "worse", so no point here passes the bar reliably. The map shows no stall-free point that is even or better at 6 players in this design space: what gets it there needs a new idea, aimed at the 6-player one-out table (why a table of discounters hands the lone hoarder its extra wins), not another setting.

## student-v1's holdout suite: better than v6 at 3 to 5 players, even at 6 (2026-10-25)

On the laptop under Node 24, from 5a9c456f, seeds `holdout`: `risk:gauntlet -- student-v1~{"weights":"e6-256-64"} --base rule-v6 --field rule-v6,gd-defensive,gd-stacker,greedy --prefix holdout`. 13,506 games in 15 hours, shared with other jobs.

| Table | One student among v6s | Students against one v6 |
|---|---|---|
| 3 players | **better**, 42.2% [36.4, 48.3] vs 33.3% | **better**, 71.7% [67.8, 75.3] vs 66.7% |
| 4 players | **better**, 36.2% [29.6, 43.3] vs 25% | **better**, 78.5% [75.7, 81.1] vs 75% |
| 5 players | **better**, 26.3% [22.1, 31.0] vs 20% | **better**, 82.3% [80.5, 84.1] vs 80% |
| 6 players | even, 16.5% [14.9, 18.3] vs 16.7% (capped 16.7%) | even, 83.2% [81.3, 84.9] vs 83.3% (capped 15.5%) |

Better than gd-defensive, gd-stacker and greedy at every table. Win Elo (v6 = 0): student +20.5, finishing order +1.7. The gauntlet's gate rejects it (it doesn't improve on v6 at every table), and it isn't a seating candidate anyway: a student is seated only when it comes close to the seated champion (`roadmap.md`), and v7 is about 115 above v6. What it settles: distillation carries a real edge to unseen seeds at 3 to 5 players, so the bigger recording and cleaner labels are worth pursuing. At 6 players the student plays v6's stall (a sixth of games capped) and its edge vanishes.

## v6.1's rival hoard: the 6-player one-out table comes level (2026-10-26)

On the laptop, 15 threads, native seeds `v61map` (stage 1 groups 1–48 and mirror games 1–200; stage 2 groups 49–300 and mirror games 201–700, seeds no stage-1 pick was made on). Two new settings aimed at the table the native map lost, one v6 among five candidates: **`rivalBeyond`**, which prices an opponent's armies past the cap at its own fraction rather than at `armyBeyond` (above it, a rival's hoard counts for more than my own does), and **`threatScale`**, which lowers the bar for naming the table's leader the common threat. Every point is the native map's best stall-free setting (`armyRounds` 16 or 22, `armyBeyond` 0.75, `reprice` "full", `borderScale` 1.2 or 1.15) with these on top, played against native-v6 at 5 and 6 players.

**Stage 1** (16 points, 23,296 games, ±27 a point): `rivalBeyond` 1.25 was the best, +39 (base +8; 1.0 +13, 1.5 +17, 2 +2, 3 −13). **`threatScale` is dead**: below 1 it loses at every `rivalBeyond` (0.85: −7 to −40; 0.7: −44 to −93) and stalls. Raising `armyBeyond` to 0.9 stalls (15 in 200 at 6 players).

**Stage 2**, the six best on fresh seeds (39,264 games; 500 mirror games a table):

| Point | Elo | 5p | 6p | 6p one-in | 6p one-out (par 83.3%) | Mirror capped 5p / 6p |
|---|---|---|---|---|---|---|
| 16 rounds, ×1.2 | +5 ±12 | +14 | −3 | 17.8% | 81.8% | 0 / 1 |
| + `rivalBeyond` 1.0 | +6 ±12 | +20 | −8 | 17.8% | 81.2% | 0 / 0 |
| **+ `rivalBeyond` 1.25** | **+6 ±12** | +14 | −3 | 15.9% | **83.6%** | **0 / 0** |
| + `rivalBeyond` 1.5 | +8 ±12 | +17 | −3 | 15.5% | 84.0% | 1 / 4 |
| 22 rounds, ×1.15, `rivalBeyond` 1.25 | +23 ±12 | +24 | +21 | 19.0% | 84.4% | 4 / 11 |
| 22 rounds, ×1.15, `rivalBeyond` 1.5 | +13 ±12 | +26 | 0 | 17.3% | 82.8% | 5 / 13 |

Stage 1's +39 was mostly the pick's luck: on fresh seeds the 16-round points are all about +6, even at 6 players. What `rivalBeyond` moves is the mixture the map lost: from 1.25 the lone v6 among candidates wins its par share, where without it it wins more (one-out 81.2–81.8% against 83.6–84.0%), at a small cost in one-in. The 22-round points are stronger, and stall (11 and 13 in 500 at 6 players), so they are out.

**The TS screen** (`gauntlet-cli.ts` on Actions, `--base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1`), the 16-round point at `rivalBeyond` 1.25 with `minPlayers` 5:

| 5p one-in | 5p one-out | 6p one-in | 6p one-out |
|---|---|---|---|
| **better**, 22.8% [20.6, 25.1] vs par 20.0% (1,380) | undecided at 2,000: 81.3% [79.5, 82.9] vs 80.0% | even, 16.9% [15.1, 18.8] vs 16.7% (1,806) | **even, 83.5% [81.6, 85.2] vs 83.3% (1,710)** |

Win Elo +11.1, finishing-order +2.3; worse in no pairing. The same setting without `rivalBeyond` was worse in 6p one-out on these seeds (1,680 games, above). The 22-round point at 1.5 was stopped once stage 2 put it out on stalling.

**Verdict.** `rivalBeyond` 1.25 is v6.1's pick: stall-free (0 in 1,000 native mirror games), worse than v6 in no pairing of the screen, and the first setting to bring 6-player one-out level there. `V6_1_PARAMS` is set to it, and it went to its seating bar (below).

## v6.1's holdout: stall-free, and still short of v6 at 6 players (2026-10-27)

The bar of `rule-bot-v6.1.md` for the pick (plain `rule-v6.1`), holdout seeds.

**The stall: passes.** `trace-cli --survey --mirror rule-v6.1 <n> --games 300 --prefix holdout-cap`, on the laptop: at 5 players 0 capped in 300, decided games 125 turns, board armies at turn 100 234, losses over income 1.09; at 6 players 1 capped in 300 (`holdout-cap-128`, three seats alive), 191 turns, 306 armies, 1.05. v6: 10% and 15%.

**Strength: fails.** `risk:gauntlet -- rule-v6.1 --base rule-v6 --field rule-v6 --players 3,4,5,6 --prefix holdout` on GitHub Actions (run 40393706284, 13,160 games):

| | 3p | 4p | 5p | 6p |
|---|---|---|---|---|
| one v6.1 among v6s | even, 33.3% (909) | even, 25.0% (1,088) | **better**, 23.5% vs 20.0% (860) | **worse**, 14.7% [13.3, 16.3] vs 16.7% (2,514; 9.9% capped) |
| v6.1s against one v6 | even, 66.7% (909) | even, 75.0% (1,088) | **better**, 82.1% vs 80.0% (2,410) | **worse**, 80.0% [77.2, 82.5] vs 83.3% (858) |

Win Elo −0.8 against v6, finishing order −1.4. At 3 and 4 players it is v6 by construction (`minPlayers` 5), so those land exactly on par.

**The seatable ladder** with v6.1 in v6's place (`risk:ratings -- --seatable`, run 40395093340, 8,496 games, 1.7 hours on 10 machines from an empty cache): v6.1 1568, v5 1541, v4 1520, v3 1442, v2 1426, v1 1314, GD Stacker 1088, GD Continental 1080, GD Aggressive 1010, greedy 1000, GD Defensive 984 (v6 was 1560 on the last ladder). Its Elo wasn't kept: v6 stays seated.

**Verdict.** v6.1 doesn't replace v6: worse in both 6-player pairings, by about the 15 Elo a seat the native map measured on fresh seeds (`v6.1's native map`), which the screen's even 6-player one-out had hidden. The 6-player one-out on the screen's seeds was a lucky sample. The stall fix holds; its cost at 6 players does too. `rivalBeyond` moved native 6-player one-out by about 2 points of win share, inside its interval, and that is all it did.

## v5.1 and v4.1: v6.1's fix ported back, and short at 6 players as v6.1 was (2026-10-27)

The bar of `rule-bot-v6.1.md` ("After v6.1") for v5.1 and v4.1, each against the version it would replace, holdout seeds, on GitHub Actions: `risk:gauntlet -- rule-v5.1 --base rule-v5 --field rule-v5 --players 3,4,5,6 --prefix holdout` (run 40397041426, 18,016 games) and the same for v4.1 against v4 (run 40397048645, 15,322 games).

| | 3p | 4p | 5p | 6p |
|---|---|---|---|---|
| one v5.1 among v5s | even (909) | even (1,088) | even, 20.2% (1,480) | **worse**, 11.8% [9.2, 15.1] vs 16.7% (588; 19.6% capped) |
| v5.1s against one v5 | even (909) | even (1,088) | even, 81.1% (7,665) | **worse**, 81.0% [79.1, 82.8] vs 83.3% (1,776; 4.1% capped) |
| one v4.1 among v4s | even (909) | even (1,104) | **worse**, 17.0% [14.9, 19.4] vs 20.0% (1,190; 7.7% capped) | **worse**, 13.6% [11.5, 16.0] vs 16.7% (1,320; 30.8% capped) |
| v4.1s against one v4 | even (909) | even (1,112) | even, 80.0% (1,295) | **worse**, 81.6% [80.3, 82.8] vs 83.3% (3,804; 8.7% capped) |

Win Elo against the old version: v5.1 +1.0, v4.1 −14.4. Below 5 players each is its old version by construction (`minPlayers` 5), so those tables land on par.

**Verdict.** Neither replaces its old version: both are worse in both 6-player mixtures, the cost v6.1 paid against v6, and v4.1 is worse in 5-player one-in too. The stall surveys weren't run, since the gauntlets alone fail the bar. v4 and v5 keep their seats; the fix is never kept just for being stall-free, as long as no fixed bot plays as well as the hoarder it replaces at 6 players.

## v7.1's stall and turn time: rules 4 and 5 pass (2026-10-27)

Two rules of `rule-bot-v7.1.md`'s bar, on the laptop.

**No stall (rule 5): passes.** `trace-cli --survey --mirror rule-v7.1 <n> --games 100 --prefix holdout-cap`: at 6 players 0 capped in 100, decided games 259 turns (quartiles 168 / 262 / 342), board armies at turn 100 334, losses over income 1.04; at 5 players 0 capped, 190 turns, 271 armies, 1.06. v7's 6-player mirrors capped about half. The games are long (v6.1's mirror decides in 191 turns at 6 players), but they finish.

**Turn time (rule 4): passes.** One seat among four v6s at 5 players, games `probe-a` and `probe-b`, the first 60 player-turns, one core, v7 timed alongside in the same run as a reference (sw384 training on the GPU meanwhile), twice each:

| | Turns | A decision | A turn, mean | Median | 9 in 10 under | Longest |
|---|---|---|---|---|---|---|
| v7 | 23 | 214–220 ms | 2.0 s | 1.9 s | 3.0 s | 5.2 s |
| v7.1 | 24 | 215–219 ms | 1.5 s | 1.5 s | 2.3 s | 2.8 s |

A decision costs what v7's does; v7.1's turns are shorter on these two games, not measured further.

## net-v1 passes M2, and is worse than v6 at 5 players (2026-10-26)

`net-v1~{"weights":"sw128b-125"}` (128×4, 131 million decisions trained), on the laptop.

**M2: passes.** `risk:gauntlet -- 'net-v1~{"weights":"sw128b-125"}' --base gd-defensive --field gd-defensive,gd-stacker --players 5 --formats one-in,one-out --prefix m2-train` (1,170 games):

| | one net among four GD | four nets against one GD |
|---|---|---|
| gd-defensive | **better**, 62.2% [47.6, 74.9] vs 20% (45 decisive) | **better**, 88.4% [83.8, 91.8] vs 80% (250) |
| gd-stacker | **better**, 65.0% [49.5, 77.9] vs 20% (40) | **better**, 97.3% [92.3, 99.1] vs 80% (110) |

Win Elo +287 over gd-defensive (gd-stacker +182), no game capped.

**Against rule-v6: worse.** `risk:gauntlet -- 'net-v1~{"weights":"sw128b-125"}' --base rule-v6 --field rule-v6 --players 5 --formats one-in` (300 games): 11.6% [8.2, 16.2] of 249 decisive games against par 20%, win Elo −111, but finishing-order Elo +17 and mean place 2.90 against par 3.0. As with the placement-reward net (`net-v1 (m2a-50) against v6`), it outlasts v6 and rarely takes the win, now on the win reward. That is the roadmap's "Reward" or "Opponents" cause, not yet told apart.

## The size sweep: 128×4 (2026-10-27)

sw128b (128×4, 4 hours), sw256 (256×6, 8 hours) and sw384 (384×8, 8 hours), one recipe, judged against decisions trained (`gpu-engine.md`, "The size sweep", has the table). sw128b leads at every matched decision count against greedy, gd-defensive and gd-stacker, and was still rising at its end. sw256 peaked at 131 million decisions and fell back at 184 million. sw384 ran out of the GPU's 12 GB at the recipe's batch (16,384, minibatch 2,048, and at minibatch 1,024; at batch 8,192 with minibatch 2,048 too), so it ran at 8,192 and 1,024 and is not a clean read of width; it reached 10%, 9% and 16% at 92 million decisions. The size is 128×4.

## v4.1, v5.1 and v6.1 seated, short of their bars (2026-10-27)

The owner seated all three fixes in place of v4, v5 and v6, which retire, although each failed its bar at 6 players ("v6.1's holdout", "v5.1 and v4.1"): ending the stall, which slowed every measuring run that seated the old bots, was worth the few Elo each gives up at 6 players. No unfinished game seated v4, v5 or v6, so none was deleted; their six finished games are kept and drawn from the list of retired bots. The fixes' Elo comes from the seatable ladder run with them in place.

## v5.1's and v4.1's stall: much reduced, not ended (2026-10-27)

`trace-cli --survey --mirror <bot> <n> --games 300 --prefix holdout-cap`, on the laptop, once both were seated:

| Mirror | Capped | Decided games' mean turns | Board armies at turn 100 | Losses ÷ income |
|---|---|---|---|---|
| 5 × v5.1 | 0 of 300 | 141 | 242 | 1.08 |
| 6 × v5.1 | 9 of 300 (3.0%) | 255 | 345 | 1.03 |
| 5 × v4.1 | 6 of 300 (2.0%) | 188 | 320 | 1.04 |
| 6 × v4.1 | 23 of 300 (7.7%) | 283 | 383 | 0.99 |

Against the bar of at most 1 in 300, only v5.1 at 5 players passes. Six v4s capped 42% (`stalled-games.md`), so v4.1 cuts it about fivefold; v5's own mirror wasn't measured here. The fix was chosen on v6; why it ends less of the stall on v4 and v5 isn't measured.

## The seatable ladder with v4.1, v5.1 and v6.1: the stall cut where the ladder pays for it (2026-10-27)

`risk:ratings -- --seatable` on GitHub Actions (run 40456163776, 3,096 new games, 50 minutes; every other matchup from the cache). Elo, greedy 1000: v6.1 1548, v5.1 1526, v4.1 1495, v3 1432, v2 1428, v1 1314, GD Stacker 1079, GD Continental 1070, GD Aggressive 1003, GD Defensive 973. Each fix rates 12 to 15 below the bot it replaces (v6 1560, v5 1538, v4 1510), the order unchanged.

The capped share of every ladder matchup a bot plays in, lone or among, against the last ladder's:

| | 5 players | 6 players |
|---|---|---|
| v4 → v4.1 | 4.5% of 470 → 1.2% of 430 | 16.7% of 564 → 4.8% of 516 |
| v5 → v5.1 | 2.7% of 450 → 0% of 440 | 11.5% of 540 → 2.3% of 528 |

A capped game plays 600 player-turns, about three decided 6-player games, so every new bot's ladder matchups against the old rule bots cost far less. A survey of a lone v6.1 and GD Defensive among each was started and stopped: the ladder measured the same thing on the tables that matter.

## v7.1's train gauntlet: better at every table (2026-10-27)

Rules 1 and 2 of `rule-bot-v7.1.md`'s bar, train seeds, on GitHub Actions (run 40409958461, from 845314d7, 60 shards, 7 rounds sized from the evidence, 8,974 games, 12.4 hours): `risk:gauntlet -- rule-v7.1 --base rule-v6 --field rule-v6,rule-v6.1,gd-defensive,gd-stacker,greedy`, 3 to 6 players, one-in and one-out, ±30 Elo a seat.

**All 40 pairings: better.** Against v6 and v6.1 at every table size, alone and in numbers, and against GD Defensive, GD Stacker and greedy (in numbers without losing a game).

| Against | 1 v7.1 alone (3p / 4p / 5p / 6p) | v7.1s against 1 (3p / 4p / 5p / 6p) |
|---|---|---|
| rule-v6 | 45.8 / 34.7 / 33.1 / 29.4% | 80.6 / 84.5 / 89.3 / 92.1% |
| rule-v6.1 | 66.7 / 39.3 / 37.3 / 37.5% | 74.5 / 83.7 / 90.8 / 91.8% |
| par | 33.3 / 25.0 / 20.0 / 16.7% | 66.7 / 75.0 / 80.0 / 83.3% |

Win Elo (rule-v6 = 0): v7.1 +116.5, v6.1 −7.3, gd-stacker −493, greedy −577, gd-defensive −610. Finishing order: v7.1 +55. v7 on the same seeds was +138 and +65, against a field without v6.1.

**Rules 1 and 2 hold on train seeds**: better than v6 at every table, worse than none. The holdout gauntlet and the seatable ladder are running.

**The cap.** Tables with five v7.1s capped 0 to 3.5% of their games, except against a lone GD Defensive at 6 players (14.4%, 340 turns); v7's five-v7 tables capped 44 to 58%. One v7.1 among five v6s capped 8.9%, among five v6.1s none.

## v7.1 seated: 1669 on the seatable ladder (2026-10-27)

Rule 3 of `rule-bot-v7.1.md`'s bar, on GitHub Actions: `risk:ratings -- --seatable` with v7.1 among the seatable bots (run 40465652335, from acd4881b, 10,080 games, 1,768 of 2,240 seed groups from the cache, 6.7 hours).

| Bot | Elo (greedy = 1000) |
|---|---|
| rule-v7.1 | 1668.6 |
| rule-v6.1 | 1536.2 |
| rule-v5.1 | 1513.1 |
| rule-v4.1 | 1493.2 |
| rule-v3 | 1428.3 |
| rule-v2 | 1421.7 |
| rule-v1 | 1312.3 |
| gd-stacker | 1084.4 |
| gd-continental | 1071.0 |
| gd-aggressive | 1010.4 |
| greedy | 1000 |
| gd-defensive | 975.0 |

v6's last Elo was 1560.3, so rule 3 holds. Alone among five v6.1s v7.1 won 41.7% of its 6-player games (par 16.7%); a lone v6.1 among five v7.1s won 12.5%. v7.1's 6-player matchups against v4.1 and v5.1 capped 2 and 3 of their games.

**Verdict.** Rules 1 and 2 (train seeds; the holdout dropped by the owner's choice), 3, 4 and 5 hold. v7.1 is seated beside v6.1, a new version: it fixes no seated bot, so nothing retires.

## net-v1 sw128b-450 beats v6 one-in (2026-10-28)

`net-v1~{"weights":"sw128b-450"}` (128×4, 472 million decisions trained): sw128b's snapshot at iteration 450, its peak on the GPU checks (one-in against m2a-50 23.8%, against par 20%) before it drifted down (`self-play-league.md`). On the laptop, beside a GPU training run.

`risk:gauntlet -- 'net-v1~{"weights":"sw128b-450"}' --base rule-v6 --field rule-v6 --players 5 --formats one-in` (600 games): **better**, 24.6% [21.2, 28.3] of 553 decisive games against par 20%, win Elo +46, finishing-order Elo +100, the lone net's mean place 2.44 against par 3.0, 0.4% capped. The first network better than a rule bot of ours at any table, and the first read that wins rather than only outlasting: sw128b-125 won 11.6% at the same table. One-out, `--formats one-out` (900 games): **better** too, four nets winning 83.4% [80.8, 85.8] of 845 decisive games against par 80%, win Elo +40, finishing-order Elo +149, the lone v6's mean place 3.81 against par 3.0, none capped. So M3 passes, one-in and one-out. Its holdout read was dropped by the owner's choice, as v7.1's was: sw128b-450 was picked by the GPU's checks, never by these seeds, so holdout seeds guard against nothing the train seeds don't.

## net-v1 sw128b-450 against v7.1: worse at both tables (2026-10-28)

The same net against v7.1, at 5 players, on GitHub Actions. Predicted before the run: it loses
clearly.

`risk:gauntlet -- 'net-v1~{"weights":"sw128b-450"}' --base rule-v7.1 --field rule-v7.1 --players 5 --formats one-in,one-out` (890 games): **worse** at both tables. One-in, 10.7% [7.3, 15.4] of 224 decisive games against par 20%, though the lone net's mean place was 2.96 against par 3.0. One-out, four nets winning 75.3% [71.7, 78.7] of 580 decisive games against par 80%, the lone v7.1's mean place 3.63. Win Elo −64, finishing-order Elo +82. The prediction held. The net outlasts v7.1 but converts far fewer games into wins: it survives, and v7.1 finishes. M4 stands open.

## vulture-v1: the card-killer's playbook as a native style bot (2026-10-28)

`native/src/bots/vulture_v1/`, designed in `vulture-v1.md` from Bot Killer's seat in all six games we have (G4FR, 9VFL, YUY4, 9PYK, YMS9, CZ7U). It is a persona, not a candidate: not seatable, no seating bar, measured only to know what it is.

**His moves.** By `risk-native agree-log`, on his 1,471 decisions it makes his exact move on 61.9% (sweeper-v1 57.4%, rule-v6.1 28.1%), and it is the closest of the three in every one of the six games. By kind: trades 58.7%, first placements 29.4%, attacks 52.6%, move-ins 92.5%, marches 12.0%.

**A 5-player native screen**, 1,000 games a pairing, lone seat rotated, against native-v1 at v6.1's settings ("v6.1"), GD's personas and greedy, par 20%:
- alone among v6.1s it wins 4.8% ± 0.7, and a lone v6.1 among vultures 51.1%;
- alone among GD Defensive, Stacker, Aggressive and Continental it wins 63.7%, 52.5%, 59.5% and 59.8%, and alone among greedys 58.2%;
- a lone GD Defensive among vultures wins 6.8%, a lone GD Stacker 2.9%, a lone greedy 11.9%;
- none of 500 vulture mirror games capped;
- about 3 µs a decision.

It is far stronger than sweeper-v1 against the yardstick bots and still rarely wins among v6.1s.


## native-v2: the baseline matches v7's gain, and the first switch screens (2026-10-28)

`native-v2` (`native-v2.md`): v7.1's search on native-v1 at v6.1's settings, with seven switches, each a knob. All screens here are native (`risk-native games --rotate`), 5 players, seeds `v2screen`, 8 workers on the laptop beside other runs, against native-v1 at v6.1's settings with v6's small-table cutoff ("v6.1": `native-v1~{"power":"armies","armyRounds":16,"armyBeyond":0.75,"reprice":"full","borderScale":1.2,"rivalBeyond":1.25,"minPlayers":5,"smallTableSeats":4}`), par 20%.

**The baseline against v6.1.** Alone among v6.1s, native-v2 wins 187 of 500 (37.4% ± 2.2), +151 win Elo a seat; a lone v6.1 among native-v2s wins 23 of 249 decisive (9.2% ± 1.8), native-v2 +156 a seat one-out, 1 of 250 capped. v7 at 8 replies measured +152 over v6 at 5 players on the TypeScript ladder: the port keeps the search's gain. Its decisions agree with v7.1's on 91.5% of CZ7U's v7.1 decisions (all of v6.1's own kinds, 17 of 46 turn-start placements, where v7.1 itself chose on noise).

**Each switch alone, and two pairs, alone among v6.1s** (same seeds as the baseline's 37.4%):

| Label | Wins | Win Elo a seat |
|---|---|---|
| baseline | 37.4% ± 2.2 | +151 |
| `execute` | 43.8% ± 2.2 | +198 |
| `kinds` 1 | 38.2% ± 2.2 | +157 |
| `margin` 2 | 29.2% ± 2.0 | +87 |
| `feed` 1 | 35.1% ± 2.1 | +134 |
| `threat` | 35.2% ± 2.1 | +135 |
| `hoard` | 35.3% ± 2.1 | +135 |
| `execute` + `feed` | 43.0% ± 2.2 | +192 |
| `execute` + `kinds` | 44.8% ± 2.2 | +205 |

`humans` isn't screened: a bot-only table has no person's seat.

Read as screens, not verdicts: a lone seat among v6.1s measures an edge over v6.1, not over the baseline, and 500 games separate about 6 points of win share. `execute` is the one clear gain (6.4 points over the baseline on the same seeds); `margin` at 2 standard errors is a clear loss (the search's overrides of v6.1 are worth more than their noise suggests); `kinds`, `feed`, `threat` and `hoard` are within the noise of the baseline alone; `kinds` on `execute` leans better than `execute` alone.

**Time.** A native-v2 turn on one core, measured in these screens beside other runs: median 0.27 to 0.35 s, nine in ten under 0.50 to 0.79 s; the longest single turns were 3 to 16 s (the 16 s under `execute` + `kinds`, which searches the most candidates), all on a loaded machine. v7.1's own was 2.5 s a turn on average.
