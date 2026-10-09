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
| Seats | One per player, in table order: profile id and name, controller (human, bot, AI), side (none before the haunt; heroes, traitor or neutral, where a neutral seat is no one's opponent), roles (the traitor is a role, not a seat number), and who knows the side and roles: everyone, or a named set of seats, which may leave out the seat itself. The revealer is the haunt's, not a role. A seat's explorer is the explorer figure it owns |
| Figures | Every piece the rules act on, in one collection keyed by id: explorers, monsters, allies and attackable objects. An explorer's id is its character's id, which is unique in a game and survives its seat changing hands; a haunt's figures are numbered from their definition, each with a number never used before in the game (the rule memory counts them), so a figure unleashed after another left play never takes its id. Each has a kind, its definition, the seat that owns it (or none), its place (room, and side in barrier rooms, or off the board), its traits (an explorer's clip positions on its tracks; a monster's values), its statuses (each an id, the rule that applied it, and its own data, such as the seat a controlled figure answers to), whether it's stunned and alive, what it holds and its links to other figures. Who controls a figure and which side it is on are questions, not fields (section 10). What a figure is comes from one catalogue of figure definitions, looked up the same way for every kind: the explorers register from the characters, and a haunt's figures register their own. A definition gives the figure's name, its token, whether it may discover rooms and hold cards (the base answers of canDiscover and canCarry: explorers may, monsters can't, p. 19), and where its traits come from (clips on printed tracks, or fixed values); a figure's value in a trait is itself a question, whose base answer reads that source, so a monster whose stats follow a track or the traitor's traits is a modifier, not a new kind of figure. "You" in card and room text means whoever is acting or affected, explorer or monster, so a rule never asks which kind it has. An attack's target is a figure, a room or a token, since haunts 84 and 86 attack rooms |
| Board | Placed tiles (tile id, floor, grid position, rotation, face down or removed), tokens on rooms and on edges, the room stack and discard pile in order |
| Cards | Each deck's draw order and discard pile, what each figure holds, ongoing events, and the counters and flags kept on cards in play (a worn Mask, an open Music Box), each either the holder's, cleared when the card leaves them, or the card's own, cleared when it leaves play. Cards set aside: a dead explorer's companion waiting in the room where they died, or a card out of the game |
| Tokens | Placed tokens by id. Supply is unlimited unless a haunt caps a kind, because its text makes running out a rule; the physical counts in `tokens.md` are what those caps cite |
| Tracks | Named tracks and counters, with their values |
| Haunt | Haunt number, revealer, and the omen and room that revealed it; its secrets (each an id, a value and the seats that know it), and its counters (tracks and counted tokens), by id. Decision parameters and events never carry a secret's value, only its id, so `viewFor` has one place to hide it |
| Turn | The current seat and turn kind (explorer, traitor or monster turn), for an inserted turn the turn in the order it came after, the figures that act on it (fixed as it starts), the one acting now and those done, and the turn's ledger: movement spent, the attack made and the rolls attempted, counted per figure, since a seat may move several and each may attempt a roll once a turn; the movement rolled for each type of monster; the monsters missing this monster turn; uses that last over a traitor's turn and the monster turn after it (the Mystic Elevator); items used, actions taken, and the rooms entered so far, in order |
| Inserted turns | Turns a rule has put into the order, taken first, in order, at the next turn boundaries |
| Rule memory | What later rules read: deaths with killer and cause, damage sources, once-only flags, the conditions that have fired, the monster traits every seat knows (a type's trait, once rolled), and how many of each haunt figure have come into play |
| Work | The step stack: the engine's unfinished work, as data (section 3) |
| Decision | The pending decision's id, its addressees, the figure it is about (whose controller it was put to, or the turn's acting figure; none for one put to seats as players), the answers already given by addressees of a shared decision, and its question (a kind with parameters). Its choices are derived from the state, not stored. Or, instead of a decision, a ready wait: the seats still to confirm (section 3) |
| Answers | The most recent answered decisions (decision id, seat, choice), for idempotent retries (section 8) |
| Last events | The events from the latest write only, for animation |
| Result | Once the game ends: the winning seats, and the rule whose goal was met |

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
2. If a raised decision has exactly one legal choice, take it, recorded as a forced step with the rule that forced it, unless its kind always asks. Otherwise pause on it. A ready wait always pauses.
3. After every step, re-check the conditions (section 5). Any that turned true push their effects.

**A player's act always asks.** Auto-taking removes meaningless steps (a roll with nothing to add, a room that fits one way, damage that can land one way), never a player's act. A decision kind may declare that it always asks, and then a single legal choice still pauses for its seat, so the player sees it happen rather than losing track of the game. The turn's own decision always asks while a figure can act on it: when ending the turn is all that's left, the game waits for the player to end it. A turn with no one able to act (a dead or sleeping explorer's, a monster turn with no monster ready) has no act to take, and passes as a forced step. Answering a trade offered to you always asks too. Bookkeeping decisions (rotation, damage split and kind, the roll options, choose-one, room placement, how an attack is made) stay forced when they leave one choice.

Monopoly gets credit here: separating real choices (actions) from obvious ones (the engine's own steps) worked well, and this loop does the same thing. The loop has a fixed step bound and throws if it exceeds it. An endless loop is a bug, and it must fail loudly rather than be cut short silently.

**The step stack is why everything stays serializable.** An effect that needs a decision halfway through (split this damage, choose the next room to collapse, roll to escape) can't hold its place in a closure, because the state is JSON stored in a row. So unfinished work is a stack of typed steps, each a kind plus parameters, and every step kind, including a haunt's small local functions, is registered by name. The game can pause anywhere and resume on another machine.

**Events name their rule.** Every event carries a rule reference: the rulebook (with its page), a room, a card, a status, or a haunt section. It also carries the decision whose answer produced it, the seat that answered, and its index within that write, which together give it a stable id, unique across the game even when several seats answer one shared decision. A pure `describe` turns events and choices into plain language ("You entered the Junk Room: roll Might to leave. You rolled 3, success"). It lives with the engine, not the UI, because AI players need the same text. Each line names the room, card or token rule behind it. A behaviour may word the events its own rule causes where the general wording would say too little, and bookkeeping that another event of the write already tells (a drawn card's gain) has no line of its own. Describing an event type it doesn't know fails loudly.

**Path moves need no special action.** A player plans a path locally, and the client submits it as a chain of single-step moves. Each step names the decision id the engine will raise next, and the client can compute that id because the engine is deterministic. If something interrupts the path (a card draw, a room roll, a monster reaction), the next step's decision id no longer matches, so that step and the rest of the chain drop away. That is exactly the rule. Section 9 covers this.

## 4. Randomness

Every roll and shuffle draws from a generator seeded from the game seed, the id of the decision being answered, and a counter within that write. Setup uses a reserved setup key. Rolls made during forced steps belong to the write that caused them, so they use the id of the decision answered in that write.

Consequences:
- Applying your own action locally computes the real roll, and the server computes the same one. Another player's action can't change it, because the inputs are only the seed and your decision's id. A roll on screen is never revised.
- Only actions that answer your own pending decision are applied locally (section 9), so a prediction is never based on someone else's unconfirmed move.
- A client can work out dice from the seed. Under the good-faith model this is accepted, as `CLAUDE.md` says. A seat's view leaves the seed out, for the readers that aren't trusted (section 10).
- A game replays from its seed and its actions, which gives tests, simulation and bug reports for free.

## 5. The rules interface

This is where the risk is. The survey separates three mechanisms, and the engine keeps them separate:

| Mechanism | What it is | How a rule source uses it |
|---|---|---|
| **Question** | Something the engine asks while it works out choices or results, such as "may this figure attack that one?" | It modifies the answer |
| **Event** | Something that happened: a turn ended, a room was entered, a figure died | A trigger reacts to it with effects |
| **Condition** | A predicate over the state: "both are in the Chapel", "escapes ≥ the secret number" | It fires when it turns true, including every win condition |

### Questions

There is a fixed, named set of questions: the 33 override points of the survey, among them combatOutcome, canAttack, lethalOutcome, dicePool and the others in its table, plus controller, the seat that decides for a figure, traitValue, a figure's value in a trait, monsterRules, whether the rulebook's "How Monsters Work" applies to a figure (the one place a figure's kind decides a rule), bindingText, whether a rule's harmful text binds a figure, may be ignored, or is ignored, and supply, how many of a haunt's figures may be in play. The set is closed and typed. A question about a piece takes a figure as its subject, never a seat. Each question declares:
- its **subject** type (for example, an attacker, a target and a trait);
- its **answer** type;
- its **base answer**, written from `rules.md`.

Every question receives the whole state plus its subject, never a narrow argument list, because the survey shows answers read sides, held cards, tracks, history and the source of damage. Choice enumeration and `apply` ask the same questions, which keeps legality single-sourced.

One attack shows how the questions chain:
1. canAttack (may this figure attack that target at all), isOpponent and the reach of the ways to attack build the target list.
2. attackModes gives the ways to attack: the trait both sides roll, the card the attacker uses (a weapon, the Ring), and how far it reaches (the attacker's own room, or a line of sight for the Revolver). A trait either side lacks is no way to attack (p. 13).
3. dicePool sizes each side's roll, then the dice are rolled.
4. rollResult adjusts the totals.
5. combatOutcome turns the comparison into what the loser suffers: damage of a kind (physical or mental) and its points, a stun, or a kill, each with the rule that says so, and whether the attacker may steal instead. Grab, push and convert join it when a haunt needs them. Its base answer is the rulebook's: the difference as damage, of the kind the trait gives; a stun for a figure that takes no damage on its traits (a monster, p. 18); nothing for an attacker beaten from another room or by a stunned monster. Because the outcome carries the damage's kind, a haunt changes it there: haunt 13's Nightmares deal mental damage whichever side they are on, with no separate routing question. A figure steals only if it can hold cards.
6. damageAmount sizes any damage, and the loser's controller splits it.
7. traitChange moves the clips.
8. lethalOutcome decides what a skull means, asked per trait, with the cause.

Every step emits events that name the rule behind it.

**The turn's attack.** From the haunt on, the figure whose turn it is may make one attack of its own (p. 13): a turn choice per legal target, an opponent in reach of some way it can attack them. Declaring it uses up that figure's attack in the turn's ledger, whatever then happens (a Sacrificial Dagger that twists in the hand), and the Dynamite's throw uses it instead. Attacks a card makes (the Bloody Vision's, the Bite's) are outside that allowance, and their own rule puts the target in reach. Which held weapon to use is a decision of its own, offered whenever there is more than one way. A stunned monster is a target only when beating it would do more than stun it again (ruling stunned-benefit), which the engine reads off the combat outcome of a win. A figure that doesn't take damage is beaten as in combat by any rule that beats it outside one, as the Dynamite's official ruling has it. A stun marks the figure, which then slows no one; it misses one monster turn and recovers at that turn's end. A kill is a death like any other: the figure leaves play, its death goes into the rule memory with the killer, and the death's event names the rule behind the kill, for a haunt's triggers to react to.

**Death.** Clips stop at a track's lowest value; going past it asks lethalOutcome, per trait, with the rule whose effect took it there, and before the haunt the base answer is to stop there (p. 5). A death is one step: the figure is no longer alive, its death goes into the rule memory with the trait, the cause and the killer (the figure that dealt the damage, which damage carries from an attack's winner), its items and item-like omens drop onto the room's pile, its companions wait in the room for the next explorer to come in, and the figure leaves the board. A dead figure takes no further part: its remaining cards and statuses are not live sources, and effects still queued for it lapse. If it was the figure acting on the turn, the turn ends, unless other figures are still to act on it (a monster turn's other monsters); any other death leaves the turn as it is, so a traitor's explorer dying on its seat's monster turn doesn't cut the monsters' turn short.

**The monster turn.** At its start, the monsters the seat controls that are stunned miss it, and one movement roll is made for each type of monster left, its Speed in dice (p. 18); those monsters are the turn's actors, fixed then, so one that enters play during the turn waits for the next. The seat then picks which monster acts, and that monster takes the turn's own choices, the same ones an explorer has (moving one space at a time by the connections and leaveCost questions, its one attack, the room's actions), until it is finished; a monster stunned partway stops at once. Its movement is the movement question, whose base answer is what its type rolled. At the turn's end the monsters that missed it recover, so a stun always costs exactly one monster turn (the monster turn's project ruling). Which monsters a monster turn is for is the controller question (base: the owner); a monster no seat controls (haunt 12's Twins) waits for a movement policy.

**Text a figure may ignore.** Harmful room text runs through one effect that asks bindingText: binding, it applies; optional, the figure's controller chooses (the traitor, p. 17); ignored, it doesn't, unasked (a monster, p. 19; ruling harmful-text). The traitor's choice not to be affected by an event card or the Bite asks the same question when the card is drawn. The rulebook's own rules that change other text, the traitor's new powers and how monsters treat rooms, are rulebook-layer sources, live in every game, so a card, room or haunt still overrules them. A monster ignores barriers (ignoresBarriers), climbs where only monsters can (rooms add those connections for it), can't raise or lower its traits but is stunned by any damage (ruling monster-traits), and a pull (the Bell, the Spirit Board) is its controller's choice, monster by monster.

**Moving past opponents.** A move out of a room costs 1 space plus the leaveCost question, whose base answer after the haunt counts the figures there that hinder the mover (the hinders question: an opponent that isn't stunned, p. 17). A figure can always move at least 1 space a turn. Only a figure's own movement pays it: a pull (the Bell, the Spirit Board) and the Dog's run spend no movement, so opponents never slow them. A haunt changes who hinders (haunt 13's sleeping dreamer doesn't) or what leaving costs (a group counting as one opponent, 98) by modifying those two questions.

### Rule sources and layers

A **rule source** is anything that can modify answers or react to events: the rulebook, a room in play, a held card, an ongoing event, a status, a haunt figure's definition, and the active haunt and its phase. A source contributes **modifiers** (a question, an optional filter on the subject, a change to the answer, and its rule reference), **triggers** and **conditions**. Only the sources that are live in the state take part. A card counts only while someone holds it or it is ongoing, or, when its text acts from where it lies (an open Music Box), while it lies in a room. A room counts only while it is on the board and relevant to the subject. A status counts while it is on a figure, in the layer of the rule that applied it (a card's status in the card layer, a haunt's in the haunt layer), and its behaviour reads the status's own data.

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
| Structured result (combatOutcome, lethalOutcome, movementPolicy) | each modifier declares whether it **replaces** the result (asleep: hinders no one) or **adjusts** the previous one (every point a Nightmare deals is mental); in layer order, and within a layer the one replacement first, then the adjustments |

Within a layer, modifiers run in a stable order (by source kind, then id, and for copies of one source, such as a status on two figures, by the figure and the room), never by when a source came into play or where it sits in the state. Sums and denials don't depend on that order. Two modifiers in the same layer that both **replace** a structured result, or both **set** or **fix** a number to different values, are a conflict the rulebook doesn't settle, so the engine **throws**, naming both rule references. That surfaces a real rules question (to be settled and recorded in `content/`) instead of quietly letting whichever ran last win.

### Triggers and conditions

A trigger is an event type, an optional filter and an effect. A condition is a predicate and an effect. Conditions fire when they change from false to true, and the rule memory records which have fired: a once-only condition for good, any other until it stops holding, which keeps the check deterministic and replayable. An effect is either kit data (damage, gain, place a token, step a track, spawn, move, change side, raise a decision, declare winners) or a named local step. Effects push steps onto the step stack, so an effect may pause for a decision and resume.

Conditions are re-checked after every step, from the haunt's first turn on (during the reveal its counters and secrets aren't all set yet). A condition that declares winners is a goal: meeting it ends the game at once, partway through a move or an attack included. The game is finished, its result is the set of winning seats with the goal's rule, and the unfinished work and any pending decision are dropped. If one step meets goals with different winners, the side whose turn it is wins. The rulebook holds one goal of its own for every haunt: with every hero dead, the traitor's side wins. All three come from the game-end ruling in `rules.md`.

## 6. The haunt format

A haunt is one typed definition in `data/haunts/`, built from kit parts (`kit/`). The kit compiles each definition into the rules the engine runs and registers them in the engine by haunt number: its figure definitions among every other figure's, its statuses beside the cards', and its local steps under its source id. While the haunt is played, its compiled rules are a rule source on the haunt layer. The engine reads `state.haunt` to find the active rules and never branches on which haunt it is. A haunt that isn't built yet stops the game at its reveal.

**The reveal** is the same whether a haunt roll or a scenario's "start haunt N" reveals it (the haunt-start ruling in `rules.md`). The revealing turn is over and exploration's remaining work is dropped. The chart's traitor rule (or the haunt's own) picks the traitor from the explorers as they stand, a tie going to the revealer or else to the nearest tied seat on the revealer's left. The traitor's side and role are set and everyone else becomes a hero. The traitor is freed from impeding events. Every seat confirms a ready wait, in any order. The traitor's setup runs, then the heroes', and the first turn goes to the traitor's left. A scenario never sets sides for a built haunt: the reveal decides them, and testers steer it through the revealer, the omen and the explorers' traits.

**A definition's sections:**
- **Identity:** number, name, set, and a reference to its content file.
- **Its text:** each side's half, its content file's Traitor's Tome and Secrets of Survival sections word for word, notes included. They are read out of `content/haunts/` into one generated file per haunt in `data/haunt-texts/`, which a snapshot test keeps in step with `content/` (as `data/rule-notes.json` is), and the definition imports its own file, so only built haunts' text is bundled. A test holds each definition's text to its content file.
- **Sides:** the chart's traitor rule, unless the definition gives its own (a hidden traitor, several traitors, or none). Each side reads its own half of the haunt text.
- **Setup:** an ordered list of kit setup parts, per side: start a counter, write down a secret known to a group of seats, put a status on a group's explorers, put a number of the haunt's figures in the room of a group's explorer (owned by a group's seat, numbered from their definition, and no more than the supply question allows in play), drop a group's items where they stand, set its companions aside out of the game, top up the rooms in the house that match a set (named rooms, rooms with windows, outside rooms) to a count, with a group's seat choosing each room from the stack and the discards and placing it by the one placement rule, or run a local step. Each part may name the content ruling its events cite. Still to come: fill the house, placement constraints beyond the one rule, set aside tokens. A count in setup (the players, the living heroes, a counter, a secret, the matching rooms in the house) is worked out when its step runs, so setup fixes it at the haunt's start; the question a setup step can't kill through is a modifier (lethalOutcome while the setup runs).
- **Figures:** monster and ally definitions (traits or a stats table, a movement policy, an attack rule, a defeat response, flags).
- **Tracks and counters**, with their count expressions.
- **Statuses** the haunt applies.
- **Actions:** objective actions (who, where, cost, roll, limit, effect on success and failure). The kit makes the common ones: a task roll (one action per trait that can make it, at most one attempt a turn by each figure) and an escape from the house (for the figures of a side, or of one definition: the figure's own move out of the room, with no room to go to, so the canMove question, the room's rules for leaving and the cost of opponents in the way all apply as to any move; optionally leaving a marker that closes the room to later escapes, and stepping a counter).
- **Modifiers**, **triggers** and **conditions**, as in section 5. A number change may be worked out from the game when it is asked (a supply of one per player). Win conditions are goals: a side and a test (a counter reaching a count, an explorer of a group dead, a card out of the game, or a local test), compiled to conditions that declare that side's seats the winners, and that may show everyone a secret as they are met.
- **Knowledge:** the secret values and who sees them.
- **Phases** (optional): the rules active in each phase, and the condition that switches between them.
- **Local functions:** named steps or modifier functions for what the kit doesn't cover, kept in the haunt's own file.
- **Rulings:** references to the content notes the definition depends on, each with its settled answer.

**Haunt 13, Perchance to Dream (built in `data/haunts/`, pure data).** It shows that a haunt with a sleeping traitor, a race of monsters and a number only the traitor knows needs no code of its own: each of its rules is a kit part, or a modifier to a question the engine already asks.
- *The sleeping traitor* is a shared kit status. It denies the questions that let a figure act, hold cards or be moved by an effect, and turns off hindering, while the seat keeps every choice the rules give the traitor, because who decides is a seat, not the body. Dropping the body's items and setting its companions aside are setup parts that can't kill it, since a lethalOutcome modifier clamps every trait while the setup runs.
- *The Nightmares* are a figure definition with fixed traits, moved by the rulebook's monster rules. How they fight is two adjustments to combatOutcome (the damage they deal is mental; a hero who beats one while attacking kills it), and how many may be in play at once is the supply question.
- *The race* is the kit's escape from the house, limited to Nightmares, marking each room it is used through and stepping a counter. One room match (rooms with windows, outside rooms and the Entrance Hall) serves three rules: the traitor's seat tops the house up to that many rooms at setup, their count becomes a secret only that seat knows, and it says where an escape may be made. Losing a Nightmare, killed or escaped, triggers an offer to the traitor's seat to bring in another beside the body.
- *Waking the dreamer* is the kit's task roll for heroes, offered in the dreamer's room while a hero there carries the Holy Symbol; each success steps the wake counter.
- *The ending* is four goals: a counter reaching the secret (which shows everyone the secret as it is met), a counter reaching the number of players, the dreamer's death and the Holy Symbol leaving the game. The rulebook's own goal covers every hero dead.
- *Rulings:* each event cites the note in the haunt's file behind it, and "why?" shows that ruling only to the seats that may read the half it sits in.

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
- **Text the players read is generated.** Where the game shows `content/`'s own words (the "why?" rule notes, each side's half of a haunt), a test reads them into generated JSON and fails until the JSON is rewritten after `content/` changes.
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

**Local UI state stays local.** Hovering, planning a path, browsing cards and selecting before confirming never reach the server. Monopoly sent its staging edits to the server. Here only committing a decision sends anything, and a planned path is sent as the chain of single-step actions described in section 3. A live preview of a public decision goes to the other players over a Realtime broadcast, never into the row (`presentation.md`, "Live previews online").

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
- **Who controls a figure is a question.** The controller question's base answer is the figure's owner, and a status changes it: possession, control taken with the Ring, a hero carried by a monster. Every choice the rules give a figure goes to its controller. Which side a figure is on is a question as well: its base answer is the owning seat's side, and a figure no seat owns is on none unless a modifier says so. So haunt 98's Mannequins, run by the revealer but winning with the heroes, and haunt 46's Victims are modifiers, not special cases. Whether two figures are opponents (isOpponent) is a question derived from their sides: on two different sides, neither of them neutral.
- **A haunt's groups mean sides.** A haunt's rule names seats and explorers by side (the traitor's side, the heroes), so a hero who changes sides counts, and wins, with the side it joined; the traitor role is read only where a rule means the traitor themself (the round starting on the traitor's left, the traitor's new powers). A choice the rules give a player ("the traitor chooses") is put to that seat, and one the rules give a figure to the figure's controller. A rule that names the one seat or explorer of a group (who owns a monster, whose side a monster comes in beside) fails loudly when the group holds several, rather than picking one.
- **"Your explorer" is a lookup** from a seat to the explorer figure it owns, used only where a rule means exactly that, such as the turn's own moves before the haunt. A seat may own none, so every caller says what that means for its rule, and fails loudly where the rules make it impossible.

- **Sides are per seat and can change.** The traitor is a role a seat holds, not a seat number. A side may be secret, with its knowledge recorded per seat (including a side hidden from its own holder).
- **Derived values are computed, never stored:** who is an opponent (the isOpponent question), which half of the haunt text a seat may read, and which win conditions apply to whom. Because they are derived, a side change takes effect everywhere at once.
- **Turn order is recomputed at every turn boundary.** It comes from the current turn, the sides, the turnOrder question and the queue of inserted turns, rather than from a list saved at the haunt's start. A conversion in the middle of a round takes effect at the next boundary with no extra code. The turnOrder question's answer is one round. Before the haunt it is every seat in table order. After it, a hero turn for each seat whose explorer is alive, passing left from the traitor's left, then each seat publicly on the traitor's side takes its traitor turn and its monster turn, even while its explorer is asleep or dead (the dead-seats-turns ruling). A seat with nothing to do on a turn (a dead or sleeping traitor, a monster turn with no monster able to act) takes it as a forced step, so it passes at once. Without a traitor known to everyone (a hidden traitor, or none), the round starts on the revealer's left and every living explorer takes an explorer turn. An inserted turn is taken at the next boundary, and the order then carries on from the turn it followed. A turn the round no longer holds (its seat changed side) is placed where the rulebook's round would put it, and the order goes on from there.
- **Results belong to seats.** A game result is a set of winning seats, and a side win is the common case of that.
- **Seats change hands freely.** Seats are tied to a browser's profile id, so any player in a game may hand a seat to another profile, from the game list or the seat menu, for example after changing device. The good-faith model keeps this from being abused.
- **Controllers** are human, bot or AI, and all of them answer asynchronously through the same route. The engine never calls a controller (section 8).
- **`viewFor(state, seat)`** returns what a seat may see (`engine/view.ts`; `game.ts` binds it to the built engine). The good-faith model trusts people not to look past what the UI shows, but a view may also go to a reader that isn't trusted: an AI agent a player connects from outside (`ai-players.md`). So `viewFor` is the boundary itself, not a hint the UI applies: what it leaves out must be absent from its result, never present and merely unrendered. The view is a type of its own, built field by field, never the state with fields blanked, so a field added to the state stays out of every view until it is added on purpose. It hides:
  - the order of the room stack and the decks, from everyone: only their sizes show. Discard piles are face up;
  - other seats' secret sides and roles, unless the seat knows them; and everything else that would give a hidden side away: a monster's owner; whom a decision is put to, where it is about such a monster or put to the seat for its side ("the traitor chooses"), in the pending decision and in a forced step's event alike; whose monster turn it is, since only the traitor's side has one; the haunt section behind a status on that seat's figures ("Traitor's setup"); a status's own data, which may name a seat, unless the viewer knows every side; and who knows a secret;
  - secret values the seat doesn't know. That a secret exists is public, as the heroes' half always says what the traitor has written down. A haunt whose secret's very existence must be hidden will need a kit flag for it;
  - the other side's half of the haunt text. A seat reads its own side's half, once it knows its side; before the haunt, and for a spectator, there is none;
  - the rulings in the other side's half. Each haunt ruling belongs to the half its note sits in, read from the haunt's text when the haunt is compiled. Wherever a rule reference names one (an event, its data, the pending decision, a status, a death, the result), a seat that may not read that half gets the reference without the ruling's id and a mark that a hidden ruling applied, so "why?" can say only that;
  - a monster's trait values from the other side, until a roll makes them known to everyone (the rule memory's known traits). That it has a trait at all is public, and its own side knows them;
  - other seats' answers to a shared decision that is still open: everyone sees who has answered, and an addressee sees its own answer;
  - the seed. Under the good-faith model a client may work out dice from it (section 4), but a reader given only a view could otherwise foresee every roll a choice would lead to, so the view leaves it out, with the step stack, the answers ledger and the rule memory beyond its deaths and known traits.

  It shows the pending decision in full (its parameters and the seat's legal choices, labelled) only to its addressees. Everyone else sees whom the game is waiting on and what kind of decision it is. Events are the latest write's, with what only some seats may see taken out of the rest's copy: a side set in secret, the card a Crystal Ball put on top or the room tile a Spirit Board saw (for all but the seat that looked), and a forced step's one choice, which is a decision's choices and so its addressee's alone. Tokens the seat hasn't seen wait for Widow's Walk, which brings the first hidden tokens. A spectator view, with no seat, shows only public information. The UI, bots and AI all receive this view, and `describe` words the log and the pending question from the view alone. A test checks every seat's view and a spectator's after every write of random games, hidden-traitor haunts included, by looking for the hidden material itself in the serialized view.

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
- Every input method (a controller through `gamepad`, touch, and keyboard + mouse) picks among the pending decision's choices. Adding an input method never touches game logic.
- Every automatic step is told in plain language, with its rule: in the play screen's status box, and in the debug view's log. Each can show "why?": the rule's source and, where a ruling applies, the ruling and its authority. A rule reference may name the one ruling behind an event, by the id its note carries in `content/` (`> Note [id]:`); "why?" then shows only that ruling, and a test fails when the code cites an id no note has.
- The house takes the screen on phones and desktops alike, never stretched; `presentation.md` holds the rest.
- The look follows Betrayal's own gothic style, from tokens scoped to the project.

## 13. Build order

Each milestone ends with something playable and tested.

1. **Foundations.** The model types, the state format with migrations, the randomness, the board with its queries (connection, adjacency, line of sight, distance by route), and the step loop. Typed data for rooms, characters, cards, tokens and the chart, with the agreement tests. Before this, settle the unresolved notes that exploration touches (for example, how the Collapsed Room's basement tile is drawn, and whether the Mystic Elevator may leave a floor if leaving would seal it off).
2. **Exploration, no haunt.** Setup, turns, moving, discovering, room text, every card, traits, item rules and the haunt roll. When a roll succeeds, the game shows the haunt number and stops. Played in one browser on a plain debug UI.
3. **One haunt end to end.** The questions and layers, starting with combat and death; sides and turn order; the kit parts haunt 13 needs; conditions and results; `viewFor`. A dev-only "start haunt N" makes haunt work quick to reach. After the base game, the same path becomes the rulebook's optional "select the haunt" rule (p. 16), a per-game setting. Haunt 13 played start to finish in one browser.
Before milestone 4 comes **local hot-seat play** in the 3D house, with the real UI (`v1-play.md`). It builds the sync reducer and store against a local stand-in for the server.

4. **Online.** The SQL, the commit routine and route, the shared game-list lobby extracted from Monopoly, seats, live previews over Realtime broadcast, and the two-client e2e, with the sync reducer and store from local play.
5. **The remaining base haunts,** in batches by the kit parts they share, in the order the survey ranks them. Each batch first settles its unresolved notes and adds its kit parts. Haunt 35 comes last.

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
4. **Monster turns for a hidden traitor** (the batch of base haunts that builds 34 and 43). The turn order gives monster turns only to a seat everyone knows is on the traitor's side, so a hidden traitor's monsters never move on their own. When, and how, a seat whose side is secret moves its monsters without giving itself away waits for the first hidden-traitor haunt that has monsters. A view already keeps such a turn's seat, and the seat's decisions about its monsters, from the seats that don't know its side.
