# Risk engine speed spike: what it measured

A record of stage 3 of the engine plan (the project's `CLAUDE.md`): a speed spike meant to pick the fast engine's language from measurements. It was stopped before its full measurement finished. The language for the fast engine and the bots is **on hold**: the owner has not decided it. The numbers below are the partial results it had, kept as context for that decision. The spike's code was deleted once this was written; git history holds it.

## What was built

The same core, written three ways, each to be fast in its own language:

- **TypeScript in Node**: one flat `Int32Array` per game, integer actions, no allocation in the hot loops; run by Node's own type stripping (no loader).
- **Rust native**: an optimised release build (`lto = "fat"`, one codegen unit), measured with and without `target-cpu=native`.
- **Rust compiled to WASM** (`wasm32-unknown-unknown`, no wasm-bindgen, no wasm-opt), instantiated directly from Node.

All three shared the map data file (the 42 territories, adjacency and card symbols of `RULES.md`, checked against `MAP-3`), the same PRNG (xoshiro128\*\* seeded by splitmix32, 32-bit integer operations only) and integer-only game logic, so a seed gave the same game everywhere. The game loop was close to `RULES.md`, with one simplification: territories were **dealt at random** and the remaining armies placed at random, instead of the claiming draft. The rest followed the rules: random seat order, reinforcement (territories / 3, minimum 3, plus continent bonuses), escalating set trades with the forced trade at 5, the occupied-territory bonus with its per-turn cap, the defender always rolling the most dice, capture and move-in, elimination with card transfer and the forced trade at 6, the end-of-attack card draw with the discard reshuffle, an adjacent fortify, win detection, and a 1,000-turn cap. A cheap greedy bot played every seat: reinforce the most threatened frontier, attack while the best attack's win odds are at least 0.6, fortify an interior stack toward the frontier.

The workloads:

1. **Battles**: single rolls through the exact per-roll table; whole battles by single rolls; whole battles by one draw from a precomputed exact terminal-distribution table (armies up to 64 per side; bigger battles roll down into range).
2. **Full games** with the greedy bot (4 players), on one core and on all cores (Node `worker_threads` against Rust threads).
3. **A bot-evaluation kernel**: from 200 mid-game positions, every one- and two-attack plan resolved at Carr's 0.3 planning quantile, each scored by a linear evaluation over about 30 integer features; once undoing each plan in place, once copying the whole state per candidate.
4. **The JS↔WASM boundary**: the cost of a call, and a game driven from JS one call at a time (the bot's attack choice made in TS, the engine in WASM) against the same game run entirely inside WASM.

## Parity and table checks

All three implementations were **bit-identical**: the same table hashes, the same final-state hashes and turn counts over 20,000 seeded 4-player games and 2,000 games each at 3, 5 and 6 players, and the same checksums on every benchmark workload, kernel scores included. The JS-driven WASM game matched the all-in-WASM game hash too.

The battle tables matched the values the bot research cites, and brute-force dice:

- **3v2 single roll**: 2890 / 2611 / 2275 out of 7776 (defender loses 2: 37.2%; one each: 33.6%; attacker loses 2: 29.3%), by exact enumeration. Ten million rolls of real dice agreed to within 0.03 points.
- **5v3 full battle, attacker wins 76.9%**: this is five *attacking* armies, that is, 6 in the attacking territory against 3 (0.76937). With 5 in the territory it is 64.2%. Two million real-dice battles gave 0.76933 (standard error 0.0003).
- **A whole terminal distribution** (10 against 6, 15 outcomes): chi-square 12.6 for real dice and 14.2 for table draws against the exact values, on 14 degrees of freedom.

## Partial results

Measured on 2026-10-15 on the owner's laptop: AMD Ryzen 7 7840U (8 cores, 16 threads), 31 GB RAM, Windows 11, on AC power, Balanced power plan; Node v24.12.0 without flags, rustc 1.99.0. A `typeperf` sidecar sampled the effective clock, load, free memory and the four ACPI thermal zones every second. Before each run the machine had to be idle (under 10% utility) and back near its idle zone temperatures, and each run's own hardware log was recorded with it. Each figure is the median of 5 timed reps after a warm-up of at least one second.

**These are partial.** The first table comes from a single interleaved round (TS, Rust, Rust `target-cpu=native`, WASM in turn), taken while the machine was quiet. Every run passed the idle gate (1.0–9.2% background load before it, effective clock 4.0–4.7 GHz on the busy core for single-thread runs and 3.6–4.1 GHz for all-core runs, the hottest ACPI zone peaking at 70–100 °C, about 10.5 GB free). That round had no check for load *during* a run, which was added later, and it predates a branch-free rewrite of the TS dice code, so its battle numbers flatter Rust (see below). The planned three rounds and the 10-minute sustained runs never completed cleanly.

| Workload | TS (per second) | Rust native | Rust, `target-cpu=native` | Rust → WASM in Node |
|---|---|---|---|---|
| Full games, one core (80 turns per game on average) | 3,562 games | 1.94× | 1.90× | 1.77× |
| Evaluation kernel, undo in place | 1.88 M positions | 3.36× | 3.37× | 2.36× |
| Evaluation kernel, copy per candidate | 1.90 M positions | 3.24× | 3.30× | 2.26× |
| Battles by table draw (TS search still branching) | 25.8 M battles | 1.73× | 1.72× | 2.24× |
| Full games, 16 threads | 28,154 games | 2.52× | 2.57× | not run |
| Full games, 8 threads | 20,993 games | 2.20× | 2.13× | not run |

From the later, stopped run, only runs with no other load measured during them: **single rolls** TS 570 M/s, Rust native 1.77×; **battles by single rolls** TS 19.0 M/s, WASM 1.02×.

**The JS↔WASM boundary** (single round): an empty call cost about 0.4 ns (2.3 billion calls a second), a one-value read about 3.8 ns, and a call that lists every legal attack about 76 ns. A game driven from JS (about 560 calls a game) ran at 5,762 games a second against 6,308 for the same game inside WASM: **9% slower**. A mixed design, with the engine in WASM and the bots in TS, would be cheap at the boundary.

**Sustained all-core load** (a 60-second trial only, not the planned 10 minutes): Rust held 68.9k then 66.9k games a second; TS fell from 27.7k to 23.9k as the effective clock dropped from 3.44 to 3.13 GHz.

What the numbers suggested, for the record: the evaluation kernel is where Rust's lead is largest (about 3.3× native, about 2.3× as WASM). Full games are branch-bound, and Rust's lead there is about 2×, or about 2.5× on all cores. `target-cpu=native` made no difference. One trap was found on the way: V8 doesn't turn branches on random dice outcomes into conditional moves, so the TS dice code had to be written branch-free by hand. That took the TS rolls benchmark from about 10× behind Rust to 1.8×.

## Why it stopped

The laptop never gave a sustained clean, quiet window. Other agents' work (builds, test runs, a dev server and screenshots) loaded the CPU intermittently, so most runs in the full measurement were rejected for load during the run, or for a machine that never settled within five minutes. The hottest ACPI zone sat at 90–100 °C under any sustained load, and all-core clocks fell as the chip throttled. The owner judged that measurements taken on this laptop were not a sound basis for the language choice, and stopped the spike.

## The case made for TypeScript

TypeScript was proposed on principles, not on these numbers, and briefly recorded as decided before the owner put the decision on hold. The case as made:

- **The gain is a constant factor.** Even at face value, Rust's lead is about 2–3.4× on this hardware: it changes how long a gauntlet takes, not which experiments are possible. Better algorithms (search pruning, cheaper evaluation features, the exact tables) move the bots further than a constant factor does.
- **One language is simpler.** The reference engine, the contract, the UI, the server route and the bots are TypeScript. A TypeScript fast engine means one toolchain, one test runner, and differential tests that compare two TypeScript engines in one process. There is no second build, no WASM packaging on Vercel, and no boundary to design around.
- **Bot iteration speed is the bottleneck that matters.** Bots are changed far more often than the engine, and changing a bot in the language the rest of the project uses keeps every iteration short.
- **The door stays open.** If profiling real gauntlets shows that a single hot kernel dominates (the evaluation kernel is the likely candidate), that kernel alone can move to Rust compiled to WASM later. The measured boundary cost says such a split would be cheap.
