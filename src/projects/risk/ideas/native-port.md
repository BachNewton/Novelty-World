# Risk in Rust: a native engine held to the rules, and bots designed in Rust

A design under construction: the foundations are built, the engine is next, the bots follow. Decided by the owner: the engine and the bots get a native Rust implementation so that, if the bots stay on the CPU, they can still get faster. The engine is **designed natively for speed and held to `RULES.md`**, not to the TypeScript implementation; bots **may be designed in Rust**, and a Rust bot is a bot of its own. TypeScript remains the engine the online game runs on and the code every frozen seated bot runs on. This revises the earlier language decision (`language-decision.md`) for the measuring harness; the online game's choice stands.

## What it is for

The seated bots (rule-v1 to v6, and v7 = v6 with its reply search) run in TypeScript on the worker pool, and they are slow: v6 about 20 ms a turn on one core, v7 about 2.5 s, most of it v6's planning inside v7's imagined replies. The engine itself is about 2% of a game's time. So the speed has to come from the bots: a bot designed in Rust, on an engine designed in Rust, where a turn's planning costs a fraction of what the TypeScript pays, and a search bot can afford far more replies.

## The one consequence to keep in view

**A Rust bot that isn't decision-identical to rule-v6 is a new bot, not rule-v6.** It gets its own name and label, is measured by the gauntlet and the ladder like any bot, and can't stand in for a frozen seated bot in a measurement of that bot. Nothing here makes v6's own gauntlets faster; it makes the *next* bots faster to build and to run. Exactness is kept only where it is cheap and buys a specific thing (below).

## Where it lives

- `native/` in this project: one Cargo crate, `risk-native`, a library with a binary (`serve` and the checking subcommands). Dependencies: `serde`, `serde_json`, `sha2`; a thread pool is a few lines over `std::thread`. Its `target/` is ignored by git. The Windows build links the C runtime statically (`.cargo/config.toml`), because Node does and `pow` differs between the static and the dynamic runtime (see "Floating point").
- `eval/native/` on the TypeScript side: the vector exporter, and the runner that lets a measuring run play on the native path. Game records are the GPU engine's own module, `eval/gpu-record.ts` on `eval/gpu-canonical.ts`: `risk:native-fixtures` and `risk:native-check` are its `risk:gpu-fixtures` and `risk:gpu-check`, and `--bots` asks each seat's TypeScript bot every decision.

## The engine

**Designed for speed, held to the rules.** Its data layout, move generation and internals are its own: flat state, a 64-bit mask of territories per seat, precomputed adjacency and continent masks, counts kept incrementally, hands as small fixed arrays, no allocation on the hot path. Nothing in it follows the TypeScript code's shape; everything in it follows `RULES.md`, every rule and every edge case, read from the spec.

Three things it keeps the same as the reference engine, each because it costs nothing and buys a check:

- **The random source and the order of its draws**: xmur3 of the seed into mulberry32, drawn in the reference engine's order (seat order, deal, starting armies, the deck; then dice, a blitz's draw, a trade's returns). mulberry32 is already as cheap as a random source gets, and keeping the stream means a Rust game and a TypeScript game of the same seed and moves are *the same game*, so every TypeScript tool that replays a game (`risk:review`, `risk:trace`) reads a Rust game, and lockstep replay (below) checks the whole rule set move by move.
- **Balanced Blitz** (`COMBAT-8`) is a rule, and its odds are already ported bit-exactly (`blitz.rs`, proven on vectors). A blitz draws one number and resolves on the same odds, so the same draw gives the same losses.
- **The contract's shapes** (a seat's view, its options, the move kinds, the events with their rule ids), so a bot written against the TypeScript contract and one written in Rust see the same game, and the differential tools can speak both.

### Verifying the engine: rules, not bytes

1. **A rules suite in Rust**: a test per rule and edge case of `RULES.md` (setup and the first-turn bonus, reinforcement arithmetic, trades and the forced trade, the territory bonus, battles and dice pairing, the blitz's resolution, capture and the move-in's bounds, elimination and the card transfer, the mid-attack forced trade, fortify reach, the turn passing eliminated seats, the win), and the invariants (`INV-*`) checked on every state in a fuzz of random-legal play.
2. **Lockstep replay of TypeScript games as a rules check**: `risk:native-fixtures` records reference games (seed, seating, every move, a canonical hash of the state after each move and of the options before it; the record format and layout are the GPU engine design's, so fixtures interchange). The crate replays each record: every move of a legal TypeScript game must be legal here and lead to the same board, and the options offered must be the same set. This checks the rules on hundreds of thousands of real positions and is independent of how the engine is built; because the random stream is kept, it checks the dice too.
3. **Options equality both ways**: the lockstep compares the whole legal move set at every decision (the options hash), so a move legal on one side and not the other fails loudly.
4. **Distributional equivalence**: the simple bots that exist on both sides (greedy and GD's personas, ported exactly, below) play the same seeds on both engines and must produce identical games; on fresh seeds, game length, win rates by seat and table size, cap rate, captures and trades per game are compared with the GPU design's statistical tests.

## The bots

**Exact ports, only of the cheap ones**: `greedy` and GD's four Expert personas (about 1,500 lines of straightforward scoring). Exactness buys three specific things here: the engine's distributional check becomes a move-for-move check (games identical, not merely similar), the yardstick bots players know exist on the native side so a Rust bot's measurement can seat them, and a search bot's reply mix has its cheap opponents (v7 draws from v6, GD Aggressive and greedy). The rule bots are **not** ported one for one.

**Bots designed in Rust**, named `native-v<n>`, each with a design doc of its own in `ideas/`:

- **`native-v1`**: a planner in v6's class, designed in Rust from the ideas, not the code: an evaluation of a turn's end (power share, the chance of being eliminated before the next turn, expected border losses, the next turn's kill), plans over target sets (hold, a capture, a continent, a kill, a sweep) scored on their success and failure boards, and a model of what each opponent does with its turn. What changes is the engineering: incremental features over bitmasks, odds from precomputed tables, boards copied as a few words, no string-keyed memos, and a design that invites tuning (`risk:tune` by SNES, as the rule bots). Its bar, fixed before its runs: at least as strong as v6 by the gauntlet (even or better against v6 in both mixtures at every table, a regression against no one in the field), at a small fraction of v6's time per turn (the target is a 20× cut, measured).
- **`native-v2`, a search bot**: v7's idea on native replies: candidate plans played forward through imagined rounds of the opponents' turns, the opponents drawn from the native bots. The whole point of the port: where v7 affords 8 replies in 2.5 s, this affords hundreds, and the budget is measured for strength as the project's rules require ("more thinking is earned").

How a Rust bot is measured: the gauntlet and the ladder stay in TypeScript, and so does the frozen field. A table whose every seat is a native bot plays wholly in the crate (`--native`: the fast path, for iterating on native bots and for tuning), and `--parity N` plays every N-th seed group in TypeScript too and fails the run on any game that differs, for the bots exact on both sides. A mixed table (a native candidate among frozen TypeScript opponents) plays on the TypeScript runner with the native seat answered by the crate: each worker owns one native process and asks it for a move over a pipe, the history sent as it grows. A label the crate has and TypeScript doesn't seats the native bot; a label both have is the TypeScript bot, and `<label>@native` forces it onto the native path, so a mixed table can be held to the all-TypeScript one (a gauntlet of `gd-stacker@native` reports exactly what one of `gd-stacker` does). That needs the runner to accept a bot that answers asynchronously, a behaviour-free change for every existing bot (their moves, seeds and fingerprints are untouched); the reason is this seam. A native bot's games in the ratings cache are keyed to the crate's sources.

## How Node uses the crate

A separate process over stdin and stdout, JSON lines, never an addon: a `serve` mode plays whole games (the harness's `RiskGameSpec` in, `RiskGameResult` out) on the crate's thread pool, wrapped on the TypeScript side as a bot-lab `GameRunner`, and a `bots-serve` mode answers a seat's decisions (`bots` lists the native labels). An addon would put a native build into `npm install` and a crash surface into Node for a call made once per game or once per decision; a pipe costs microseconds against a decision that costs milliseconds. The runner fails loudly when the binary is missing or older than the crate's sources.

## Floating point

Only the blitz's balancing and GD's balancing of an estimated chance use transcendental functions. The crate's `jsmath` reproduces V8's arithmetic and is proven on exported vectors: `exp` and `log` are V8's fdlibm ports (with V8's one special case, `exp(1)`), and `pow` is the platform's, because **V8 since Node 24 calls the C runtime's `pow`** (`use_std_math_pow`), so the TypeScript's own results depend on the platform: Node on Windows links the runtime statically and its `pow` differs from the system DLL's and from glibc's in the last bit on about 1 input in 3,000. Two consequences the owner should weigh: the committed `pow` vectors are Windows's, and a TypeScript game whose blitz odds hit such an input may already differ between the laptop and a Linux runner on GitHub Actions. `js_round` and `fround` are reproduced too; the rest is plain IEEE arithmetic in the same order wherever a result is compared.

## Order of work

1. Foundations (done): the crate; `jsmath`, the RNG, the map, the cards, the blitz and the battle odds, bit-exact on vectors exported on Risk's Node pin; the TypeScript lockstep tooling (one module with the GPU engine's) and committed fixtures of random, greedy and GD games.
2. The engine (done): designed natively, a rules suite named by rule id, lockstep on every fixture, the fuzz with every invariant, and `serve`.
3. `greedy` and the GD personas (done), exact in both directions, so a native game of theirs is the TypeScript game.
4. `native-v1` (built, measured only by proxy): its design doc `native-v1.md`, the seam (`--native`, `--parity`, `@native`, mixed tables), and the harness path proven end to end with a smoke gauntlet against rule-v6. Its gauntlet against v6 and the field is next. Its first timing, taken on a saturated machine, is about 6× v6 per decision and 3.5× per turn, short of the 20× its doc set; the quiet-machine figure and a cheaper kill planner are the open items.
5. `native-v2`, the search bot, with its budget measured for strength.
6. Speed, reported as games and decisions a second against the TypeScript pool, on a quiet machine with the owner's go-ahead.
