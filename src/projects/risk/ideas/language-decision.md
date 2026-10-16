# The language of the fast engine and the bots

A decision with its reasoning: which language the Risk fast engine and the Risk bots are written in. It was made on the merits after the speed spike (`speed-spike.md`), with no candidate preferred in advance. When the owner confirms it, the project's `CLAUDE.md` records the outcome and this document stays as the case behind it; if they overrule it, the sections on options and triggers are still the map of the trade-offs.

## The decision

**TypeScript, for the fast engine and for the bots**, in the same repo, toolchain and test runner as everything else, with one bounded escape hatch:

- **One kernel may move to Rust compiled to WebAssembly**, and only when three things have been measured, not argued (the triggers are in "What would change this"). The kernel is one hot, pure, integer-shaped piece (scoring positions, rolling out an attack sequence), never the bot's judgement.
- **If the hatch is taken, the same WASM binary runs everywhere**: laptop gauntlets, the server and any device. No native Rust in the loop. The TypeScript version of the kernel stays as its reference and its differential test.
- **A bot is never written in Rust.** The bot's logic is what changes every week; it stays in the language of its tests, its scenarios, its view type and its measurement tooling.

In one sentence: the speed Rust buys is a constant factor of two to three on a cost the project does not yet pay, while the second language is a tax paid on every change to the thing that does matter, the bot's logic.

## What the choice has to serve

From the project's goals and the owner's principles, in the order they bind:

1. **The strongest possible bot**, uncapped by any other requirement.
2. **Fast iteration on bot strength**: thousands of games per change, judged by SPRT and Elo, as Monopoly does.
3. **One build**: the shipped bot is the exact code that was tuned.
4. **Determinism**: the same seed and position give the same move on any machine.
5. **Bots see only their seat's view**, enforced by construction.
6. **Simplicity first; share code aggressively; choose on how well Claude can build and maintain it**, never on readability to the owner, who is language-agnostic.

The runtimes: a Next.js route handler on Vercel's free tier (Node, one vCPU, a few seconds per bot turn is acceptable), phones running the reference engine for legality, the owner's shared 8-core laptop for gauntlets, and possibly a phone or tablet's Web Workers later.

## The options

| | Fast engine | Bots | Where the speed goes |
|---|---|---|---|
| **A. TypeScript throughout** (chosen) | TS, flat typed-array state | TS | 1× |
| **B. Rust throughout** | Rust: native on the laptop, WASM on the server and device | Rust | ~2 to 3.4× |
| **C. Rust engine, TypeScript bots** | Rust → WASM | TS, calling into WASM | engine 2×, bot 1×, plus the boundary |
| **D. TypeScript with a Rust/WASM kernel, if measured** | TS, one kernel in WASM | TS | kernel 2 to 3×, the rest 1× |

A is the decision and D is its escape hatch; they are one option with a gate between them.

Dismissed without a full row:

- **AssemblyScript**: looks like TypeScript, is a different language (no sharing of the real TS code or types, its own memory model, a small ecosystem), with speed between the two. It would be a second language that pretends not to be.
- **C or C++ through Emscripten, Zig, Go**: nothing Rust doesn't do better here, with worse WASM tooling, larger output (Go) or a less settled toolchain (Zig). Rust is installed, and it is the language Claude writes most reliably among them.
- **Python**: never for the engine or bots (every prior Risk bot that ran in Python was throttled by it, per `risk-bot-ai.md`). It may still be the right tool for a later learned evaluation's **training step**; that is a separate decision that doesn't touch the shipped bot's language (see "Consequences").

## How each option fares

### Strength (goal 1)

Language does not change what a bot can express. It changes strength through one channel only: how much work fits in the budget a real turn allows. On the server that budget is a few seconds on one vCPU; Rust fits two to three times as much work into it.

Whether more work makes the bot stronger is, by the project's own principle, **a measurement, not an assumption**. The v1 design (`rule-bot-v1.md`) estimates tens of milliseconds per turn at full budget, so the server's few seconds hold roughly a hundredfold headroom in TypeScript before the factor of three is reached. For later search-based stages (Carr-style end-of-turn search, opponent-turn rollouts) more budget probably does buy strength, but with diminishing returns: a factor of two or three in simulations is typically worth a measurable but modest rating gain, and the same gain is available from a better evaluation or pruning, which iterates faster in one language. Option B is the only one that is strictly stronger at a fixed server budget; D captures most of that gain exactly where and when the measurement says it exists.

### Iteration speed (goal 2)

Two costs here, and they point in opposite directions.

**Gauntlet wall-clock.** Rust ran full games 2.2 to 2.5× faster on 8 to 16 threads and held its throughput under sustained load where TypeScript lost about 14% over a minute to falling clocks. Overnight runs would finish in well under half the time. But the engine's own share of a gauntlet is small: at the spike's 3,562 games per second per core, the engine costs about 0.3 ms per game, while a v1 bot costs milliseconds per *turn*, so the bot's code, not the engine, sets a gauntlet's length. A screening run of a few thousand games at a small budget takes seconds to a minute in TypeScript on 14 workers; a confirmation run at full budget takes minutes to tens of minutes. These are workable, and they are the same order as the Monopoly gauntlets the method was built around.

**The change loop.** Every bot change is edited, type-checked, unit-tested and then gauntleted. In TypeScript that is one command each, on the test runner and lint the repo already has, against the reference engine's `test-kit.ts` positions, with the view and option types shared with the UI. Option B adds a compiler step, a second test runner, a second lint, glue for every view and option shape that crosses the boundary (serde or wasm-bindgen), a build artifact to produce for every deploy, and a second copy of the map data and of the shared seeded RNG, each kept in step by a test. Option C is the worst of the two: the bot's hot loops (rollouts, evaluation) are the expensive part and would be the slow side, crossing the boundary constantly; the spike's 9% penalty for driving a game one call at a time is the floor of that cost, not its ceiling.

Cross-language seams are also where agent maintenance errors concentrate: a stale artifact, a type changed on one side, a test that can only run where cargo is installed. Under the principle "choose on how well Claude can build and maintain it", the seam is the real cost of B, more than the Rust itself, which Claude writes well.

### One build (goal 3)

TypeScript: literally one module imported by the gauntlet worker, the route handler and a Web Worker. Rust: one source, but native on the laptop and WASM on the server are two compilations, and `f64` transcendental functions (`exp`, `ln`, `powf`) come from different math libraries on each, so a bot that uses them could pick a different move on the server than it did when it was tuned. B keeps "one build" only by running WASM on the laptop too, which gives up native's extra margin and leaves WASM's 1.8 to 2.4× over TypeScript. That is the hatch's rule as well: one binary, everywhere.

### Determinism (goal 4)

Integer arithmetic and the basic float operations are bit-identical across every runtime in play. Transcendental functions are not guaranteed identical across JavaScript engines (V8 on the laptop, Vercel and Chrome; JavaScriptCore on an iPhone) or between native and WASM math libraries. Neither language is exempt; both need the same discipline, written down under "Containment". WASM has one genuine edge: the same binary gives the same answer in every browser, which matters only if on-device thinking ships and must match the server bit for bit, which it need not (the server validates legality, not agreement).

### The view boundary (goal 5)

A type, not a language. Every option enforces it the same way: the bot is handed a `GameView` and `Options`, never the state. In B the view is serialized into WASM per turn, microseconds that don't matter in a real game and that a gauntlet avoids by running the whole game inside the binary.

### Simplicity, sharing, maintainability (goal 6)

A is one language, one toolchain, one test runner, no binary artifacts, no cross-compilation and no Vercel build step. Monopoly's worker pool, SPRT and Bradley-Terry Elo are imported, not re-implemented. The reference engine, the fast engine, the differential test between them, the bots, their scenarios and the UI all share `contract.ts` and `map.ts` directly. The repo already shows the cost of the alternative in miniature: Shipwright uses Rapier's `-compat` build, which inlines its WASM as base64 to dodge bundler trouble, and still needed a health check for the module's singleton state.

### Summary against the goals

| Goal | A. TypeScript | B. Rust throughout | C. Rust engine, TS bots | D. TS + measured WASM kernel |
|---|---|---|---|---|
| Strongest bot at a fixed server budget | 1× work; headroom ~100× for v1 | 2 to 3.4× work | engine fast, bot slow | kernel 2 to 3× when it matters |
| Gauntlet turnaround | adequate; bot code dominates | 2.2 to 2.9× faster | little gain | gain where the kernel is |
| Change loop on bot logic | one command each, shared types | compile, glue, two test runners, artifacts | glue on every call | as A until the hatch opens |
| One build | yes | only if WASM runs on the laptop too | partial | yes: one binary everywhere |
| Determinism across machines | same discipline as all | same discipline, plus the native/WASM libm gap | same | WASM kernel is bit-identical everywhere |
| View boundary | a type | a type plus serialization | a type plus serialization | a type |
| Simplicity and sharing | one toolchain, Monopoly tooling reused | two toolchains, duplicated data and RNG | two toolchains and a chatty seam | one toolchain plus one contained crate |

## Why the speed factor doesn't decide it

The laptop's numbers are partial and the owner is right not to lean on them alone. They don't need to be leaned on. They fall squarely in the range public experience gives for V8 against native on integer-heavy array code (roughly 1.5 to 4×), and the decision does not turn on whether the factor is 2 or 3.5: at either value it is a constant that neither removes a capability nor changes the shape of the bot. A quiet run on a desktop would sharpen the number and change nothing. The one measurement that would change the decision is a different kind, about the bot's strength curve, and it can only be made once a bot exists.

The spike's most useful finding is not a ratio but a lesson: **TypeScript's speed is a discipline, Rust's is a default**. The TypeScript battle code was ten times slower than Rust until it was rewritten branch-free, then 1.8× slower. The evaluation kernel never got that treatment and sat at 3.4×. That is the real cost of TypeScript, and it is paid by writing the hot paths deliberately and pinning them with benchmarks, which is cheaper than a second language.

## Costs and risks of the choice, and their containment

1. **Hot paths written carelessly are slow.** The fast engine keeps the spike's shape: a flat `Int32Array` state, no allocation in hot loops, integer arithmetic, branch-free battles, battle tables rather than simulated dice. The bots' expensive parts (rollouts, path convolutions, the elimination planner's allocation loop) are written the same way, and `vitest bench` pins the throughput of each kernel so a regression shows in a number, not in a slow night. Profile a gauntlet (`--cpu-prof`) before optimizing anything; the hot spot is rarely where it is guessed to be.
2. **Floats can differ across engines.** Decision-bearing math stays in integers and rationals where it can (battle tables are exact counts; set probabilities are combinatorics). Where a transcendental function is unavoidable (a normal approximation past the battle-table cap), it is implemented in plain arithmetic in our own code, not called from `Math`, so every runtime computes the same bits. Ties are broken by index order, never by float equality. A golden-move test runs seeded positions through each bot and pins the moves; if on-device thinking ships, the same goldens run in the e2e suite's three browser engines.
3. **A budget-limited bot is capped at the server's few seconds.** This is the one risk that touches goal 1, and the hatch exists for it; its triggers are below. Until they fire, the Rust toolchain on the laptop stays out of the repo. A kernel ported early, on a guess, is the duplication the choice is meant to avoid.
4. **Sustained all-core runs throttle.** This costs wall-clock, never results: games are deterministic in their seed whatever the clock does. Gauntlets keep Monopoly's `cores − 2` worker default and run overnight when long.
5. **Monopoly's tooling is Monopoly-shaped.** Its `GameSpec` and `GameResult` name Monopoly's labels and counters. Lifting the pool, SPRT, Elo and gauntlet skeleton to `src/shared/` and making them generic over a play-one-game function is a refactor done once, before Risk's first gauntlet, and Monopoly becomes its first consumer.

## What would change this

The hatch opens, for one kernel, when **all three** hold:

1. **The bot gains from budget.** The same bot, rated at several work budgets in mixed-field gauntlets, keeps gaining at the largest budget the server can give it. (`CLAUDE.md`: more thinking is earned by measurement.)
2. **The server can't give more.** Real bot turns, timed on Vercel (a diagnostic log of wall time per decision), are using the few seconds a turn may take, after the TypeScript hot paths have been profiled and tuned.
3. **The time is in one place.** A profile shows most of a turn (as a working line, seventy percent or more) inside one pure, integer-shaped kernel.

Then that kernel, and only it, is written in Rust, compiled to WASM, run from the same binary on the laptop, the server and any device, and held bit-identical to its TypeScript original by a differential test over seeded inputs. How the binary ships (Turbopack's `wasm` loader, or inlined as the Rapier `-compat` build does) is decided then, against the Next.js version in the repo at the time.

Two other findings would reopen the whole question rather than the hatch:

- A future bot direction whose cost is dominated by the engine's `apply` itself (deep rollouts with millions of applies per turn) *and* whose strength is still climbing at the server's budget: then "Rust throughout, WASM everywhere" (B with the one-binary rule) is the option to re-weigh.
- Vercel's function budget shrinking below what a few seconds of thinking needs, with no on-device path: the bot's home would have to move, and the question becomes where it runs before what it is written in.

What would not reopen it: a cleaner benchmark showing the factor is 3 rather than 2, or a desire for faster overnight runs on their own. Those are costs the containment above already prices.

## Consequences

**The fast engine** is TypeScript, beside the reference engine, built when the first bot that simulates needs it (the v1 chain rollouts do), starting from the spike's loop. Flat typed-array state; the territory, adjacency and continent tables generated once from `map.ts`; the same `seeded-random.ts` stream as the reference engine, so the differential test can replay the same seeds move for move and demand identical events. It never becomes the engine of real games: those stay on the reference engine, on the server and on the phone.

**The bots** are TypeScript, pure functions of `BotInput` through the existing `Bot` seam in the online module, importing the fast engine to simulate from states they build out of their view. Bots start without a work budget. An expensive part gets one only once rating the same bot at several amounts of work shows it gains from more (the project's "more thinking is earned" rule); a budget is then counted in its own units (routes, rollouts, re-plans), never time. The scenarios in `rule-bot-v1.md` are Vitest tests over positions built with the reference engine's test kit, run on every change. Hot loops follow the fast engine's rules, and their throughput is pinned by benchmarks.

**The measurement tooling** is Monopoly's, made shared: the worker-thread pool, SPRT, Bradley-Terry Elo and the gauntlet's candidate-against-field skeleton move to `src/shared/lib/` behind a game-agnostic play function; Risk adds its own worker that runs one seeded Risk game with named bots and reports the compact outcome. CLIs run through `tsx` under `npm run`, as Monopoly's do. Fitness for evolutionary tuning is the mixed-field win share the v1 design specifies.

**The server** imports the bot module the gauntlet tuned. A bot turn is single-threaded (one vCPU), planned once per turn, at a fixed budget once it has earned one. Each bot decision logs its wall time, so trigger 2 above is a reading, not a guess. Nothing else changes in the route.

**On-device thinking**, if it is ever earned, loads the same module in a Web Worker, one copy of the game per worker, with any parallel search partitioned deterministically by seed so the device's answer is the one the server would have reached. The golden-move test runs in every browser engine the e2e suite covers before it ships.

**A learned evaluation**, if a later stage adds one, keeps the shipped bot in TypeScript: a small network's inference is a few hundred lines of float32 arithmetic over an exported weights file, which is a data asset of the bot, versioned with it. The training step's language is decided then; Monopoly's `tfjs-node` precedent and its Windows DLL workaround argue for weighing Python and PyTorch for training alone, with the engine still generating games in TypeScript.

**The hatch**, when and if it opens: one Rust crate for the one kernel, one WASM binary for every runtime, the TypeScript kernel kept as its reference and oracle, and the `CLAUDE.md` engine plan updated to name the kernel and the measurement that justified it.
