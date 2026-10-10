# Betrayal at House on the Hill

A faithful digital recreation of the board game and its Widow's Walk expansion: explore a haunted house room by room until the haunt begins and one player turns traitor. It is for the owner and close friends only. The engine is being built, milestone by milestone, from `design/engine.md`, and the game is played in a 3D house on one device (`design/v1-play.md`), with the plain debug view at `?debug`. What follows is the decided design direction.

## Haunts

Haunts are the hard part: each one rewrites the rules, its own way. Two pieces handle them.

- **Overridable rules.** The engine never hard-codes a rule a haunt might change. It asks questions (can this player move here, is this player defeated, how many dice does this roll get) and the active haunt adds modifiers to the answers.
- **A kit of haunt parts.** Reusable pieces a haunt is assembled from: setup, monsters, allies, tokens, tracks, objective actions, rule changes, win conditions, and information split per side (what heroes know, what the traitor knows).

A haunt is mostly typed data built from that kit, with small local functions where a haunt needs something the kit doesn't cover. The engine never branches on which haunt is running.

## The rules engine

Pure and deterministic, with a seeded random number generator in the game state, so a game is a function of its start and its actions. It pauses on a pending decision, with an id, that names which seat must answer (or which seats, each answering once, when a question is put to several at once) and lists the legal choices. Legality has one source: a choice is legal exactly when applying it succeeds, and a test enforces that the listed choices match. A forced step, where the rules leave exactly one legal option, is taken by the engine itself, not offered as a decision, and recorded as an event so the screen can show it: placing a room that fits only one way, taking damage that can land only one way, making a roll with nothing to add to it. That removes meaningless steps such as "click to roll", never a player's act. A player's act stays theirs to take even with one option, so they always know it is happening: their turn (moving, exploring, actions, and above all ending it, so a turn with nothing left waits for End turn) and answering a trade offered to them. A turn with no one able to act on it, a dead or sleeping explorer's or a monster turn with no monster ready, has no act to take and passes as a forced step. A decision kind declares whether it always asks. A real choice always goes to the player, even when one option is clearly better. Every event the engine emits names the rule that caused it (a room, card, haunt or rulebook rule), so the UI can explain it. The saved state's format is versioned from the start, because the Widow's Walk star-haunt record outlives individual games.

## Who it's for

Average players: neither first-timers nor experts. The game carries the rules so players don't have to: forced steps happen automatically, legal choices are offered rather than remembered, and every rule the engine applies is explained in plain language as it happens ("You entered the Junk Room: roll Might to leave. You rolled 3, success"). Automation is for convenience and to take away the mental load of interpreting rules, not for speed. Automatic steps play out visibly, at a pace a player can follow, and are explained in the moment, in the status box (see "Presentation and input"), rather than in a log. This is unlike Monopoly, which aimed at fast, expert play.

## Visual style

Betrayal has its own style, separate from Novelty World's bright, quirky one: it's a gothic haunted-house horror game, and its look should be dark, eerie and atmospheric. Its colours come from its own design tokens, scoped to the project. All art is original, never copied from the published game.

**Claude makes all of the art, so the style leans into Claude's strengths and finds workarounds for its weaknesses.** All of it is built in code: simple shapes with adjustable dimensions; figures sculpted from formulas (signed-distance forms and lofts, meshed when built), since organic forms built from formulas are a strength; small pixel-art textures drawn only from one limited palette, the art's texture style (the palette's skin ramp is for figures only, and decals never snap to it; each character's skin tone is assigned in one place, `art/explorers/skin.ts`); SVG decals; and lighting to carry the mood. It avoids painted illustration, and fakes what is hard to model (water, fire, a deep pit) with what works. Claude checks its own art from screenshots before the owner sees it.

**The game is shown as a 3D house**, in `art/`: each room tile is a little room, seen as a dollhouse with the walls between rooms cut down. It renders at native resolution: a lowered render resolution is not a style but a cheap, unearned trick. A room is a short data definition (materials, props, lights, mood) on a shared stage that builds the shell, with doors and windows taken from the room data. Props a single room needs live in that room's file; pieces several rooms share go in the kit. Light is baked: a room's lamps spill through doorways into the rooms next door, and walls stop them; `design/lighting.md` holds the lighting as a whole. Light is not pixel art: light, caustics and water reflections (and water's surface) may move smoothly while surfaces stay pixel art. Water is one shared kit piece (`art/kit/water.ts`) for any water, from the lake to flooding, puddles and fountains; the lake's look is pending between two styles (`?water=shader` or `shader-palette`). **Colour has a meaning** in light: cold moon blue is the baseline, warm amber human, sickly green supernatural, red danger and the traitor, violet magic and omens, gold holy. Figures are miniatures on a base, built from rigid parts joined at pivots; animation is procedural, driven by the stage's clock, with no skeletons or keyframe files. The art bench (`?bench=<room-id>`) shows one room on its own, and `tools/shots.mjs` freezes the clock and screenshots it from every view. The `betrayal-room-art` and `betrayal-figure-art` skills hold how a room and a figure are built and reviewed.

## Presentation and input

`design/presentation.md` holds the design in full.

- **Logic and presentation are fully separate.** The engine knows nothing about rendering. The UI reads game state and sends intents, so the presentation can be swapped without touching game logic.
- **Three input methods**: a controller (through the shared `gamepad` library), touch, and keyboard + mouse, one method with the two used together. Each picks among the legal options the engine offers, and adding one never touches game logic. Hints follow the last-used input.
- **A free strategy camera** on every input: pan, turn, tilt from near eye level to near top-down, zoom, change floor, and recentre on the active explorer. Game events only pan it; the player's turn, tilt, zoom and chosen floor are theirs.
- **Controls never change meaning with what's under the cursor**: the wheel always zooms.
- **Decisions about places live in the house** (glowing rooms, doorways and stairs, a ghost tile to place). Every other decision is in **one status box**: what happened, why (the rule behind it, its full text a tap away), and what you can do now, End turn included.
- **Preview before commit**: pointing at a choice shows what it would do before anything is sent. There is no undo.
- **Dice** are the engine's: no physical dice, but each die's value and the outcome in words. **Cards** play out in the room, held cards live on the figure, and a panel appears only where nothing else works. There is no game log panel in v1.
- **Phones and desktops** both: from 360px wide to ultrawide, with the house never stretched.
- **The UI is always instant.** It responds at once, and is usable on the first pass: for light, the direct light of what is on screen. Higher-fidelity work runs in the background, on workers sized to the device's cores, never blocks input or frames, and is applied as it lands, with a mark showing finer passes are coming. Work that usually takes more than a couple of seconds shows its progress from the start; which work that is gets decided per kind of work by measurement, never by a hard-coded timer. The built UI is the right idea but needs refinement: frames still drop during a bake (`design/v1-play.md`).

## Hot-seat

One device, three to six seats, as a feature, not a stand-in. The screen shows only the view of the seat holding the device, and players look away from what isn't theirs. Ending the turn is passing the device: there is no handover banner, and a question for another seat mid-turn names that seat in its prompt. When online play comes, the seats move to devices.

**Several controllers on one device.** Each pad is assigned the seats it plays ("pad assignment", `play/pads.ts`, named so as not to clash with a seat's human, bot or AI controller). It is local device setup, never game state, and not saved: pads re-claim their seats after a reload. A seat has at most one pad, and claiming a seat takes it from another pad. When the game waits on a seat, only that seat's pad may act and drive the camera; an open seat accepts any pad; a disconnected pad frees its seats. Touch and keyboard + mouse are the device, and always act for whoever the game waits on.

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
- **Most interaction is local UI state** that never reaches the server: hovering, choosing a path, browsing cards, selecting before confirming. Only committing a decision is sent. (A live preview is broadcast to the other players, but never written; see "Online play".)
- **Actions are absolute** ("set this", never "add one"), so replaying one can't change its meaning.

Under the good-faith model, a client being able to work out dice from the seed is accepted.

## Bots and AI players

Not required: "working end to end" means every seat is a human. A seat held by a rule-based bot, or by an AI model through an API, is a planned nice-to-have, so the architecture keeps it cheap to add later:

- **A seat has a controller:** human, bot or AI. At first only "human" is used.
- **Decisions describe themselves.** A pending decision lists its legal choices both as data the engine checks and as plain-language labels, each with a one-line consequence (what taking it leads to). The UI shows the labels, and an AI can read them.
- **A per-seat view.** `viewFor(state, seat)` returns what that seat may see. The UI renders it, and bots and AI receive the same view, so they play fair even though the full state is public.
- **Every controller answers asynchronously.** The engine never calls a controller. It only holds a pending decision, and any controller (a human's click, a bot, an AI waiting on an API) answers later by submitting an action through the same route. A rule bot that answers at once is just an async controller that happens to be fast. This is a lesson from Monopoly, whose bots were synchronous, which made adding AI players hard: nothing may assume a non-human seat answers immediately.
- **Answers are matched to decisions.** Each pending decision has an id, and an action names the decision it answers. An answer to a decision that is no longer pending is rejected, so a slow AI can't act on a game that has moved on.
- **The server drives non-human seats** when the pending decision is theirs; clients never act as a bot's proxy. A write that hands the decision to a bot or AI triggers a drive request. Any client may also call an idempotent "nudge" that restarts a stalled drive, and decision-id matching makes duplicate calls harmless. A long AI call runs as its own request, not inside the request that raised the decision, and posts its answer back like any other client. Only one AI call runs per decision, so several clients don't each pay for the same answer. API keys stay server-side. What happens when an AI never answers is a feature decision for the owner.
- **Bots can't break the game.** Every answer is validated by the engine, and a legal fallback is used when an answer is missing or illegal.
- **A bot's policy is a pure function** from a seat's view to its action. An AI player can be given the `content/` rules specs as its rules context.

## Online play

Server-authoritative: a route handler is the single writer, using the pure engine to validate actions, and clients read and subscribe to one shared game-state row. Not PeerJS, because games are long and players must be able to drop out and rejoin without the game dying with a host's tab, and because the Widow's Walk star haunt needs a record that lasts between games (which seasonal haunts each explorer has played).

Players are trusted to act in good faith and look only at what the UI shows them. So all state, hidden information included (the traitor's half of a haunt, a player's cards), lives in that one public row, and the UI decides what each player sees. There is no per-player secret storage.

**Live previews.** Other players see the acting player's preview before it is committed (the choice in focus, a route, a ghost being turned, a trade being built), so the game feels live. A preview is ephemeral UI state, never game state: sent over a Supabase Realtime broadcast on the same connection as the game row's subscription, never stored, never validated, dropped on commit. It never leaks a secret: only public decisions are previewed, filtered by the per-seat view. Not PeerJS: its star hangs on a host's tab while players drop and rejoin, and it would add a second network, with its NAT failures, beside the row's. It stays an upgrade path only if previews ever feel laggy.

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

Where the books are ambiguous or contradict themselves, the files say so in a `> Note:`, which may carry an id (`> Note [id]:`) when the engine cites that one ruling behind an event. A `> Resolution (...)` line under each note gives the answer found by research, labelled with its authority (official, designer, community, project or unresolved) and its source. There is no official 2nd-edition FAQ. Official errata (the Widow's Walk FAQ, both its short version and the long one with haunt corrections, and the 1st-edition FAQ where the rule is unchanged) is applied to the rule text itself. Settle every unresolved note before implementing the rule it affects. Research comes first: an official, designer or community answer is recorded with that authority. When research finds nothing conclusive, the ruling is Claude's to make, as a game designer would: keep the heart of the game in mind, weigh it from the players' and the designers' standpoint, and draw on modern board game design and digital adaptations. Record it with the authority project, with its reasoning. The owner's expertise is the architecture and the UI, not game design, so bring a ruling to the owner only when it would fork the engine or the technical architecture. The engine is definitive: the rulebook's "agree, or flip a coin" for unclear rules is never put to players at runtime. The Widow's Walk haunt and rule-sheet notes haven't been researched yet; do that when Widow's Walk is built.

## Scope

The base game, working end to end, comes first; Widow's Walk follows. Widow's Walk UI and art wait for it, unless a Widow's Walk decision would change a base-game one. Its content is already recorded, so the engine is designed with all of it in view, and nothing in the engine may hard-code base-game counts such as three floors or fifty haunts.

## Prior art in this repo

Monopoly (`src/projects/monopoly/`) is the closest existing project: a turn-based game on a shared Supabase row with a server writer and bots. Treat it as a project to learn from, not a template. Review it critically, keep what proved sound, and don't carry over its mistakes just because it already does things a certain way.

## Design

`design/haunt-survey.md` is the evidence base for the engine: every haunt broken down against the parts kit. It gives the coverage, the override questions the engine must answer (ranked by how many haunts use them), the parts kit, the engine capabilities beyond overrides, and the outliers that need custom code.

`design/engine.md` is the engine design built on it: layers, game state, decisions and events, randomness, the rules interface, the haunt format, the content pipeline, server, client sync, testing and build order, with the lessons from Monopoly folded in.

`design/presentation.md` is the presentation: the house and the status box, input and the camera, moving, placing rooms, dice, cards, the cutaway, figures in rooms, the art's scope, and the open questions. `design/lighting.md` is the lighting: the bake, its passes and bounce, probes, fakes and budgets. `design/card-presentation.md` sorts every card by how it shows in the house, and `design/cutaway-research.md` is the research behind the cutaway, with its sources.

`design/v1-play.md` is the plan for local hot-seat play: its phases, the architecture as built, and where work left off.

`design/ai-players.md` records a proof of concept with local models playing the exploration phase, what it showed about the view text an AI needs, and the options for AI seats later.

## Working on long tasks

Keep the main session thin. Delegate each substantial unit of work (a phase, an integration, an engine gap, a review) to a fresh agent with a self-contained written brief, and read back only a short report. The main session orchestrates and makes the decisions at each boundary. When its own context grows heavy, hand orchestration to a fresh agent through a written brief rather than pressing on or waiting for auto-compaction: a long context degrades judgement well before it fills. Decisions only the owner can make still come back to the owner through the reports.

## Next step

Milestones 1 to 3 are built: the engine plays the whole game before the haunt, and haunt 13, Perchance to Dream, plays start to finish in one browser, reached by the haunt roll or the page's "start haunt 13" scenario. Every other haunt still stops the game at its reveal. The playtesting tools are built: the page can start from a scenario (stacked decks and room stack, rooms in the house, explorers placed with chosen traits and cards, or "start haunt N"), set up by the engine's own setup so it stays reproducible; a game can be shared as a link (`?game=<code>`) that replays it from its seed, scenario and actions; the log reads by turn and each line can show "why?" (the rule's text and its rulings, from `data/rule-notes.json`, which holds a haunt's cited rulings but never its halves' text); and the board highlights what the pending decision offers. The haunt framework is the kit in `kit/` (setup parts, shared statuses, rule changes, triggers and objective actions written for any haunt), compiled into a haunt-layer rule source, with `viewFor` as the per-seat view the page renders. A toy haunt in `test/` still sweeps the framework under every haunt number.

Next is **v1: local hot-seat play** in the 3D house (`design/v1-play.md`), before online play (milestone 4): a fully playable hot-seat game, with all its UI and art up to and including the haunt reveal. Done: phases 0 to 2 (the house scene, the playable skeleton, and moves of several rooms with walking and the route preview), the free camera on three inputs, the rotation ghost, the status box, the room review pass, the cutaway markings, several controllers on one device, the bake in passes with bounce light, and 25 rooms and four explorers. Next, in order: startup speed and frame smoothness; phase 3, the presenter, with stable standing spots; phases 4 to 7 in parallel; and art throughout. `design/v1-play.md` holds the detail and what is tabled.
