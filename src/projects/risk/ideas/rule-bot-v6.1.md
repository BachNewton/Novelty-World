# Risk bot v6.1: v6 without the stall

v6.1 (`bots/rule-v6.1/`, label `rule-v6.1`) is built and not yet measured. It is a candidate to replace v6 in its lobby seat: v6 is seated and frozen, and its bot-only tables at 5 and 6 players run to the turn cap (`stalled-games.md`). v6.1 is v6 with one change, the one the diagnosis points at, and is meant to play v6's moves everywhere else.

## The fix

v6's evaluation charges `borderWeight × borderLoss / total`, and `borderLoss` (`rule-v6/opponents.ts`, `forecast`) is the **sum** over every opponent of its aim at me times the hit it could deal me. Summed, the charge counts every opponent's blow as if all of them landed at once, so it grows with the table while my share of the power shrinks, and it is cut most by stacking up and never thinning out. With four or five opponents each seat's best move becomes a card capture and a bigger stack, and the table freezes. Lowering `borderWeight` to 0.25 or 0 removed every stall at 6 players, but shrinks the term at every table, including the small ones where it never caused trouble.

v6.1 changes how the term gathers the opponents, a setting `border`:

| `border` | The border loss | |
|---|---|---|
| `"sum"` | every opponent's aim × hit added up | v6's; plays exactly v6's moves (a test holds it) |
| `"max"` | the single opponent with the largest aim × hit | the worst blow I could take this round |
| `"mean"` | the sum over the number of opponents counted | the typical blow; doesn't grow with the table |

An opponent counts when v6's model sees it reach me: it borders me, or its sweep reaches me through a third player (any aim case but "apart"). With one opponent counted the three modes agree. `borderWeight` stays tunable beside it, so the screen can also move the weight a mode is played at.

**The default is `"max"`, provisionally.** The screen below picks the mode that goes forward (and its weight, if a mode needs one other than v6's 0.5); `V6_1_PARAMS` is set to its pick before the bar is run.

**Where the change reaches.** The border loss feeds a decision only through the evaluation's value, and every board v6 scores goes through the settings' scorer (`scoreOf` in `rule-v6/evaluate.ts`): the planner's plans (and so the attacks, the trade decision and the move-in, which are all read off the best plan), the fortify, and the `homeward` credit, which adjusts the breakdown before scoring it. v6.1 swaps the scorer (`border.ts`): v6's value with v6's summed charge taken back out and `border`'s put in, its per-opponent terms from v6's own opponent model, with the settings and opponent record the decision plays by. That is why v6.1 has its own entry point (`index.ts`, v6's copied): the scorer must be bound to the table's preferences and this game's record, which v6 works out inside its bot. Everything else is v6's by import. The opponent model's kill beliefs, power, spared chances and common threat don't read the border loss, so they are v6's unchanged. One other sum over opponents is left as it is: the `gather` fortify picks the move that most cuts the opponents' summed sweep costs, but only compares fortifies with one another, never against the share of power, so the sum doesn't tilt it towards hoarding.

**At every table.** The mode applies at 3 and 4 players too, where v6 never stalled: the overcount is the same flaw there, smaller with two or three opponents. If the bar finds v6.1 worse at a small table and even at the large ones, the next step is the mode at 5 and 6 players only.

**What it costs.** The scorer asks v6's opponent model again for each board it scores (v6's breakdown keeps only the sum), so a decision costs about half as much again as v6's: on the online games' positions, 2.4 ms against 1.55 ms. If v6.1 is seated, a speed-only change (its own breakdown carrying the per-opponent terms) can remove that, bit for bit, under the frozen test.

## Behaviour against v6

`npm run risk:agreement` asks v6 and the candidates every decision of a set of positions, and reports how often each decides as v6 does, by kind (placement, trade, attack, move-in, fortify). Positions come from online games' exported move logs (`--online`, every seat's decisions, the people's included) or from v6's own games (`--games`, v6 in every seat). On the three finished online games (G4FR, 9VFL, YUY4, 2,616 decisions):

| | placement | trade | attack | move-in | fortify | all |
|---|---|---|---|---|---|---|
| `"sum"` | 100% | 100% | 100% | 100% | 100% | 100% |
| `"max"` | 75.4% | 94.0% | 78.3% | 80.7% | 91.7% | 80.4% |
| `"mean"` | 74.9% | 93.9% | 79.0% | 81.1% | 96.8% | 81.2% |

A fifth of the decisions move. These are 5-player games, with three or four opponents counted on most boards, so the larger tables are where the two modes differ most from the sum; at 3 players they will agree with v6 more.

## Measuring it

Fixed before any run. Every command below is exact and none has been run. They play locally from a checkout of this branch; each gauntlet runs as well on GitHub Actions with the same arguments (`docs/actions.md`). A run that holds the machine for long needs the owner's go-ahead (the root `CLAUDE.md`).

### 1. The screen (5 and 6 players)

The candidates: `"max"` and `"mean"` at v6's weight, and as the reference the ablation already found stall-free, `"sum"` at weight 0.25. For each, the cap rate on a mirror table, 100 games at each table size:

```bash
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"max"}' 5 --games 100 --prefix screen-v6.1
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"max"}' 6 --games 100 --prefix screen-v6.1
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"mean"}' 5 --games 100 --prefix screen-v6.1
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"mean"}' 6 --games 100 --prefix screen-v6.1
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"sum","borderWeight":0.25}' 5 --games 100 --prefix screen-v6.1
npm run risk:trace -- --survey --mirror 'rule-v6.1~{"border":"sum","borderWeight":0.25}' 6 --games 100 --prefix screen-v6.1
```

and a quick gauntlet against v6, both mixtures, train seeds, at most 2,000 decisive games a pairing:

```bash
npm run risk:gauntlet -- 'rule-v6.1~{"border":"max"}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npm run risk:gauntlet -- 'rule-v6.1~{"border":"mean"}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npm run risk:gauntlet -- 'rule-v6.1~{"border":"sum","borderWeight":0.25}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
```

and the behaviour on v6's own games beside the online ones:

```bash
npm run risk:agreement -- --games 10 --players 5,6 --prefix agree-v6.1 --candidate 'rule-v6.1~{"border":"max"}' --candidate 'rule-v6.1~{"border":"mean"}' --candidate 'rule-v6.1~{"border":"sum","borderWeight":0.25}'
```

**The pick.** A candidate with 2 or more capped games in 100 at either table is out. Of the rest, one whose screen is "worse" in any pairing is out. Of what remains, the one with the highest agreement with v6 (all decisions, the online and the v6-game positions together) goes forward: the fix with the most v6-like play. If none remains, the screen's numbers go to the owner with the next candidates (a mode at another weight, or the mode at 5 and 6 players only) before anything else runs. `V6_1_PARAMS` is set to the pick, its label then plain `rule-v6.1`.

### 2. The bar for replacing v6

On holdout seeds, never used by the screen:

```bash
npm run risk:gauntlet -- rule-v6.1 --base rule-v6 --field rule-v6 --players 3,4,5,6 --prefix holdout
npm run risk:trace -- --survey --mirror rule-v6.1 5 --games 300 --prefix holdout-cap
npm run risk:trace -- --survey --mirror rule-v6.1 6 --games 300 --prefix holdout-cap
```

- **Strength: "even" against v6 in every pairing**, 3, 4, 5 and 6 players, one-in and one-out, each pairing's SPRT at the gauntlet's defaults (±30 Elo a seat, α = β = 0.05, at most 20,000 decisive games). A pairing still undecided at its cap hasn't passed: it is rerun with a higher `--max`, never read as even.
- **"Worse" in any pairing fails.** v6 keeps its seat, and the mode at 5 and 6 players only is the next candidate.
- **"Better" in any pairing (and worse in none) means a stronger bot,** not v6's replacement: it gets a name of its own (the next version) and goes through the full suite and seating like any new version, and v6 keeps its seat.
- **No stall: at most 1 capped game in 300 on each of the 5- and 6-player mirror tables** (an upper 95% bound under 1.6%; 0 in 300 puts it under 1%), against v6's 10% and 15%.
- **Behaviour agreement is reported, not gated.**

If it clears the bar, v6.1 takes v6's lobby seat in `online/seat-roster.ts` (what happens to tables already seating v6 is settled then), its frozen fingerprints are taken, and the seatable ratings are rerun. Until then it is registered for measuring only.
