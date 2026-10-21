# Risk bot v8: v6's planner on a learned evaluation

v8 (`bots/rule-v8/`) is built, trained and screened locally, and not measured on GitHub Actions yet, so it is not seated. Its seating bar is below, fixed before any of those runs. `bot-log.md` has the training result and the local measurements.

v8 is v6 (`rule-bot-v6.md`) with one change. v6's planner, its plans, filters and odds, its opponent model, its fixes and its small decisions all stay as they are. Only the score changes. Wherever v6 scores a board with its hand-weighted evaluation, v8 scores it with a small network's chance that the seat wins from that board.

## What it builds on

The kill test (`bot-log.md`, "Can a learned evaluation predict the winner better than v6's?") recorded 10,000 five-player games of v6, v5, v4 and gd-stacker. It kept every seat's board at the end of each of its turns, and asked which method best predicts who wins. v6's own value, calibrated to a probability, scored a log-loss of 0.530 on the rule bots' seats in held-out games. A logistic fit on v6's terms scored 0.514, and a small network on those terms and the board scored 0.497. Telling the fits who sat where didn't close the gap. So the positions themselves carry evidence about winning that v6's weighting leaves out. The test also named its own limit: predicting winners better is necessary, not sufficient. The planner ranks sibling boards from one position, and only a gauntlet decides.

## The network

- **Inputs** (`features.ts`, 293 of them) come from v6's breakdown of the board and from the board itself. From the breakdown: its terms (share, kill exposure, border loss, opportunity, idle, the common threat and its lead), with v6's value beside them. From the board: each territory's armies by where its owner sits from the scored seat, and per seat its hand, territories, armies, biggest stack, power, its chance of outliving the turns before mine, and the continents it holds. Then the scored seat's own cards, the turn, whether this turn earned a card, and how many are alive.
- **Seats are slots, never names.** The first slot is the scored seat, then come the opponents still alive in turn order. No input says which bot or person sits anywhere: against people the bot can't know who plays which way. Compacting the slots to the seats alive means a 3- or 4-player table looks like a 5-player table with seats out.
- **One definition of the features.** The bot reads boards through `features.ts` at play time. `npm run risk:features` reads the recorded positions through the same function into a training matrix (in `eval/positions/features/`, never committed), each record's board rebuilt as the seat built it (`positionBoard` in `eval/positions.ts`). The trainer never computes a feature.
- **Training** (`train/train.py`, PyTorch on the CPU, seeded) uses decisive games only, held out by game: a game whose index is 0 mod 5 is test, and 1 mod 10 is validation for early stopping. It writes the weights as a TypeScript module (`weights.ts`: float32 values in base64, the input's normalisation folded into the first layer) and the golden values for the forward-pass test (`golden.ts`).
- **Size, by measurement.** Two hidden layers of 16 and 8 units, 4,849 weights. Every size from 256 and 64 units down to a single layer of 8 scored within fit-to-fit noise (0.492 to 0.496 on the rule bots' held-out seats). The smallest of those that held up was kept, since the weights ship in the repo and the planner calls the network on every board it scores.
- **The forward pass** (`network.ts`) is plain TypeScript in float64 over the float32 weights. Every sum runs in one fixed order, so a frozen fingerprint would hold bit for bit. A test holds it to the trained model's probabilities on held-out recorded positions.

## How it is swapped in

v6's settings carry an optional scorer (`score` in `rule-v6/params.ts`). Every place v6 scores a board reads it (`scoreOf` in `rule-v6/evaluate.ts`): the planner's success and failure boards for every plan and sweep, the fortify's options, and through the planner the move-in and the trade-or-hold. Unset, it is v6's own value. v6 is frozen, and its fingerprints are unchanged by this refactor. v6's breakdown now also carries every seat's power and chance of outliving the turns before mine, which the network reads. v8 is v6's own entry point with `V8_PARAMS`, which are v6's with the network as the scorer. So every use of the score switches together, and v8 holds no copy of the planner.

**`homeward` becomes an input, not a credit.** v6 credits a run's stranded stack by adding back its idle charge. A credit in v6's units means nothing on a probability, so v8's planner hands the scorer the breakdown with that stack taken out of the idle armies, and v6's value raised by the same credit. For v6 that is the same number as before.

**At more than five seats alive, v8 plays v6.** The network has five slots and never saw a sixth seat alive. So while a 6-player table still has all six seats, the whole decision is v6's, and v8 takes over once a seat falls. The choice is made per decision, from the seats the view shows alive, so every board one decision compares is scored on one scale.

**Preferences whose meaning depends on the score's scale.** `killCommitMargin` (a kill must beat the best other plan by this much, v4's −0.029, so a kill is taken even slightly below the best) was tuned in v6's units: about a share of power. On a win probability the same number is a different-sized step. It is kept as v6 set it, and is the first preference to retune if v8 holds up. The planner's and the fortify's tie margins (10⁻⁹, 10⁻¹²) are far below either scale. Every other preference enters only through the breakdown, which v8 reads as an input.

## The holes, and what answers each

- **The planner scores boards the network rarely saw.** The training boards are ends of turns, after the fortify, played by four bots. The planner scores mid-turn boards (a capture's success with the turn's card coming, a failure with a stack bled out), and plans no bot would play. A network can overrate some region of boards it never saw, and a planner that maximises over many boards finds that region and picks it. This is the risk to watch. The gauntlet is the test, and `risk:review` on v8's losses shows which plans it overrated. The answer, if it bites, is to record the boards v8's own planner scores, labelled by playing on, and to retrain on them.
- **Self-play bias.** The labels come from games among v6, v5, v4 and gd-stacker. What a position is worth depends on who is playing it, by about 0.01 log-loss in the kill test. The weak-bot rows of the seating bar check that v8 hasn't learned a convenient fiction about these opponents.
- **Five-player data only.** At 3 and 4 players the network reads the table as a 5-player one with seats out. That matches the slots exactly, but the positions (14 territories each at turn 1) are rare in its data. The 3- and 4-player tables of the gauntlet decide whether it carries over.
- **Ranking, not prediction.** A better predictor can still rank siblings worse. Its edge was largest after turn 20, and close to v6's in the first 20 turns. A v8 that loses early and wins late would show it.
- **Cost.** The network costs little beside v6's breakdown, which it still computes: 1.02 to 1.14 times v6 per decision (`bot-log.md`).

## The seating bar, decided before the runs

v8 is seated only if all of these hold:

1. **Against v6**, on train seeds and then holdout: better at one table or more, worse at none. Each pairing is an SPRT at ±30 Elo a seat, one-in and one-out, at 5 players first (the table people play) and then at 3, 4 and 6.
2. **Against the weak bots** (gd-defensive, gd-stacker, greedy), in the same gauntlets: worse at none.
3. **On the ladder**, with every seatable bot, v6 included, and v7 if it is seated by then: v8's win Elo above v6's (and above v7's if v7 is on it).

A v8 that passes 1 and 2 but sits at or below v6 on the ladder has shown nothing the network adds, and stays unseated.

## Measuring it

On GitHub Actions (`docs/actions.md`), from this branch once it is pushed, with `gh` on the owner's account (`gh auth switch --user BachNewton`). The runners are shared, so launches are coordinated with other runs and capped with `max_parallel`.

**1. The 5-player screen** against v6, one-in and one-out, train seeds, at most 2,000 decisive games a pairing:

```bash
gh workflow run risk-measure.yml --ref claude/risk-hybrid-eval-idea-ad0d76 -f tool=gauntlet -f max_parallel=10 -f args="rule-v8 --base rule-v6 --field rule-v6 --players 5 --formats one-in,one-out --max 2000 --prefix screen-v8"
```

If v8 comes out worse than v6 at either mixture, it stops here, and `risk:review` on its losses looks for the overrated boards.

**2. The full suite**, train seeds, then holdout once train passes rules 1 and 2:

```bash
gh workflow run risk-measure.yml --ref claude/risk-hybrid-eval-idea-ad0d76 -f tool=gauntlet -f args="rule-v8 --base rule-v6 --field rule-v6,rule-v5,gd-defensive,gd-stacker,greedy"
```

```bash
gh workflow run risk-measure.yml --ref claude/risk-hybrid-eval-idea-ad0d76 -f tool=gauntlet -f args="rule-v8 --base rule-v6 --field rule-v6,rule-v5,gd-defensive,gd-stacker,greedy --prefix holdout"
```

```bash
gh workflow run risk-measure.yml --ref claude/risk-hybrid-eval-idea-ad0d76 -f tool=ratings -f args="rule-v8 rule-v6 rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100"
```

Add `rule-v7` to the ladder if it is seated by then. The scorer seam changed v6's source, so the ladder cache's v6 matchups replay once, beside v8's own. Each run's results come back with `risk:import`, and each gets its entry in `bot-log.md`. If v8 clears the bar it is seated as v6 was: `online/seat-roster.ts`, the seatable ratings run, and its fingerprint in `frozen.test.ts`.

## Open questions

- **Retraining on v8's own boards.** If the screen shows the planner exploiting the network, the next data is the boards v8's planner scores, not only the ends of turns.
- **Data at every table size.** A recording at 3, 4 and 6 players would let the network see those tables directly, and at 6 give it a sixth slot.
- **The kill commit margin** on the new scale, with a retune of v8's preferences against a mixed field.
