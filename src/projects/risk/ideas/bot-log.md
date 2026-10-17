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
