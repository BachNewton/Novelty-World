# Risk bot student-v1: v7's placement choice, learned, at v6's cost

student-v1 (`bots/student-v1/`) is built and registered, not measured and not seated. It is the bot `distilled-v7.md` plans: v7's search replaced by a small network trained on what the search chose. The harness seats it as `student-v1`; no table can.

## What it is

v6 everywhere, except at exactly the decisions where v7 searches: a turn's own reinforce phase, after v6's trade if v6 trades, over v7's candidates (v6's top plans by value, one per distinct placement, v6's own choice first; `candidates` in `rule-v7/index.ts`). There the student scores every candidate with its network and places for the highest. Ties go to the earliest candidate, as in v7, and whenever the first is v6's own choice the student simply plays v6, so a network that ranks nothing plays v6 move for move. The rest of the turn, attacks, move-ins and fortify, is v6's on the board the placement made, as in v7. Its cost is v6's, plus the candidates' boards and a few forward passes once a turn.

- **One definition of a candidate's row** (`candidates.ts`): the success and failure boards v6 values the plan on, each read through rule-v8's feature function with v6's breakdown of it, then the success chance and v6's value, to six figures as the recording keeps them. The teacher recorder (`eval/distill.ts`) and its features step build the training rows through the same functions, so the network is never fed a row built another way; a test holds the bot's rows equal to the features step's for the same decision.
- **The network** (`network.ts`) reads what its weight set says: every column of the row or only each board's breakdown terms with the chance and value, as themselves, as their difference from the decision's mean over its candidates, or both; normalised, then the layers, ReLU between them. It runs in float64 over float32 weights with every sum in a fixed order, and a test holds it to the trainer's own scores on the golden decisions its export carries.
- **Six seats alive is v6's.** The features have five slots and the recording is 5-player games, so while more than five seats are alive the whole decision is v6's, as in v8.

## Weight sets

`bots/rule-v8/train/distill.py --export <file>` writes a fitted student as JSON; `npm run risk:student-weights -- <file> --name <name>` turns it into a committed weight set (`weights/<name>.ts`, never edited by hand) and its golden decisions into the forward pass's fixture (`__fixtures__/golden-<name>.json`), checking the bot's pass against them first. Any set is seated by label, `student-v1~{"weights":"<name>"}`; the plain label plays the default (`DEFAULT_WEIGHTS`). A seated bot is frozen, so once student-v1 is seated its default is fixed, and a better set is a new version.

The first set, `pilot`, is the best student of the pilot (`distilled-v7.md`): v6's breakdown terms of both boards with the chance and value, read both ways (48 inputs), one linear layer fitted to v7's scores. It kept 18% [2%, 33%] of v7's edge in split-half regret. Regret isn't Elo; the gauntlet decides.

## The seating bar, decided before the runs

v7's bar (`rule-bot-v7.md`, "The seating bar"), applied to the student at its one setting. The student has no work budget, so v7's rule 1, the budget curve, has nothing to choose; rules 2 to 5 stand as written:

1. **Against v6**, on train seeds and then holdout: better at one table or more, worse at none (each pairing's SPRT at ±30 Elo a seat, 3, 4, 5 and 6 players, one-in and one-out).
2. **Against the weak bots** (gd-defensive, gd-stacker, greedy), in the same gauntlets: worse at none.
3. **On the seatable ladder**, with every seatable bot: its win Elo above v6's.
4. **It fits a real game's turn**: nine turns in ten under 5 seconds on the laptop's one core. At v6's cost it should clear this by far; it is timed as v7's cost was, before the suite.

## Measuring it

None of it is run. First the 5-player screen against v6, one-in and one-out, which costs what a v6 pairing does:

```bash
npm run risk:gauntlet -- student-v1 --base rule-v6 --field rule-v6 --players 5
```

Then the suite as v7's (`rule-bot-v7.md`, "Measuring it", step 3) with `student-v1` in v7's place, and a screen against v7 at 5 players, which `distilled-v7.md` asks of a student and which says how much of v7 it carries.
