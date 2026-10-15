# Risk

The board game Risk: its rules, its engine, and a game screen playable on touch, keyboard and mouse, and a controller.

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

Risk has its own style, separate from Novelty World's bright, quirky one: a war room, campaign maps, brass and parchment. Its colours come from its own design tokens, scoped to the project. The board is our own, never Hasbro's board art. It is drawn as a graph of territories and borders, made to be read; geographic art may come later.

**Risk's width floor is 375px**, raising the site's 360px floor for this project only: the whole board has to stay readable and tappable, and 42 territories are its hardest layout problem.

- **The board is a graph with a fixed layout** (`board/graph-layout.ts`), so players learn it: each territory a node, each border an edge, each continent a tinted region with its name and bonus, outlined in a seat's colour while that seat holds it all. `board/layout_graph.py` makes it offline, once, from a hand sketch that keeps the continents where Risk players expect them (North America left, South America below it, Europe and Africa in the middle, Asia right, Australia lower right) and places territories within a continent for the graph, not geography; a gentle relaxation then evens the spacing without letting any border cross another. It is tuned by editing the sketch and running the script again, never at runtime. Borders between continents are drawn brighter than those inside one. Alaska–Kamchatka runs off both sides of the board, as on Risk's own board, each end's line leading to a ghost of the territory across the edge, which can be tapped. Tests hold the layout to `map.ts` (every territory and border, nothing more), with no crossings and every territory a fingertip apart on a 375px phone.
- **Nodes** show the owner's colour and shape, the armies large in the middle and a short name (`ui/short-names.ts`); the full name is the tooltip. The territories on offer light in brass, the chosen source and target more strongly, with the borders between them, and a fortifying army's march through its owner's territories is drawn as a lit path.
- **The geographic board is kept, unused**, for when the board gets art: `board/generate.py` draws it from Natural Earth's admin-1 provinces (downloaded into a directory of its own, never committed), and only its simplified output, `board/board-data.ts`, is in the repo. It is stylised as Risk boards are: projected with the Bering Strait as the board's edge, magnified smoothly round the crowded places (Europe, Central America, the Malay archipelago, Japan) by lenses that only stretch the plane, archipelagos closed up into chunkier land, small islands dropped and a few scaled up. The generator checks the result against `map.ts`: territories that touch must be neighbours, and neighbours that don't touch get a sea line.
- **Colour is never the only cue.** Each seat has an ink and a shape, on its territories on the board and beside its name, and is named by its colour (`ui/seats.ts`).
- **The tokens** are `components/theme.ts`, applied on the game's root; the display face is Cinzel.
- **The map pans and zooms on every input.** It starts on the whole board while that is readable, and otherwise zoomed to a readable size: a phone in portrait fills the map's height and is panned across rather than shrunk to a strip.

## The game screen and input

The screen is built against the contract alone. It shows a seat's `GameView`, lights the territories its `Options` offer and never works out legality for itself (`ui/selection.ts`), sends `Move`s, and tells the events. The rules are well known, so the screen doesn't quote them; events keep their rule ids for tracing a game. It takes a feed (the view, the options, the events and a way to move), so a local game and an online one drive the same screen. `local-engine.ts` is the one place a local game picks its engine: a stand-in (`stub/`), with hand-made scenes for each phase, until the real engine replaces it.

- **Places are picked on the map; everything else is one status box**: what to do now, the amounts and dice, the latest news, and ending the phase. Cards, the log and the menu are dialogs. The card dialog shows everything public (`public-cards`): every hand's size, the sets traded, the next set's value and the discard pile.
- **Three input methods, each complete on its own**, following Betrayal's model and controller map wherever the two games share a meaning, so a player moving between them finds the same controls doing the same things. Hints follow the last-used input, and before anything is used, the device (none on a touch screen), drawn with the site's prompt glyphs from one map of meanings to controls (`ui/bindings.ts`).
- **One meaning per control.** The d-pad, left stick and arrow keys move the focus: between the territories on offer while a territory is to be picked (spatially, by screen direction, the board wrapping east to west so Alaska's west is Kamchatka), round the status box's buttons while it asks for something, and round a dialog's while one is open. A, Enter and Space press the focus; B and Esc back out. Tab steps through the territories on offer. Unlike Betrayal, whose left stick pans its camera round a reticle, a flat map is navigated by focus, so the right stick pans and the triggers zoom (Betrayal's zoom), View and C show the whole board (Betrayal's Follow, the camera's home), Y and I open the cards (Betrayal's explorer), Menu and M the menu, LB and RB (or the bracket keys) step an amount down and up, and ending the attack or the turn is a hold of X or Backspace, as Betrayal's End turn is. The number keys roll that many dice and B blitzes.
- **Touch and the mouse** pick a territory with a tap or click, a territory reaching half way to its neighbours (a fingertip at least); a drag pans, two fingers pinch, the wheel zooms. Every button is at least 44px.
- **A couch-distance layout** at 1920 wide and up: larger type, markers and buttons (sized in ems, so they scale with the type), a margin clear of the screen's edges, and a focus that shows plainly.
- **Screens step up with their room.** A tablet held upright gives the board the height its shape needs and shows the players below it. From 2400px wide (an ultrawide), panels beside the status box show what narrower screens keep behind a tap: every player's standing as bars, continent control, the exact odds of a planned blitz (`ui/odds.ts`; each target's chance while one is being picked) and the battle log as dice and loss pips (`components/intel.tsx`). From 3600px (32:9) the log gets a column of its own.
- **Hot-seat**: a local game shows the view of the seat whose turn it is, cards included, and any controller acts for it. Assigning controllers to seats (Betrayal's pad assignment) is not built yet.

## Engine plan

The engine is built in stages, each one earning the next:

1. **The rules spec** (`RULES.md`).
2. **A reference engine**: slow and written to be read, one rule at a time, with a test for each rule and invariant checks (army counts, ownership, card counts, turn order) run on every state it produces. Its job is to be obviously correct, not fast. It lives in `engine/`: `invariants.ts` checks `RULES.md`'s INV-* on every step, and `test-kit.ts` holds scripted positions, scripted dice, a model of what the options allow, and the random-legal player the fuzz tests use.
3. **A speed spike**: the same core written as fast TypeScript, as Rust native and as Rust compiled to WASM, measured on the laptop (gauntlet throughput) and in the server's runtime (how much search fits in a bot's turn). The numbers pick the language; nothing is assumed in advance.
4. **The fast engine** in the winning language, differential-tested against the reference engine over many seeded games: the same seed must give the same game in both, move for move.

## Bots

The bot direction is a rules-based bot. `ideas/risk-bot-ai.md` is the research behind that choice and the survey of stronger methods.

- **One build, laptop to server.** A bot ships as the exact code that was tuned on the laptop. There is no separate "tuning" bot and "shipping" bot to drift apart.
- **Bots run on the server.** Game state lives in the database and a server function plays the bot seats, as in Monopoly, so a phone only shows the game and sends its player's moves. In a real game a bot may take a few seconds per turn: a better decision in a competitive game is worth the wait. The budget is spent once per turn, planning it, not on each of a turn's many small decisions.
- **Gauntlets must be fast.** Measuring bots takes thousands of games, so iteration speed is set by the engine and the bots' cost per move. A searching bot is screened at a small work budget, and a change that passes is confirmed at its play budget, where rankings can differ.
- **Work budgets, not time limits.** A bot that searches gets a fixed amount of work per turn (nodes, rollouts, iterations), never a wall-clock limit, so the same seed and position always give the same move on any machine.
