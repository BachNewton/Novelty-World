# Risk bot log

What was tried on Risk's bots and what each measured, negative results included, so an idea is not walked twice. Append-only in spirit: a later finding gets its own entry rather than rewriting an old one. Dates appear only as the context of a measurement. The method is Monopoly's (`monopoly/bots/docs/METHOD.md`): reasoning proposes, measurement selects.

## v1, the rule-based bot (`bots/rule-v1/`)

v1 is the design in `rule-bot-v1.md`, built in one pass, then corrected where its scenario tests (`bots/rule-v1/scenarios.test.ts`) showed a judgement an expert wouldn't make. Each correction below came from a scenario, with the reasoning that fixed it.

### Built differently from the design, and why

- **Re-planning.** A bot is a pure function of its view, so v1 keeps no plan between decisions: it plans afresh at every one (each placement, after every blitz, at every move-in). The design's "re-plan after a blitz that falls short" is that, every time. Each blitz stops early enough (about one and a half times the capture's expected cost, or when the rest of the run falls under a 15% chance) for the next decision to look again.
- **Chains** are not rolled out. A kill whose cards force a mid-turn trade is scored with the trade's armies on the board; the next kill is planned when the bot is next asked, from the board as it is. The one work knob is instead **outcomes sampled per plan** (0: a plan is scored on its success and its likeliest failure, both exact; n: n sampled ends).
- **Setup placement** (§2.1) was built and then removed: setup became the deal's automatic placement (RISK: Global Domination's Auto Placement), with no decision left in it, so `stackTarget` went with it. Scenario 11 went too.
- **The view gained `cardEarned`** (whether the seat to move has captured this turn). It is public, and without it a stateless bot can't tell whether a capture earns a card.

### Corrections the scenarios forced

- **Lead penalty** was a cut of my whole share once I became the common threat: in scenario 1 that made a sure mid-cash kill (share 0.26 → 0.49) look worse than taking one territory. It now counts only the power past the point that turns the table on me, at weight 0.1. The threat model already makes everyone aim at a leader, so most of the lead's cost is modelled, not a penalty.
- **Common threat** subtracted the leader's whole power, which jumped when the test flipped: a kill that happened to drop the leader's ratio below the trigger gained the whole term. It now counts the leader's power past the trigger, which is continuous.
- **Forced-trade armies** were put on the last territory a run took, usually interior after a kill, so the idle-army term punished the kill. They now go on the front stack, as the bot would place them.
- **Border exposure** priced a territory's armies as the stake, so reinforcing a threatened territory raised its stake and looked useless (scenario 13 fortified away from the larger threat). It is now each opponent's best blow: the armies it would win from me in the exchange (big battles favour the attacker), or a held continent of mine broken, reached through at most one of my territories.
- **Third parties.** Scenario 3 committed a 42% kill of a card-holder sitting beside the leader. Two pieces of the design's threat model were missing: each opponent taking the best kill of a third player before my next turn (the victim's power goes, its cards go to the killer), and the next-turn kill opportunity discounted by the chance an earlier opponent takes it first. With both, the damage I'd leave is priced as a gift to the leader.
- **Others' cards** were their hand only, so a trade, which raises the next set's value, cost nothing when nobody else held cards. Others' card equity now counts the cards they will draw over the income horizon (0.8 a turn, pinned in the opponent model).
- **Card-less buffers** (scenario 17): the design's filter is now in the plan generator: at 5 or 6 players, no plan finishes a victim with no cards.

### Open: holding cards (scenarios 4 and 7)

v1 trades at 4 cards, and trades a second set at 6, whenever the armies buy the smallest edge: its evaluation counts a card as a third of the set value it will trade at, the same as the armies the trade gives, so holding is worth almost nothing when nobody else is about to trade. Experts hold. Whether a price for holding makes v1 stronger is a measurement; the scenarios are marked as expected failures until it is made.

### Speed

A 6-player self-play game first averaged 78ms a decision (worst 4.8s), 95% of it in path runs the threat model asked for again and again. Remembering path runs (they are pure) and dropping chances under 10⁻¹² brought that to 6.5ms (worst 123ms), with the engine about 2% of a game.

### Against greedy (gauntlet, 2026-10-16)

`risk:gauntlet -- rule-v1 --field greedy,random --base greedy`, train seeds, 14 workers (random was named by mistake; the run was stopped before any of its pairings). Every pairing that finished was decided **better** for v1 at the ±30 Elo SPRT, and most within a few dozen decisive games, which a 30-Elo test only does when the edge is far larger than 30 Elo:

| Pairing | Decisive games to decide |
|---|---|
| 1 v1 vs 2 greedy (3p) | 69 |
| 2 v1 vs 1 greedy (3p) | 435 |
| 1 v1 vs 3 greedy (4p) | 48 |
| 3 v1 vs 1 greedy (4p) | 148 |
| 1 v1 vs 5 greedy (6p) | 36 |

The sixth pairing (5 v1 vs 1 greedy, 6p) was stopped after about 40 minutes, with the pool running on about 3 of its 14 cores: tables of five v1s are the costliest games there are, and a few long ones held each batch. No Elo was fitted, since the run did not finish. greedy has done its job as v1's bar; like `random`, it now stays out of v1's successors' fields, which are v1 and later versions, and is named only for a floor check. The slow 6-player tail is a speed question for v1 (where its time goes), not a reason to add weaker opponents.
