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
