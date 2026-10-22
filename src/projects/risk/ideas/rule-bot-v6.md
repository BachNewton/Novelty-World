# Risk bot v6: v5 with the fixes two human games showed

v6 (`bots/rule-v6/`) is built and measured, and it clears its seating bar (below, under "Measuring it"), so it is seated, and it tops the seatable ladder. The screens kept six of its seven fixes: every one but `movein`. `bot-log.md` has the build's entry and every measurement.

v6 is v5 (`rule-bot-v5.md`) whole: v4's beliefs, fixes and preferences, and v5's sweep. It adds seven fixes, each for a mistake a person's win showed, and each a switch in its settings (`Fixes` in `params.ts`), so a screen can seat v5 with any one of them and pin a result on it. With every switch off v6 plays v5's moves exactly. A parity test held it to that while v6 was built; once v5 and v6 were both seated, their frozen fingerprints (`bots/frozen.test.ts`) caught everything it could, so it was deleted. v6 keeps only the files it changes and shares the rest from v5, v4, v3 and v1: its own capture planner order (`routes.ts`), kill chance (`kills.ts`), opponent model (`opponents.ts`), evaluation (`evaluate.ts`), planner (`planner.ts`), move-in and fortify (`decisions.ts`) and entry point, each v4's or v5's line for line wherever its switches are off.

## What 9VFL showed

In 9VFL, a 5-player game (`bots/rule-v6/9vfl.json`, its seed and 821 moves from the database), the person who won G4FR ("Bot Killer") beat Kyle, v3, v4 and v5 with the same playbook: Australia held with one guard on Siam, everything on one stack, about 4.4 captures a turn against the bots' 2, the stack pulled back to a hub after each sweep, and a card every turn. A replay of the game, each bot's decisions read again on the board it had (`9vfl.test.ts` checks the replay: v4 and v5 make their recorded moves), found five kinds of mistake. In order of what they cost:

1. **A kill lost at a fork.** At turn 57 v4 planned to kill Kyle (5 cards) at 97%, took Venezuela and moved 42 in. Kyle's land was now two groups, Peru and Argentina, and North America with Iceland and Kamchatka, both reachable only from that one stack. v3's capture planner, which v4 uses, costs a victim's groups in the order its territories are listed, and a stack leading one group has only what that group's run leaves it for the next: it spent the stack on North America first, so Peru and Argentina had nothing, and the kill read 0. v4 held with 42 on Venezuela.
2. **Declined cards.** v4 turned down a sure capture of a 1-army neighbour six times (turns 41, 45, 69, 72, 75 and 78). At turn 72 holding scored 0.2148 against 0.2067 for taking Brazil.
3. **No consolidation.** At turns 87 and 88 v4 believed Bot Killer's sweep would take 20 of its territories (he took 21) and still spread to 24 territories, its biggest stack 11, and fortified forward. v5 never pulls back after its sweeps.
4. **A sweep through a third player.** At turn 59 v4 believed Kyle's sweep would take none of its territories: no territory of his touched one of v4's. He went from Iceland through v5's Great Britain and Western Europe into v4's Africa, and took 5.
5. **Parked stacks.** v4 sat 44 to 56 armies on Venezuela for ten turns (72 to 81), waiting on a kill of Kyle that never came nearer. At turn 68 v5, on one territory with 28 armies, held (0.0741) rather than make a sure 9-capture sweep (0.0623), and was eliminated two turns later.

## The fixes

Each is one switch. The test that pins it reads the position with that switch alone on, against v5.

### `fork`: a kill at a fork stays a kill

The victim's groups are costed cheapest first (their defenders and the army each capture leaves), so a stack that leads two of them drops its detachment for the cheap one and goes on with the rest, which is how the turn is played: the move-in leaves the detachment at the fork. A group's own order is v3's. It is a reordering of the targets v3's planner already takes, so it costs almost nothing. The fixed kill chance is the one the planner offers kills by, the opponent model believes others' kills by, and the evaluation weighs next turn's kill by.

At turn 57, after "Brazil to Venezuela, 42 in", the kill reads 0.957 where v4 read 0, and v5 with `fork` goes for it: Peru first from Venezuela, keeping the rest for Central America. v5 without it sweeps three territories of North America.

The same order also fixes the turn's earlier plan in part: the route from Venezuela through Peru and Argentina then on to Central America, which don't border, is v3's way of costing a fork as one line (its doc calls it "a slight optimism"). The success board already splits the armies between the branch ends, and the move-in leaves the detachment, so it was the costing order, not the line, that lost the kill.

### `movein`: a sure card is worth its card

v4's success board for a single capture splits the armies evenly between the two territories whenever both face an enemy, but the move-in weighs keeping them home too. At turn 72 that half stack moved away was what made holding win: split, the capture raised the expected border losses from 1.5 to 10.4; with three moved in and 44 kept on Venezuela, they hardly move, and the capture scores 0.2199 against holding's 0.2148. A single capture is now scored on the better of v4's split and the fewest armies in, and only where the two differ (both territories facing an enemy).

At turn 78 v5 holds; with `movein` it takes Brazil, keeping 50 on Venezuela. It doesn't flip all six: at turn 41 the capture of South Africa would fill v4's hand to three, and the opponent model believes a 3-card hand makes a kill pay, so the kill exposure rises (0.17 to 0.23), a cost the model measures rather than a mistake.

### `alive`: preferences by the seats still playing

v4 plays the small table's preferences (tuned at 3 and 4 players) only at a table that started with 4 or fewer, so a 5- or 6-player game plays the large table's (v3's, never tuned on v4's beliefs) down to the last three. With `alive` on, the seats still alive decide. In 9VFL v4 played the large table's two players from the end. This is the variant `rule-bot-v4.md`'s open question asked for.

It is the fix with the most visible risk: at G4FR's turn 89, with three alive, v5 with `alive` spreads to 20 territories with its biggest stack on 3, where v5 ends on 13 with a stack of 8 (the small table's preferences fear their own death less). A screen at 5 and 6 players decides it.

### `gather`: the fortify that cuts the believed sweep

When an opponent's sweep is believed to take a third of my territories or more, the fortify is the move that most cuts what the opponents' believed sweeps cost me (their sum), if any move cuts it; otherwise v4's fortify. A stack moved onto a choke point stops a sweep there, and two stacks moved together make one a sweep can't take, so this guards choke points and gathers to a hub without a new weight: the opponent model already says where the sweeps go.

It doesn't change turn 87. There v4 believed the sweep would take 20 of its 24 territories, the rule fires, and the move that cuts it most is the one v4 made (10 armies from Ontario to Scandinavia): nothing a fortify can do saves a spread that wide. The spread came in the attack phase, after the kill, where the evaluation weighs each capture's income and card against the believed sweep at the border weight (about half). That is a preference, which a retune of the large table sets, not a rule.

### `homeward`: the turn's fortify is still to come

A run that ends behind my lines leaves its stack there for the turn's fortify to take back to the front, which is how the winner brought his stack home after each sweep. v4's evaluation charged that stack as idle when it scored the plan, so a sweep that ends deep in what it took lost to holding: at 9VFL's turn 68 v5's sweep ended on Japan with 17 armies idle. With `homeward` on, the stack at a run's end isn't charged as idle when the plan is scored; any other idle armies still are, and the move-in and the fortify are scored as before.

At turn 68 v5 with `homeward` sweeps (0.0800 against holding's 0.0741). A first build credited the biggest idle stack anywhere, and that leaked into the move-in (two of v4's move-in scenarios flipped: armies left idle on a source cost nothing once credited), so the credit is only for the stack at a run's end.

v5's dropped "next turn's sweep" (`rule-bot-v5.md`) also wanted the stack home, by valuing the stack for what it could take next turn; it made every capture score lower and the bot sat. `homeward` changes no capture's worth except by the idle charge at its own end, which only ever raises it.

### `thirdParty`: a sweep that crosses a third player

An opponent's sweep may also start from its biggest stack, everything to place on it, when that stack isn't beside me: it breaks through at most two of a third player's territories, each a sure capture, to the territory beside mine it reaches with the most armies, and sweeps me from there. The worse of that and v4's sweep is the one believed, for my exposure and for the aim's share alike, and an opponent that doesn't border me can now aim at me through it.

At the end of v4's turn 57, v4 believed Kyle's sweep would take none of its territories; with `thirdParty` it believes 6 (he took 5, two turns later).

### `reinforced`: a kill next turn has to beat this turn's reinforcements

v4 weighs next turn's best kill on the board as it stands, as if the victim placed nothing before it, so a stack starved of income sat beside a kill that never came nearer. With `reinforced` on, the victim's expected income goes on its territory facing my strongest launch (beside it, or a third player's territory away), where my kill would have to start.

At turn 68 the 37% kill of v4 that kept v5 on Egypt is weighed against v4's next placement, and v5 takes Middle East instead of holding. The parked Venezuela stack was waiting on a 25% kill the same way.

## Played on G4FR's positions

v5's G4FR test plays whole turns of v3's seat from the position v3 had (`rule-v5/g4fr.test.ts`). The same turns played by v6, each fix alone and all together (territories at the turn's end, biggest stack, and the most of them a person's sweep is believed to take):

| Turn | v5 | `fork` | `movein` | `alive` | `gather` | `homeward` | `thirdParty` | `reinforced` | all |
|---|---|---|---|---|---|---|---|---|---|
| 56 | 20, 3, 12 | same | 16, 5, 7 | 20, 4, 11 | 20, 3, 14 | 19, 4, 11 | same | 19, 3, 10 | 21, 3, 18 |
| 62 | 25, 3, 10 | same | 25, 3, 7 | 21, 6, 8 | same | same | same | 20, 8, 7 | 19, 6, 6 |
| 71 | 18, 12, 10 | same | same | same | same | same | same | same | 18, 15, 9 |
| 89 | 13, 8, 11 | same | same | 20, 3, 13 | same | same | same | 13, 6, 11 | 20, 3, 13 |

Most fixes leave most turns alone, as they should: each is about one kind of position. `movein` and `reinforced` end turns smaller and less exposed; `alive` spreads thin at turn 89, and does so in the whole set too.

## Left out, and why

- **Marching a starved stack toward the common threat.** The parked stacks in 9VFL were waiting on a kill that the board as it stood promised and the victim's next placement would take away; `reinforced` prices that wait honestly, and `homeward` lets a stack's sweep end deep. A rule that marches a stack by its income would overrule the evaluation instead of informing it, and v5's dropped experiment showed how easily a stack's future is mispriced.
- **Spreading after a kill.** Turn 87's spread is a preference (the border weight at a large table), so it belongs to a large-table retune on v6's beliefs, not to a rule. `rule-bot-v4.md`'s open question about tuning the 5- and 6-player preferences stands.
- **Planning a fork jointly.** Costing groups cheapest first is exact for the case that cost the kill (one stack, one cheap group beside the fork) and changes nothing else. A joint plan over several stacks and groups would be a new planner.
- **Who is a person.** As in v4 and v5. Two human games are fixtures now; the beliefs are scored on people once there are a dozen or so.

## Cost

Per decision, as a multiple of v5's, both asked the same decisions (a v5 seat among v5s, 12 games a table size capped at 150 turns, both bots asked each of the seat's decisions, taking turns going first):

| Table | All fixes | `fork` | `movein` | `alive` | `gather` | `homeward` | `thirdParty` | `reinforced` |
|---|---|---|---|---|---|---|---|---|
| 3p | 1.33 | 1.03 | 1.23 | 0.98 | 0.96 | 1.02 | 1.02 | 1.08 |
| 4p | 1.35 | 1.08 | 1.32 | 1.06 | 0.96 | 1.08 | 1.10 | 1.09 |
| 6p | 1.41 | 1.06 | 1.28 | 1.00 | 0.97 | 1.01 | 1.16 | 1.07 |

`movein` is most of it: one more scored board for each single capture where both territories face an enemy, which is most of them. `thirdParty` is the rest at 6 players, a second sweep for each opponent whose biggest stack isn't beside me. v5's decision costs about three times v4's, so v6's is about four times; a v6 that keeps `movein` should earn it on the screens.

## Screens

Each fix alone, and all of them, against v5, alone among two v5s at 3 players, train seeds `screen-v6:*`, capped at 600 decisive games (about 70 seconds each on 12 workers):

| v5 with | Win share vs par 33.3% | Win Elo a seat | Verdict |
|---|---|---|---|
| every fix | 32.8% [29.2, 36.7] | −4 | inconclusive |
| `fork` | 34.0% [30.3, 37.9] | +5 | inconclusive |
| `movein` | 31.2% [27.6, 35.0] | −17 | inconclusive |
| `homeward` | 31.7% [28.1, 35.5] | −13 | inconclusive |
| `reinforced` | 33.8% [30.2, 37.7] | +4 | inconclusive |

None is a big loser, and 3 players can't tell them apart: each changes a few decisions a game, and near-identical bots take thousands of games to separate. `alive`, `gather` and `thirdParty` weren't screened there: `alive` does nothing at a table that starts with 3 or 4, and the other two act on spread-out boards and third players, which a 3-player game rarely has. The games that showed every fault were 5-player games, so the screens that choose v6's set are at 6 players, below. No 3-player game hit the turn cap.

At 6 players, on GitHub Actions: one v6 among five v5s, train seeds `screen-v6:*`, at most 2,000 decisive games each (runs 39376243877 to 39376263609):

| v5 with | Win share vs par 16.7% | Win Elo a seat | Games | Cap rate | Verdict |
|---|---|---|---|---|---|
| `alive` | 20.1% [17.5, 23.0] | +40 | 1,074 | 25.0% | **better** |
| `gather` | 17.2% [15.6, 18.9] | +6 | 2,694 | 25.6% | inconclusive at the cap |
| `fork` | 17.0% [15.4, 18.7] | +4 | 2,562 | 25.8% | even |
| `homeward` | 16.9% [15.1, 18.7] | +3 | 2,226 | 24.6% | even |
| `thirdParty` | 16.8% [15.0, 18.7] | +2 | 2,082 | 24.3% | even |
| `reinforced` | 16.7% [14.9, 18.7] | +1 | 1,914 | 24.3% | even |
| `movein` | 15.9% [14.4, 17.6] | −9 | 2,616 | 23.5% | inconclusive, leaning worse |
| every fix | 17.9% [16.3, 19.6] | +15 | 2,604 | 23.1% | inconclusive |

Only `alive` pays, and it pays plainly: the large table's preferences, played down to three survivors, were costing v5 about 40 Elo a seat. The six fixes for single positions change too few decisions to show at this size; they are corrections that cost nothing measurable, and nothing measurable is gained. `movein` leans worse at both table sizes and is most of the cost, so it is dropped. Every fix together came out below `alive` alone, so the bundle gives back some of what `alive` wins. The cap rate is about 24% in every screen; v5 among v4s ran 34 to 38%, so v5-only tables end more often, and no fix moved it.

Two sets go to a last screen before v6 is fixed: `alive` with `fork` (the bug fix that cost the kill, which leans above par at both sizes for 4% more work), and every fix but `movein`. The choice, fixed before they report: the larger set whose win share is inside `alive`'s interval (17.5% or more) is v6; failing both, v6 is `alive` alone.

| v5 with | Win share vs par 16.7% | Win Elo a seat | Games | Cap rate | Verdict |
|---|---|---|---|---|---|
| `alive` and `fork` | 20.3% [17.5, 23.4] | +42 | 966 | 26.1% | **better** |
| every fix but `movein` | 19.4% [17.2, 21.7] | +32 | 1,608 | 25.2% | **better** |

Both are better than v5, and the larger is inside `alive`'s interval, so **v6 is every fix but `movein`**. The two can't be told apart at this size; the larger set is kept because each of its fixes is right on the position it was built for and none measurably costs.

## The seating bar, decided before the runs

v6 is seated only if all of these hold:

1. **Against v5**, on train seeds and then holdout: better at one table or more, worse at none (each pairing's SPRT at ±30 Elo a seat, 3, 4 and 6 players, one-in and one-out).
2. **Against the weak bots** (gd-defensive, gd-stacker, greedy), in the same gauntlets: worse at none. This is where the first v4 failed.
3. **On the ladder**, with every seatable bot: v6's win Elo above v5's (+538, greedy = 0).

A v6 that passes 1 and 2 but sits at or below v5 on the ladder has shown nothing the fixes add, and stays unseated.

## Measuring it

Two stages, on GitHub Actions (`docs/actions.md`), from this branch once it is pushed. The labels have no spaces, so the workflow passes them whole.

**1. Screens at 6 players**, each fix alone and all of them against v5, one v6 among five v5s, train seeds, at most 2,000 decisive games each. Eight runs; give each `max_parallel` 5 so two or three play at once. Each is roughly an hour or two of the account's runners, the cap rate included:

```bash
gh workflow run risk-measure.yml --ref claude/risk-rule-v6-200641 -f tool=gauntlet -f max_parallel=5 -f args='rule-v6~{"fork":1,"movein":0,"alive":0,"gather":0,"homeward":0,"thirdParty":0,"reinforced":0} --base rule-v5 --field rule-v5 --players 6 --formats one-in --max 2000 --prefix screen-v6'
```

and the same with each other switch on alone (`movein`, `alive`, `gather`, `homeward`, `thirdParty`, `reinforced`), and with `rule-v6` (every fix). A fix stays in v6 if its screen leans above par and its 3-player screen didn't fall clearly below; a fix whose screen comes out worse is dropped, and `V6_PARAMS.fixes` becomes the set kept. With the set changed, `rule-v6` is screened once more the same way before stage 2.

**2. The full suite** on the chosen set:

```bash
gh workflow run risk-measure.yml --ref claude/risk-rule-v6-200641 -f tool=gauntlet -f args="rule-v6 --base rule-v5 --field rule-v5,rule-v4,gd-defensive,gd-stacker,greedy"
```

```bash
gh workflow run risk-measure.yml --ref claude/risk-rule-v6-200641 -f tool=gauntlet -f args="rule-v6 --base rule-v5 --field rule-v5,rule-v4,gd-defensive,gd-stacker,greedy --prefix holdout"
```

```bash
gh workflow run risk-measure.yml --ref claude/risk-rule-v6-200641 -f tool=ratings -f args="rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100"
```

The holdout gauntlet only once train passes rules 1 and 2. v5's own train gauntlet took 3.4 hours on the laptop, most of it two 6-player pairings against v4 that needed over 1,400 decisive games to call even; v6 against v5 will be closer still, so its 6-player pairings are the long ones. Each run's results come back with `risk:import`, and its entry goes in `bot-log.md`. If v6 clears the bar, it is seated as v4 and v5 were: `online/seat-roster.ts`, the seatable ratings run, and its fingerprint in `frozen.test.ts`.

**What it showed** (`bot-log.md`, the entries from "v6's screens at 6 players" to "v6's holdout gauntlet, and v6 seated"), all on GitHub Actions:

1. **Against v5: passes.** Train: better at 4 players one-in and at 6 players both ways, even elsewhere. Holdout: better at 4 players one-out and at 6 players both ways, even elsewhere. Worse at no table on either.
2. **Against the weak bots: passes.** Better at every table on both seed sets. v4 too.
3. **On the ladder: passes.** Win Elo +558.9 against v5's +537.7 (greedy = 0); by finishing order v6 (+287.9) sits between v4 (+292.9) and v5 (+282.9).

The gain is at the big table, where `alive` acts: level with v5 at 3 players, a little ahead at 4, clearly ahead at 6. The six fixes for single positions are right where they were built and measurably cost nothing, and gain nothing a screen could see on their own.

## Open questions

- **`alive` against a retune.** If the screens show `alive` costs at 5 and 6 players, the question becomes whether the small table's preferences are wrong at a thinned big table, or the large table's are wrong everywhere: a large-table tunable (`rule-bot-v4.md`) answers both.
- **Cap rate.** A third of 6-player games among v4s and v5s reach the 600-turn cap. Fixes that put stacks into play (`movein`, `homeward`, `reinforced`) may shorten games; each screen's cap rate is recorded against v5's.
