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

v6 (`rule-bot-v6.md`, `bots/rule-v6/`) is v5 with seven fixes for what 9VFL showed (a 5-player game the winner of G4FR won again, over Kyle, v3, v4 and v5; its seed and 821 moves are a fixture), each a switch so a screen can seat v5 with one of them (`rule-v6~{"fork":1,...}`): `fork` (a kill whose victim splits at the stack, costed cheap group first), `movein` (a single capture scored on the move-in that keeps the stack home), `alive` (preferences by the seats still alive), `gather` (when a big sweep against me is believed, the fortify that most cuts it), `homeward` (the stack at a run's end isn't charged as idle: the turn's fortify is still to come), `thirdParty` (an opponent's sweep may break through a third player to reach me) and `reinforced` (next turn's kill weighed with the victim's income on its defence). With every switch off v6 plays v5's moves exactly (`parity.test.ts`). Registered with every fix on; not seated.

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
