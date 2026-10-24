# Risk in Rust: the engine and the rule bots, native and exact

A design under construction: the engine and the bots are being ported in order, each proven identical to its TypeScript original before the next builds on it. Decided by the owner: the game engine and the bots' logic get a native Rust port, so that if the bots stay on the CPU they can still get faster. It overrides the earlier language decision (`language-decision.md`, "bots are never written in Rust") for this one purpose: a port, held exact, of code the TypeScript keeps owning.

## What it is for

The measured and seated bots (rule-v1 to v6, and v7 = v6 with its reply search) run in TypeScript on the worker pool, and they are slow: v6 about 20 ms a turn on one core, v7 about 2.5 s, most of it v6's planning inside v7's imagined replies. The engine itself is about 2% of a game's time. So a faster engine alone buys nothing; the port must carry the bots, and that is where the risk is.

The TypeScript stays the source of truth. Seated bots are frozen by fingerprint, measurements and the ratings cache rest on their exact moves, and a bot that differs in one decision in a million is a different bot. So the port's one bar is **exactness**: a Rust game is the same game as the TypeScript one, move for move, for the same seed and seating, and a Rust bot makes the same decision as its original at every position. Speed is measured only once that holds.

## Where it lives

- `native/` in this project: one Cargo crate, `risk-native`, a library with a binary. Modules follow the TypeScript files they port (`rng`, `jsmath`, `map`, `cards`, `blitz`, `engine/`, `bots/odds` and the rest of the bots, `runner`, `record`, `canonical`, `serve`). Its `target/` is ignored by git.
- `eval/native/` on the TypeScript side: the exporters and checkers that prove the port, and the runner that lets a measuring run play on it.
- Dependencies stay few and well known: `serde` and `serde_json` for the wire format, `sha2` for the canonical hash. A thread pool is a few lines over `std::thread`; no runtime.

## How Node uses it

**A separate process over stdin and stdout, never an addon.** The binary's `serve` mode reads batches of game specs (the harness's `RiskGameSpec`: index, seed, labels, turn cap) as JSON lines and writes their results (`RiskGameResult`) back, played on its own thread pool. On the TypeScript side a `GameRunner` (`src/shared/lib/bot-lab/pool.ts`'s interface) wraps that process, so a gauntlet or a ladder swaps the worker pool for the native runner and nothing else changes: the SPRT, the Elo fit, the rotation groups and the reports stay in TypeScript, where they are tested.

Why not a napi addon: it adds a native build to `npm install`, a toolchain to CI and a crash surface inside Node, for a call that happens once per game. A process boundary costs one JSON line per game, nothing against a game of five hundred moves, and `cargo build --release` is the whole build. The runner fails loudly when the binary is missing or older than the crate's sources rather than quietly playing TypeScript.

Determinism needs no care: a game is a pure function of its spec, so which thread plays it changes nothing, exactly as the worker pool's games are bit-identical to the single-threaded runner's.

## What breaks exactness, and the answer to each

The TypeScript runs on V8, and the port must reproduce V8's arithmetic, not the platform's.

- **Transcendental functions.** `Math.pow` (`**`), `Math.exp` and `Math.log` in V8 are its own ports of fdlibm (`base/ieee754.cc`), and the platform's `libm` may differ in the last bit. They appear only in Balanced Blitz's balancing (`blitz.ts`: the two powers, and the exponential fit of fights over 2,000 armies) and in GD's balancing of an estimated chance. The port uses the same fdlibm algorithms and proves them on exported vectors, including every input the blitz actually feeds them; any disagreement is a bug.
- **`Math.round`** rounds halves toward +∞; Rust's rounds them away from zero. The port has its own `js_round`, used everywhere the TypeScript rounds. **`Math.fround`** is a round trip through `f32`; GD's `fround(fround(a) / fround(d))` divides in `f64` first and rounds once after, never as an `f32` division.
- **The order of floating-point operations** is kept exactly: every sum, product and comparison in the order the TypeScript makes it, `reduce` left to right, no reassociation, no fused multiply-add (the port compiles with the default, which never fuses).
- **Integer arithmetic**: `Math.imul`, `| 0` and `>>> 0` are wrapping 32-bit operations, and the RNG (xmur3 over the seed string, then mulberry32) is bit-exact including the `toString(36)` of the bots' seed.
- **Sorting** is stable on both sides (V8's `sort` since 2019, Rust's `sort_by`); comparators are ported as written, tie-breaks included.
- **`Map` and `Set` iterate in insertion order**, and some tie-breaks read that order (the move-in's candidate totals, a plan's placements). The port keeps ordered vectors wherever an order is read; a hash map is used only where no result depends on it.
- **Memos and caches** (`Memo`, the odds' remembered runs, the scratch arrays) change only time, never answers, so the port is free to cache differently. A memo whose key misses an input would be a TypeScript bug, and the differential tests would show it.
- **Hands are ordered**, as the engine's arrays are: `setsIn` lists a hand's sets in hand order and bots trade the first.

## Proving it

Four layers, smallest first, so a float that drifts is found in a unit, not in a game.

1. **Vectors**: `risk:native-vectors` exports what TypeScript computes for the RNG (seeds, states, draws), `jsmath` (pow, exp, log, round over broad inputs), the blitz (fair and balanced fights over a grid and the large estimates), the odds (`battleOutcome`, `pathRun`, `exchange`, `blitzCommit`), the cards' worth model and the map. The crate's tests read them and compare bit for bit.
2. **Lockstep on the engine**: `risk:native-fixtures` plays TypeScript games (any seating of the bots) and writes **game records**: the seed, the players, the labels, every move, and a hash of the state after each move and of the active seat's options before it, on a canonical byte layout both sides implement (the same layout and record format the GPU engine's design fixes, so the two efforts' fixtures are interchangeable). The crate replays a record and compares every hash, reporting the first divergence with both states.
3. **Decisions, both directions**: with the engine exact, the crate replays a TypeScript record asking its own bot at every decision and compares the move; and `risk:native-check` replays a record the crate played, asking the TypeScript bot at every decision. A bot is exact when thousands of games of each direction agree at every decision, across every table size, with itself and against the other bots.
4. **Parity in the harness**: the native runner has a parity mode that plays a sample of a run's games on both paths and fails loudly on any difference in a result. It stays on, cheap, as the continuous check a long-lived port needs.

## Order of work

1. Foundations: the crate, `jsmath` and the RNG, the map and cards, the blitz and the odds, each on its vectors.
2. The engine, in lockstep with TypeScript records of every seating kind, random-legal play included (the widest move coverage).
3. The bots, in dependency order: random and greedy; GD's four personas; rule-v1; v2 and v3 (both on v1's modules); v4 (the opponent model every later version shares); v5; v6. Each is proven on records before the next builds on it. rule-v6.1 waits for its final form; rule-v7 is proposed after v6, since its replies need the sim's worlds and the GD and greedy bots in the crate too.
4. Integration: the native runner, a `--native` path for the gauntlet and the ladder when every bot at the table has an exact port, and the parity mode.
5. Speed, measured only with the owner's go-ahead on a machine with capacity: games a second and decisions a second against the TypeScript pool, on the same specs.
