# Risk

The board game Risk. The project is an outline for now: a placeholder screen, with the rules, engine and bots still to come.

## Rules

Classic Risk, with escalating card values for set trades. `RULES.md` in this folder is the source of truth for the rules: the engine, its tests and the bots follow it, and a question about a rule is settled there, not in code.

Ambiguities are settled the way Betrayal settles them: a note beside the rule, and a resolution labelled with its authority (official, official digital, community, project or unresolved). Where the rulebooks are unclear, the official digital game, RISK: Global Domination, is deferred to before community practice or a project ruling. `RULES.md` opens with the method. Claude makes the project rulings as a game designer would, and brings one to the owner only when it would fork the engine or the architecture.

## The engine contract

`contract.ts` is the boundary between the engine and everything that uses it: the UI, the server route that plays real games, and the bots. They never read the engine's state; they ask for a seat's **view** (what that seat may see), its **options** (the legal moves, grouped so a screen can highlight targets), and **apply** a move, getting back the new state and the **events** that happened, each naming the rule behind it. `map.ts` is the board as data, shared by both sides. The contract is the same whichever language the fast engine ends up in, so the UI and the engine are built in parallel against it.

- **One source of legality.** A move is legal exactly when `apply` accepts it; the options are a convenience a test holds equal to that. A step the rules leave no choice over is taken by the engine, not offered.
- **Hidden information is kept by good faith, as in Betrayal.** The whole state, every hand and the deck order included, lives in one game row every player can read, and the UI shows each seat only its own view and events with other players' drawn cards removed. Players are trusted to look only at what the UI shows them; there is no per-player secret storage. Bots receive the same per-seat view, so they play fair.
- **Moves are sized for a network.** Every move is a round trip to the server, so a whole assault is one move (blitz: attack until captured, or down to a chosen number of armies), alongside the single battle.
- **The reference engine runs real games; the fast engine runs bots.** Real games, on the server and for legality on the phone, use the reference engine, which is TypeScript and obviously correct. The fast engine exists for bot speed, and the differential tests keep the two identical.

## Visual style and map

Risk has its own style, separate from Novelty World's bright, quirky one: a war room, campaign maps, brass and parchment. Its colours come from its own design tokens, scoped to the project. The map is our own, never Hasbro's board art: drawn as SVG from public-domain world geography (Natural Earth), with territories grouped by `RULES.md`'s borders, and credited on the credits page.

**Risk's width floor is 375px**, raising the site's 360px floor for this project only: the whole board has to stay readable and tappable, and 42 territories are its hardest layout problem.

## Engine plan

The engine is built in stages, each one earning the next:

1. **The rules spec** (`RULES.md`).
2. **A reference engine**: slow and written to be read, one rule at a time, with a test for each rule and invariant checks (army counts, ownership, card counts, turn order) run on every state it produces. Its job is to be obviously correct, not fast.
3. **A speed spike**: the same core written as fast TypeScript, as Rust native and as Rust compiled to WASM, measured on the laptop (gauntlet throughput) and in the server's runtime (how much search fits in a bot's turn). The numbers pick the language; nothing is assumed in advance.
4. **The fast engine** in the winning language, differential-tested against the reference engine over many seeded games: the same seed must give the same game in both, move for move.

## Bots

The bot direction is a rules-based bot. `ideas/risk-bot-ai.md` is the research behind that choice and the survey of stronger methods.

- **One build, laptop to server.** A bot ships as the exact code that was tuned on the laptop. There is no separate "tuning" bot and "shipping" bot to drift apart.
- **Bots run on the server.** Game state lives in the database and a server function plays the bot seats, as in Monopoly, so a phone only shows the game and sends its player's moves. In a real game a bot may take a few seconds per turn: a better decision in a competitive game is worth the wait. The budget is spent once per turn, planning it, not on each of a turn's many small decisions.
- **Gauntlets must be fast.** Measuring bots takes thousands of games, so iteration speed is set by the engine and the bots' cost per move. A searching bot is screened at a small work budget, and a change that passes is confirmed at its play budget, where rankings can differ.
- **Work budgets, not time limits.** A bot that searches gets a fixed amount of work per turn (nodes, rollouts, iterations), never a wall-clock limit, so the same seed and position always give the same move on any machine.
