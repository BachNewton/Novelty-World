# Risk

The board game Risk. The project is an outline for now: a placeholder screen, with the rules, engine and bots still to come.

## Rules

Classic Risk, with escalating card values for set trades. `RULES.md` in this folder is the source of truth for the rules: the engine, its tests and the bots follow it, and a question about a rule is settled there, not in code.

Ambiguities are settled the way Betrayal settles them: a note beside the rule, and a resolution labelled with its authority (official, official digital, community, project or unresolved). Where the rulebooks are unclear, the official digital game, RISK: Global Domination, is deferred to before community practice or a project ruling. `RULES.md` opens with the method. Claude makes the project rulings as a game designer would, and brings one to the owner only when it would fork the engine or the architecture.

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
