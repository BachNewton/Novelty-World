# Risk

The board game Risk. The project is an outline for now: a placeholder screen, with the rules, engine and bots still to come.

## Rules

Classic Risk, with escalating card values for set trades. `RULES.md` in this folder is the source of truth for the rules: the engine, its tests and the bots follow it, and a question about a rule is settled there, not in code.

Ambiguities are settled the way Betrayal settles them: a note beside the rule, and a resolution labelled with its authority (official, official digital, community, project or unresolved). Where the rulebooks are unclear, the official digital game, RISK: Global Domination, is deferred to before community practice or a project ruling. `RULES.md` opens with the method. Claude makes the project rulings as a game designer would, and brings one to the owner only when it would fork the engine or the architecture.

## The engine contract

`contract.ts` is the boundary between the engine and everything that uses it: the UI, the server route that plays real games, and the bots. They never read the engine's state; they ask for a seat's **view** (what that seat may see), its **options** (the legal moves, grouped so a screen can highlight targets), and **apply** a move, getting back the new state and the **events** that happened, each naming the rule behind it. `map.ts` is the board as data, shared by both sides. The contract is the same whichever language the fast engine ends up in, so the UI and the engine are built in parallel against it.

- **One source of legality.** A move is legal exactly when `apply` accepts it; the options are a convenience a test holds equal to that. A step the rules leave no choice over is taken by the engine, not offered.
- **Hidden information is kept by good faith, as in Betrayal.** The whole state, every hand and the deck order included, lives in one game row every player can read, and the UI shows each seat only its own view and events with other players' drawn cards removed. Players are trusted to look only at what the UI shows them; there is no per-player secret storage.
- **Bots are never trusted: they see only what their seat may legally see.** That is enforced by construction, not good faith: a bot is given its seat's view and options, never the game state, so hidden information is unreachable from bot code. A searching bot that needs whole states to simulate builds them from its view, filling in what it can't see (other hands, the deck order) by sampling what is consistent with it, never by reading the real ones.
- **Moves are sized for a network.** Every move is a round trip to the server, so a whole assault is one move (blitz: attack until captured, or down to a chosen number of armies), alongside the single battle.
- **The reference engine runs real games; the fast engine runs bots.** Real games, on the server and for legality on the phone, use the reference engine, which is TypeScript and obviously correct. The fast engine exists for bot speed, and the differential tests keep the two identical.

## Visual style and map

Risk has its own style, separate from Novelty World's bright, quirky one: a war room, campaign maps, brass and parchment. Its colours come from its own design tokens, scoped to the project. The map is our own, never Hasbro's board art: drawn as SVG from public-domain world geography (Natural Earth), with territories grouped by `RULES.md`'s borders, and credited on the credits page.

**Ultrawide monitors are a primary device too** (21:9 such as 3440×1440, and 32:9 such as 5120×1440). The extra width is spent on information, not on stretching the board: the board stays at its most readable size, and panels beside it show what a narrower screen keeps behind a tap (the battle log, every player's standing, continent control, the odds of a planned attack).

**The iPad is a primary device**, in both orientations (iPad about 820×1180, iPad mini 744×1133), with touch as its input. Every iPad browser runs on WebKit, Safari's engine, so Risk is checked in WebKit as well as Chromium.

**Risk's width floor is 375px**, raising the site's 360px floor for this project only: the whole board has to stay readable and tappable, and 42 territories are its hardest layout problem.

## Engine plan

The engine is built in stages, each one earning the next:

1. **The rules spec** (`RULES.md`).
2. **A reference engine**: slow and written to be read, one rule at a time, with a test for each rule and invariant checks (army counts, ownership, card counts, turn order) run on every state it produces. Its job is to be obviously correct, not fast. It lives in `engine/`: `invariants.ts` checks `RULES.md`'s INV-* on every step, and `test-kit.ts` holds scripted positions, scripted dice, a model of what the options allow, and the random-legal player the fuzz tests use.
3. **TypeScript for the fast engine and the bots** (`ideas/language-decision.md`, made by an independent review; `ideas/speed-spike.md` holds the partial measurements). One bounded exception: a single hot, pure kernel (position scoring, say) may later move to Rust compiled to WASM, the same binary everywhere with the TypeScript kernel kept as its differential oracle, and only when all three hold: the bot measurably keeps gaining from more work, real bot turns on the server use their allowed time after the TypeScript is tuned, and a profile puts most of a turn inside that kernel. Bots are never written in Rust.
4. **The fast engine**, TypeScript, built when gauntlets need it: flat typed-array state, allocation-free hot loops, benchmarks pinning each kernel's throughput, and differential tests against the reference engine over many seeded games, move for move. It is for simulation only; real games use the reference engine.

## Bots

The bot direction is a rules-based bot. `ideas/risk-bot-ai.md` is the research behind that choice and the survey of stronger methods.

- **One build, laptop to server.** A bot ships as the exact code that was tuned on the laptop. There is no separate "tuning" bot and "shipping" bot to drift apart.
- **Bots run on the server.** Game state lives in the database and a server function plays the bot seats, as in Monopoly, so a phone only shows the game and sends its player's moves. In a real game a bot may take a few seconds per turn: a better decision in a competitive game is worth the wait. Thinking time is spent once per turn, planning it, not on each of a turn's many small decisions.
- **Bots may later think on a player's device.** If a bot's strength keeps climbing with its budget well past what a server function can give it in a few seconds (measured by rating the same bot at several budgets), a modern phone's faster cores may run it instead. The design keeps that open: a bot is a pure function of its seat's view, and its move goes through the same route as any move, named by its decision id. A device could then volunteer an answer, with the server still the single writer, still validating, and still playing the bot itself when no device answers. Parallel search would use Web Workers with their own copies of the game, not shared-memory threads, which need site-wide cross-origin isolation.
- **Strength comes first.** The goal is the most challenging bot; the need for fast gauntlets never caps its strength.
- **Gauntlets must be fast.** Measuring bots takes thousands of games, so iteration speed is set by the engine and the bots' cost per move.
- **More thinking is earned, not assumed.** Whether a bot gets stronger with more work per turn is a measurement, made by rating the same bot at several amounts of work, not an assumption built into the bot interface. Only a bot with an expensive part that measurably gains from more work gets a work budget. Such a budget is then a fixed amount of work (nodes, rollouts, iterations), never a wall-clock limit, so the same seed and position always give the same move on any machine; and gauntlets may screen it at a small budget and confirm a change at its play budget, where rankings can differ.
