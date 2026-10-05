# Haunt survey

A survey of all 101 haunts (base game 1–50, Widow's Walk 51–100 and the star haunt, Seasons of the Witch) against the design bet in the project's CLAUDE.md: a haunt is typed data built from a kit of parts, plus overrides of the questions the engine asks, plus a small local function where the kit falls short, and the engine never branches on which haunt is running.

Each haunt was broken down on its own: sides, setup, figures, tokens, tracks, actions, overrides, triggers, win conditions, hidden information, persistence, anything unusual, and a fit verdict. The counts below were computed by script over those breakdowns. The breakdowns were written in batches with slightly different judgement, so the hook names were merged and split by hand (section 2 says how), and verdicts that look wrong are called out. Claims were checked against `content/haunts/`, `content/rules.md` and `content/widows-walk-rules.md`.

Counts of override points are counts of haunts, not of rule changes. They are lower bounds: some batches recorded a rule change only in a figure's description (for example, "immune to Speed attacks") rather than as an override.

## 1. Coverage

Verdicts as the batches gave them:

| Fit | Base (1–50) | Widow's Walk (51–100, star) | All |
|---|---|---|---|
| data | 27 | 14 | 41 |
| data + small function | 21 | 24 | 45 |
| custom | 2 | 13 | 15 |
| **total** | 50 | 51 | 101 |

Verdicts after this synthesis, assuming the engine capabilities of section 4 exist (they are needed anyway) and that the "players decide" decision type exists:

| Fit | Base | Widow's Walk | All |
|---|---|---|---|
| data | 27 | 14 | 41 |
| data + small function | 22 | 29 | 51 |
| custom | 1 | 8 | 9 |

Six batch verdicts of "custom" move down (43, 52, 64, 67, 76, 92); section 5 gives the reason for each. No "data" or "data + small function" verdict was raised to custom.

What this means for the bet:

- **The bet holds for the base game.** 49 of 50 base haunts are data or data plus a small function. The one exception (35, Small Change) needs figures that stand in doorways and a vehicle that carries explorers.
- **Widow's Walk is harder, but mostly in the engine, not in the haunts.** Its haunts lean on things the core model must support rather than on haunt-specific code: sides that change, secret and per-player knowledge, a mutable board, per-turn memory. Once those exist, 43 of its 51 haunts are data or data plus a small function.
- **Custom does not mean the engine branches.** Every custom haunt can still be a haunt-local function plugged into the same override points and events; what makes it custom is the size of that function, or one engine capability that only it needs (a wall clock for 99, a bounded table for 93).
- **Several "data" verdicts are conditional.** Batches often wrote "data, given X", where X is an engine capability: kill attribution (21), dynamic sides (9), a controller switch (6), hidden positions (39), a chase movement policy (29). The verdicts are only true if section 4 is built.
- **Batch judgement was inconsistent in a few places,** always about the same mechanism: the chase-the-closest-hero policy is "data" in 10 and 29 but "small function" in 28 and 54; the kill-credit win is "data" in 21 but "small function" in 5 and 30; moving the traitor role is "custom" in 67 but "small function" in 90 and 94; secret sides are "custom" in 43 but "small function" in 34, 81 and 97; word games are "custom" in 64 but "small function" in 69 and 78; a spreading area is "data" in 65 but "small function" in 27 and 57. In every case the mechanism belongs in the kit or the core, after which the haunts that share it get the same verdict.

## 2. Override points

### Questions and events are different things

The batches used one list of hook names for two kinds of thing:

- **Questions** the engine asks while working out legal choices and results ("may this figure attack that one?", "how many dice?"). A haunt modifies the answer. These are the override points.
- **Events** the engine emits as play happens (a turn starts, a room is entered, a figure dies). A haunt reacts with an effect. These are triggers, and belong with the haunt's trigger list.

`onTurnStart`, `onTurnEnd`, `onEnterRoom`, `onDiscoverRoom` and most of `onDeath` were events, not questions. Some entries under those names were really questions ("can't use the Mystic Elevator", "must stop on entering") and were moved to the right question.

### The override points, ranked

Each row is one engine question. "Merged from" names the batch hooks whose entries landed there.

| Override point | Engine question | Base | WW | All | Examples | Merged from |
|---|---|---|---|---|---|---|
| combatOutcome | When an attack is won, what happens to the loser (and sometimes the winner)? Base: an explorer takes damage equal to the difference; a monster is stunned. | 30 | 28 | 58 | grab instead of damage (7, 23), capture (35, 80), steal or take control (28), convert the loser (58), move the loser (56, 64), killed not stunned (13, 26), damage on a track (15, 21), per-colour effects (80) | onDefeatInCombat, stunInsteadOfKill, damageAmount ("no damage, steal instead") |
| canAttack | May this figure attack that target at all? | 23 | 14 | 37 | can't be attacked (8, 9, 42), only a Medallion carrier may affect it (21), attack a guessed room (41), attack an object (36, 61) or a room (84, 86), can't attack until a condition (2, 11) | canAttack |
| lethalOutcome | When a trait would reach the skull, what happens: death, conversion, transformation, a clamp above the skull, a reveal? Asked per trait. | 12 | 19 | 31 | turns traitor (9, 56, 85), clamps (71, 78, 96), Knowledge and Sanity give different outcomes (84), becomes an Owl (93) or a baby (95), corpse object (14), hidden traitor reveals (34) | isDefeated, onDeath, traitBounds (clamps) |
| dicePool | How many dice does this roll get (attack, defence or trait roll)? | 6 | 22 | 28 | grouped monsters pool Might, capped at 8 (26, 86, 98), undefended attacks (39, 41), defence is a letter score (64), dice from this turn's movement (77) | dicePool, defenseDice |
| canCarry | May this figure pick up or hold this thing, and how many? | 14 | 13 | 27 | corpses (14), one Parachute (31), one Prop (51), per-Curse limits (81), carry limit by Might (95) | canCarry |
| canTransfer | May this be dropped, traded, given or stolen, and on what margin? | 14 | 13 | 27 | steal on a 2+ win including a companion (1), can't drop the Spirit Board (40), steal in any combat (61), forced pickup (94) | canDropTradeSteal |
| attackTrait | Which traits may the attacker use, and with which trait does the defender answer? Includes immunity to a trait. | 11 | 16 | 27 | immune to Speed attacks (1, 28, 29), Sanity only (11), mental traits only (49), the Elector's colour picks the trait (66), defender uses the attacker's trait (71) | attackTrait, canAttack (immunities) |
| movementCost | What does entering a room cost, and who hinders whom? | 17 | 9 | 26 | carrying a body costs 2 (14, 20, 42), doorways are spaces (35), monsters that don't hinder (7, 24, 38), a group counts as one opponent (98) | movementCost |
| roomFeatureApplies | Does this room's printed rule, or a special connection like the Mystic Elevator, apply to this figure? Room text reaches monsters as well as explorers by default (pp. 18–19), so the base answer already takes any figure, and these haunts change it. Built as bindingText for harmful text (binding, optional or ignored) and monsterRules for the monster-only ways through rooms. | 15 | 10 | 25 | can't use the Mystic Elevator (5, 8, 21, 47), the Elevator stops while a monster is in it (7, 23, 70), ignore harmful room text (49, 64, 71), a room's own roll yields a Key (34) | roomFeatureApplies, canMoveThrough, onEnterRoom, tilePlacement |
| movementPolicy | Who decides where this figure moves, and by what rule? (Applies to monsters and to explorers being forced.) | 14 | 8 | 22 | chase the closest hero (28, 29), toward a room (9, 54), wall-hugging with a facing (8, 46), teleport (1, 17), moved by another player (42, 46, 96) | monsterMovement, movementAllowance (forced moves) |
| damageAmount | How much damage does this figure take or deal? | 6 | 16 | 22 | halved (5), reduced (15), none for the traitor (42, 52, 68), none until a gate is met (63, 66) | damageAmount |
| connections | Which rooms are connected for this figure? (Doors, walls, the front door, face-down tiles, blocked edges, extra links.) | 8 | 13 | 21 | through walls (2, 20, 49, 64, 71, 80, 91), the front door opens (4, 16, 18, 46, 74, 89, 95), face-down tiles have doors on every side (76, 86, 91), blocked doorways (79, 97), extra links (91) | canMoveThrough, roomConnections |
| turnOrder | Who takes the next turn, and what does each turn consist of? | 8 | 12 | 20 | monster turn after the revealer (12), an extra traitor turn (33), creatures act right after a given explorer (68), the traitor never takes a turn (76), the traitor after every hero (77), a player takes a turn at once (81) | turnOrder |
| traitChange | Does this trait change happen, and where do trait values come from? | 11 | 7 | 18 | traits frozen (12, 42, 87), traits live on the Turn/Damage track (18), no Sanity at all (85), Might lost raises Speed (95) | traitChange, traitBounds (non-clamp) |
| movementAllowance | How many spaces may this figure move this turn? | 9 | 9 | 18 | −1 per attached Bat (24), flooded floors (36), doubled (93), can't move at all (4, 45) | movementAllowance |
| damageRouting | Which traits does this damage come off, and who takes it? | 9 | 7 | 16 | Speed until its floor, then Might (1), a Might attack deals mental damage (13), physical becomes mental (49, 64), damage split with another figure (56, 79) | damageType, damageAmount (splits) Haunt 13 is built without it: combatOutcome carries the damage kind, and the kit's `dealsDamageAs` changes it. |
| monsterTurn | What does this monster do on its turn besides moving? | 10 | 6 | 16 | must attack if able (1, 4), spawns (24, 38), the Blob spreads (27), plays chess (37), a forced-target attack (84) | monsterTurn |
| cardDraw | What is drawn, and how? | 9 | 6 | 15 | search the stack instead (4, 22), draw three keep one (21), weapons are redrawn (51, 98), no draws at all (35) | cardDraw, onDiscoverRoom, canCarry |
| canEnterOrLeave | May this figure enter, leave, or end its turn in this room, and does that need a roll? | 8 | 7 | 15 | forbidden room (26, 37), roll to enter (30), roll to leave (57), may not end a turn there (68), may not re-enter a room left this turn (77), trapped (100) | canMoveThrough, onTurnEnd |
| rollResult | What is added to a roll's result, is it rerolled, or is the result fixed? | 7 | 4 | 11 | summed bonuses from board state (32, 50), reroll blanks once (4, 37), a fixed result of 5 (91), a +2 for rhyming (62) | rollModifier, dicePool (rerolls) |
| itemEffect | What does this card or token do here? | 9 | 2 | 11 | items do nothing for a monster (14, 17), the Armor stops 1 point only (38), a Thought raises a trait (70) | itemEffect |
| endsMovement | Does this event end the figure's movement? | 6 | 5 | 11 | discovering a symbol room doesn't end movement (25, 47, 92), taking an objective does (31, 34), must stop in an unflooded room (65) | movementAllowance, onDiscoverRoom, cardDraw, onEnterRoom |
| visibility | Who may see this piece of state? | 3 | 8 | 11 | the traitor's position (41), side tokens (43, 81, 97), private reveals (83), future rules unread (star) | visibility |
| canDiscover | May this figure discover a new room? | 5 | 5 | 10 | Frogs, Blob-people and Souls can't (3, 27, 49), monsters or a figureless traitor can (11, 47, 68, 86), not past a Barricade (97) | canDiscover, tilePlacement, canMoveThrough, onDiscoverRoom |
| attackReach | Which targets are in reach: same room, an adjacent room, line of sight, the whole floor, the closest hero anywhere? | 2 | 8 | 10 | every hero in the room at once (6), from a connected room (30, 54), line of sight (91, 96), whole floor (95), the closest hero (66) | canAttack, attackTrait |
| canUseItem | May this figure use this card? | 5 | 2 | 7 | grabbed heroes (7, 23), Souls (49), Owls (93) | canUseItem |
| roomDraw | How is the next room tile drawn or placed? | 2 | 4 | 6 | pick any room from the stack (19), choose one of the next five (54), reshuffle a tile that would touch a marked room (96) | tilePlacement |
| isOpponent | Are these two figures opponents? | 3 | 2 | 5 | every hero is every other's opponent (31, 50), team-relative opponents (100) | canAttack |
| canAct | May this player act at all this turn (including after death)? | 2 | 2 | 4 | asleep (13), petrified (55), a dead traitor keeps acting (22, 85) | canAct, onDeath, turnOrder Haunt 13's asleep is the kit status `ASLEEP` (canAct, canCarry and canBeMoved denied, hinders false). |
| attacksPerTurn | How many attacks may this figure make, and against whom? | 3 | 1 | 4 | two attacks (15), one per hero reached (17), chain until a failure (18), one per Ghost (71) | canAttack |
| lineOfSight | What blocks or extends line of sight? | 0 | 4 | 4 | blocked by Nodes or Barricades (79, 97), not blocked by face-down tiles (91), across the outside perimeter (95) | lineOfSight, visibility |
| attackRedirect | May an attack on this figure go to another figure instead? | 0 | 2 | 2 | bodyguards (51), a Snow Monster (75) | canAttack |
| hauntSelection | Does a haunt roll start this haunt, and which haunt? | 0 | 2 | 2 | the star haunt's gate (star), a nested game that re-runs itself (99) | hauntSelection, hauntRoll |

All 101 haunts override at least one question; the average is between five and six.

### Batch hooks that were several questions

- **canAttack** (56 haunts as written) mixed six questions: is the target legal, which traits, what reach, how many attacks, can it be redirected, and who counts as an opponent. They are asked at different moments (building the target list, choosing a trait, resolving), so they are separate points.
- **canMoveThrough** (37) mixed the board's connections, permission to enter or leave a room, special connections such as the Mystic Elevator, hindrance and discovery.
- **tilePlacement** (17) was used for discovering, for drawing the next tile, for the Mystic Elevator, for flipping and moving tiles mid-game, and for building the whole house at setup. Only drawing the next tile is an override point (roomDraw); flipping, moving and building are board capabilities (section 4), and discovery is canDiscover.
- **movementAllowance** mixed the number of spaces with "your movement ends now" (endsMovement) and with forced moves (movementPolicy).
- **onDiscoverRoom** and **onEnterRoom** mixed events with three questions: canDiscover, endsMovement and roomFeatureApplies.

### Batch hooks that were one question

- **onDefeatInCombat** and **stunInsteadOfKill** both answer "what happens to the loser". The base rule already branches on the loser (explorers take damage, monsters are stunned), so the answer is one structured result: a list of effects such as damage, stun, kill, a track step, steal, grab, push or convert. How a monster responds to defeat is mostly a property of that monster, recorded with it, which the haunt's override can still change.
- **isDefeated**, **onDeath** and the clamping uses of **traitBounds** all answer "a trait would reach the skull: now what?". It must be asked per trait, because 84 treats Knowledge, Sanity and the physical traits differently, and with the cause of the damage, because 30 converts only on Speed lost to Domination.
- **dicePool** and **defenseDice** are the same question for the two sides of a roll.
- **hauntRoll** and **hauntSelection** are one question.

### The context every question needs

The answers depend on much more than the two figures involved. Across the survey they read: the figure's side, kind and statuses; the cards and tokens it holds ("a Ring holder's Sanity attack" alone appears in 2, 11, 15, 17, 18, 20 and 28); the room and floor; a track's value; history ("before the traitor reaches the chamber", 26); and the cause and source of damage. So every question must receive the whole game state plus a subject, never a narrow argument list.

### Events

From the override entries plus a keyword count over the trigger lists (220 triggers across 99 haunts), the events haunts react to, by number of haunts:

| Event | Haunts (about) | Notes |
|---|---|---|
| a figure dies or is killed | 36 | with killer and cause (section 4) |
| a turn ends | 34 | whose turn matters: any explorer's, the traitor's, the haunt revealer's (34, 43, 100), a dead traitor's character's (85) |
| a turn starts | 29 | same |
| a room is entered (including passed through: 8) | 28 | |
| a room is discovered | 19 | |
| a track reaches a value | 15 | |
| a counter reaches a target ("tokens equal the number of players") | 13 | |
| an attack is won or lost | 12 | |
| a card or token changes hands | 10 | |
| a room is destroyed, flipped or moved | 9 | 2, 18, 22, 50, 57, 76, 86, 91, 93 |
| damage is taken | 4 | |

About a quarter of the triggers did not match any event: they are **conditions** ("the bride and the groom are both in the Chapel", 20; "3 or more Surgers around a Lock", 53; "every living hero is on the Balcony with the Rowboat", 36). The engine needs both kinds: triggers on events, and predicates over state that it re-checks after every step, firing when one becomes true. Win conditions are the largest family of the second kind.

## 3. The parts kit

The parts the haunts actually use, grouped by role. "Uses" lists the haunts that need the part; lists marked "e.g." are examples of a part that most haunts use.

### Counts and placement

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Count expression | A number derived from the game, used for token counts, targets and thresholds. | basis (players, heroes, explorers, traitors, living heroes); when it is fixed (at haunt start, or live); arithmetic (×2, half rounded up or down, +1, 6 − heroes, 9 − starting heroes, a cap) | 61 haunts, e.g. 4, 7, 8, 13, 26, 79, 75. 23 haunts specify the count at haunt start (e.g. 9, 17, 25, 35, 96) Built as `Count` (engine/haunt.ts), which also counts the rooms in the house matching a `RoomMatch`. |
| Find a named room | At setup, if a room isn't in the house, search the room stack, place it under a constraint, reshuffle. | room names (one, or any of several); who places; constraint (floor, connected to, far from) | 28 haunts: 2, 9, 13, 14, 18, 20, 22, 23, 24, 29, 31, 32, 33, 39, 43, 46, 49, 53, 54, 55, 60, 61, 67, 80, 82, 86, 89, 91 Haunt 13's top-up is the kit setup part `rooms` (`topUpRooms`), the traitor choosing and placing. |
| Fill the house | At setup, place tiles from the stack until a floor or the house meets a count. | floor; count (rooms, open doors, item-symbol rooms) | 40, 86, 90, 91, 94, 97 |
| Placement rule | Where a token or figure goes, chosen by whom. | room list in priority order (cycling when tokens remain); room filter (symbol, floor, unoccupied, no token yet); distance (at least N from, as far as possible, within N); chooser (traitor, heroes, revealer, split: one side picks the floor, the other the room, 88); spread (per floor, no two adjacent, 66); deferred placement on discovery | e.g. 1, 7, 15, 19, 21, 26, 28, 34, 37, 50, 61, 66, 78, 81, 88 |
| Deferred placement | A token waits for its room to be discovered. | room filter; tokens remaining | 3, 7, 11, 15, 19, 34, 37, 50, 75, 100 |

### Figures

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Monster | A figure that is not an explorer. | traits (fixed, from a table keyed by a track, live from a track or from another figure's traits); count; side; owning seat, which may be none (12's Twins, the star haunt); movement policy; attack rule; defeat response; flags (can't be attacked, immune to a trait, doesn't hinder, can or can't discover, carry, use the Mystic Elevator) | 51 haunts |
| Monster stats from a track | A monster's traits read from a table or value that changes during play. | track; table | 4, 17, 23, 60, 75, 89, 92 |
| Transformed explorer | An explorer who keeps their seat but takes new rules: Werewolf, Frog, Ghost, Monkey, Owl, baby. | rule set; trait reset (to start, to start + N, a snapshot); what is dropped; whether it's permanent or reversible | 36 haunts, e.g. 3, 5, 9, 21, 30, 49, 71, 80, 93, 95 |
| Replaced piece | The explorer's piece is swapped for another figure or split in two, or the traitor's explorer is replaced by a monster the traitor's seat plays. | what replaces it; what carries over (traits, cards, place); whether a body is left behind | swapped or split: 3, 47, 49; traitor replaced by a monster: 10, 21, 33, 43, 59, 61 |
| Ally | A non-explorer figure on the heroes' side, often moved by heroes. | who moves it and when; what it does | 16, 42, 46, 51, 55, 87, 88 |
| Linked figures | Figures tied to each other or to a hero. | link (Root and Tip, Arm and Sucker; twin to hero; two bodies of one player) | 7, 12, 23, 49, 79, 87 |
| Attackable object | A target with a trait value and a hit counter that is not a figure. | trait and value; hits needed; who may attack it | 4 (web), 36 (Rowboat), 61 (Chest), 84 and 86 (rooms) |
| Spawner | New monsters enter play over time. | where; how many (dice, a count expression, a supply cap); when (each monster turn, on an action, on discovery, on a track step) | 16, 24, 33, 38, 39, 53, 54, 60, 64, 67, 70, 75, 86 Haunt 13's replacement on a kill or escape is the kit's `replaceWhenLost`, capped by `supplyOf`. |

### Movement policies

A policy decides a figure's path when the rules, not a player, choose it. Ties go to a named chooser (usually the traitor). Without one, a monster moves by its controller's choices, one space at a time, exactly as an explorer does: the base the policies replace.

| Policy | Definition | Parameters | Uses |
|---|---|---|---|
| Chase | Move toward the closest target and attack if able. | target set (any hero, attackable heroes, a hero in sight, its own linked hero, Frogs); distance by route; retarget rule (mid-move, at turn start); tie-breaker | 2, 3, 4, 10, 12, 28, 29, 54, 98, star |
| Toward a room | Move by the shortest route toward a room or token. | destination; exact or up to the roll; what happens on arrival | 6, 7, 9, 11, 23, 54, 55, 98 |
| Facing walk | Keep a facing; go straight, else turn left (or right), hugging walls. | pattern; who chooses at forks and stairs | 8, 46 |
| Teleport | Move to any room satisfying a filter. | filter (omen room, in line of sight, within N spaces, anywhere) | 1, 3, 17, 72, 80, 96 |
| Fixed distance | Move a set number of spaces without rolling. | distance or "full Speed" | 60, 61, 80, 86, 89, 98, star |
| Moved by a player | Another seat moves the figure. | which seat; when | 42, 46, 51, 96 |
| Flee | Move away from heroes. | — | 16, 68 |
| Leaves a trail | Moving drops a token in the room left. | token; once per room; supply | 47, 96 |

### Hero statuses

A status is a named condition on an explorer that blocks some actions, may bind them to another figure, and ends on a condition. Statuses in the survey: bitten (5), Frog (3), mind-controlled (6), grabbed (7, 23), trapped (4, 100), asleep (13), Bats attached (24), Blob-person (27), captured (35, 80), inoculated (43), Soul and body (49), petrified and poisoned (55, star), noosed (69), laughing (74), possessed (72, 78, 84), catatonic (84), marked (86), dragged (87), Owl and Human (93), baby (95). About 25 haunts.

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Status | A condition with rule effects. | blocks (move, act, attack, use items, draw, discover); turn-start and turn-end effects; how it ends (an escape roll, an action by another hero, a timer, never); permanence | about 25 haunts, above Built: statuses are rule sources; shared ones live in `kit/statuses.ts`. |
| Controlled | A seat other than the figure's owner decides for it: plays its turn, moves it, or answers its choices. The engine asks the controller question, whose base answer is the owner, and a status changes the answer. | controller; what the controlled figure may do; how it ends | 16 haunts: 2, 6, 28, 35, 42, 46, 51, 55, 79, 87, 88, 90, 95, 96, 98, star (e.g. the Ghost's summoner, 2; mind-controlled heroes, 6; Demons taken with the Ring, 28; the Victims, moved by the player left of the traitor, 46; Hoplites, 55; the Siblings, 87) |
| Carried | An explorer (or their corpse) travels as cargo of another figure and has no agency while carried. | carrier; capacity; how it ends | 3, 7, 23, 35, 87, 95 |
| Grabbed / captured | An explorer held by a specific monster: immobile, items dropped, an escape contest at turn start, a delayed kill or a drag toward an anchor. | holder; escape roll; fate and when | 7, 23, 35, 80 |

### Tokens and objects

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Haunt object | A token that acts as a carried item. Under the base rules item tokens can be dropped, traded and stolen like cards unless the haunt says otherwise. | count; transfer restrictions (see canTransfer); carry limit; movement penalty while carried; who can't pick it up | 40 haunts use pentagonal item tokens, most as carried objects, e.g. 2, 14, 29, 31, 34, 36, 43, 61, 81, 90 |
| Stealable objective | A haunt object whose theft is part of the fight, sometimes with a special steal rule (random pick, any margin, steal from a figure that can't be damaged). | steal margin; random or chosen; who may steal | e.g. 1, 7, 9, 28, 29, 31, 33, 51, 59, 61, 70, 74, 90, 94 |
| Carryable body | A dead explorer's figure, or an explorer token, becomes a carryable object. | who may carry it; movement cost (entering a room costs 2); provenance condition ("killed by a weapon", 42); what delivering it does | 2, 14, 20, 42, 46, 73 |
| Room marker | A token marking a room as used, flooded, burned, trapped, or holding something. | meaning; one per room; face-down secret value | e.g. 8, 11, 16, 22, 31, 44, 52, 58, 65, 85 |
| Secret-value token | A face-down token whose value is known only to some players. | values; who has seen it; how it's revealed | 34, 43, 50, 51, 52, 63, 81, 83, 97, 100 |
| Edge token | A token placed on a doorway or connection rather than in a room. | blocks movement or sight; legality (must not cut off any room) | 53, 57, 79, 97 |
| Resource pool | A stock spent or lost over time. | items; what consumes them | 57 (Tools), star (Food, Water, Coal) |

### Tracks

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Timer | A track that advances (or counts down) at a turn boundary and does something at a value. | start; step and boundary (end of the traitor's turn, start of the revealer's turn, each hero turn, each explorer turn); conditions that skip or add steps; effects at values | 4, 16, 20, 22, 23, 25, 30, 34, 36, 39, 40, 43, 44, 45, 52, 53, 56, 65, 72, 75, 76, 82, 85, 89, 100, star |
| Counter to threshold | Successes counted toward a target, often "the number of players". | target (a count expression); what adds and removes; per-figure or shared; what reaching it does | most haunts, e.g. 2, 8, 11, 13, 15, 17, 22, 26, 33, 38, 44, 47, 49, 58, 61, 66, 67, 87 Built: kit goals on a counter (`{ counter, atLeast }`), plus a dead explorer and a card out of the game; a task roll is the kit's `taskRoll`. |
| Track as a table key | A track value selects a row of a table that sets monster stats, rooms to collapse, flood levels or effects. | table | 4, 22, 23, 36, 75 |
| Track as traits | A figure's trait lives on the track. | which trait; what moves it | 17, 18 |
| Staged objective | An ordered list of steps; each unlocks the next, sometimes swapping the token. | steps (location, roll, token) | 1, 2, 20, 24, 27, 62, 68, 72, 84 |
| Per-hero track | A track per explorer. | — | 44 (age), 67 (kills), 69 (gallows) |
| Phases | A haunt whose rules change at a point: control passes, a second phase starts, a new month's rules apply. | phase list; switch condition; rules active per phase | 2, 72, star (twelve Months and a finale) |

### Areas and the board

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Spreading area | A set of rooms that grows each step: fire, collapse, Blob, storm, flood. | seed; growth rule (adjacent with or without doors, through extra links, by floor order); rate (fixed, by track, by dice); what happens to occupants and tokens; floor fallback when a floor is gone; connectivity of detached patches | 2, 18, 22, 27, 50, 57, 65, 91; per-floor flooding by track: 36 |
| Outside | Leaving the house. Either an exit that removes the figure with an outcome, or a zone outside that figures can occupy and return from. | exit rooms or edges (front door, windows, outside rooms); door state (locked, opened by a roll or a count); whether return is allowed; what it counts as | exit: 4, 6, 13, 16, 31, 35, 36, 64, 74, 89, 98; zone with return: 18, 46, 95 Haunt 13's exit is the kit's `escapeTheHouse`, for the figures of a side or a definition, which may leave a marker and step a counter. |
| Forced move | Move a figure other than by its own movement. | figure; distance (fixed, = damage, = margin); direction (any, toward, to a room filter, within line of sight); hindrance ignored or not | 6, 9, 18, 22, 30, 40, 51, 56, 64, 70, 73, 77, 79, 80, 87, 91, 95, 96, 100 |
| Room state | A per-room value: flooded, burned, reception bars, used for a search. | value; created lazily (85) | 31, 36, 65, 85 |

### Actions

303 haunt actions were recorded across 95 haunts. Nearly all are one shape:

| Part | Definition | Parameters | Uses |
|---|---|---|---|
| Objective action | Do something in a place to change state. | who; where (room list, a room with a token, holding an item, adjacent through a door); cost (an action, 1 movement, all movement, the turn's attack, the whole turn); roll (trait and target, a contest, a dice table, none); limit (once per turn, once per room, once per source); effect on success and on failure | 95 haunts |
| Roll table | A roll whose result picks an effect from bands. | table | 16, 22, 37, 41, 50, 87, 89, 90, 94 |
| Search that reveals | A roll that makes the holder of a secret answer truthfully about one room. | the secret; what is revealed | 25, 40, 41 |
| Special attack | An attack with its own dice, trait, target set or result: area attacks, distance attacks, undefended sneak attacks. | as for an attack, plus the result | 6, 15, 39, 41, 49, 55, 69, 73, 95 |

### Win conditions

| Part | Definition | Uses |
|---|---|---|
| All heroes dead, or dead or in a status | The default traitor goal. | at least 60 haunts; with a status: 3, 5, 6, 27, 30, 55, 56, 72, 73, 81, 84, 85 |
| Counter or track reaches a value | | most haunts |
| Thing at place | An object, or a set of figures, in a room. | 1, 20, 36, 39, 81, 96 |
| Escape | Enough heroes leave the house. | 4, 16, 18, 31, 35, 36, 46, 64, 74, 89, 95 |
| Fraction of starting heroes | More than half dead, at least half alive. | 25, 34, 35, 36 |
| Judged at a time | Both sides' conditions are checked when a timer ends. | 52, 53, 82, 99, 100 |
| Kill the traitor or a named figure | | e.g. 19, 26, 33, 41, 42, 45, 63, 66, 71, 75, 88 |
| Per-player win | A set of winners, not a side. | 5, 12, 21, 30, 31, 43, 50, 51, 67, 83, 90, 92, 94, 100 |
| Win conditions that change | One side's condition changes after an event. | 46, 72 |

## 4. Engine capabilities beyond overrides

These are things the core model must support. No haunt data can supply them.

| Capability | Evidence | Haunts | Count (B / WW) |
|---|---|---|---|
| **Side per player, changeable** | Heroes join the traitor's side mid-game | 5, 9, 12, 20, 21, 27, 30, 43, 54, 56, 58, 68, 72, 73, 78, 84, 85, 91, 100 | 19 (8 / 11) |
| | Players switch back to the heroes | 67, 72, 73, 78, 90, 94 | 6 (0 / 6) |
| | The traitor role moves between players | 67, 90, 94 | 3 (0 / 3) |
| | Several traitors from the start | 51, 64, 79, 91 | 4 (0 / 4) |
| | Secret sides (including the traitor's own secret allegiance, and a side hidden from its own holder) | 34, 43, 81, 84, 97 | 5 (2 / 3) |
| | No traitor at all, or none at the start | 9, 12, 31, 50, 57, 83, 92, 98, 99, 100, star | 11 (4 / 7) |
| | Winners are players, not a side | 5, 12, 21, 30, 31, 43, 50, 51, 67, 83, 90, 92, 94, 100 | 14 (7 / 7) |
| **Turn structure** | The traitor's seat has no explorer to move but still takes turns (plays monsters, or the house) | 4, 6, 10, 13, 21, 22, 23, 24, 33, 41, 44, 47, 52, 61, 76, 83, 85, 86, 98, 99 | 20 (12 / 8) |
| | The traitor takes no turns at all | 76 | 1 |
| | A turn inserted after a specific player (monsters after the revealer, creatures after their releaser, the traitor after every hero, an immediate turn) | 12, 33, 68, 77, 81 | 5 (2 / 3) |
| | Turn boundaries tied to a specific seat, including a dead one (track steps on the revealer's or a dead traitor's turn) | 34, 43, 56, 85, 100, star | 6 (2 / 4) |
| | One player with two bodies | 12, 47, 49, 79, 87 | 5 (3 / 2) |
| | Decisions by a player who isn't taking the turn (reactions, interrupts, a forced counterattack) | 39, 51, 55, 60, 62, 70, 75, 85, 95, 96 | 10 (1 / 9) |
| **Mutable board** | Rooms destroyed, collapsed, flipped, moved, rotated, stacked or removed mid-game | 2, 18, 22, 50, 52, 57, 76, 77, 80, 86, 91, 93, star | 13 (4 / 9) |
| | Face-down tiles as a state with their own connectivity | 76, 86, 91, 93 | 4 (0 / 4) |
| | The house rebuilt or reset at setup | 31, 32, 96, 99 | 4 (2 / 2) |
| | The whole house built at setup | 76, star | 2 (0 / 2) |
| | Spaces that are not rooms (a line of tiles off the roof, grid cells on a bounded table, a perimeter outside, doorways) | 35, 77, 93, 95 | 4 (1 / 3) |
| **Board queries** | Adjacency by a shared side regardless of doors (the rulebook's own meaning of "adjacent") as a separate query from connection by doors | 2, 18, 20, 22, 26, 45, 49, 50, 57, 64, 66, 71, 80, 91 | 14 (8 / 6) |
| | Line of sight (base rules use it for distance attacks) | 3, 10, 54, 55, 67, 69, 79, 84, 91, 95, 96, 97 | 12 (2 / 10) |
| | Distance by route ("closest", "as far as possible", "within N spaces") | 1, 2, 3, 9, 10, 11, 12, 19, 28, 29, 45, 54, 66, 72, 73, 88, 91, 98, star | 19 (11 / 8) |
| | Edge geometry: window and outside-facing edges, false windows, facing, straight lines, a table edge | 8, 11, 13, 24, 35, 46, 50, 73, 93, 95, 97, star | 12 (7 / 5) |
| | Doorways and connections as places tokens or figures occupy | 35, 53, 57, 79, 97 | 5 (1 / 4) |
| | Connectivity checks (a placement or move must not cut off rooms; a path must remain) | 52, 79, 80, 93, star | 5 (0 / 5) |
| **Per-player knowledge** | Secret game state held by one side (positions, chosen numbers, assignments) | 3, 13, 25, 34, 37, 39, 40, 41, 43, 50, 51, 52, 63, 69, 70, 74, 76, 78, 81, 83, 84, 92, 96, 97, 100 | 25 (10 / 15) |
| | Knowledge per token: who has seen which token, including a token hidden from its own holder and one-to-one reveals | 41, 43, 51, 70, 81, 83, 97, 100 | 8 (2 / 6) |
| | Rules text hidden by side or by phase, and handed over when a role moves | all haunts (each side's half); 9, 63, 67, 90, 94, star | |
| **Memory of past events** | Who killed whom, and how (cause of death) | 5, 21, 30, 33, 35, 42, 49, 51, 67, 83, 87, 100 | 12 (7 / 5) |
| | A per-turn action log (what this player did this turn) | 41, 62, 65, 67, 71, 73, 77, 79, 88, 89, 90, 98 | 12 (1 / 11) |
| | Flags that remember a past event for the rest of the game | 26, 33, 46, 81, 96 | 5 (3 / 2) |
| **Damage carries its source** | Damage records attacker, attack or card or room or haunt effect, trait, physical or mental, weapon | 3, 5, 15, 19, 30, 36, 42, 45, 49, 50, 55, 59, 62, 72, 78, 84 | 16 (10 / 6) |
| **Persistence across games** | Four haunts record each explorer's completion; the star haunt reads the record as a gate | 57, 75, 86, 93, star | 5 (0 / 5) |
| **Haunt roll and selection** | A haunt roll that is cancelled (the star gate) or nested inside a haunt that re-runs itself | 99, star | 2 (0 / 2) |
| | The chart's traitor rule returns a set, or nobody: everyone but one, left and right of the revealer, oldest real player, a draft | 51, 64, 79, 91, 95 | 5 (0 / 5) |
| **Token supply** | Physical supply limits that a haunt can exhaust, as a cap, a recycling rule, a stop rule or a win condition (see `content/tokens.md`) | 7, 11, 23, 24, 27, 34, 38, 43, 44, 47, 50, 52, 53, 56, 70, 86, 98, 100, star | 19 (11 / 8) |
| **Real-world input** | Spoken lines with a rule effect | 62, 63, 68 | 3 |
| | Free-text secrets typed by a player | 64, 69, 70, 92 | 4 |
| | The real players' ages | 95 | 1 |
| | A wall clock | 99 | 1 |

What these add up to:

- **Side is per player, changeable and possibly secret,** and "the traitor" is a role a player holds, not a seat number. Whatever derives from sides must be recomputed whenever a side changes: the turn order, whose half of the rules a player may read, who counts as an opponent, and which win conditions apply to which player. A game result is a set of winning players; a side win is the common case of that.
- **A turn belongs to a seat, not to a figure.** Seats may have no figure, two bodies, or monsters only; monsters may act after a named player; and the active player is not always the one deciding.
- **What rules act on is a figure, not a seat.** "You" in card and room text means whoever is acting or affected, explorer or monster (`rules.md`; room text reaches monsters, pp. 18–19). About 56 haunts have figures other than explorers that move, attack or are attacked; five give a seat two bodies; about 19 leave a seat with no live figure; some replace an explorer with a new piece or leave a body behind; and 16 have a seat decide for a figure it doesn't own. So every question's subject, effect's target and event's subject is a figure, and who controls a figure is itself a question, never a stored seat number.

- **The board is game state, not a fixed map.** Tiles can be flipped (with changed connections), removed, moved, rotated, stacked and built at setup, and the board must answer adjacency, connection, line of sight, distance by route, edge facing and connectivity on the current state. The base rules already need adjacency without doors and line of sight, so these are not Widow's Walk extras.
- **The event log is game state.** Killer and cause of death, damage source, and "what did this player do this turn" are read by rules, so they can't live only in the presentation's log.

### The "players decide" decision type

Under the owner's good-faith model, some rules can be resolved by a player stating the answer, which the engine records without validating. It covers rules software can't check: artwork, speech, free text, and judgement calls.

Haunts that need it for a rule with a game effect:

| Haunt | What players decide |
|---|---|
| 20, 39 | the traitor places a room "as hard for the heroes to reach as possible" (the engine offers every legal spot) |
| 60 | which rooms have a drawer (no list exists) |
| 62 | whether Hamlet spoke his lines; whether a rhyme earns the +2 |
| 63 | that a hero spoke aloud (a reported penalty) |
| 64 | that the Poltergeist's word names something pictured on the tile and isn't "tricky" (the engine counts the letters) |
| 68 | that a hero said the traitor's name |
| 69 | that the phrases fit the announced theme |
| 76 | the yes/no answer about the hiding room's artwork, and which rooms that answer rules out |
| 92 | whether a gift matches each player-written criterion |
| 95 | who is the oldest real player |

That is 11 haunts: 2 base and 9 Widow's Walk. About ten more have speech or performance with no game effect (51, 56, 60, 69, 70, 74, 77, 91, 93, 95); they need no decision at all, at most a line in the haunt's text. Table talk such as persuasion (84) or lying about a peeked token (97) is outside the engine.

The type is cheap and keeps legality single-sourced: a decision addressed to a named seat (or to the table, as a confirmation by the other side) whose choices are the possible answers, all of them legal. Without it, 64, 76 and 92 are custom (64 and 76 would need a catalogue of every tile's artwork); with it, all three are data plus a small function.

## 5. The outliers

All 15 haunts the batches marked custom.

| Haunt | What makes it custom | Recommendation | Fit after this synthesis |
|---|---|---|---|
| 35 Small Change | Doorways become spaces where figures stand; the Toy Airplane is a vehicle carrying several explorers, driven by one, that can be grounded; Cats capture heroes | Bespoke function for the vehicle and capture, on top of a board that models doorways as spaces. Doorways as places are needed anyway for 53, 57, 79 and 97, but only 35 lets figures stand in them | custom |
| 43 The Star-Sickness | Secret side tokens passed by forced random swaps; dead traitors become monsters; the most recent traitor loses on a traitor win | Extend the kit: per-player secret sides (shared with 34, 81, 97), a random exchange action, and per-player winners with a "joined last" record | data + small function |
| 51 Director's Cut | Ten one-shot Props, each a different attack variant with its own relocation or drop effect; several traitors hostile to each other with a single winner | Bespoke functions, one per Prop. The engine needs nothing new beyond per-player winners and relocation; this is custom by volume | custom |
| 52 Prism | The traitor moves rooms with heroes in them every turn, under connectivity constraints; a deduction puzzle over a secret number sequence | Extend the kit: a move-tile board operation with a connectivity validator (shared with 80 and 93); the secret sequence is per-player knowledge | data + small function |
| 64 Chairman of the Board | The Poltergeist's attack is a letter-guessing game over a word naming something in the room's artwork | "Players decide" for whether the word fits the tile; the free-text word and the letter count are a small function | data + small function |
| 67 Murderball | The traitor role passes like tag; dead heroes respawn; winners are scored by kills | Extend the kit: role transfer (shared with 90 and 94), respawn as a lethalOutcome, a kill tally (kill attribution) | data + small function |
| 73 Existence Precedes Essence | A throw in a straight line across floors through stairs, the Balcony or the Coal Chute; a reanimated hero's allegiance decided by whether the hero it attacked attacks it back next turn; the traitor rejoins the heroes | Bespoke function for the throw and the allegiance check, using the action log and changeable sides | custom |
| 76 Back to the Past | A twenty-questions game about a room's name and artwork; the traitor flips rooms the answer rules out; the house is built in full at setup; face-down tiles have their own connectivity | "Players decide" for the answers and the flips; the full-house setup and face-down tiles are board capabilities (shared with 86, 91, 93 and star) | data + small function |
| 79 The Twins | Nodes on doorways that must not cut off any room; the traitor win is a path between the Twins through every Node and at least 20 rooms, which is a hard search and is under-specified | Bespoke function for the path check, after a project ruling on what "touches" and repeated rooms mean | custom |
| 92 Ghost at the Finish Line | Gifts are matched against criteria the players wrote; the game ends when no room can be placed anywhere | "Players decide" for the matches; "no legal placement left" is a board query | data + small function |
| 93 Owl's Moving Castle | The house sits on a bounded table; tiles move toward an edge and fall off under several legality rules; Owls fly over empty grid cells | Bespoke function, plus a board model with grid cells and table bounds that only this haunt needs | custom |
| 95 Nanny, Interrupted | A perimeter of outside spaces around the ground floor with window entry and line of sight; heroes carried as cargo; an attack that interrupts a hero's move; the traitor is the oldest real player | Bespoke function for the perimeter; carrying and interrupts reuse the carried status and off-turn decisions; "players decide" for the age | custom |
| 99 The Manor of Your Demise | A real-time deadline; the haunt rewinds the game to pre-haunt exploration and can recurse | One-off engine support: a clock event delivered by the server, and a "return to exploration" step with a haunt-selection override. The haunt itself is then small | custom |
| 100 Let's Play a Game | 24 Challenges, each its own scripted effect; a secret simultaneous vote forms teams; several winners | Bespoke functions, one per Challenge; a third fit one roll-then-fetch template | custom |
| star Seasons of the Witch | Twelve Months, each a small haunt with its own rules, then a boss fight; a gate on the cross-game record; the whole house built with rotations; October removes rooms and reconnects the rest | Bespoke phase driver over kit parts (each Month is mostly data); persistence and the gate are engine capabilities | custom |

## 6. Recommendations for the engine design

### Build into the core from the first base-game build

These are needed by many haunts, base included, and are expensive to retrofit:

1. **The override points of section 2,** as a fixed set of named questions each taking the whole state and a subject, with base answers from `rules.md`. Combat (combatOutcome, canAttack, attackTrait, dicePool) and death (lethalOutcome) come first: they are the most-used and run through every attack.
2. **Events and conditions** as two trigger kinds, both firing with the rule that caused them so the log can explain them.
3. **Side as a changeable property of each player,** the traitor as a role, results as a set of winners, and turn order derived from sides. Eleven base haunts already need conversions, no traitor, hidden traitors or per-player winners.
4. **Seats and figures separated:** a turn belongs to a seat; a seat may control zero, one or several figures, including monsters; any seat may be asked to decide off-turn.
5. **The board as state** with both adjacency queries, line of sight, distance by route, and edges that tokens can sit on. Room removal and flipping are needed by base haunts 2, 18, 22 and 50.
6. **A structured event history**: damage with its source, deaths with killer and cause, and per-turn actions.
7. **Per-player visibility** in `viewFor`, down to individual tokens (base haunts 41 and 43 already need it), since the public-state model puts all secrets in the row.
8. **Token supply counts,** so a haunt can run out (11 base haunts touch the limits).
9. **The parts most haunts use:** count expressions, find-a-named-room setup, placement rules, monsters with movement policies (chase, toward a room), statuses, haunt objects, timers and counters, objective actions, the standard win conditions.

### Can wait for Widow's Walk

- **Tile operations beyond flip and remove:** move, rotate, stack, build the whole house, with a connectivity validator (52, 76, 80, 86, 93, star).
- **Tokens hidden from their own holder** and one-to-one reveals between players (81, 83, 97).
- **The traitor role moving between players** (67, 90, 94).
- **The "players decide" decision type** (two base uses, 20 and 39, can be a free choice of any legal room until then).
- **Persistence across games** (57, 75, 86, 93, star). The save format must be versioned from the start, as CLAUDE.md already says, but the record itself is Widow's Walk.

### One-offs: keep them inside their haunt

- Figures standing in doorways and a vehicle (35).
- A bounded table and grid cells (93).
- The outside perimeter (95).
- The wall clock and the nested game (99).
- Twelve Month phases (star), 24 Challenges (100), ten Props (51), the Twins' path search (79).

Each needs a haunt-local function. Where a one-off needs engine support (the clock for 99, grid cells for 93), give it a narrow, general hook rather than a branch on the haunt.

## 7. Content gaps the survey found

| Gap | Needed by | Recommendation |
|---|---|---|
| Room artwork (what each tile pictures) | 64, 76 | Don't catalogue it; use "players decide". Catalogue it only if bots or AI players must play these haunts |
| Which rooms are outside rooms | 13, 18, 31, 35, 95 (some base haunts give their own lists) | Add an outside flag to each room in `rooms.md`, from the Widow's Walk glossary list |
| Which rooms have a drawer | 60 | No source defines it; needs a project ruling or "players decide" |
| Drop, trade and steal restrictions as structured fields | 92, 94, 95, and every haunt that restricts transfer | The cards state them in prose only ("can't be dropped, traded, or stolen"); `cards/` labels carry Weapon and Companion only. Add structured flags |
| Hobby matching | 24, 32 | Whether "Gaelic Music" counts as the Music hobby is unresolved in haunt 32's note |
| What the star haunt's record is keyed by | 57, 75, 86, 93, star | "Your explorers" may mean the characters or the players; unresolved in `widows-walk-rules.md`. Settle it before designing the persistent record |
| Whether 99's "last timer" outlives the game | 99 | Settle it before implementing the haunt |
| Real players' data (age) | 95 | Not content: a setup input, or "players decide" |
| Token shortfalls | 11 (purple tokens with the Widow's Walk window rooms), 34 (more Keys than numbered item tokens), 89 (no Speed Roll tokens) | Already noted in `tokens.md`; the engine must decide whether a digital game keeps the physical limits |
| Rules gaps the books leave open | 12 (a dead hero's goal), 55 (Hoplite movement), 72 (the second phase), 79 (the path), 82 (police arrive with no alibi and no Rope), 87 (finding the Headmistress), 89 (Denizen movement), 98, 100 | Widow's Walk notes aren't researched yet (per CLAUDE.md); settle these before implementing the haunt |

Already present: explorer sex, age, hobbies, birthdays and card colour (`characters.md`), window edges, dumbwaiter marks and floors (`rooms.md`), token supply counts (`tokens.md`), the Fiend's name table (78) and the aging table (44) in their haunt files.
