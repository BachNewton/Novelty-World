# Risk bot v7.1: v7's search on v6.1

v7.1 (`bots/rule-v7.1/`, label `rule-v7.1`, and at any budget by a tuned label such as `rule-v7.1~{"replies":8}`) is built and not seated. It is v7 (`rule-bot-v7.md`) rebuilt on v6.1 (`rule-bot-v6.1.md`), so that v7's strength comes without v6's stall. This doc fixes its seating bar and measurement plan before any run; `bot-log.md` has every measurement.

## Why it exists

v7 beat every bot at every table on train and holdout seeds, and topped the ladder by about 115 win Elo over v6. It wasn't seated because it inherits v6's stall: tables of v7s at 6 players capped about half their games (`bot-log.md`, "v7's train gauntlet"). v6.1 ends the stall in v6 at about v6's strength (the same Elo on the ladder: better at 5 players, short at 6), so v7's search is moved onto it rather than v7 being seated with the flaw. v7 was never seated, so v7.1 replaces nothing in the lobby; v7 stays registered as the search's first measurement. v6.1 itself failed its bar at 6 players (`bot-log.md`, "v6.1's holdout"), about 15 Elo a seat short of v6 there, so v6 stays seated; v7.1 is a new version, held to the bar below against v6, and needs v6.1 only as its base.

## What changes from v7

Three things, each so the search plays and scores as v6.1 does:

- **The plans and every other decision are v6.1's.** The candidates are v6.1's best few, from its planner, scored by v6.1's settings as the table-size gates leave them at the decision; trading, attacking, moving in and fortifying are v6.1's own moves.
- **The replies seat v6.1.** My own play after the placement is v6.1's, and v6.1 takes v6's place in the reply bots' mix, at the same weight. GD Aggressive and greedy stay.
- **The standing prices armies as v6.1 does.** Where v6.1's settings are in effect with `power` "armies", the leaf counts every seat's armies at v6.1's price (mine at `armyBeyond` past `armyRounds` rounds of board income, a rival's at `rivalBeyond`) and scales the threat's bar by `threatScale`. Otherwise a search would choose between plans v6.1 scored on priced power by a standing that prices a hoard at face value, and the search, not the plans, would decide what a stockpile is worth.

Its search settings are v7's (8 replies, 4 candidates, the mixed replies), chosen by v7's budget curve: the search itself is unchanged, so the curve isn't measured again. Below 5 players v6.1 is v6, so there v7.1 is v7 with v6.1 in the replies.

## The seating bar, decided before the runs

v7.1 is seated at 8 replies only if all of these hold:

1. **Against v6**, the seated bot it is built over, on train seeds and then holdout: better at one table or more, worse at none (each pairing's SPRT at ±30 Elo a seat, 3, 4, 5 and 6 players, one-in and one-out).
2. **Against v6.1 and the weak bots** (gd-defensive, gd-stacker, greedy), in the same gauntlets: worse at none.
3. **On the seatable ladder**, with every seatable bot: v7.1's win Elo above v6's.
4. **It fits a real game's turn**: nine turns in ten under 5 seconds on the laptop's one core, as v7's rule 5.
5. **No stall**: at most 1 capped game in 100 on each of the 5- and 6-player mirror tables (an upper 95% bound under 4.7%), against v7's tables of v7s, which capped about half their 6-player games; a reckless-short mirror (decided mean under 70 turns at 5 players or 90 at 6) fails too.

The holdout gauntlet of rule 1 was dropped by the owner's choice once the train gauntlet was better in all 40 pairings: v7.1 was tuned on no seeds (its settings are v7's, its plans v6.1's), so holdout seeds guard against nothing the train seeds don't, and its run was cancelled unfinished. Rules 1 and 2 are read on train seeds.

v4 and v5 are not in the field (the Risk `CLAUDE.md`): they stall a bot-only table worst, and v7 already beat them at every table. The bar was first written against v6.1 as if it would be seated; it was moved to v6 when v6.1 failed, before any v7.1 result was read.

## Measuring it

From branch `claude/v6.1-hoarder`, on GitHub Actions (`docs/actions.md`); the stall mirrors on the laptop. v7's train suite needed 100 shards to keep each machine inside Actions' six-hour job limit, most of it in capped 6-player games; v7.1's are meant not to cap, so it starts at 60.

```bash
gh workflow run risk-measure.yml --ref claude/v6.1-hoarder -f tool=gauntlet -f shards=60 -f args='rule-v7.1 --base rule-v6 --field rule-v6,rule-v6.1,gd-defensive,gd-stacker,greedy'
```

```bash
gh workflow run risk-measure.yml --ref claude/v6.1-hoarder -f tool=gauntlet -f shards=60 -f args='rule-v7.1 --base rule-v6 --field rule-v6,rule-v6.1,gd-defensive,gd-stacker,greedy --prefix holdout'
```

```powershell
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v7.1 6 --games 100 --prefix holdout-cap
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v7.1 5 --games 100 --prefix holdout-cap
```

The turn time is read as v7's was (`rule-bot-v7.md`, "Cost"). The ladder is the seatable ratings run once v7.1 joins the seatable bots.
