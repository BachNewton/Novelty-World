# Risk on the GPU: a batched engine held exact to the reference engine, and the bots that follow it there

A design under construction: phases 0 to 2 (foundations, the engine, the simple bots) are being built; self-play on top of it (phase 3) is proposed, not decided. It supersedes the earlier architect's design note where the two differ, and says why at each point.

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

The bots' own stream is the runner's: `bots|<seed>` hashed, its state in base 36, then `<botSeed>/<decision>` per decision, so a GPU bot that draws (GD-lite's jitter) draws what the TypeScript bot would.

### Balanced Blitz as exported running totals

The blitz is the one place floating point enters the rules, and `**` differs in the last bit between V8 and CUDA, so the GPU **never computes the odds**. `risk:gpu-tables` exports, for every `(a, d)` up to a bound, exactly what `resolveBlitz` compares: `defenderLost[d]` (the capture chance), the attacker side's running totals as `pickOutcome` accumulates them (sequentially, in float64; an outcome with chance ≤ 0 is marked unreachable), the defender side's likewise, and each side's `likeliest` index. The GPU then takes the first index whose total reaches the draw, exactly as the TypeScript loop does, with no summation of its own: a parallel `cumsum` would not round the same way. The table is ragged, stored flat with offsets, float64, regenerated locally (gitignored); a small bound is committed for the tests.

A fight beyond the bound, or beyond GD's exact range (2,000 armies, where `blitz.ts` estimates; 100,000, where it rolls), is **flagged**: the game's `oversize` flag is set and its result is resolved on a slow path (a Python port of the odds, labelled approximate). In lockstep a flagged game stops counting toward exactness from that move and is reported; in free play it is counted. Human-scale stacks never reach the bound; stalled bot tables might.

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
3. **The reverse replay**: GPU games (random-legal bots give the widest move coverage; greedy and GD-lite the realistic one) replayed on the reference engine by `risk:gpu-check`, every move legal and every hash equal.
4. **Distributional checks** for what lockstep can't reach: the ported bots free-running on both engines. Greedy, an exact port, must agree move for move on recorded positions and so needs no statistics; GD-lite is approximate and is compared on win rates by seat and table size (two-proportion z-tests, Holm-corrected), game length (Kolmogorov–Smirnov), cap rate, captures and trades per game, with the margins fixed before the runs.

## The bots on the GPU

- **random**: a random legal move, *not* the TypeScript `random` bot. Its moves depend on list orders with no rules meaning (a depth-first order of fortify destinations), and exactness would buy nothing: it is the fuzzer for the reverse replay.
- **greedy**: exact. Its scores are integers plus one float term computed in the same operation order; its ties go to the first maximum in the options' order, which the GPU reproduces (territory order, canonical edge order, and for fortify the reference engine's depth-first destination order).
- **GD-lite**: the four personas ported as batched code, labelled approximate: GD's own orders and first-maximum ties are kept, its odds read from the same tables, its jitter from the bot's own stream; near-ties and the odds search may differ.
- **The rule bots are not ported** (planners over variable-length plan lists, 3,000 lines of ordered float sums; a batched port is a rewrite and a maintenance tax on every version), and nothing with v6 inside it (v7, v8, student-v1) can be.

## Phases and kill criteria

| Phase | Deliverables | Kill criterion |
|---|---|---|
| 0 Foundations | exporters, canonical hash on both sides, RNG exact, state and setup exact, committed fixtures | the RNG or the setup doesn't reproduce bit for bit |
| 1 Engine | every rule, the forced steps, options masks, invariants, lockstep exact on every fixture seating | unflagged games not 100% identical after the obvious fixes |
| 2 Bots | random, greedy exact, GD-lite approximate, the runner with in-place resets, `risk:gpu-check`, the distributional checks | greedy disagrees beyond a near-tie rate; GD-lite outside its margins after the obvious fixes |
| 3 Self-play | proposed separately when 0 to 2 are done | |

Throughput is measured only on a free machine and labelled with its load; the design makes no speed claim until then.
