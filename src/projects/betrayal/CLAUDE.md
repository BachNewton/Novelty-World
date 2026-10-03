# Betrayal at House on the Hill

A faithful digital recreation of the board game and its Widow's Walk expansion: explore a haunted house room by room until the haunt begins and one player turns traitor. It is for the owner and close friends only. No game code exists yet, so its page shows the "Coming soon" placeholder. What follows is the decided design direction.

## Haunts

Haunts are the hard part: each one rewrites the rules, its own way. Two pieces handle them.

- **Overridable rules.** The engine never hard-codes a rule a haunt might change. It asks questions (can this player move here, is this player defeated, how many dice does this roll get) and the active haunt adds modifiers to the answers.
- **A kit of haunt parts.** Reusable pieces a haunt is assembled from: setup, monsters, allies, tokens, tracks, objective actions, rule changes, win conditions, and information split per side (what heroes know, what the traitor knows).

A haunt is mostly typed data built from that kit, with small local functions where a haunt needs something the kit doesn't cover. The engine never branches on which haunt is running.

## The rules engine

Pure and deterministic, with a seeded random number generator in the game state, so a game is a function of its start and its actions. It pauses on a pending decision, with an id, that names which seat must answer and lists the legal choices. Legality has one source: a choice is legal exactly when applying it succeeds, and a test enforces that the listed choices match. A forced step, where the rules leave exactly one legal option, is taken by the engine itself, not offered as a decision. A real choice always goes to the player, even when one option is clearly better. Every event the engine emits names the rule that caused it (a room, card, haunt or rulebook rule), so the UI can explain it. The saved state's format is versioned from the start, because the Widow's Walk star-haunt record outlives individual games.

## Who it's for

Average players: neither first-timers nor experts. The game carries the rules so players don't have to: forced steps happen automatically, legal choices are offered rather than remembered, and every rule the engine applies is explained in plain language as it happens ("You entered the Junk Room: roll Might to leave. You rolled 3, success"). Automation is for convenience and to take away the mental load of interpreting rules, not for speed. Automatic steps play out visibly, at a pace a player can follow, and are kept in a readable game log. This is unlike Monopoly, which aimed at fast, expert play.

## Visual style

Betrayal has its own style, separate from Novelty World's bright, quirky one: it's a gothic haunted-house horror game, and its look should be dark, eerie and atmospheric. Its colours come from its own design tokens, scoped to the project. All art is original, never copied from the published game. The specific art direction (for example pixel art or illustrated SVG) is still to be chosen.

## Presentation and input

- **Logic and presentation are fully separate.** The engine knows nothing about rendering. The UI reads game state and sends intents, so the presentation (React components, a 2D canvas, three.js) can be swapped without touching game logic.
- **Every input method picks from the pending decision's choices.** Touch, mouse, keyboard and an Xbox controller (through the shared `gamepad` library) are interchangeable ways of choosing among the legal options the engine offers. Adding an input method never touches game logic.
- **Phones:** a touch-friendly layout; the board plus panels pulled in when needed.
- **Desktop:** mouse and keyboard, using whatever screen shape the player has. Extra width (ultrawide) goes to always-visible side panels, such as character cards, held cards and the game log, not to a stretched board.

## Responsiveness

The UI must respond to a player's action at once, never after a server round trip. Monopoly's first version waited on the server. It then replayed the player's own unconfirmed actions locally through its pure engine, and the bugs came from the machinery around that replay, not the replay itself:
- the client handled version conflicts;
- clients acted as the game clock and drove the bots;
- hidden flags lived outside the store;
- animation was stacked as a third state;
- updates arrived twice in no fixed order;
- relative actions changed meaning when replayed;
- updates were missed when a tab resumed.

Betrayal keeps the replay and removes those causes:

- **Applying an action locally computes the real result.** The engine is pure and deterministic, and each roll's randomness derives from the game seed plus the id of the decision it answers. Another player's action therefore can't change the result of your own pending roll, and a shown roll is never changed afterwards. Only actions answering your own pending decision are applied locally.
- **The client holds two things:** the last state the server confirmed, and a queue of its own unconfirmed actions. What the screen shows is always calculated from them. A new server state replaces the confirmed one. Queued actions whose decision is no longer pending drop away, and a rejected action drops everything queued after it.
- **The client never handles versions.** An action names the decision it answers. The server checks that id, applies the action, and retries its own write on a lost race. The client only ever hears "accepted, here is the state" or "rejected".
- **Client sync is one pure function** over four events: server state, local action, accepted, rejected. There are no flags outside it, and its tests include duplicated, reordered and dropped updates. Only states with a higher version are kept, and nothing waits on a particular update arriving.
- **The engine emits events, and the presentation animates them.** Animation never holds up sync or input. The server runs mechanical steps through to the next decision in one write.
- **The client reloads the state** whenever its subscription (re)connects and whenever a tab wakes or comes back online.
- **Most interaction is local UI state** that never reaches the server: hovering, choosing a path, browsing cards, selecting before confirming. Only committing a decision is sent.
- **Actions are absolute** ("set this", never "add one"), so replaying one can't change its meaning.

Under the good-faith model, a client being able to work out dice from the seed is accepted.

## Bots and AI players

Not required: "working end to end" means every seat is a human. A seat held by a rule-based bot, or by an AI model through an API, is a planned nice-to-have, so the architecture keeps it cheap to add later:

- **A seat has a controller:** human, bot or AI. At first only "human" is used.
- **Decisions describe themselves.** A pending decision lists its legal choices both as data the engine checks and as plain-language labels. The UI shows the labels, and an AI can read them.
- **A per-seat view.** `viewFor(state, seat)` returns what that seat may see. The UI renders it, and bots and AI receive the same view, so they play fair even though the full state is public.
- **Every controller answers asynchronously.** The engine never calls a controller. It only holds a pending decision, and any controller (a human's click, a bot, an AI waiting on an API) answers later by submitting an action through the same route. A rule bot that answers at once is just an async controller that happens to be fast. This is a lesson from Monopoly, whose bots were synchronous, which made adding AI players hard: nothing may assume a non-human seat answers immediately.
- **Answers are matched to decisions.** Each pending decision has an id, and an action names the decision it answers. An answer to a decision that is no longer pending is rejected, so a slow AI can't act on a game that has moved on.
- **The server drives non-human seats** when the pending decision is theirs; clients never act as a bot's proxy. A write that hands the decision to a bot or AI triggers a drive request. Any client may also call an idempotent "nudge" that restarts a stalled drive, and decision-id matching makes duplicate calls harmless. A long AI call runs as its own request, not inside the request that raised the decision, and posts its answer back like any other client. Only one AI call runs per decision, so several clients don't each pay for the same answer. API keys stay server-side. What happens when an AI never answers is a feature decision for the owner.
- **Bots can't break the game.** Every answer is validated by the engine, and a legal fallback is used when an answer is missing or illegal.
- **A bot's policy is a pure function** from a seat's view to its action. An AI player can be given the `content/` rules specs as its rules context.

## Online play

Server-authoritative: a route handler is the single writer, using the pure engine to validate actions, and clients read and subscribe to one shared game-state row. Not PeerJS, because games are long and players must be able to drop out and rejoin without the game dying with a host's tab, and because the Widow's Walk star haunt needs a record that lasts between games (which seasonal haunts each explorer has played).

Players are trusted to act in good faith and look only at what the UI shows them. So all state, hidden information included (the traitor's half of a haunt, a player's cards), lives in that one public row, and the UI decides what each player sees. There is no per-player secret storage.

## Content

The source of truth for the game's rules is `content/`, written from the owner's copies of the 2nd edition and Widow's Walk:

- `rules.md`, the rulebook, and `widows-walk-rules.md`, the expansion's rule sheet, which holds the combined haunt chart for haunts 1–100
- `haunt-chart.md`, the base chart
- `haunts/`, one file per haunt (1–100 plus the star haunt), each holding the traitor's half (Traitor's Tome) and the heroes' half (Secrets of Survival)
- `widows-walk-haunt-index.md`
- `characters.md` and `explorers.md`
- `rooms.md`
- `cards/` (omens, items and events)
- `tokens.md`, including token supply limits, which haunts can exhaust

These are rules specs, not copies of the books. Data is recorded exactly: numbers, stats, names, tables. Rules are restated in our own words, and the books' story text is left out, with a one-line summary in its place. Keep it that way when adding content. Every entry that comes from Widow's Walk is tagged as such.

`rules.md` headings carry book page numbers, because the haunts refer to rules by page.

Where the books are ambiguous or contradict themselves, the files say so in a `> Note:`. A `> Resolution (...)` line under each note gives the answer found by research, labelled with its authority (official, designer, community or unresolved) and its source. There is no official 2nd-edition FAQ. Official errata (the Widow's Walk FAQ, both its short version and the long one with haunt corrections, and the 1st-edition FAQ where the rule is unchanged) is applied to the rule text itself. Settle unresolved notes with the owner before implementing the rule they affect. The Widow's Walk haunt and rule-sheet notes haven't been researched yet; do that when Widow's Walk is built.

## Scope

The base game, working end to end, comes first; Widow's Walk follows. Its content is already recorded, so the engine is designed with all of it in view, and nothing in the engine may hard-code base-game counts such as three floors or fifty haunts.

## Prior art in this repo

Monopoly (`src/projects/monopoly/`) is the closest existing project: a turn-based game on a shared Supabase row with a server writer and bots. Treat it as a project to learn from, not a template. Review it critically, keep what proved sound, and don't carry over its mistakes just because it already does things a certain way.

## Design

`design/haunt-survey.md` is the evidence base for the engine: every haunt broken down against the parts kit. It gives the coverage, the override questions the engine must answer (ranked by how many haunts use them), the parts kit, the engine capabilities beyond overrides, and the outliers that need custom code.

`design/engine.md` is the engine design built on it: layers, game state, decisions and events, randomness, the rules interface, the haunt format, the content pipeline, server, client sync, testing and build order, with the lessons from Monopoly folded in.

## Next step

The owner reviews `design/engine.md` and settles its open questions. Then building starts at its first milestone.
