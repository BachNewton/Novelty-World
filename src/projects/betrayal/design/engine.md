# Engine design

The design for Betrayal's engine, server and client sync. It builds on the decisions in the project's `CLAUDE.md`, which it follows rather than reopens, and on `haunt-survey.md`, which gives the evidence for the rules interface and the haunt format. Where a choice avoids a problem Monopoly had, it says which one. Section 14 lists the questions deliberately left until the milestone that needs them.

## 1. Shape and layers

Seven layers, each depending only on the ones above it:

| Layer | What it is | Where it lives |
|---|---|---|
| Model | Types only: game state, seat, figure, decision, action, event, rule reference | `types.ts` |
| Engine | The pure rules engine: setup, the step loop, questions and modifiers, the board, effects, decisions and choices, randomness, `viewFor`, plain-language descriptions. It imports no content, React or Supabase | `engine/` |
| Content | The haunt parts kit, plus every room, character, card, token, chart and haunt as typed data built from it | `kit/`, `data/` (with `data/haunts/` holding one file per haunt) |
| Game | Binds the engine to the content catalogue and exports the handful of entry points everything else uses: create a game, apply an action, list the choices, view for a seat, describe | `game.ts` |
| Server | Commit and drive logic, written against a small database interface so it can be tested in memory. The route handlers are thin wrappers around it | `server/`, `src/app/api/betrayal/route.ts`, `src/app/api/betrayal/drive/route.ts`, `supabase/betrayal.sql` |
| Client sync | A pure sync reducer, and the store that connects it to Supabase and the route | `sync/`, `store.ts` |
| Presentation | Components that render a seat's view and choose among the pending decision's choices | `components/`, `index.tsx` |

```
types ← engine ← kit ← data ← game ← { server, sync/store, components, bots (later) }
```

This adapts the repo's project convention to the project's size. The engine is too big for one `logic.ts`, so it gets a folder, and the content needs the kit and the data separated. `store.ts`, `types.ts`, `index.tsx` and `components/` keep their usual roles. The engine never imports the catalogue directly. `game.ts` passes it in, so the arrows only point one way and tests can build a small house when they need one.

**Shared code it uses:**
- `seeded-random`: its string-seeded generator is exactly what per-decision randomness needs (section 4).
- `supabase/client`, for reads and Realtime, and `supabase/server-admin`, for the route's writes.
- `profile`: a player's identity on a seat.
- `gamepad`: controller input.
- `storage`: per-device UI preferences, such as the animation pace.

**What it doesn't use:**
- `peer` and `room-list`, because play is server-authoritative.
- `GameLobby` as it stands, because it offers a typed code or presence-listed rooms, and Betrayal lists persisted games, as Monopoly does. At the online milestone, Monopoly's game list moves into `src/shared/` as an option of the lobby, and both games use it; Monopoly's lobby is the refactor target.
- The `ui/` primitives where they carry Novelty World's colours, because Betrayal styles from its own scoped tokens.

**Determinism is enforced, not hoped for.** Code under `engine/`, `kit/` and `data/` may not use `Math.random` or the clock, and a lint restriction on those folders enforces it. Iteration over keyed collections goes in a sorted, stable order.

## 2. Game state

One JSON value, kept in the game row. It holds identifiers and live values only. Static content (room tiles, card text, character tracks, haunt definitions) stays in the catalogue and is referenced by id.

| Part | Holds |
|---|---|
| Header | State format number, game id, seed, sets in play (base, Widow's Walk), status (lobby, exploring, haunt, finished) |
| Seats | One per player, in table order: profile id and name, controller (human, bot, AI), side, roles (traitor, revealer), whether the side is secret and who knows it. A seat's explorer is the explorer figure it owns |
| Figures | Every piece the rules act on, in one collection keyed by id: explorers, monsters, allies and attackable objects. An explorer's id is its character's id, which is unique in a game and survives its seat changing hands; a haunt's figures are numbered from their definition. Each has a kind, its definition, the seat that owns it (or none), its place (room, and side in barrier rooms, or off the board), its traits (an explorer's clip positions on its tracks; a monster's values), its statuses, whether it's stunned and alive, what it holds and its links to other figures. Who controls a figure and which side it is on are questions, not fields (section 10). "You" in card and room text means whoever is acting or affected, explorer or monster, so a rule never asks which kind it has. An attack's target is a figure, a room or a token, since haunts 84 and 86 attack rooms |
| Board | Placed tiles (tile id, floor, grid position, rotation, face down or removed), tokens on rooms and on edges, the room stack and discard pile in order |
| Cards | Each deck's draw order and discard pile, what each figure holds, ongoing events, and the counters and flags kept on cards in play (a worn Mask, an open Music Box), each either the holder's, cleared when the card leaves them, or the card's own, cleared when it leaves play |
| Tokens | Placed tokens by id. Supply is unlimited unless a haunt caps a kind, because its text makes running out a rule; the physical counts in `tokens.md` are what those caps cite |
| Tracks | Named tracks and counters, with their values |
| Haunt | Haunt id, phase, revealer, secret values with the seats that know them, and the haunt's own small typed data |
| Turn | The current seat and turn kind (explorer, traitor or monster turn), and the turn's ledger: movement spent and the attack made, counted per figure, since a seat may move several; rolls attempted, items used, actions taken, and the rooms entered so far, in order. Plus a queue of inserted turns |
| Rule memory | What later rules read: deaths with killer and cause, damage sources, once-only flags, condition flags already fired |
| Work | The step stack: the engine's unfinished work, as data (section 3) |
| Decision | The pending decision's id, its addressees, the answers already given by addressees of a shared decision, and its question (a kind with parameters). Its choices are derived from the state, not stored. Or, instead of a decision, a ready wait: the seats still to confirm (section 3) |
| Answers | The most recent answered decisions (decision id, seat, choice), for idempotent retries (section 8) |
| Last events | The events from the latest write only, for animation |
| Result | Winning seats and each seat's outcome, once the game ends |

The randomness needs no stored stream: everything derives from the seed (section 4). Decision ids come from a counter in the state, so the client and the server compute the same ids when they apply the same action.

**Versioning.** The header's format number is set from the first commit. Loading a state runs a chain of pure migrations, one per format step, each tested with a saved fixture of the older format. The route migrates before it applies anything. A client that receives a format newer than its bundle understands reloads its own code, because the deploy has moved on. That is a code version change, not a bug being hidden. The star-haunt record (section 8) lives in its own table, so its shape never depends on a game's format.

**Payload.** Monopoly broadcast its whole row, log included, on every write. Betrayal keeps the row small:
- content is referenced by id;
- `lastEvents` holds only one write's events;
- the readable game log goes to an append-only events table that isn't broadcast;
- choices are derived, never stored;
- the answers ledger is bounded.

A test builds a late-game Widow's Walk state (a full house, many monsters, every card dealt) and asserts that its serialized size stays under a fixed budget of tens of kilobytes, well inside Realtime's message limit. A change that breaks the budget fails the test rather than failing in production.

**The engine is definitive.** The rulebook ends by telling a group to agree on anything the books don't clearly answer, or flip a coin (p. 23). The engine never does that. Every ambiguity a rule depends on is settled before the rule is built (section 7), and a conflict the engine meets at runtime throws (section 5): it is a bug to settle and fix, never a question put to the table.

## 3. Actions, decisions and events

**The pending decision.** It has:
- an id;
- its addressees: one seat, or a set of seats who each answer once. A decision about a figure (how it splits damage, which side of a barrier room it lands on, what it steals) goes to the seat that controls it, by the controller question, so a possessed or carried figure's choices move with its control and the rule that raised them never changes;
- a kind, with parameters;
- the rule that raised it.

**Shared decisions.** Some questions are put to several seats at once and answered in any order: haunt 100's secret vote, where everyone chooses and then all reveal together, and haunt 92's secretly written notes. Each addressee answers once, the answers are recorded per seat and hidden from everyone until the last one is in, and only then does the engine go on. Asking one seat at a time would leak the earlier answers or make everyone wait in turn.

**Ready waits are not decisions.** When the rules have players read something and carry on once everyone has, as at the haunt reveal ("everyone reads their half, then the traitor returns", p. 16), the engine holds a ready wait: the seats it is waiting for, each of whom confirms once. It offers no choice, so the forced-step rule below never applies to it. A decision is a pick among legal options; a ready wait gives people time to read and think.

**There is no undo.** Choices are selected locally and only committing sends anything, so a misclick is caught before it counts, and an undo would have to take back rolls everyone has already seen.

`choices(state)` lists the legal choices. Each choice is an action, given as data, with a plain-language label and a one-line consequence: what taking it leads to ("a room already in the house, with 2 unexplored doorways; you were there earlier this turn", "places a new room and moves you in, ending your movement"). The decision kind that writes the label writes the consequence, so the two never disagree. The UI shows the labels, with the consequence as a hint, and an AI reads both. An AI proof of concept found the consequence lines more than halved needless backtracking (`ai-players.md`). The turn's own decision ("what next?") lists moving one space to each reachable room, discovering through each open doorway, each usable item, each attack, each haunt action, trading, dropping, picking up and ending the turn.

**Actions are absolute.** An action names the decision it answers and states its answer outright ("move to room R", "split this damage as 2 Might and 1 Speed", "seat 3 is ready"). Nothing in an action is relative ("one more", "toggle"), so replaying it can't change what it means. Monopoly had to convert its toggles and bid increments after relative actions broke during replay.

**Legality is a dry run.** There is no separate legality check. A choice is legal exactly when `apply` succeeds on it. `choices` produces candidates from the questions (section 5) and keeps the ones that apply. A test asserts the invariant in both directions over seeded games (section 11). Monopoly's `isLegal` equals `apply().ok` rule proved sound, and Betrayal keeps it.

**Forced steps.** After applying an action, the engine runs a step loop until it reaches a real decision or the end of the game:
1. Pop the next step off the step stack and run it. A step may emit events, change state, push more steps, or raise a decision.
2. If a raised decision has exactly one legal choice, take it, recorded as a forced step with the rule that forced it. Otherwise pause on it. A ready wait always pauses.
3. After every step, re-check the conditions (section 5). Any that turned true push their effects.

Monopoly gets credit here: separating real choices (actions) from obvious ones (the engine's own steps) worked well, and this loop does the same thing. The loop has a fixed step bound and throws if it exceeds it. An endless loop is a bug, and it must fail loudly rather than be cut short silently.

**The step stack is why everything stays serializable.** An effect that needs a decision halfway through (split this damage, choose the next room to collapse, roll to escape) can't hold its place in a closure, because the state is JSON stored in a row. So unfinished work is a stack of typed steps, each a kind plus parameters, and every step kind, including a haunt's small local functions, is registered by name. The game can pause anywhere and resume on another machine.

**Events name their rule.** Every event carries a rule reference: the rulebook (with its page), a room, a card, a status, or a haunt section. It also carries the decision whose answer produced it, the seat that answered, and its index within that write, which together give it a stable id, unique across the game even when several seats answer one shared decision. A pure `describe` turns events and choices into plain language ("You entered the Junk Room: roll Might to leave. You rolled 3, success"). It lives with the engine, not the UI, because AI players need the same text. Each line names the room, card or token rule behind it. A behaviour may word the events its own rule causes where the general wording would say too little, and bookkeeping that another event of the write already tells (a drawn card's gain) has no line of its own. Describing an event type it doesn't know fails loudly.

**Path moves need no special action.** A player plans a path locally, and the client submits it as a chain of single-step moves. Each step names the decision id the engine will raise next, and the client can compute that id because the engine is deterministic. If something interrupts the path (a card draw, a room roll, a monster reaction), the next step's decision id no longer matches, so that step and the rest of the chain drop away. That is exactly the rule. Section 9 covers this.

## 4. Randomness

Every roll and shuffle draws from a generator seeded from the game seed, the id of the decision being answered, and a counter within that write. Setup uses a reserved setup key. Rolls made during forced steps belong to the write that caused them, so they use the id of the decision answered in that write.

Consequences:
- Applying your own action locally computes the real roll, and the server computes the same one. Another player's action can't change it, because the inputs are only the seed and your decision's id. A roll on screen is never revised.
- Only actions that answer your own pending decision are applied locally (section 9), so a prediction is never based on someone else's unconfirmed move.
- A client can work out dice from the seed. Under the good-faith model this is accepted, as `CLAUDE.md` says.
- A game replays from its seed and its actions, which gives tests, simulation and bug reports for free.

## 5. The rules interface

This is where the risk is. The survey separates three mechanisms, and the engine keeps them separate:

| Mechanism | What it is | How a rule source uses it |
|---|---|---|
| **Question** | Something the engine asks while it works out choices or results, such as "may this figure attack that one?" | It modifies the answer |
| **Event** | Something that happened: a turn ended, a room was entered, a figure died | A trigger reacts to it with effects |
| **Condition** | A predicate over the state: "both are in the Chapel", "escapes ≥ the secret number" | It fires when it turns true, including every win condition |

### Questions

There is a fixed, named set of questions: the 33 override points of the survey, among them combatOutcome, canAttack, lethalOutcome, dicePool and the others in its table, plus controller, the seat that decides for a figure. The set is closed and typed. A question about a piece takes a figure as its subject, never a seat. Each question declares:
- its **subject** type (for example, an attacker, a target and a trait);
- its **answer** type;
- its **base answer**, written from `rules.md`.

Every question receives the whole state plus its subject, never a narrow argument list, because the survey shows answers read sides, held cards, tracks, history and the source of damage. Choice enumeration and `apply` ask the same questions, which keeps legality single-sourced.

One attack shows how the questions chain:
1. canAttack, attackReach and isOpponent build the target list.
2. attackModes picks the trait both sides roll and the card the attacker uses (a weapon, the Ring).
3. dicePool sizes each side's roll, then the dice are rolled.
4. rollResult adjusts the totals.
5. combatOutcome turns the comparison into effects (damage, stun, steal, kill, grab, push, convert).
6. damageAmount and damageRouting place any damage.
7. traitChange moves the clips.
8. lethalOutcome decides what a skull means, asked per trait, with the cause.

Every step emits events that name the rule behind it.

### Rule sources and layers

A **rule source** is anything that can modify answers or react to events: the rulebook, a room in play, a held card, an ongoing event, a status, a haunt figure's definition, and the active haunt and its phase. A source contributes **modifiers** (a question, an optional filter on the subject, a change to the answer, and its rule reference), **triggers** and **conditions**. Only the sources that are live in the state take part. A card counts only while someone holds it or it is ongoing, or, when its text acts from where it lies (an open Music Box), while it lies in a room. A room counts only while it is on the board and relevant to the subject.

Sources apply in four layers, in the order the rulebook gives for conflicts. A card beats the rulebook (p. 12), and a haunt beats everything (p. 17):

1. **Rulebook**: the base answer, including the side-dependent base rules such as the traitor's new powers and how monsters work.
2. **Rooms**: tile text and special rooms.
3. **Cards and statuses**: items, omens, ongoing events, and statuses that cards apply.
4. **Haunt**: the active haunt, its phase, its figure definitions, and the statuses it applies.

Each layer receives the answer the layers below it produced, so the haunt sees the finished answer and can change anything.

### When several modifiers apply at once

Each answer type composes in a fixed way. Composing like this is what makes stacking predictable:

| Answer type | Composition |
|---|---|
| Number (dice, movement, damage, allowance) | base, then **set** (the highest layer's set wins), then **add** (all deltas summed), then **fewer** (a cut "to a minimum of N", which stops at N and never lifts an answer already at or below it), then **multiply**, then **bound** (the tightest cap), then **fix** (a final fixed value, such as 91's result of 5; the highest layer wins) |
| Permission (canAttack, canCarry, canEnterOrLeave…) | deny or allow with reasons. Within a layer, a deny beats an allow. A higher layer may explicitly overrule a lower one (the traitor ignores harmful room text) |
| Set (targets, traits, connections) | add and remove in layer order |
| Structured result (combatOutcome, lethalOutcome, movementPolicy, damageRouting) | each modifier transforms the previous result, in layer order |

Within a layer, modifiers run in a stable order (by source kind, then id). Sums and denials don't depend on that order. Two modifiers in the same layer that both **replace** a structured result, or both **set** or **fix** a number to different values, are a conflict the rulebook doesn't settle, so the engine **throws**, naming both rule references. That surfaces a real rules question (to be settled and recorded in `content/`) instead of quietly letting whichever ran last win.

### Triggers and conditions

A trigger is an event type, an optional filter and an effect. A condition is a predicate and an effect. Conditions fire when they change from false to true, and a once-only condition records that it fired in the rule memory, which keeps the check deterministic and replayable. An effect is either kit data (damage, gain, place a token, step a track, spawn, move, change side, raise a decision, declare winners) or a named local step. Effects push steps onto the step stack, so an effect may pause for a decision and resume.

## 6. The haunt format

A haunt is one typed definition in `data/haunts/`, built from kit parts. The engine reads `state.haunt` to find the active definition and never branches on which haunt it is.

**A definition's sections:**
- **Identity:** number, name, set, and a reference to its content file.
- **Sides:** how sides are assigned (from the chart's traitor rule, a hidden traitor, several traitors, or none), and which half of the haunt text each side may read.
- **Setup:** an ordered list of kit setup parts, per side (find a named room, fill the house, placement rules, spawn figures, set aside tokens, start tracks, set secrets).
- **Figures:** monster and ally definitions (traits or a stats table, a movement policy, an attack rule, a defeat response, flags).
- **Tracks and counters**, with their count expressions.
- **Statuses** the haunt applies.
- **Actions:** objective actions (who, where, cost, roll, limit, effect on success and failure).
- **Modifiers**, **triggers** and **conditions**, as in section 5. Win conditions are conditions that declare winners.
- **Knowledge:** the secret values and who sees them.
- **Phases** (optional): the rules active in each phase, and the condition that switches between them.
- **Local functions:** named steps or modifier functions for what the kit doesn't cover, kept in the haunt's own file.
- **Rulings:** references to the content notes the definition depends on, each with its settled answer.

**Haunt 13, Perchance to Dream (pure data).**
- *Sides:* the chart's traitor rule.
- *Setup:*
  - The traitor's explorer gets an "asleep" status that blocks moving and acting, and drops its items.
  - Companions are set aside, with a clamp above the skull.
  - Nightmares are spawned in the dreamer's room, one per player.
  - Escape rooms are counted with a count expression over a room filter (the window and outside rooms the haunt lists), fixed at haunt start. A find-named-room step tops the count up to the number of players.
  - The count becomes a secret value known to the traitor's seat.
- *Figures:* Nightmare, with Speed 5, Might 4 and Sanity 4, moved by the traitor under the default monster rules.
- *Actions:*
  - The Nightmares' escape: in an unmarked escape room, at a cost of 1 movement. It removes the Nightmare, places an escape token and steps the escape counter.
  - The heroes' wake: in the dreamer's room while a hero there holds the Holy Symbol. It is a Sanity or Might roll of 5+, a task roll once per turn, and steps a counter with the matching token.
- *Modifiers:*
  - damageRouting: a Nightmare's Might attack deals mental damage.
  - combatOutcome: a Nightmare that loses to an attacking hero is killed, not stunned.
  - itemEffect: the Smelling Salts can't wake the dreamer.
- *Triggers:* a Nightmare killed or escaped raises a traitor decision to unleash another, within the token supply.
- *Conditions:* the traitor wins when escapes reach the secret value (which reveals it); the heroes win when the wake counter reaches the number of players.

**Haunt 22, The Abyss Gazes Back (data plus small functions).** This is one of the harder base haunts: a mutable board, a timer, obligations on other players' turns, and two unresolved notes.
- *Setup:*
  - A find-named-room part with a filter (an unoccupied basement room with an omen or event symbol), chosen by the traitor, or else drawn until a legal basement room appears.
  - A time track at 0.
  - The exorcism counter.
- *Spreading area, "Abyss":*
  - Its seed is the start room. It grows by adjacency through a shared side, doors not needed, which is the board's adjacency query rather than its connection query.
  - It moves to the next floor up once a floor is gone, starting from an unoccupied room with an unexplored door.
  - The collapsing player chooses where it grows. Collapsing turns a tile face down.
  - The Entrance Hall, Foyer and Grand Staircase are separate rooms.
- *Triggers:*
  - At the end of the traitor's turn, collapse a room (the start room first), then step the time track. This runs even after the traitor's death, because the seat keeps its turns.
  - At the end of each living hero's turn, from track value 2 on, the hero owes collapses at the rate the track keys from a roll table (1, then 2, 3 and 4 dice). This raises a chain of "choose the next room" decisions for that hero.
  - Room engulfed: each occupant makes a Speed 4+ roll, then chooses among adjacent, connected, non-collapsing rooms, or dies with the cause "Abyss".
  - Forced arrival in a collapsed room kills.
- *Actions:*
  - The exorcism comes in two variants (Sanity in the listed rooms or with the listed items; Knowledge likewise), once per hero per turn and once per source.
  - Sacrificing the Holy Symbol replaces a collapse obligation.
- *Modifiers:* cardDraw lets the traitor search for Secret Stairs or the Secret Passage while in the basement.
- *Local functions:*
  - "Suppress collapse until the end of this hero's next turn": a flag that expires at a turn boundary.
  - The floor fallback for the spreading area, if the kit's part doesn't already cover it.
- *Conditions:* the traitor wins when all heroes are dead. The heroes' counter reaching the number of players sets a "collapse stopped" flag and wins.
- *Rulings needed before it is built:* whether the traitor also collapses at the per-turn rate, and what "legal basement room" means. Both are unresolved in its file.

**The "players decide" decision.** This is a decision kind whose choices are all the possible answers to a question software can't check, such as artwork, speech, free text or judgement. All of its choices are legal, so the invariant holds. The answer is recorded as an event that names the rule and the seat that answered. It is addressed to a named seat: the claimant, or the other side when it is a confirmation. It is needed by 11 haunts, 2 of them base (20 and 39, which can offer every legal room until it exists). It belongs with Widow's Walk.

**Speech.** Players are assumed to be on a voice call outside the app, so there is no in-app chat. Where speaking is itself a game action, it becomes a decision: haunt 78's hero naming the Fiend, haunt 92's secret notes. Rules on how players talk (haunt 69's Wild West voice, haunt 91's whisper) stay on the call, in good faith, with "players decide" where one grants a bonus. Haunt 63 silences the heroes, who would gesture at a real table, so it needs an in-app way to signal without words. These are all Widow's Walk haunts, and how they look is a UI question for when they are built.

**Custom haunts** use the same definition. What makes them custom is the size of their local functions. Where a one-off needs engine support (a clock event for 99, grid cells for 93, doorway spaces for 35), it gets a narrow, general hook (a new event type, a board capability) rather than a branch on the haunt.

## 7. Content pipeline

**Recommendation: hand-written typed data, kept in agreement with `content/` by tests.** Parsing the markdown into data isn't workable. The rules are restated prose, and turning "If you end your turn here, gain 1 Might" into a trigger with an effect is a translation only a person (or Claude, with review) can make. The prose stays the human-readable source of truth, and the TypeScript is its executable form.

How they are kept in agreement:
- **Facts are parsed, in tests only.** The regular fields in `content/` are compared field by field with the typed data:
  - doors, floors, windows, outside and symbols in `rooms.md`;
  - trait tracks and starting values in `characters.md`;
  - deck, set and label in `cards/`;
  - token counts in `tokens.md`;
  - the chart and traitor tables.

  A small test-side reader handles the bullet-and-table format these files already use.
- **Coverage both ways.** Every heading in `content/` that names a room, card, character or haunt has a typed entry, and every typed entry points back at its heading. Additions and renames fail a test until both sides match.
- **Rulings are linked.** A typed rule that depends on a `> Note:` names that note. A test fails when a referenced note's resolution is still marked unresolved, which enforces the rule that unresolved notes are settled before the rule they affect is implemented. Where research finds no answer, the ruling is made for this adaptation and recorded with the authority **project** (the project's `CLAUDE.md` says how).
- **Effects are tested from the rules.** Each card's, room's and haunt's behaviour gets unit tests written from its content entry, not from its own implementation.

### Behaviours

Every card, room and token with rules text has a **behaviour**, kept with the content (`data/behaviours/`) and keyed by its id. A behaviour can:
- run steps when its card is drawn, gained or lost;
- offer actions: on its holder's turn for a card, or to a figure in its room for a room or token; a card may instead offer one to anyone with its holder, which they take without using the card (freeing the holder from the Webs), and an action that is the way out of what stops a figure is offered even while it can't act;
- react to events (a turn ending in this room, this card being used);
- modify the answers to questions (section 5), which is how a passive card such as one that adds a die or stops movement works;
- offer options around a roll its holder makes: something to add, extra dice or a number to use instead before the dice, or a reroll after. Only on its holder's own turn, unless its text allows it on another's (a defence roll's Angel Feather): the roll's decision is then put to the holder, whoever's turn it is;
- have a say when its holder attacks with it (the Sacrificial Dagger's roll first), which may call the attack off;
- have a say before a figure leaves its room (a room's roll to leave), which may keep it there;
- let its holder take damage of one kind as the other before it is split;
- for a room, make it a barrier room, split in two with one side by each door and crossed by a trait roll, or say which of its printed symbols a discoverer draws for, where its text gives some another meaning (the Vault's items are its contents);
- register steps of its own, named under its id.

Everything a behaviour does to the game is a step built from the engine's effects (`engine/effects.ts`): gaining and losing traits, damage the player splits, a roll feeding an outcome table, drawing and keeping cards, placing tokens (in a room, on a wall between two rooms, on one side of a barrier room, one of a linked pair, or one that follows the figure holding it), moving a figure without spending movement or 1 space closer to a room (`engine/movement.ts`), and putting a room tile in the house or moving one (`engine/tiles.ts`). Every route, whether a player's move, a measured distance or a companion's trip, asks the connections question, so a card or a haunt that adds or blocks a connection changes them all; adjacency and line of sight are questions too. Every tile, whether discovered through a doorway, put in the house by a card or moved, goes by the one placement rule exploring uses, and figures, tokens and items in a moved room go with it. So an effect that pauses for a decision halfway through is stored as data like any other work. A rule that changes a single roll it asks for (fewer dice in one room) carries that change on the roll itself, since the card behind it may no longer be in play when the dice are rolled; an event card in play remembers who drew it, for rules that favour rolls for events their holder drew. When a card needs something the effects and the questions don't offer, the engine gains a general effect or question for it; the engine never branches on a card's id.

Each behaviour's tests come from its `content/` entry, played through a scenario (`testing.ts`): stack the decks and the room stack, then pick the offered choices by their labels.

## 8. Server

### Route contract

`POST /api/betrayal` takes lobby operations (create, join, take a seat, choose a character, set a controller, start) and game actions. A game action carries only the game id, the seat, the decision id it answers and the choice. **The client never sends or receives a version as a precondition.** Every operation goes through one commit routine:

1. Read the row (state and version) and migrate the state if it's an older format.
2. If the action's decision id isn't the pending one, look in the answers ledger. If the same seat already answered that decision with the same choice, reply **accepted** with the current state, since this is a retry of an action that already landed. Otherwise reply **rejected** with the current state. A shared decision that is still open gets the same check per seat: a seat that has already answered it is **accepted** when it repeats its answer and **rejected** when it sends a different one, so a retry never counts as a second answer.
3. Apply the action. If the engine refuses it, reply **rejected** with the current state.
4. Run the forced steps through to the next decision, all in this one write.
5. Write the new state and that write's events in one database call that only succeeds if the version is unchanged. If another write got there first, go back to 1. The retry runs in a loop with a fixed number of attempts, and running out of attempts is an error that fails loudly. Re-reading is always correct, because the action names its decision: on the new state it either still applies or is now rejected.
6. If the new pending decision belongs to a non-human seat, schedule a drive (below).
7. Reply **accepted**, with the state and its version number.

The client hears two answers, "accepted, here is the state" and "rejected, here is the state", and both carry a state it can use at once. This avoids Monopoly's two worst failures: its client handled version conflicts, and the route sometimes returned a bare conflict with no state, which locked games up.

### Driving non-human seats on Vercel

Not needed for the first milestones. The design keeps it cheap:

- **The trigger.** When a commit leaves a non-human seat to decide, the route uses Next's `after()` to send a request to `/api/betrayal/drive` once its own response has gone out. The drive runs as its own request with its own time limit, so a slow AI call never sits inside a player's request.
- **Drive is idempotent.** It reads the row. If the pending decision isn't for a non-human seat, it stops. Otherwise it claims the decision by inserting a (game, decision id) row into a claims table; the unique key makes a second claim fail, and a failed claim means someone else is on it. The winner computes the answer (a bot's pure policy, or one AI call given the seat's view, its labelled choices and the `content/` rules) and submits it through the same commit routine, under the decision id it claimed. An illegal or missing answer gets the legal fallback, and the log says so.
- **The nudge.** Any client may call drive. A client does so when an event shows it a non-human seat's decision with no answer: on load, on resubscribe, or when a tab wakes. Duplicate calls are harmless, because claiming happens once per decision and the commit matches decision ids.
- **One AI call per decision**, guaranteed by the claim. API keys stay on the server.
- **A deadline on every drive.** A drive's function can die after claiming (a time limit hit while an AI API hangs, a deploy, a platform error), leaving the claim in place and the decision unanswered, and nothing reports that as an event. So a drive has a deadline: once it passes, a nudge may claim the decision again. How long the deadline is, and what happens after it, wait for the bots milestone (section 14).

Monopoly's clients acted as the game clock and drove the bots, with guard flags that stalled the game whenever an expected update never arrived. Here the server drives, and every client's only power is an idempotent nudge.

### The star-haunt record

The star haunt, Widow's Walk's finale, unlocks only once the explorers have played its four seasonal haunts (86, 57, 93 and 75), which the book tracks on a chart that fills up over many games. The record is that chart: a table of completions plus the game that earned each one. What it is keyed by waits for Widow's Walk (section 14); the book's chart has a row per character. A game that ends in 57, 75, 86 or 93 includes the completions in its final commit, written in the same transaction. At game creation the route copies the part of the record that game needs into the state. That keeps the engine pure (the star gate reads state, never the database) and the game replayable.

### Tables

`supabase/betrayal.sql`, in the repo's flat, idempotent style. RLS allows `select` only, and all writes go through the service role:

| Table / function | Columns and purpose |
|---|---|
| `betrayal_games` | id, state (jsonb), version, status and a small summary (seats, characters, haunt) for the game list, updated time. In the Realtime publication |
| `betrayal_events` | game id, version, events (jsonb), keyed by both. The readable log, and the source for filling gaps. Not broadcast |
| `betrayal_drive_claims` | game id, decision id (the unique key), claimed time. Insert-only |
| `betrayal_star_record` | a completion (who, haunt) and the game id that earned it. Added with Widow's Walk |
| `betrayal_commit` (function) | Writes the state, version and summary only if the version is unchanged, inserts the events, and upserts any record completions, all in one transaction. Executable by the service role only |

Creating a game is an insert. A duplicate id means "load the existing one", as in Monopoly, where that proved sound.

## 9. Client sync

**One pure reducer** holds the confirmed state (the last state and version the server sent) and the queue of this client's own unconfirmed actions. It handles four inputs:

| Input | Effect |
|---|---|
| Server state (from a load, Realtime, or a route response) | Kept only if its version is higher than the confirmed one; duplicates and stale deliveries are ignored. Then the queue is pruned against it |
| Local action | Appended to the queue, but only if it answers a decision addressed to this client's seat in the displayed state |
| Accepted (with state) | The action leaves the queue, and the state goes through the "server state" rule |
| Rejected (with state) | The action **and everything queued after it** leave the queue, and the state goes through the "server state" rule |

**Pruning.** The queue is replayed over the new confirmed state:
- An action whose decision appears in the answers ledger is already included, so it is dropped.
- The first action that fails to apply is dropped, together with the rest of the queue behind it.

**What the screen shows** is derived from those two things and never stored: the confirmed state with the queue applied in order, through the same engine. Applying an action locally computes its real result, rolls included (section 4).

**Sending** is in queue order, with one action in flight at a time. Which action is in flight is recorded inside the reducer. The store contains no module-level flags at all. Monopoly kept hidden module-level state, which caused a bug that appeared only on phones, where updates arrived in a different order.

**Nothing waits for a particular delivery.** A response and its Realtime echo can arrive in either order, or one can be lost. Both go through the "keep only higher versions" rule, so whichever arrives first wins and the other is ignored. Monopoly had a hang caused by waiting on an echo.

**Reloading.** The store fetches the row:
- whenever the subscription reports it has (re)connected;
- on `visibilitychange` (to visible), `online` and `pageshow`.

Realtime doesn't resend changes missed while a connection was down, and a phone tab that wakes up has a dead socket. The fetched row goes in as an ordinary server state.

**Connection loss.** Players are assumed to have a stable connection, so there is no offline mode. Two guarantees hold instead. A dropped connection never breaks the game on the server: the row only ever holds states the commit routine wrote, and a lost request is either fully committed or not at all. And a client can always recover by reloading, because a reload rebuilds everything from the row. A queued action the server later rejects drops away with a plain message, never a silent revert.

**Events drive animation, without blocking.** Animation is a presentation layer on top of the state, never a third state that sync has to manage, which is how Monopoly stacked it:
- Local applies supply events immediately.
- New server versions supply their `lastEvents`.
- The animator plays events it hasn't played yet, identified by their stable ids, so an echo of a local action doesn't play twice.
- If versions were skipped, it shows the new state as it is, and the log fetches the missing events from the events table.
- When the animator falls behind, it skips ahead.

Input is never locked by sync. The UI may wait to show a decision's prompt until the events that led to it have played, so the game stays readable, but that is a presentation choice made locally.

**Local UI state stays local.** Hovering, planning a path, browsing cards and selecting before confirming never reach the server. Monopoly sent its staging edits to the server. Here only committing a decision sends anything, and a planned path is sent as the chain of single-step actions described in section 3.

### What became of Monopoly's problems

| Monopoly's problem | Betrayal's answer |
|---|---|
| The client handled version conflicts | Actions name decisions, and the route retries its own lost writes |
| Clients were the clock and the bot proxy | The server drives; clients can only nudge, idempotently |
| Hidden module-level flags | One pure reducer, and the store holds no flags |
| Animation as a third stacked state | Events animate on top of the displayed state |
| Each update arrived twice, in no fixed order | Only higher versions are kept, and nothing waits on an echo |
| Relative actions changed meaning on replay | Actions are absolute |
| Missed updates after a resubscribe or tab wake | The row is reloaded on (re)subscribe, visibility, `online` and `pageshow` |
| Who acts was worked out by the client, phase by phase | The engine's pending decision names the seat |
| Animation was inferred by diffing snapshots | The engine emits events |
| The full log was broadcast every write | The log lives in its own table, and the row has a size budget |
| No state-format versioning | A format number and migrations from the first commit |

## 10. Sides, seats and controllers

- **A seat is a player.** A seat holds a side, roles and a controller, and takes turns. Figures are separate, so a seat may own no figures, one, two bodies, or monsters, and a turn belongs to a seat. Who decides stays a seat (decisions, ready waits, turns, sides, results); what the rules act on is a figure (every question's subject, effect's target and event's subject, a card's holder, a token that follows someone). An event about a turn names its seat, and the seat's explorer where it has one.
- **Who controls a figure is a question.** The controller question's base answer is the figure's owner, and a status changes it: possession, control taken with the Ring, a hero carried by a monster. Every choice the rules give a figure goes to its controller. Which side a figure is on is a question as well, added with sides.
- **"Your explorer" is a lookup** from a seat to the explorer figure it owns, used only where a rule means exactly that, such as the turn's own moves before the haunt. A seat may own none, so every caller says what that means for its rule, and fails loudly where the rules make it impossible.

- **Sides are per seat and can change.** The traitor is a role a seat holds, not a seat number. A side may be secret, with its knowledge recorded per seat (including a side hidden from its own holder).
- **Derived values are computed, never stored:** who is an opponent (the isOpponent question), which half of the haunt text a seat may read, and which win conditions apply to whom. Because they are derived, a side change takes effect everywhere at once.
- **Turn order is recomputed at every turn boundary.** It comes from the current turn, the sides, the turnOrder question and the queue of inserted turns, rather than from a list saved at the haunt's start. A conversion in the middle of a round takes effect at the next boundary with no extra code.
- **Results belong to seats.** A game result is a set of winning seats, and a side win is the common case of that.
- **Seats change hands freely.** Seats are tied to a browser's profile id, so any player in a game may hand a seat to another profile, from the game list or the seat menu, for example after changing device. The good-faith model keeps this from being abused.
- **Controllers** are human, bot or AI, and all of them answer asynchronously through the same route. The engine never calls a controller (section 8).
- **`viewFor(state, seat)`** returns what a seat may see. It hides:
  - the order of the stacks and decks, from everyone;
  - other seats' secret sides and secret values, unless the seat knows them;
  - the other side's half of the haunt rules;
  - tokens the seat hasn't seen;
  - other seats' answers to a decision that is still open.

  It shows the pending decision in full only to its addressees. Everyone else sees whom the game is waiting on and what kind of decision it is. The UI, bots and AI all receive this view. A spectator view, with no seat, shows only public information.

  The good-faith model trusts people not to look past what the UI shows, but a view may also go to a reader that isn't trusted: an AI agent a player connects from outside (`ai-players.md`). So `viewFor` is the boundary itself, not a hint the UI applies: what it leaves out must be absent from its result, never present and merely unrendered.

## 11. Testing

| Kind | What it proves |
|---|---|
| Engine unit tests | Each rule, card, room and haunt behaves as its content entry says. Tests use seeded games and a scenario builder (place figures, set traits, deal cards, start a haunt), never the real generator's luck |
| Choices match legality | Over many seeded games played by a random-legal driver, every listed choice applies, and every sampled action that applies is listed. This is the invariant from section 3 |
| Determinism | Replaying a game's seed and actions reproduces its state exactly. Migrations upgrade saved fixtures |
| Headless simulation | Full games through the same driver the server uses, with a random-legal policy on every seat. Checks that every game terminates within the step bound, the payload stays inside its budget, and no conflict between rule sources throws. This replaces the haunt-by-haunt playtesting a person would otherwise do |
| Content agreement | The fact, coverage and rulings tests from section 7 |
| Server | The commit routine against an in-memory database: decision-id checks, idempotent retries, a lost write retried, the retry bound, and drive claims |
| Sync reducer | Deliveries reordered, duplicated and dropped; a response arriving before or after its echo; a rejection in the middle of the queue; a path chain interrupted by a forced roll; a retried answer to a shared decision that is still open |
| Two-client e2e | Two browsers on the dev server against the real Supabase project, as Frogmino's lobby e2e already does, using game ids with an e2e prefix that teardown deletes. One client acts and the other sees it. Covers rejoin after reload, a rejected stale action, and a tab waking up |

Bug fixes start with a regression test that fails first, a habit Monopoly showed is worth keeping.

## 12. Presentation and input

This is brief, because the UI gets its own design.
- The presentation renders `viewFor` and `describe` and nothing else, so it can be React components, a canvas or three.js without touching the engine.
- Every input method (touch, mouse, keyboard, an Xbox controller through `gamepad`) picks among the pending decision's choices. Adding an input method never touches game logic.
- Every automatic step appears in a readable log, in plain language, with its rule. Each log line can show "why?": the rule's source and, where a ruling applies, the ruling and its authority.
- On phones, the board takes the screen and panels pull in when needed. On desktop, extra width goes to always-visible panels (character card, held cards, log), not to a stretched board.
- The look follows Betrayal's own gothic style, from tokens scoped to the project.

## 13. Build order

Each milestone ends with something playable and tested.

1. **Foundations.** The model types, the state format with migrations, the randomness, the board with its queries (connection, adjacency, line of sight, distance by route), and the step loop. Typed data for rooms, characters, cards, tokens and the chart, with the agreement tests. Before this, settle the unresolved notes that exploration touches (for example, how the Collapsed Room's basement tile is drawn, and whether the Mystic Elevator may leave a floor if leaving would seal it off).
2. **Exploration, no haunt.** Setup, turns, moving, discovering, room text, every card, traits, item rules and the haunt roll. When a roll succeeds, the game shows the haunt number and stops. Played in one browser on a plain debug UI.
3. **One haunt end to end.** The questions and layers, starting with combat and death; sides and turn order; the kit parts haunt 13 needs; conditions and results; `viewFor`. A dev-only "start haunt N" makes haunt work quick to reach. After the base game, the same path becomes the rulebook's optional "select the haunt" rule (p. 16), a per-game setting. Haunt 13 played start to finish in one browser.
4. **Online.** The SQL, the commit routine and route, the sync reducer and store, the shared game-list lobby extracted from Monopoly, seats, and the two-client e2e. The UI design starts here, in parallel.
5. **The remaining base haunts,** in batches by the kit parts they share, in the order the survey ranks them. Each batch first settles its unresolved notes and adds its kit parts. Haunt 35 comes last. Then add the real UI.

**The base game, working end to end with every seat human, is the end of milestone 5.** After it:

6. **Bots.** Pure policies on views; server drive, claims and the nudge; a conformance test that every bot answers legally across simulated games.
7. **AI players.** One call per decision, with labelled choices and the rules specs as context, and the fallback.
8. **Widow's Walk,** in this order:
   - its rule-sheet notes researched and settled;
   - the engine capabilities: tile move, rotate and build, with a connectivity check; tokens hidden from their holder; role transfer; "players decide"; the persistent record;
   - its haunts in kit-part batches;
   - the custom haunts and the star haunt last.

## 14. Deferred questions

Each waits for the milestone that needs it. Nothing before that milestone depends on the answer.

1. **What the star-haunt record is keyed by** (Widow's Walk). The book's chart has a row per character, and "every explorer in your group" (the star haunt's season gate) has to be read against it. The record stays out of the engine either way: the route copies what a game needs into its state at creation.
2. **Which model plays an AI seat, and how it reaches the game** (AI players). A seat's job is to pick one of the pending decision's labelled legal choices from its view, which suits a schema-constrained "System One" model such as TypeSafe's Jev. Planning and bluffing over a whole haunt may need more reasoning than such a model offers. Whether the AI gets the game through an MCP server (tools to read its view, look up rules in `content/` and submit a choice) rather than one prompt per decision is part of the same question. `ai-players.md` records a proof of concept with local models and the options it leaves: where the model runs, players bringing their own agent over MCP, progress while an AI thinks, and a stated plan carried between decisions.
3. **A drive's deadline** (bots). How many seconds a drive has to answer, and what happens once the deadline passes: whether the decision is claimed again, a fallback answers, or a human takes the seat.
