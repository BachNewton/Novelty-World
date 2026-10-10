# Presentation

How the game looks and is played on screen. The game is played in the 3D house: each room tile a little room, seen as a dollhouse with the walls nearest the camera cut away, with one status box beside it. The project's `CLAUDE.md` holds the standing rules ("Visual style", "Presentation and input", "Hot-seat"); this file holds the design behind them, and marks what is still open. `v1-play.md` is the plan that builds it, and says what is built.

## The screen: the house and one status box

The engine already shapes the UI: at any moment there is one pending decision, with plain-language choices, and every event names the rule behind it. A physical board can't do that, so the UI leans on it.

- **Decisions about places live in the house only**, with no list: the rooms you can reach glow, an unexplored doorway glows, a tile to place shows as a ghost on its cell. A choice on another floor shows as its staircase glowing on this floor. Picking one is the same action on every input.
- **Everything else is in one status box**, in three parts:
  - **What happened:** the latest events, in plain language.
  - **Why it happened:** the rule behind each, a room, card, haunt or rulebook rule, as its short plain text with its source named ("Junk Room: roll Might to leave"). The full text and its rulings (the "why?" content from `data/rule-notes.json`) are a tap away.
  - **What you can do now:** the seat named, the prompt, the choices that aren't places, and End turn. This part is the strongest and stays in view.

  The box is how "every rule the engine applies is explained in plain language as it happens" is kept without a log.
- **No game log panel in v1.** Explanations live in the moment, in the status box. The debug view (`?debug`) keeps its full log.
- **Controls never change meaning with what's under the cursor.** The mouse wheel always zooms, even over the rotation ghost.
- **Preview before commit.** Pointing at a choice shows what it would do before anything is sent: the ghost turned the way it would be placed, and, from v1 phase 2, a move's route (below). There is no undo: a step is a recorded action, and a roll is seeded by the decision it answers.

**Pacing:** automatic beats play by themselves, with a speed setting, and a card's text waits for a tap. Input always fast-forwards whatever is playing; nothing waits on an animation.

## Input

**Three input methods**, interchangeable, each picking among the pending decision's choices: a controller, touch, and keyboard + mouse (one method, the two used together; there is no keyboard-only mode). Hints follow the last-used input. Nothing is hover-only, touch targets are measured in screen pixels, and the e2e tests cover all three methods.

| | Controller | Keyboard + mouse | Touch |
|---|---|---|---|
| Selection | a reticle at the screen's centre, snapping to the nearest legal choice | the cursor (hover, click) | tap to focus, tap again to confirm |
| Pan | left stick | WASD or the arrows | one-finger drag |
| Turn | right stick across | Q / E, or right- or middle-drag | two fingers' midpoint moving sideways |
| Tilt | right stick up and down | T / G, or right- or middle-drag | two fingers' midpoint moving up or down |
| Zoom | RT in, LT out | the wheel | two fingers' spread |
| Floors | d-pad up and down | PgUp / PgDn, or R / F | on-screen floor buttons |
| Next or previous choice | RB / LB | Tab | |
| Confirm, back | A, B | click (or Enter), Esc | tap |
| Turn a ghost tile | LB / RB, or d-pad left and right | Q / E | on-screen buttons |
| Recentre | Y or R3 | C or Home, and an on-screen button | an on-screen button |
| The status box | View moves into it and out; X ends the turn | click | tap |
| Raise the walls | hold L3 | hold V | hold the on-screen Walls button |

Two fingers are one combined gesture: turning, tilting and zooming happen at once, each starting past its own small threshold, and there is no twist. The art bench uses the same scheme.

## The camera

A free strategy camera, in the style of Cities: Skylines and XCOM: a target point on the floor, turned round the vertical, tilted from near eye level (about 9°) to near top-down (80°), and zoomed. It never drops below 2.2 m above the floor, so fully zoomed in the lowest tilt rises to about 12°, looking over the furniture rather than into it. Zooming never changes the tilt. The reticle snaps within 48 px.

- **The player owns the view.** On a game event the camera only pans to the subject, keeping the player's turn, tilt and zoom; recentring does the same.
- **Recentre** returns to the active explorer's room and floor, on every input, so a player is never lost.
- **Floors** change by the player's hand, and follow an explorer only when the explorer takes the stairs. The game never overrides a floor the player picked.
- The cutaway, the reticle and picking hold at the lowest tilt.

## Moving

Movement follows the rules: up to Speed in spaces a turn, a stair step costing one. Movement is spent freely around actions until the turn ends, and the movement left is shown. **End turn is a separate, explicit action**, never automatic: a turn with nothing left waits for it, with a hint ("No moves or actions left: End turn"). Drawing a card or failing a barrier roll ends movement, with a note in the status box.

**Targets.** Every reachable room is a target, and so are the doorways further on ("walk there, then explore"). A route stops at anything chance decides (a roll, a card draw, a question). Crossing a barrier room is an engine action, so routes never cross one. RB and LB step through the choices in an order fixed until the choices change.

**The route preview:** pointing at a target shows its route, its cost ("3 of 4 spaces") and every rule it would trigger on the way. The warnings come from what the engine actually does on the way, never from a list of room names. Room damage at the end of a turn gets no warning: the engine applies it at turn end, not on the way. The preview is one small serialisable value (the target, the figure, the route, the spaces, what is left, the warnings), worded on the screen that receives it, so it can be broadcast to other players online. The route's tag stays inside the screen's edges.

**Committing** sends the route's actions one at a time, and drops the rest when the pending decision changes. The walk plays after the state has moved, and any input skips it. The floor follows the explorer's stairs.

## Placing a room

A discovered room shows as a ghost of the actual room on its cell, with each doorway marked at its edge by what it would do (joins a door, faces a wall, opens onto the unexplored). The player turns it through its legal ways round, then places it. A room that fits only one way is placed by the engine and shown as the tile appearing, with no prompt. Rooms that cards and rooms move (the Mystic Elevator, The Beckoning) use the same ghost, with the cells they may go to glowing.

## Dice

The engine makes the randomness, so there are no physical or 3D dice and no thrown-dice animation. A roll still shows: each die's value (0, 1 or 2), the total, and the outcome worded for what it means, a pass or fail against the target, a damage amount, the haunt roll against the omens, an attack's comparison. A reroll card (the Lucky Stone, the Rabbit's Foot) picks from the dice shown, with no special case.

## Cards

The card sort (`card-presentation.md`) sorted all 110 cards by how they show in the house, and is the direction:

1. **A draw is an in-world beat**: the card's name as a title over the room, in its colour (amber for an item, violet for an omen, an event's mood colour), the effect playing out in the room, the result shown, and one caption line. Most events and every card that never needs reading take no panel.
2. **Held cards live on the figure**: items and omens carried, companions beside it. Tap a figure to fan out its cards with their text.
3. **Reading happens at the point of use**: a card that applies surfaces as an offer with a one-line consequence ("Idol: +2 dice, −1 Sanity").
4. **A panel only where nothing else works**: the 15 each-use cards whose odds table is the decision, deck searches and peeks, trait picks, and cards with several written options.
5. **Kept statuses are a mark on the figure**, the way out a tap away. Debris and Webs offer "free them" to explorers in the same room.

## Stats

Hidden by default and shown when useful: in a roll's prompt, on the damage tracks, as a float on a gain or loss. Holding a key, a button or a long-press overlays every explorer's stats over the figures. More of it is contextual after the haunt.

## Actions

How the turn's actions that aren't places are offered depends on the input and the action (keys, the pad's face buttons or a radial, a touch near the explorer, a mouse context menu), and needs its own design pass. Until then they are buttons in the status box, with End turn reachable on every input.

## Haunt selection

Choosing the haunt is a feature. At setup a game is set to "as the rules decide" or to one chosen haunt; at a reveal that lands on an unbuilt haunt, the game offers the built ones. The traitor comes from the chosen haunt's rule.

## Live previews online

When online play comes, other players see the acting player's preview before it is committed (the focused choice, the route and its warnings, the ghost being turned, a trade being built), so a game feels live and players wait less. A preview is ephemeral UI state, never game state: never stored and never validated, sent on change over a Supabase Realtime broadcast channel on the same connection as the game-row subscription, and dropped on commit, on a change of decision and on disconnect. It must never leak a secret: only public decisions are broadcast, filtered by the per-seat view. Monopoly showed the value of the same idea (property management and trades). PeerJS stays a known upgrade path only if previews ever feel laggy.

## The house

### The cutaway

Every wall between two rooms is cut down to a 45 cm stub from every view; only the outside walls at the back of the house stand full. When an explorer first enters a room, the camera shows it close with its back walls up, so its wall art is seen once; the moment plays on the first visit only and can be skipped, and a room may name its best angle for it. Most of the time a room is read from its floor and what stands below the cut height.

**Walls under the cutaway.** A wall's meaning to the rules survives the cut, on the stub, the floor or an icon (the research is in `cutaway-research.md`). Decided, with no switch:

- **Doors:** a lit amber threshold strip in the gap.
- **False doors** are boarded: a shut leaf with boards across it, and boards across the cut stub's top, so it reads from every view.
- **Windows:** a frame and glass strip on the stub's cap, and a pool of window light on the floor. The stage draws the pool; rooms don't draw their own.
- **False windows** are boarded, and let no moonlight in.
- **The stub's cap** is light stone.
- **Raise the walls** by holding a key, a pad button or an on-screen button (see "Input"). The walls snap back, with no fade or hysteresis: a fade isn't cheap.

Still open: markers for secret passages and switches, stairs showing their destination floor with an icon, highlighting a wall a haunt cares about, and a fade.

### Connections

A door against a neighbour's wall is a false door, and a window against a neighbour a false window. False doors are a game mechanic (haunts 76 and 80 make them passable, and they reopen if a neighbour moves), and whether a window faces outside matters to many haunts and cards, so both are drawn boarded, as generic stage pieces (see "The cutaway"), never dropped.

Connections that aren't doorways (the Secret Passage and Secret Stairs, the Wall Switch, the Revolving Wall, the Mystic Slide, the Coal Chute, falling through a floor) need a visible look of their own, as room features.

### A layout that changes

The layout changes during play (the Mystic Elevator, "What The . . . ?", haunts 52, 80 and 93), so the house never assumes a fixed one: it rebuilds walls, the cutaway and the baked light on any layout change. Rooms need one generic ruined state (collapsed, burned or flipped), built on the shared stage when the first haunt needs it.

### Light

The house is lit by baked light: lamps' light and shadows baked into each room's lightmaps, with one bounce of indirect light, and only what moves lit live, from light probes. Light spills through doorways into the next room, and a room and its neighbours re-bake when the layout changes. The house owns the fill, the fog and the moon; the moon comes only through real windows. There are no graphics settings or quality tiers: the technique is what keeps it fast. `lighting.md` holds the lighting in full: the bake and its passes, probes, fakes, budgets, and how a new effect chooses between baked, live and faked.

**Colour has a meaning**, in light, glows and decals alike:

| Colour | Means |
|---|---|
| Cold moon blue | the baseline: night, the house itself |
| Warm amber | human and safe-ish: candles, lamps, explorers |
| Sickly green | the supernatural |
| Red | danger, blood, the traitor |
| Violet | magic and omens |
| Gold | the holy: the Blessing, the Holy Symbol, the Chapel |

Lean into coloured, dynamic light, faked where it can be (glows, additive pools, lights that last a second or two). Only permanent signature lights count against a room's budget. The opportunities:

- signature room lights (the Furnace Room, Pentagram Chamber, Underground Lake, laboratories, Conservatory, the charred and bloody rooms, Graveyard, Ballroom);
- event moments (Lights Out, Burning Man, Bloody Vision, Shrieking Wind, Night View, A Moment of Hope, Mists, Smoke, Image in the Mirror, Possession, The Beckoning);
- carried lights (the Candle, glowing omens);
- an omen draw pulses the house's light, for the haunt roll;
- the haunt reveal shifts the whole house's light, and the traitor's colour marks them and their monsters;
- storm lightning through the windows, house-wide.

A room may carry slow, quiet "something's wrong" motion (the Foyer's chandelier, the Upper Landing's rocking chair).

### Figures in rooms

Explorers are miniatures on a base ringed in the player's colour, which is the character card's; the active explorer has a soft warm light from above. Nothing on an explorer glows; a monster may.

**Standing spots.** Each room defines six standing spots (the prime spot and five more), chosen by whoever designs the room where they make sense in it. The house fills them in order, and the first is the prime spot, for the active explorer. Each spot is clear for a base and reachable from the doors, and the spots stand at least a ring's width apart beyond two ring radii (`SPOT_SPACING`), so colour rings never touch. Figures past the six take the room's overflow places, free floor where bases don't touch though rings may overlap; how many a room has depends on its floor. Filling a room past its capacity is an error for now. What should happen instead is the owner's call, settled at the first haunt that can overfill a room, together with how a large monster fits a crowded one. A figure's colour ring writes no depth and draws after the room, so overlapping rings never fight.

**Walking.** A room may give walking lanes where a straight walk would be blocked, and a barrier room a crossing path. A crossing is walked; a failed crossing shows nothing. A crossing always walks for now, though heroes should run it after the haunt.

**Batching and cloth.** A figure's parts are drawn in a batch per material. Cloth (robes, skirts) follows the legs through a smoothed window that doesn't depend on the frame rate, shared by every figure and held to a smoothness test. The look of Zoe's skirt and Father Rhinehardt's robe needs another pass, tabled by the owner.

**Size classes.** A figure is small (swarms and animals), person-sized (explorers, companions, most named monsters, zombies and cultists) or large (the Spider, the Dragon, the Demon Lord, the Ouroboros heads: four or five figures, each in one haunt). A figure is never shrunk to fit, no room needs a reserved large spot, and furniture never fades out of the way. A big monster takes a spot and may spread to its neighbours. How a large monster fits a crowded room waits for the first haunt that has one; the lead idea is a per-monster "crowded pose" (the Spider coiled), used when its full spread doesn't fit. A swarm is one instanced group clustered round a spot.

**Gait.** Every figure walks at one speed (1.5 m/s) and runs at one speed (3.6 m/s); a figure's stride and cadence show its character, never its speed. Before the haunt everyone walks; slow exploration adds to the atmosphere. After the haunt starts, heroes run and the traitor walks calmly; in a hidden-traitor haunt everyone runs, because a gait must never give away hidden information. Monsters move their own way.

**Animations**, in priority order: the walk (through doorways, up and down stairs); a startle on discovering a room; physical and mental hurt; attack and defend; death; the traitor's turn (optional). No item pickups or celebrations.

## Art scope

**Built:**
- **25 rooms:** the starting tile (the Entrance Hall, Foyer and Grand Staircase), the Upper Landing, the Chapel, Library, Master Bedroom, Mystic Elevator, Chasm, Furnace Room, Kitchen, Graveyard, Underground Lake, Basement Landing, Stairs from Basement, Wine Cellar, Creaky Hallway, Dusty Hallway, Statuary Corridor, Junk Room, Attic, Pentagram Chamber, Catacombs and Tower, and the Drawing Room, a Widow's Walk tile kept as the reference room.
- **4 explorers:** Professor Longfellow, Ox Bellows, Zoe Ingstrom and Father Rhinehardt, sculpted as smooth forms, with arms that hold things, an idle, a walk and a run. Every other character stands as a pawn in their seat's colour.
- **2 monsters:** the Banshee and the Spider.
- **Stand-in props:** a revolver, a candle (carrying a live light) and a spear.

**Next:** the remaining base rooms and explorers (`v1-play.md` lists them), one agent per room or per small group that must match, and one per figure; room features (the non-doorway connections); then monsters, carried props, companions, room tokens and body states as the cards and haunts need them. Widow's Walk rooms, cards and art wait for the base game.

**In numbers**, counted from `content/`:
- **Rooms:** 67 tiles across the base game and Widow's Walk. Some are outdoors (gardens, graveyard, patio, balcony, roof); an outdoor tile's edge style is its own (railings, hedges, a balustrade), and an indoor wall beside one is cut like an interior wall.
- **Explorers:** 12 characters. The board game shares one figure between a card's two characters; here each has their own.
- **Named monsters:** 12 base and 5 Widow's Walk. Built bodies (the Mummy, Frankenstein's Monster, the Zombie Lord, Dracula) come easily; the Dragon is hard, like the Spider.
- **Ordinary monsters:** open-ended. On cardboard, 91 numbered tokens serve every haunt, and each haunt decides what they are (zombies, bats, frogs, rats, cultists); each kind needs its own figure. The haunt survey is where to count them.
- **Cards, companions, tokens and body states:** see `card-presentation.md`.
- **Haunt objects and item piles:** each haunt names its numbered objects.
- **Flat art:** character portraits, icons for the four traits, the three card types, damage and stunned; haunt screens can stay mostly typographic.

## Open questions

- **One device per player, a shared screen with phones as controllers, or both**, once online play comes. A TV could show what everyone may see (the house, whose turn it is) as a spectator client of the game row, while each phone renders its own seat's `viewFor`: its cards, its choices and, after the reveal, its side's half of the haunt. That suits the server-authoritative design and the traitor's secrets, and could sit beside one device per player.
- **The layout on phones and on wide screens**, around the status box: how much of a phone it may cover, and what extra width shows.
- **How the turn's actions are offered on each input** (see "Actions").
- **How a large monster fits a crowded room**, and **what happens when a room is overfilled**, at the first haunt that can do either.
- **The lake's water look:** `shader` or `shader-palette` (`?water=`).
- **Whether to brighten a figure lit only from behind.** Bounce light now gives figures some fill from below.
- **Whether the rotation ghost reads clearly enough as "not placed yet".**
