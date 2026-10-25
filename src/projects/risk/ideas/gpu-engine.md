# Risk on the GPU: a batched engine held exact to the reference engine, and the bots that follow it there

The design of the GPU engine. Phases 0 to 2 (foundations, the engine, the simple bots) are built and verified ("What was found" at the end holds the results); self-play on top of it (phase 3) is proposed, not decided. It supersedes the earlier architect's design note where the two differ, and says why at each point. The native Rust port (`native-port.md`) shares this design's canonical layout and game records, so the two engines' fixtures interchange.

## What it is for

A second Risk engine, in PyTorch, that plays thousands of games at once as tensors on the GPU (or on the CPU, the same code, for tests), **bit-identical to the reference engine** (`engine/`) at every move. It exists for one thing: a learning bot that reads the raw board (nothing of v6) needs 10^9 to 10^10 engine steps, which the reference engine on the worker pool can't give and a GPU can. Everything that measures the seated bots stays on the reference engine and the harness: nothing measured on the GPU ever decides a seating.

The exactness is not decoration. Because the random stream, the blitz odds and every rule are the reference engine's, any GPU game is a seed and a move log that the reference engine replays to the identical state, and any reference game replays on the GPU. That makes correctness continuous (a sampled replay on every run) rather than argued once.

## Where it lives

- `gpu/` in this project: the Python package `riskgpu/` (`rng.py`, `board.py`, `tables.py`, `state.py`, `canonical.py`, `engine.py`, `bots/`, `runner.py`, `lockstep.py`), its `tests/` (pytest, on the CPU, small batches, seconds), `data/` (what the TypeScript side exports for it: `board.json`, `rng-vectors.json`, the small blitz table) and `fixtures/` (recorded reference games with their per-move hashes). `conftest.py` puts the package on the path; `npm run risk:gpu-test` runs the tests.
- `eval/gpu-canonical.ts`: the canonical byte layout of a state and of a seat's options, and their hashes, which both sides implement from this document. `eval/gpu-tables-cli.ts` (`npm run risk:gpu-tables`) exports the board data and the blitz tables; `eval/gpu-fixtures-cli.ts` (`risk:gpu-fixtures`) records reference games as game-record files; `eval/gpu-check-cli.ts` (`risk:gpu-check`) replays game-record files on the reference engine and asserts every move legal and every hash equal.
- Python follows the project's precedent (`rule-v8/train/`, `board/generate.py`): Python for tooling and training, never for a shipped bot. Torch 2.5.1 on Windows, CUDA where present, the same code on `cpu`.

## The engine

### State: structure of arrays, batch first

| Tensor | Shape, dtype | Notes |
|---|---|---|
| `players` | `[B] int32` | 3 to 6; seats at or past it don't exist |
| `rng` | `[B] int64` | mulberry32's 32-bit state, held unsigned in int64 |
| `turn_order` | `[B, 6] int8` | −1 padded |
| `owner`, `armies` | `[B, 42] int8`, `[B, 42] int32` | territories in `map.ts` order; stacks reach the hundreds in stalled games |
| `hand`, `hand_len` | `[B, 6, HAND_MAX] int8`, `[B, 6] int32` | **ordered**, as the reference engine's arrays are, −1 padded. Card indices: territory index for its card, 42 and 43 the wilds |
| `deck`, `deck_len` | `[B, 44] int8`, `[B] int32` | top card first; the order is a rule (`CARDS-8`) |
| `trades` | `[B] int32` | count only; the public trade list is a view's concern |
| `eliminated` | `[B, 6] bool` | |
| `turn`, `round`, `active` | `[B] int32` | |
| `phase` | `[B] int8` | 0 reinforce, 1 attack, 2 fortify, 3 game over |
| `reinf_present`, `reinf_to_place`, `reinf_placed_any`, `reinf_after_elim` | `[B]` | the `ReinforceState`, zeros when absent |
| `occ_present`, `occ_from`, `occ_to`, `occ_min`, `occ_max`, `occ_elim` | `[B]` | the `Occupying` record: from/to/elim −1 and min/max 0 when absent |
| `captured_this_turn`, `winner` | `[B] bool`, `[B] int8` | winner −1 while none |

**Hands are ordered, not sets.** The earlier design kept hands as 44-bit masks because the rules don't read a hand's order. The bots do: `setsIn` lists a hand's sets in hand order and greedy trades `sets[0]`; `bonusTerritories` is in hand order and greedy's trade takes its first. An exact greedy needs the order, and the hash is simpler when the GPU holds exactly what the reference engine holds. `HAND_MAX` is 12: a hand holds at most 4 before a capture (every forced trade runs before the next battle), a victim at most 5 (its last draw), so 9 is the most a capturer ever holds, and the engine fails loudly past the padding.

Fixed data on the device from `data/board.json`: adjacency, the 166 directed border edges in canonical order, continent membership and bonuses, card symbols, GD's territory and link orders, the starting armies and first-turn bonus tables.

### Randomness: the reference engine's own stream

`createRng` (`src/shared/lib/seeded-random.ts`) is xmur3 over the seed string into a 32-bit state, then mulberry32. Every operation is 32-bit integer arithmetic plus one float64 division, so it is exact in int64 tensors masked to 32 bits (`Math.imul` as a 16-bit split product mod 2^32) with `Math.floor(r * n)` in float64. The draw order is the reference engine's and nothing else: setup (seat order by Fisher–Yates over the seats, the 42 territory cards' shuffle, each starting army's pick in turn order, the 44-card deck's shuffle), then per move (a battle's attacker dice then defender dice, a blitz's one draw, a trade's three `returnToDeck` positions in the move's card order). `data/rng-vectors.json` pins it: string seeds' states and draws, numeric states, a million-draw checksum.

The bots' own stream is the runner's: `bots|<seed>` hashed, its state in base 36, then `<botSeed>/<decision>` per decision, so a GPU bot that draws (GD's jitter) draws what the TypeScript bot would.

### Balanced Blitz as exported running totals

The blitz is the one place floating point enters the rules, and `**` differs in the last bit between V8 and CUDA, so the GPU **never computes the odds**. `risk:gpu-tables` exports, for every `(a, d)` up to a bound, exactly what `resolveBlitz` compares: `defenderLost[d]` (the capture chance), the attacker side's running totals as `pickOutcome` accumulates them (sequentially, in float64; an outcome with chance ≤ 0 is marked unreachable), the defender side's likewise, and each side's `likeliest` index. The GPU then takes the first index whose total reaches the draw, exactly as the TypeScript loop does, with no summation of its own: a parallel `cumsum` would not round the same way. The table is ragged, stored flat with offsets, float64, regenerated locally (gitignored); a small bound is committed for the tests.

A fight beyond the bound is resolved on the **slow path**, `blitz_port.py`: a Python port of `blitz.ts` (the fair-fight dynamic programme, the balancing, GD's estimate above 2,000 armies) and of GD's odds reader (`gd/odds.ts`), with the same operation and summation order, computed per distinct fight on the host and cached. The game is still **flagged** `oversize`, so a lockstep report says which games went through it. Fights above 100,000 armies, which the reference engine rolls battle by battle from the game's stream, raise: no bot game reaches them.

**The odds depend on the `pow` that computes them.** Up to Node 22, V8 had its own `Math.pow`, `log` and `exp`; from Node 24 they call the platform's C runtime, which differs from V8's in the last bit on about a tenth of inputs (405 of the 1,024 cells of the 32-bound table came out different), and Windows' and Linux' C runtimes differ from each other on about one input in 3,000. A blitz's outcome flips wherever a draw lands on such a difference, so tables, goldens and fixtures computed by one `pow` are never mixed with another's: every exported file carries a `provenance` (Node, V8, platform, arch, when). The reference engine is the Node Risk's measurements pin (`eval/node-version`, 24.22.0; the repo has no Node pin of its own). So the slow path's `pow` is CPython's (the C runtime's), and its `log` and `exp` stay ports of V8's own, which Node 24 still uses. Even so the slow path is not bit-exact: Node carries its own statically linked C runtime, whose `pow` differs from the system's on about one input in 2,600 (neither is correctly rounded), and of 1,325 cells checked against the Node 24 tables, six have running totals up to 2 ulps off (their capture chances and likeliest outcomes exact; every odds golden exact). The split is therefore: **inside the exported table, exact by construction; beyond it, flagged `oversize` and within 2 ulps**, where an outcome flips only for a draw within about 10^-16 of a boundary. A run that must be exact past the bound exports a larger table; the bound is a parameter.

### Stepping: one decision per step, in lockstep

A step applies one move per game (a `[B, 5] int32` tensor: kind and up to four fields) exactly as `apply` does, then the forced steps. Games are in different phases, so every phase's update runs under a mask each step. The forced-step chain is bounded: a move-in whose minimum is its maximum, then an attack phase with no legal attack, then a fortify phase with no legal move, and never a fourth (the next phase is a decision). So the step runs the chain a fixed three times, masked, and has no data-dependent control flow: it can be captured as a CUDA graph.

Legality is the same masks the options report: a move the mask refuses raises (an illegal move is a bug, never replaced). The invariants (`RULES.md` INV-1 to INV-9) run as tensor checks in test mode.

Finished games (a winner, or `turn > maxTurns`, read before a decision exactly as the harness reads it) stop stepping; the runner resets them in place.

### Canonical layout and hash

Both sides write the same byte sequence and hash it with SHA-256, keeping the first 16 hex characters. Every field is a 4-byte little-endian integer: unsigned for `rng`, signed two's complement otherwise. Territories by `map.ts` index, cards by card index, seats by seat id, absent entries −1 unless stated.

**State**, in order: `players`; `rng`; `turnOrder[6]`; `owner[42]`; `armies[42]`; for each of 6 seats: `handLen` then `hand[12]`; `deckLen`; `deck[44]`; `tradesCount`; `eliminated[6]` (0/1, 0 for absent seats); `turn`; `round`; `active`; `phase` (0 reinforce, 1 attack, 2 fortify, 3 game over); `reinforcePresent`, `armiesToPlace`, `placedAny`, `afterElimination` (0s when absent); `occupyingPresent`, `from`, `to`, `min`, `max`, `eliminating` (−1, −1, 0, 0, −1 when absent); `capturedThisTurn`; `winner` (−1 none).

**Options** (the active seat's, before a move), in order: `kind` (0 reinforce, 1 attack, 2 occupy, 3 fortify), then by kind. Reinforce: `armiesToPlace`, `mayPlace`, `mustTrade`, `own[42]` (0/1), `setCount` then each set's three card indices in the order `setsIn` lists them, `bonus[42]` (0/1). Attack: `maxDice[166]` over the canonical edges (0 where the attack isn't legal). Occupy: `from`, `to`, `min`, `max`. Fortify: `maxArmies[42 × 42]` by `[from][to]` (0 where not legal).

The canonical **edge order** is: for each territory in `map.ts` order, each neighbour in its `ADJACENCY` order. It is the order `attacks` lists, so greedy's first-maximum tie-break reads the same on both sides.

### Game records

One JSON object per game, one per line (`.jsonl`, gzipped when large), written and read by both sides:

```
{ "seed", "players", "maxTurns", "bots": [labels, optional],
  "initialHash",
  "moves": [[seat, kind, x, y, z, w], ...],
  "stateHashes": [after each move], "optionsHashes": [before each move],
  "result": { "winner": seat | -1, "turns", "capped", "places": [...] },
  "oversize": bool (GPU games only) }
```

Move kinds: 0 `place(territory, armies)`, 1 `trade(c1, c2, c3, bonus | −1)`, 2 `attack(from, to, dice)`, 3 `blitz(from, to, keepAtLeast)`, 4 `occupy(armies)`, 5 `end-attack`, 6 `fortify(from, to, armies)`, 7 `end-turn`; unused fields 0.

The fixtures (`risk:gpu-fixtures`) are game records of reference games: a seating, a seed prefix, a count. The lockstep tool replays them on the GPU engine as one batch and compares every options hash and state hash. `risk:gpu-check` does the reverse for GPU games. The committed fixtures are a few short games of every seating kind the tests need; the surveys of thousands are generated locally.

## Correctness

1. **Lockstep** (the main proof): every unflagged fixture game identical at every move, options and state. Pass bar: 100% of unflagged games, the flagged share reported.
2. **Options equal masks**: part of lockstep, through the options hash at every decision.
3. **The reverse replay**: GPU games (random-legal bots give the widest move coverage; greedy and GD the realistic one) replayed on the reference engine by `risk:gpu-check`, every move legal and every hash equal.
4. **Distributional checks** for what lockstep can't reach: the ported bots free-running on both engines. Greedy and GD, exact ports, must agree move for move on recorded positions and play identical games on fresh seeds, and so need no statistics while they do; should a port ever be approximate, it is compared on win rates by seat and table size (two-proportion z-tests, Holm-corrected), game length (Kolmogorov–Smirnov), cap rate, captures and trades per game, with the margins fixed before the runs.

## The bots on the GPU

- **random**: a random legal move, *not* the TypeScript `random` bot. Its moves depend on list orders with no rules meaning (a depth-first order of fortify destinations), and exactness would buy nothing: it is the fuzzer for the reverse replay.
- **greedy**: exact. Its scores are integers plus one float term computed in the same operation order; its ties go to the first maximum in the options' order, which the GPU reproduces (territory order, canonical edge order, and for fortify the reference engine's depth-first destination order).
- **GD**: the four personas ported as batched code (`bots/gd*.py`, file for file with `bots/gd/`): GD's own orders and first-maximum ties, its odds from the same tables and the slow path's exact search, its jitter from the bot's own stream drawn in GD's order. The design budgeted for an approximate "GD-lite"; the port came out **exact** (every recorded GD decision, and whole games on fresh seeds, identical), so the statistical checks below are the fallback should it ever drift, not the proof.
- A bot reads the turn's history from the runner's `TurnLog` (attacks and captures this turn, territories placed on, trades, and Stacker's switch to Aggressive), the tensors that stand for what `bots/history.ts` derives from the events.
- **The rule bots are not ported** (planners over variable-length plan lists, 3,000 lines of ordered float sums; a batched port is a rewrite and a maintenance tax on every version), and nothing with v6 inside it (v7, v8, student-v1) can be.

## Phases and kill criteria

| Phase | Deliverables | Kill criterion |
|---|---|---|
| 0 Foundations | exporters, canonical hash on both sides, RNG exact, state and setup exact, committed fixtures | the RNG or the setup doesn't reproduce bit for bit |
| 1 Engine | every rule, the forced steps, options masks, invariants, lockstep exact on every fixture seating | unflagged games not 100% identical after the obvious fixes |
| 2 Bots | random, greedy exact, GD exact, the runner, `risk:gpu-check`, the free-running comparison | greedy or GD disagrees beyond a near-tie rate after the obvious fixes |
| 3 Self-play | PPO in a league on the GPU engine, a network bot exported to TypeScript (below) | the milestones M1 to M4 below, fixed before training |

Throughput is measured only on a free machine and labelled with its load; the design makes no speed claim until then.

## Phase 3: self-play

A network bot trained from scratch by PPO on the GPU engine, against a league, then exported to TypeScript and measured in the harness like any bot. It lives in `gpu/riskgpu/selfplay/` (`obs.py` the view, `actions.py` the action space, `net.py` the network, `env.py` the training environment, `ppo.py` the trainer and its CLI); runs write to `gpu/runs/selfplay/<name>/` (gitignored), resumable from `latest.pt`. The earlier design note's plan holds where this section doesn't revise it.

### The step, captured

The whole training step (the options, the observation, every network's move, greedy's move, the engine's `apply` and its forced steps, eliminations, a game's end and its scores, and the finished game replaced in place by a fresh deal from a pool) is one CUDA graph: nothing in it reads a value back to the host. That took three changes to shared code, none to what a move does: greedy's depth-first fortify order has a sync-free form (`dfs_order_graphable`, every pop pushing its neighbours at once; the fixtures hold it to the original decision for decision), constants reach the device once (`on_device`), and a blitz past the table's bound can be resolved on the device by scaling the fight into the table (`scaled_oversize`, training only: approximate, flagged `oversize`, never in a record anything is checked against). The reachability products for fortify run in float16 on CUDA (counts up to 42, exact in either type).

Each controller runs only on the rows it decides: the rows needing it are sorted first and the first `capacity` of them taken, a static shape the graph can hold; a decision past its controller's capacity waits a step (`stalled`, reported; around 2% at the default capacities). Without it every network ran over the whole batch, and a larger network would pay for the greedy seats' decisions too.

### Observation and actions

The acting seat's view only (`obs.py`): the board, every hand's size, its own cards, the deck's size, the turn so far's public events, the pending move-in and the options; seats as slots from the acting seat in turn order, v8's rule. A decision is a **main** choice from one masked categorical (place on a territory, trade, attack along a border, end the attack, a move-in amount, fortify along a pair, end the turn: 1,978 ways) then, for place, attack and fortify, an **amount** bucket (all, half, one; for an attack: blitz keeping one, blitz keeping half, one battle) read from the chosen territories' tokens. The design's flat space over every bucket (4,158 ways) spent a fifth of a step on memory traffic over its logits; the factored one halves that and conditions the amount on where. A trade's set and bonus territory follow a fixed rule (most valuable, fewest wilds), as v6 and GD choose sets by rule.

### The network, and how it grows

The owner's direction: large enough to learn deep strategy, and sized so the GPU is the busy part. So not the design's residual MLP but a **transformer over the board**: 49 tokens (42 territories, 6 seat slots, a global token), each layer's attention biased per head along the map's borders, so a layer can pass messages along borders or look across the world. A place logit per territory token; an attack logit per border and a fortify logit per pair from dot products of source and destination projections; the value a vector over the slot tokens (each slot's expected final score, max-n style), with an auxiliary head on each slot's board share 32 steps on (KataGo's cure for a sparse value).

Sizes: training starts at width 128, 4 layers (0.84M weights), which clears M1 fastest; once it does, a size sweep at fixed compute (128×4, 256×6 at 4.8M, 384×8) decides whether bigger pays at the data scale reached, and the run grows to the size that does. **Size is chosen by strength, not by play cost** (the owner's ruling): a bot's live turn against people may take a human's budget, up to the turn timer of about 90 seconds, spent on stronger play, and it may think on the player's device rather than the server (Risk's `CLAUDE.md`). So each export reports the TypeScript forward pass's milliseconds per decision and per turn, and a size is playable if its turn fits well inside that budget on the server or on a device. What a device would take (a WebGPU or WASM forward pass in the browser, the per-turn time on a recent phone) is later engineering, not a reason to shrink; distilling into a smaller net stays an option. Measured on one core of a CPU loaded by gauntlets: 119 ms a decision at 128×4, 672 ms at 256×6, 1,968 ms at 384×8.

### Reward, cap and league

A seat finishing p-th of n scores 1 − 2(p − 1)/(n − 1); the survivors of a capped game all score as k-th of n (k survivors) less 0.5, never below −1, so a stall is never a result (`stalled-games.md`, v8's hoarding). The cap is drawn per game, 150 to 600 player-turns, so no policy can count on a clock. The league: each new game's seats are the learner (at least one seat, at random), greedy, GD's four personas (their graphable port, `gd_bot_graphable`: the eager port's move on every recorded GD decision, its odds approximate only past the table, its jitter from a device stream), or past checkpoints (four slots refreshed from every snapshot so far); table sizes 3 to 6 mixed (0.35, 0.2, 0.3, 0.15). PPO with GAE (γ = 1, λ = 0.95) over each learner seat's own decisions, clip 0.2, entropy 0.01.

**From scratch first**, as the owner asked; the imitation warm start (arm 2) waits on a move-log recorder and is the fallback if M1 or M2 fails for want of exploration.

### Milestones, fixed before training

Training time is GPU wall-clock of the trainer. A milestone is checked on the GPU (fixed deals, the learner's most likely move) and confirmed in the TypeScript harness after export; a failed milestone stops the line and is reported.

| | Pass | Within |
|---|---|---|
| **M1** | beats greedy at 3 players: GPU win rate among decisive games ≥ 0.40 (par 0.33) on 2,048 fixed deals, cap rate under 10%; then `risk:gauntlet` better than greedy at 3 players one-in | 48 hours of training |
| **M2** | above par against the GD personas at 5 players with cap rate under 10%: `risk:gauntlet` better than each of gd-defensive and gd-stacker at 5 players one-in, and not worse one-out | two weeks of training |
| **M3** | even or better than rule-v6 at 5 players, one-in and one-out, by the gauntlet's SPRT (30 Elo a seat), train seeds then holdout | |
| **M4** | the same against rule-v7 | |

### Phase 3 so far

Measured on the RTX 4070 with nothing else on it, the CPU saturated by gauntlets throughout (so every host-side cost is pessimistic).

**Throughput.** The eager step (greedy only, batch 8,192) ran 32,500 decisions a second. Captured, at batch 16,384: 127,000 a second with the 128×4 network against greedy, 60,000 with GD's personas in the league, 47,000 with two anchor networks as well, and 36,000 to 40,000 with the 256×6 network. The step is GPU-bound throughout: big masked tensors and the engine's work, not launches.

**M1 passed** in about an hour of training. Run m1a (128×4, greedy and self-play seats, placement reward): after 50 iterations (52 million decisions), the GPU evaluation won 76.5% of decisive 3-player games against greedy (par 33%) and 78% at 5 players (par 20%), no game capped. The TypeScript harness agreed: `net-v1~{"weights":"m1a-50"}` against greedy at 3 players, one-in, better, win share 79.5% [64.5, 89.2], 39 decisive games, win Elo +356.

**Argmax stalls; the bot samples.** Playing its most likely move, a trained network fell into loops: 23% of 3-player games against greedy capped, against none when it sampled, and its mean score fell from 0.79 to 0.53. net-v1 therefore samples from its seed (deterministic per seed, as the seam requires), and every evaluation samples.

**Strength among networks and against the fixed bots part ways.** m2a (m1a continued with GD's personas and its own snapshots in the league) beat GD well by iteration 50 (54% against gd-defensive, 43% against gd-stacker, par 20%). By iteration 75 it scored below its own snapshots and below its iteration-50 self on the checkpoint ladder (+325 to +117). sw128 (the win reward, from scratch) then beat GD harder still (58% and 64% at iteration 100) yet won 0.6% of games alone among four m2a-50s. One m2a-50 among four of it won 50%. Matched at m2a-50's 131 million decisions, sw128b (below) still wins only 4% alone among m2a-50s while holding it under par as a group. The multi-network Luce ladder can't separate checkpoints when one style dominates, so the progress metric became the head-to-head pair test against m2a-50 (one-in and one-out) beside the GD evaluations, and the league keeps strong past networks for good (`--league-fixed`).

**Against rule-v6, the placement reward places.** `net-v1~{"weights":"m2a-50"}`, 5 players, one-in: worse, 7.1% [4.0, 12.3] of 154 decisive games against par 20%, 3.8% capped. Its finishing-order Elo was −3 and its mean place exactly par: it outlasts v6 and almost never takes the win. That is what second place's +0.5 paid for, and also why it outlasts other networks. Hence the win reward: +1 for the win, second place 0, down to −1.

**The size sweep** (the same recipe at every size, judged by strength against decisions trained and by the slopes at the end, not only per GPU-hour, the larger when close). sw128b, 128×4, 4 hours: by 131 million decisions, 69% against greedy at 3 players, 66% against gd-defensive and 59% against gd-stacker at 5, all still rising. sw256, 256×6, at 52 million decisions: 23%, 6% and 8%, slower per decision so far. Results continue below as they land.

## What was found

Everything below was established on Node 22's odds and then re-established on Node 24.22.0's: the tables, goldens and fixtures were regenerated under it, the Python suite passes, and the lockstep is exact on all 23 regenerated games, with the 256 table and with the committed 32 table plus the slow path (16 games through it, all exact). The free-running survey under Node 24's odds (the same three seatings and seeds, played on the CPU) came out identical in all 260 games, `survey-gd5-18` included: that game's one disagreement under Node 22 was played on CUDA, and a CUDA replay under Node 24 reproduced it (99 of 100, the same decision): CUDA divides a tensor by a plain Python number by multiplying with its reciprocal, which is off in the last bit a third to a half of the time, and one such bit on GD's enemy-strength term turned a near-tie between two targets into an exact tie that went the other way. Fixed by dividing by a tensor everywhere in the GD port (`div` in `gd_odds.py`), with that decision as a test on the CPU and, where there is one, on CUDA; the CUDA replay is then 100 of 100. **The rule it leaves:** a float that decides a comparison is never divided by a Python number; multiplying by a number is correctly rounded, dividing by one is not on CUDA.

**Phase 0.** The RNG, the setup and the canonical hash reproduce the TypeScript bit for bit (every vector, 12 setup states of every table size in one batch, the pinned hashes); CUDA and CPU hash alike.

**Phase 1.** Lockstep is exact on every fixture: the 19 committed reference games (8,715 moves; greedy, GD, rule-v4 to v6, random, 3 to 6 players, capped games) and the native port's 80 games (45,678 moves), at every decision, options and state, with the invariants on; identical on CUDA. Reached in those games: 47 eliminations with their cards, 14 forced trades mid-attack, the win with no move-in, the round wrapping past eliminated seats at 6 players, 229 trades (74 naming their bonus), 3,313 blitzes, 127 battles. Two corners no real game can reach (an empty deck's draw; a card returned into a deck of 3 or fewer: the rules cap hands, so at most 29 cards are ever held) are unit-tested against the reference code as written.

**Phase 2.** `greedy` agrees with the TypeScript greedy on every recorded decision (4,353 over six fixture files, the depth-first fortify order included: 188 of its 240 fortifies pick differently from map order), and GPU-played greedy games are byte-identical to reference games of the same seeds (records: moves, every hash, result). GD agrees on every recorded GD decision (2,267: 448 placements, 68 trades, 1,013 attack decisions, 506 move-ins, 232 fortify decisions, Stacker's Aggressive phase included). Free-running on fresh seeds (Node 22's odds on both sides), both engines played identical games in 259 of 260: 100 of 100 at 3 players (Stacker, greedy, Aggressive; CPU), 60 of 60 at 6 players (CUDA), 99 of 100 at 5 players (the four personas; CUDA), where one GD attack target differed at decision 475 of seed `survey-gd5-18`, a disagreement still to be classified (a near-tie or a port bug) under the Node 24 odds. GPU random-bot and greedy games (50 games, 28,882 moves) replay on the reference engine with every move legal and every hash equal.

**Not measured.** Throughput: the machine was shared throughout (the CPU saturated by a gauntlet, the GPU by a training run), so nothing here is a speed figure. One reading to take seriously: GD games on CUDA at a batch of 100 ran far slower than on the CPU, because the step is eager (hundreds of small kernels) and the GD features sync to the host for odds past the table and the ideal-army search. Phase 3's first job is a profile on a free GPU, then CUDA-graph capture of the step and the odds moved wholly on device.

**An environment hazard, unconfirmed.** One agent saw Python's `math.floor` return infinity for the rest of a process after a float64 matrix product in torch (MKL); it didn't reproduce in a plain test. The GD port counts in integers where it could have multiplied, with a comment, and the slow path's `round_half_even` would fail loudly, not quietly, if it recurred.
