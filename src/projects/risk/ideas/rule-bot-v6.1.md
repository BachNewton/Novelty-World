# Risk bot v6.1: v6 without the stall

v6.1 (`bots/rule-v6.1/`, label `rule-v6.1`) is built, screened and measured against its bar, and **failed it: it doesn't replace v6.** Its pick ("The rival's hoard", below) ends the stall (0 and 1 capped in 300 holdout mirror games at 5 and 6 players, against v6's 10% and 15%) and is better than v6 at 5 players, but worse at 6 in both mixtures, about 15 Elo a seat, as the native map measured; on the seatable ladder it rates v6's Elo (`bot-log.md`, "v6.1's holdout"). It stays registered as the base of v7.1 (`rule-bot-v7.1.md`), v4.1 and v5.1. v6.1 is v6 with its board scored another way, a set of settings that each re-read v6's evaluation, and plays v6's moves everywhere else.

## Why v6 stalls

v6's value is its share of the table's power, less a border charge, and smaller terms (`rule-v6/evaluate.ts`; power is `forecast` in `rule-v6/opponents.ts`: a seat's armies at face value, plus its income over a horizon, plus its cards).

**The share term forbids every stack-on-stack attack at a big table.** Attacking with `a` armies lost to kill `d` of an opponent's moves my share from `A/T` to `(A − a)/(T − a − d)`, a gain only when `d/a > (1 − s)/s`, `s` my share. At 3 players I must kill twice what I lose; at 6, five times. Balanced Blitz makes an equal-stack exchange about one for one, so only captures of thin territories pay, whatever the border weight. It is the n-player public-goods problem: I pay all of weakening a rival, and every seat shares the benefit.

**Income stops rescuing it once armies outgrow income.** Early, a seat's power is about half armies and half income, so a capture that raises income is worth armies spent. In a frozen 6-player table the board carries 449 armies at turn 100 and 1,929 at turn 600 while the table's income stays near 35 a round: armies are 80% of power by turn 100 and over 90% by turn 300, and the evaluation becomes pure attrition arithmetic. Every turn the seats earn more than they lose pushes the ratio further, so the stall feeds itself.

**The border term locks the shape.** The border loss is, summed over the opponents, each one's aim at me times the hit it could deal me. A seat on one or two big stacks has nothing a sweep can take, so its border loss is near zero; a seat that spreads has thin territories in every opponent's sweep. So the border term makes stacking the local optimum and the share term makes the stacks unbreakable. Neither alone stalls (v3 has the share term and stays spread; bots with no opponent model never stall); together, at a table where each share is small, they do. The stall is an equilibrium of identical evaluations, not a bug one seat commits, which is why mixed fields don't stall and v6 is strong in them.

Shrinking the border term (lower weight, or gathering it by `max` or `mean`) breaks the lock by making thinness free, and the bots end games but recklessly (below). The candidates that came after go at how armies enter power instead, or ease the border term only once the board is stall-shaped.

## The settings

Each is a setting on v6's scorer hook (`scoreOf` in `rule-v6/evaluate.ts`): v6.1's scorer (`score.ts`) re-reads v6's breakdown of a board, so no v6 file changes. The one setting the hook can't carry alone, `reprice: "full"`, also reaches the planner, through v6.1's copy of it (round two, below). With `border` at `"sum"`, `power` at `"face"`, `attrition` at 0 and `borderScale` at 1 it plays exactly v6's moves (a test holds it), whatever the gates.

| Setting | Values | What it changes |
|---|---|---|
| `border` | `"sum"` (v6's), `"max"`, `"mean"` | how the border loss gathers the opponents: every opponent's aim × hit added up, the single largest, or their mean over the opponents counted |
| `power` | `"face"` (v6's), `"armies"` | with `"armies"`, a seat's armies count fully up to `armyRounds` rounds of its board income and at `armyBeyond` each past that (C1) |
| `armyRounds`, `armyBeyond` | 6 and 0.25 by default | the cap `m` and the fraction `f` of `power: "armies"` |
| `attrition` | 0 (v6's), or `k` | the border weight times min(1, k × the board's income ÷ its armies) (C2) |
| `borderWeight` | v6's 0.5 by default | v6's own preference, tunable beside them (the large table's only) |
| `borderScale` | 1 by default | the border weight of the preferences in force, at either table, times this (the native map's knob, below) |
| `reprice` | `"value"` (round one's), `"full"` | with `power: "armies"`, where the re-priced armies reach: the final score only, or the forecast too (the opponents' aims at me and the planner's threat plans read the common threat the re-priced power names) |
| `minPlayers`, `minAlive` | 0 by default | every change applies only at a table that started with at least `minPlayers` seats and while at least `minAlive` are alive at the decision; elsewhere the bot is v6 |
| `attritionAlive` | 0 by default | `attrition` alone applies only while at least this many seats are alive |

An opponent counts for `border` when v6's model sees it reach me (any aim case but "apart"). The income in `power` and `attrition` is the board income (territories and continents, the same for every seat, so no preference of mine enters the others' power), summed over the seats still alive for `attrition`.

**The default is the screen's pick** ("The rival's hoard", below), set before the bar is run. A label moves settings from it, so the candidates the screens name by full label are read with every setting they leave out at its value then: `"border":"max"`, `"power":"face"`, `"reprice":"value"`, `armyRounds` 6, `armyBeyond` 0.25, `borderScale` 1, `rivalBeyond` −1 and every gate 0.

### C1, `power: "armies"`: hoarded armies at a discount

A seat's armies enter its power as `min(armies, m × income) + f × max(0, armies − m × income)`, for every seat alike. At face value a 300-stack is 300 power that can never be spent profitably at 6 players; discounted it is far less, and one more territory of income, or a continent's bonus, is worth spending armies on again. An exchange between two over-cap stacks still doesn't pay, but captures and continent completions do, and a seat that spends spreads, which gives the sweeps and kills their thin targets. The border loss keeps its full price, so the bot stays v6 about thinness. In human-shaped games (about 30 armies a seat on an income of 6 at turn 100, a cap of 36 at m = 6) the discount is nearly inert; in the frozen table (75 a seat on 5.7) it binds every seat. Screened at m = 6, f = 0.25 and m = 4, f = 0.5.

**What it re-prices, and what it leaves as v6's.** The scorer rebuilds v6's value on the re-priced power: the share, the total every term is divided by (the border, opportunity and idle charges are all in units of the table's power), and the common-threat and lead terms, with the common threat itself found again from the new power with v6's ratio. The re-pricing is exact for the power v6's forecast computes: a seat's armies enter its power at face value and are then scaled by each kill the opponents might make of it, the same factors its spared chance multiplies (mine aren't), so the discount is scaled by the same factors and the result is the power the forecast would give with the discounted armies in its sum. Left as v6's, because they live inside v6's forecast and planner where the hook can't reach: the opponent model's aim cases (an opponent's aim at me is "leader" or "ally" by v6's common threat, so the border loss is weighted by v6's reading of who leads), its kill beliefs, the kill exposure and opportunity (which read kill chances, not power), and the planner's own common-threat plans (which plans it builds is chosen by v6's breakdown's threat). The design expected these to matter little: a hoarder reads as the leader less often after the discount, and that changes the aims only at tables with a clear leader. `reprice: "full"` (round two) carries the discount to them.

### C2, `attrition`: the border weight eased as armies outgrow income

The border charge is weighted `borderWeight × min(1, k × incomeTotal / armiesTotal)`. With k = 6 it is v6's while the board holds up to 6 rounds of its income (human games run at 3 to 6; the frozen table passes 10 by turn 80) and half at 12. So in a stall-shaped table the bot plays like a lower border weight, which ends games, and everywhere else it is v6 exactly, float for float. It is the least principled candidate (it lowers a correct price because the game has gone long) and the lowest strength risk; it shares C1's trigger, so it is the fallback if C1 fails on strength. Screened at k = 6 and k = 9.

### C3, the control: `border: "sum"` at a lower weight

`border: "sum"` at `borderWeight` 0.4 (0.25 is already being measured, below): the cheapest possible fix, there to put the stall-against-strength trade-off on a curve the others must beat. A label moves the weight at every table; the screen plays only 5 and 6 players, and if C3 were picked, gating it to those tables would be a one-line change to build first.

## Where the change reaches

The settings feed a decision only through the evaluation's value, and every board v6 scores goes through the settings' scorer: the planner's plans (and so the attacks, the trade decision and the move-in, which are all read off the best plan), the fortify, and the `homeward` credit, which adjusts the breakdown before scoring it. That is why v6.1 has its own entry point (`index.ts`, v6's copied): the scorer must be bound to the table's preferences, this game's record of the opponents and the table-size gates, which v6 works out inside its bot. v6.1 also plays through its own copy of v6's planner (`planner.ts`, with v6's move-in, which plans through it), for `reprice: "full"`'s one change there; the test that holds v6.1's defaults to v6's moves holds the copy too. Everything else is v6's by import. One other sum over opponents is left as it is: the `gather` fortify picks the move that most cuts the opponents' summed sweep costs, but only compares fortifies with one another, never against the share of power.

**At every table, unless gated.** The settings apply at 3 and 4 players too unless `minPlayers` or `minAlive` says otherwise. C1 and C2 are inert there by construction in most positions (those games end before armies outgrow income); `max` and `mean` are not. A gate is read once per decision, from the seats the table started with and the seats alive, never per board scored, so a kill plan whose success board has one seat fewer is scored by the same settings as the hold beside it.

**What it costs.** `max` and `mean` ask v6's opponent model again for each board scored (v6's breakdown keeps only the sum): 2.4 ms a decision against v6's 1.55 ms on the online games' positions. C1 and C2 with `border: "sum"` don't: each reads every seat's armies and income off the board, a few hundred additions a board. `reprice: "full"` asks the opponent model once more for a board whose re-priced threat differs from v6's, and only then. If v6.1 is seated, a speed-only change can fold any of it into the breakdown, bit for bit, under the frozen test.

## Behaviour against v6

`npm run risk:agreement` asks v6 and the candidates every decision of a set of positions, and reports how often each decides as v6 does, by kind. On the three finished online games (G4FR, 9VFL, YUY4, 2,616 decisions):

| | placement | trade | attack | move-in | fortify | all |
|---|---|---|---|---|---|---|
| `"sum"` | 100% | 100% | 100% | 100% | 100% | 100% |
| `"max"` | 75.4% | 94.0% | 78.3% | 80.7% | 91.7% | 80.4% |
| `"mean"` | 74.9% | 93.9% | 79.0% | 81.1% | 96.8% | 81.2% |

## The first screen: `max` and `mean`

| | Elo vs v6 | stalls | decided games |
|---|---|---|---|
| `"max"` | −156 | none | about 47 turns |
| `"mean"` | −215 | none | about 47 turns |

Both rejected. They never stall, but they end games in about half the turns of people's games (75–98 at 5 players) and of v6's decided games (105 at 5, 183 at 6): with the border charge cut to a fraction at a big table, on every board, including those where the opponents' sweeps really do land in turn, the bots spread thin and are swept. They fixed the symptom by removing the judgement. `"sum"` at `borderWeight` 0.25 is being measured now, and is C3's first point.

## Round two: the re-pricing made whole, and gated

The second screen (`bot-log.md`) put every army-pricing and attrition candidate on one curve: the more a candidate discounts hoarded armies, the less it stalls and the more it loses to v6. The gentlest that passes the stall screen, armies past 10 rounds of income at 75%, is −22 Elo: even at 5 players, worse at 6. Round two asks whether two things the first build left out move the curve.

**Full re-pricing (`reprice: "full"`).** Round one's discount reached v6's final score but not the forecast, so the bot partly argued with itself: its share said a hoarder was weaker than it looks, while the opponent model, aiming by v6's common threat, still saw that hoarder lead (so every other seat's aim at me was the fixed "ally" aim, not read from what it could take from me), and the planner still built its plans round it (no capture into an ally's continent or once the turn's card is earned, kills of others only for a big trade, sweeps only through the threat's land). Where v6 reads power, and what round two does there:

| Where v6 reads power | Round one | Round two, `"full"` |
|---|---|---|
| the share and the total every term is divided by | re-priced | re-priced |
| the common-threat and lead terms of the value | re-priced | re-priced |
| the opponents' aim cases ("leader", "ally" or "share"), so the border loss | v6's threat | the re-priced threat |
| the planner's threat plans (targets, kills, sweeps) | v6's threat | the re-priced threat |
| kill beliefs, kill exposure, opportunity | read no power: kill chances, hands and spared chances only, entering the value divided by the (re-priced) total | the same |

So "every place v6 reads power" is the two rows that read the common threat; the kill terms never read power. The aims are recomputed exactly, without copying v6's forecast: an aim depends on the threat only through its case, "leader" and "ally" are constants pulled toward the game's record, and the "share" aims and every hit are read from v6's own forecast run with a common-threat bar no seat can clear (`turnsUnder` in `score.ts`; a test holds it to v6's turns, aim for aim, under v6's own threat). The planner reads the threat off v6's breakdown, where no scorer reaches, so v6.1 copies v6's planner whole (`planner.ts`) with that one line read through the settings' `threat`, and v6's move-in with it; the rest of v6 is imported. A board whose re-priced threat is v6's costs nothing more and scores exactly as round one's re-pricing.

Left at face value, on purpose: the border loss's hits (armies a sweep or exchange would take, in face armies), so the bot stays v6 about thinness. One consequence to read the screen with: the hits are divided by the re-priced total, which is smaller than v6's, so at a stall-shaped table the border charge weighs more against the share than it does in v6 (at a total discounted by a fifth, a quarter more). Pricing the hits at the armies' marginal value would cut it again, and round one showed that cutting the border charge is the reckless direction.

**Table-size gates (`minPlayers`, `minAlive`, `attritionAlive`).** Two cautions shape how they are used. v6's own 5-player mirror caps 10% of games, so a candidate gated to 6 seats leaves 5 players stalling and fails the bar there; a gate can only keep the change off where v6 never stalled, at 3 and 4 players (`minPlayers: 5`), which makes the bar's 3- and 4-player pairings v6 by construction. And the churning tables (`stalled-games.md`) stall with four seats alive, at 5 and 6 players, so a gate on seats alive switches a change off in exactly the games it must end; `minAlive` is there to say so with a measurement if needed, not a recommendation. `attritionAlive` gates attrition alone, for the frozen table, whose six seats all live to the cap.

**The candidates.**

| | label | why |
|---|---|---|
| R2a | `rule-v6.1~{"border":"sum","power":"armies","reprice":"full","armyRounds":10,"armyBeyond":0.75}` | the second screen's survivor made whole: the same discount, so its Elo against −22 says what the half-applied re-pricing cost |
| R2b | `rule-v6.1~{"border":"sum","power":"armies","reprice":"full","armyRounds":12,"armyBeyond":0.75}` | gentler: with a hoarder no longer named the threat, the planner's targets open, which may end stalls at a smaller discount and so lose less |
| R2c | `rule-v6.1~{"border":"sum","power":"armies","reprice":"full","armyRounds":12,"armyBeyond":0.75,"attrition":6,"attritionAlive":6,"minPlayers":5}` | the combined pick, below |

**The combined pick, R2c.** The second screen's loss is at 6 players, so the most promising direction is to discount less there, not more: R2b's gentler discount, everywhere a table started with 5 or more. If that discount is too gentle to end the frozen table (all six alive, armies far past income), attrition at k = 6 eases the border weight there and only there: it acts only on boards past 6 rounds of income, which v6's decided games and people's games don't reach, and `attritionAlive: 6` keeps it out of the churning tables, where the discount already binds. `minPlayers: 5` makes it v6 at 3 and 4 players, so it carries to the bar unchanged. The risk it takes: attrition at k = 6 alone capped 6 in 100 at 6 players and was never measured for strength.

## The native map

Every hand-picked candidate of the two screens landed on one curve, so the third looks at the whole space at once, on the native engine (`native/`, `native-port.md`), where a game costs a fraction of the TypeScript's.

**The instrument.** native-v1 takes v6.1's settings as a tuned label by the same names (`native-v1~{"power":"armies","armyRounds":20,"reprice":"full"}`), designed into its own forecast and value rather than ported line by line: priced power is carried beside face power through the forecast's kills, the opponents' aims and the planner read the threat `reprice` names, and the border loss is gathered by `border` and weighted by `borderScale` and `attrition`. Off, or gated off, it is native-v1 float for float (a crate test holds it). Its yardstick is **native-v6**, native-v1 with v6's small-table cutoff (`"smallTableSeats":4`; native-v1's own is 5), which decides as TS rule-v6 on 99.9% of v6's recorded decisions at 5 and 6 players; native-v1 at each of six v6.1 settings decides as TS rule-v6.1 at it on 99.89–100% (`risk-native agree`). So a point on the map is the TS bot's point, measured against v6.

**The run.** `risk-native sweep` plays each point against native-v6 at 5 and 6 players: one-in and one-out in seed groups with the lone seat rotated, as the gauntlet seats them, and the mirror for the stall, every point on the same seeds; `risk-native sweep-report` sums any number of runs by point (cap rate with its upper bound, decided games' length, each mixture's win share against par with its interval, and a Luce win Elo a seat pooled over the mixtures and tables). The map's 201 points, 272,664 games, and their numbers are in `bot-log.md` ("v6.1's native map").

**What it shows.**

- **The discount alone is round two's curve**, in every corner of it: rounds 4 to 30, 25% to 90% beyond, value or full. Its best stall-free points are 8 to 13 Elo a seat short of v6, inside their intervals but never above.
- **v6's border weight is too low against v6.** The border charge at 1.15 to 1.3 times v6's weight is +6 to +33, the strongest settings measured, but it stalls more than v6 does (3.5–9% at 5 players, 17–22% at 6): a heavier charge makes the stacks still more attractive. Attrition on top of it stalls more still.
- **Together they end the stall, and win at 5 players only.** At 75% beyond, 16 to 22 rounds, fully re-priced, the border at 1.15 to 1.25, no mirror caps more than 3 games in 500 at either table, and the decided games run about 120 turns at 5 players and 190–220 at 6. Those points are better than v6 at 5 players on the map (+25 to +30) and 10 to 20 Elo a seat below it at 6, measured on seeds the points weren't picked on; the weak mixture is 6-player one-out, v6 alone among five candidates. Where a point holds its own at 6 players (90% beyond, or the border raised alone), it stalls there.

So the map has a stall-free region that is even or better at 5 players and none that is at 6. The TS gauntlet agrees (`bot-log.md`): all four frontier points it played came out worse in 6-player one-out, and every 5-player pairing it decided was even. So the best point (`armyRounds` 16, `armyBeyond` 0.75, `reprice` "full", `borderScale` 1.2, with `minPlayers` 5 so it is v6 at 3 and 4 players) is not taken to the bar. The next step is a new idea aimed at the 6-player one-out table, not another setting: a table of these bots hands the lone v6 more than its share of wins, and nothing in v6.1's settings then changed that. The next section is that idea.

## The rival's hoard

The map's lost table was one v6 among five candidates: a table of discounters wears itself down while the lone v6, holding back, collects more than its share of wins. The discount treats every hoard alike, mine and a rival's, so a candidate prices the lone v6's stockpile as cheaply as its own and leaves it be. Two settings go at that, both inside the full re-pricing:

- **`rivalBeyond`**: an opponent's armies past the cap count at this fraction, not at `armyBeyond`, which stays the price of my own. Above `armyBeyond`, a rival's hoard is more of a threat than mine is worth, so the forecast, the threat and the share all see the hoarder as stronger than a discounter. Below 0 it is `armyBeyond`, the plain discount.
- **`threatScale`**: the bar for naming the table's leader the common threat, times this; below 1 the leader is named sooner.

On the native engine, over the map's best stall-free settings (`bot-log.md`, "v6.1's rival hoard"), `threatScale` below 1 lost and stalled everywhere, and `rivalBeyond` 1.25 on the 16-round point brought 6-player one-out level, natively and in the TS screen, with no capped game in 1,000 mirror games. **The pick is `armyRounds` 16, `armyBeyond` 0.75, `reprice` "full", `borderScale` 1.2, `rivalBeyond` 1.25, from 5 players (`minPlayers` 5)**, so it is v6 at 3 and 4 players by construction and needs no agreement run there. `V6_1_PARAMS` is set to it: its label is plain `rule-v6.1`.

## Measuring it

Fixed before any run; none of the commands below has been run. They play locally from a checkout of this branch, from the repository root, in PowerShell; each gauntlet runs as well on GitHub Actions with the same arguments (`docs/actions.md`). A run that holds the machine for long needs the owner's go-ahead (the root `CLAUDE.md`). A label's inner quotes are escaped with backslashes so Windows PowerShell passes them to the program.

The candidates, by label:

| | label |
|---|---|
| C1a | `rule-v6.1~{"border":"sum","power":"armies","armyRounds":6,"armyBeyond":0.25}` |
| C1b | `rule-v6.1~{"border":"sum","power":"armies","armyRounds":4,"armyBeyond":0.5}` |
| C2a | `rule-v6.1~{"border":"sum","attrition":6}` |
| C2b | `rule-v6.1~{"border":"sum","attrition":9}` |
| C3 | `rule-v6.1~{"border":"sum","borderWeight":0.4}` |

### Stage 0: finish what is running

`"mean"` and `"sum"` at 0.25. Record both in `bot-log.md`; 0.25's Elo is C3's first point.

### Stage 1: stall and shape, 100-game mirrors at 5 and 6 players

```powershell
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":6,\"armyBeyond\":0.25}' 5 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":6,\"armyBeyond\":0.25}' 6 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":4,\"armyBeyond\":0.5}' 5 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":4,\"armyBeyond\":0.5}' 6 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"attrition\":6}' 5 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"attrition\":6}' 6 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"attrition\":9}' 5 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"attrition\":9}' 6 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"borderWeight\":0.4}' 5 --games 100 --prefix screen-v6.1
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"borderWeight\":0.4}' 6 --games 100 --prefix screen-v6.1
```

A survey prints, besides the cap rate and game lengths, the table's **shape**: the mean armies on the board as turn 100 began (over the games that reached it) and the mean of each game's battle losses over its income (trades included).

- **Out on stalling:** 2 or more capped games in 100 at either table.
- **Out on recklessness:** decided games' mean under 70 turns at 5 players or under 90 at 6 (people's games run 75–98 at 5 players; v6's decided games 105 at 5 and 183 at 6; `max` and `mean`'s 45–49 is the reckless mark).
- **The shape check, reported beside the verdict:** board armies at turn 100 in 100–250 at 6 players (people's games; the frozen table had 449), and losses within about ±25% of income (people's games: roughly equal). It tells a human-shaped table from one that is merely stall-free; it removes no candidate by itself.

### Stage 2: strength at 5 and 6 players

For every stage 1 survivor, a gauntlet against v6, both mixtures, at most 2,000 decisive games a pairing, the screen's seeds; shown here for all five:

```powershell
npx tsx src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":6,\"armyBeyond\":0.25}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npx tsx src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":4,\"armyBeyond\":0.5}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npx tsx src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"attrition\":6}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npx tsx src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"attrition\":9}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
npx tsx src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"borderWeight\":0.4}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
```

**Out on "worse" in any pairing.** Then the agreement at 3 and 4 players, where v6 never stalled and C1 and C2 should be inert, for the survivors (each named once with `--candidate`):

```powershell
npx tsx src/projects/risk/eval/agreement-cli.ts --games 10 --players 3,4 --prefix agree-v6.1 --candidate 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":6,\"armyBeyond\":0.25}' --candidate 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"armyRounds\":4,\"armyBeyond\":0.5}' --candidate 'rule-v6.1~{\"border\":\"sum\",\"attrition\":6}' --candidate 'rule-v6.1~{\"border\":\"sum\",\"attrition\":9}'
```

A candidate agreeing with v6 on under 97% of decisions at 3–4 players goes to a 3- and 4-player gauntlet against v6 (the command above with `--players 3,4`) before anything else, out on "worse" there too; one at 97% or more is taken as v6 there, pending the bar.

### Stage 3: the pick

Among the survivors, the **highest win Elo** against v6 over the 5- and 6-player tables; a tie inside 15 Elo goes to the higher agreement with v6. `V6_1_PARAMS` is set to the pick, its label then plain `rule-v6.1`. If none survives, the curve (C3's points, and the failures' Elo, cap rates and shapes) goes to the owner, with a relative share against the strongest opponent as the next idea (a new version's hypothesis, not a v6.1).

### Round two's screen

The same rules (stages 1 to 3 above), for R2a, R2b and R2c, under Node 24, Risk's pin; none has been run. R2c is v6 at 3 and 4 players by construction, so it needs no agreement run there; R2a and R2b do, as above. Stage 1, 100-game mirrors at 5 and 6 players:

```powershell
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":10,\"armyBeyond\":0.75}' 5 --games 100 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":10,\"armyBeyond\":0.75}' 6 --games 100 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75}' 5 --games 100 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75}' 6 --games 100 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75,\"attrition\":6,\"attritionAlive\":6,\"minPlayers\":5}' 5 --games 100 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/trace-cli.ts --survey --mirror 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75,\"attrition\":6,\"attritionAlive\":6,\"minPlayers\":5}' 6 --games 100 --prefix screen-v6.1
```

Stage 2, for each survivor, a gauntlet against v6 at 5 and 6 players, both mixtures:

```powershell
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":10,\"armyBeyond\":0.75}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
& "C:\Users\Kyle\AppData\Local\mise\installs\node\24.22.0\node.exe" "C:\Users\Kyle\hobby\Novelty-World\node_modules\tsx\dist\cli.mjs" src/projects/risk/eval/gauntlet-cli.ts 'rule-v6.1~{\"border\":\"sum\",\"power\":\"armies\",\"reprice\":\"full\",\"armyRounds\":12,\"armyBeyond\":0.75,\"attrition\":6,\"attritionAlive\":6,\"minPlayers\":5}' --base rule-v6 --field rule-v6 --players 5,6 --max 2000 --prefix screen-v6.1
```

How to read it: R2a against round one's −22 is the cost of the half-applied re-pricing. If R2b stalls and R2c doesn't, attrition is doing the stall's work at 6 players; if R2b passes, R2c's attrition is unneeded and R2b is the simpler pick.

## The bar for replacing v6

**v6.1 replaces v6 if it is at least as strong as v6, "even or better in every pairing, worse in none", without stalling.** On holdout seeds, never used by the screen:

```powershell
npx tsx src/projects/risk/eval/gauntlet-cli.ts rule-v6.1 --base rule-v6 --field rule-v6 --players 3,4,5,6 --prefix holdout
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v6.1 5 --games 300 --prefix holdout-cap
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v6.1 6 --games 300 --prefix holdout-cap
```

- **Strength: even or better against v6 in every pairing**, 3, 4, 5 and 6 players, one-in and one-out, each pairing's SPRT at the gauntlet's defaults (±30 Elo a seat, α = β = 0.05, at most 20,000 decisive games). A pairing still undecided at its cap hasn't passed: it is rerun with a higher `--max`, never read as even.
- **"Worse" in any pairing fails**, and v6 keeps its seat.
- **No stall: at most 1 capped game in 300 on each of the 5- and 6-player mirror tables** (an upper 95% bound under 1.6%; 0 in 300 puts it under 1%), against v6's 10% and 15%; a reckless-short mirror (decided mean under 70 turns at 5 players or 90 at 6) fails too, and the shape is reported beside it.
- **Behaviour agreement is reported, not gated.**

If it clears the bar, v6.1 takes v6's lobby seat in `online/seat-roster.ts` (what happens to tables already seating v6 is settled then), its frozen fingerprints are taken, and the seatable ratings are rerun. Until then it is registered for measuring only. v7 is then rebuilt on it: its plans from v6.1's planner, its reply seats v6.1, and if C1 landed, its leaf's share on the same discounted power; its own 6-player cap rate is the first thing measured.

## After v6.1: v4.1 and v5.1

A fix that passes the bar is ported back as v4.1 and v5.1, since v4 and v5 stay seated and on the ladder, where their stalls cost every new bot's matchups. Each is held to the same bar against the version it replaces: even or better in every pairing, worse in none, without stalling.

**Neither needs a port of its own.** v6 with every one of its seven fixes off plays v5's moves exactly, and v5 is v4's plans with v5's sweeps added. So **v5.1** (`bots/rule-v5.1/`) is v6.1 with v6's fixes off, and **v4.1** (`bots/rule-v4.1/`) is the same on a copy of v6.1's planner without the sweeps. Each plays v6.1's pick unchanged, the settings v6.1 took to its bar, and with them gated off each makes every one of its old version's kept moves (their tests, on v4's and v5's frozen games). Their settings were chosen on v6, never on v4 or v5, so each goes straight to its bar on holdout seeds; a screen comes only if one fails:

```powershell
npx tsx src/projects/risk/eval/gauntlet-cli.ts rule-v5.1 --base rule-v5 --field rule-v5 --players 3,4,5,6 --prefix holdout
npx tsx src/projects/risk/eval/gauntlet-cli.ts rule-v4.1 --base rule-v4 --field rule-v4 --players 3,4,5,6 --prefix holdout
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v5.1 5 --games 300 --prefix holdout-cap
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v5.1 6 --games 300 --prefix holdout-cap
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v4.1 5 --games 300 --prefix holdout-cap
npx tsx src/projects/risk/eval/trace-cli.ts --survey --mirror rule-v4.1 6 --games 300 --prefix holdout-cap
```

Each that passes replaces its old version as v6.1 replaces v6 (the Risk `CLAUDE.md`, "A fix replaces the bot it fixes").
