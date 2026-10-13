# Presentation

How the game looks and is played on screen. The game is played in the 3D house: each room tile a little room, seen as a dollhouse with the walls nearest the camera cut away, with one status box beside it. The project's `CLAUDE.md` holds the standing rules ("Visual style", "Presentation and input", "Hot-seat"); this file holds the design behind them, and marks what is still open. `v1-play.md` is the plan that builds it, and says what is built.

## The screen: the house and one status box

The engine already shapes the UI: at any moment there is one pending decision, with plain-language choices, and every event names the rule behind it. A physical board can't do that, so the UI leans on it.

- **Decisions about places live in the house only**, with no list: the rooms you can reach glow, the empty cell beyond an unexplored doorway glows as a faint room outline, a tile to place shows as a ghost on its cell, each side of a barrier room is its own half of the tile, a wall or corner of a room (where a card puts a token) is a pad on the floor against it with the token shown there when focused, and a figure a card or attack names is the figure. A choice on another floor shows as its staircase glowing on this floor. Picking one is the same action on every input.
- **Everything else is in one status box**: what you can do now, and at most one line for the beat playing. A player is not playing to read: ordinary play shows, and the text is there when they want the detail.
  - **What you can do now:** the prompt and the choices that aren't places (a roll, damage, a card's question, a trade offered to you), and End turn, always in reach. The turn itself has no prompt: its places glow and End turn is there. The seat is named only for a question put to a seat other than the turn's, mid-turn; the seat's button at the top left names the holder. Of the turn's actions, the box offers only those needed often, and only where they apply: Pick up, a held card's uses, and a haunt's actions. Drop and trading are on Your explorer's sheet only.
  - **The line:** the beat playing, in icons where icons say it (a roll's die faces turning up, its total and mark; damage on its tracks), or else in a few plain words. It stays until the next write's beats begin. There is no history list, and no line for what the house already shows: walking in, discovering, a room placed the only way it fits, a card drawn (its title is over the room), a trait gained or lost (it floats over the figure), the turn passing.
  - **Why:** one button beside the line opens the rules behind its beat, or, with nothing playing, behind the pending decision (the card that asked a roll): each named by its source (a room, card, token, haunt, or the rulebook's section, never a page number), in a plain sentence, then its full text and every ruling on it (`data/rule-notes.json`). A beat with several causes lists them all. While Why is open the beats wait between two, so reading never costs a beat. On a pad it is a box button, reached with the d-pad and pressed with A; on the keyboard H, or a click; on touch, a tap.
- **No game log panel in v1.** The events stay in the game's data, and the debug view (`?debug`) keeps its full log.
- **Show before telling.** The house or the board shows a thing first, then an icon, and text only for what only text can explain. The rule behind an event is a tap away, not shown by default.
- **One meaning per control** (see "Input"): the mouse wheel always zooms, even over the rotation ghost.
- **Preview before commit.** Pointing at a choice shows what it would do before anything is sent: the ghost turned the way it would be placed, and, from v1 phase 2, a move's route (below). There is no undo: a step is a recorded action, and a roll is seeded by the decision it answers.

**Pacing: the text and the house are always in step.** The presenter cuts each write into beats in the order its events happened, each naming the events it shows, and every event belongs to one beat or to none (bookkeeping with nothing to show is silent). A discovery plays as walking in, the card for each symbol, what the card did, then the room's own rule if it does something; a turn's end plays before the next turn's light; the haunt roll before the house turns to the haunt. The beat playing is the one source of truth for what the screen tells: the box's line, its Why, a card's title and the floats over the figures, so **the box never tells an event before its beat plays in the house**, nor after. A figure whose walk is still to come stands where it was until its beat, and a walk always runs from where the figure was shown, even when its discovery spans several writes.

A beat lasts as long as what it shows, and nothing waits with nothing to see: a walk, at the explorer's Speed; a room carried by a rule; a roll's dice turning up in its line; a gain or loss rising over its figure; a card's text, until a tap. A line with nothing else to show holds nothing up. The next tiles of the room stack have their floors read ahead, so walking into a room just discovered never waits on one. A speed setting scales the beats' own timings, not the walks. The game's state never waits on an animation, but **the story comes before the next choice**: a decision's choices appear the moment the beats leading to it have played or been skipped, an input during a beat only skips them, never also answering, and what caused a new decision (a card's title over its room) stays in view until its choices appear.

## Input

**Three input methods**, interchangeable, each picking among the pending decision's choices: a controller, touch, and keyboard + mouse (one method, the two used together; there is no keyboard-only mode). **Each is complete on its own**: a controller never needs touch, the keyboard or the mouse, and every feature works natively on all three; the art bench and `?debug` are exempt. An audit and a controller-only e2e game through the reveal hold it. Hints follow the last-used input. Nothing is hover-only, and touch targets are measured in screen pixels.

**One meaning per control.** A control means one thing everywhere, never changing with what is under the cursor or what is open. There is one focus at a time, on a choice in the house or a button over it, and confirming presses it. Hints are glyphs on the thing they act on, drawn as games draw button prompts, our own drawings on their conventions (`components/prompts.tsx`, the single map from a meaning to its control on each input): each glyph is the control's own shape (a keycap, a bumper, a trigger, a stick, the d-pad, View and Menu, the mouse) with its label filling it, near-black with a pale rim and label, and the face buttons Xbox's coloured discs (prompt tokens, which name a button and never a meaning); there are no per-decision hint sentences, and no sentence restates what a glyph or a hold's fill already shows. Touch has no glyph, since the control is the tap target. A glyph shows only where the control isn't obvious: confirming the focused thing (A, Enter) and closing the topmost one (B, Esc) show none, so what matters there is seeing clearly what has the focus. Every glyph is one system: sized to the text beside it, reading on any background through its dark body and halo, and leading the label inside the button it presses (a pair that steps through a group, LB and RB, flanks it). A hold that acts when complete, End turn, fills its button's background from the left while held and empties when let go early.

The controller map, with its counterparts:

| | Controller | Keyboard + mouse | Touch |
|---|---|---|---|
| Point at a choice | a reticle at the screen's centre, pointing at what's under it | the cursor | tap to focus |
| Press the focus | A | click, Enter or Space | tap the focused choice again, or tap a button |
| Back | B closes the topmost thing open, or clears the focus | Esc | the open thing's close button |
| Step through a row's choices (a ghost's ways round among them) | d-pad left and right | Tab and Shift+Tab | tap the choice; the ghost's turn buttons |
| Between rows, or scroll a long text | d-pad up and down | Tab, the wheel | tap; drag to scroll |
| Pan | left stick | WASD or the arrows, or a left-drag | one-finger drag |
| Turn | right stick across, as if dragging the house | Q / E, or a right- or middle-drag | two fingers' midpoint moving sideways, half a turn per screen width |
| Tilt | right stick up tilts towards eye level | T / G, or a right- or middle-drag | two fingers' midpoint moving up or down |
| Zoom | RT in, LT out | the wheel, + / − | two fingers' spread |
| Floors | LB down, RB up | PgDn / PgUp, or F / R | on-screen floor buttons |
| End turn | hold X | hold Backspace, or click End turn | tap End turn |
| Why, the rules behind the box's line | the box's Why button: d-pad into the box, then A | H, or click Why | tap Why |
| Your explorer | Y | I, or click the seat's button, a mark or a nameplate | tap the seat's button, a mark or a nameplate |
| Follow the active explorer | View | C or Home, or the on-screen Follow button | the on-screen Follow button |
| The game menu | Menu, on any pad | M, or its button | its button |
| Raise the walls | hold L3 | hold V | hold the Walls button |
| Details | hold R3 | hold Z | hold the Details button |

The seat's button at the top left opens Your explorer and counts the turn's actions on it ("Y Zoe Ingstrom · 3 actions"); the status box has no second way to it. Ending the turn is a hold on a pad and the keyboard, because there is no undo and with several pads a stray press would pass the device. Menu opens the game menu from any pad, even one that may not act now, and does nothing at setup, where Start is a button like any other. A seat is called by its character everywhere, so setup has no names to type. The input last used is the device's, carried from setup into the game: a pad's focus and prompts show at setup the moment the pad is noticed, and a press that only brings the focus into view does nothing else. A mouse drag orbits at 0.004 radians a pixel, and a two-finger tilt shares it. Two fingers are one combined gesture: turning, tilting and zooming happen at once, each starting past its own small threshold, and there is no twist. The art bench uses the same scheme.

## The camera

A free strategy camera, in the style of Cities: Skylines and XCOM: a target point on the floor, turned round the vertical, tilted from near eye level (about 9°) to near top-down (80°), and zoomed. It never drops below 2.2 m above the floor, so fully zoomed in the lowest tilt rises to about 12°, looking over the furniture rather than into it. Zooming never changes the tilt. Fully zoomed in (8), half a room spans the screen's short side. The reticle points at exactly what is under the screen's centre, picked the same way as under the mouse cursor, with no magnetism or sticky focus: to point at something small, the player zooms in. Moving off every choice clears the focus, as the mouse leaving one does.

The camera has **two modes**, as Monopoly's board does, kept as local UI state and never game state (`art/camera-follow.ts`):

- **Following** the active explorer: the camera's target tracks them, smoothly through their walks, onto another floor when they take the stairs, and to the turn's beats about them (a room appearing, a card drawn, a room carried by a rule, a ghost tile to place), then back to them. A figure walking is followed until it arrives. The game starts following.
- **Free**: the camera is the player's alone, and nothing in the game moves it, not even a card's beat elsewhere: the beat plays where it is, and the status box still tells it. A ghost tile is the player's own decision in hand, so its floor still shows.
- **What frees it**: panning (the left stick, WASD or the arrows, a left-drag, a one-finger drag) and changing floor by hand (the bumpers, PgUp/PgDn or F/R, the floor buttons). Turning, tilting and zooming never do: while following, they orbit and zoom round whatever is followed, as a strategy game's "follow unit" camera does.
- **Follow** (View, C or Home, the on-screen button) reattaches whenever the player wants: following again, the camera glides to the active explorer and their floor. The button is lit while following, so the player always knows which mode they are in.
- **A new turn reattaches**: in hot-seat the device has just passed to the next player, who expects to see their own explorer. A question put to another seat mid-turn changes nothing.
- **The player owns the angles.** The game only ever pans: following moves only the target, and the turn, tilt and zoom are the player's alone, never changed by a beat.
- The cutaway, the reticle and picking hold at the lowest tilt.

## Moving

Movement follows the rules: up to Speed in spaces a turn, a stair step costing one. Movement is spent freely around actions until the turn ends, and the movement left is shown. **End turn is a separate, explicit action**, never automatic: a turn with nothing left waits for it, with a hint ("No moves or actions left: End turn"). Drawing a card or failing a barrier roll ends movement, with a note in the status box.

**Targets.** Every reachable room is a target, and so is every empty cell beyond an unexplored doorway, here or further on ("walk there, then explore"): the whole cell, because the player means "go into whatever is over there". A cell beside several such doorways is one target, explored through the doorway with the cheapest route, the room the explorer stands in first on a tie, then a fixed order. The cell shows no doorway mark: the route preview's dotted path, which always means "you'll take this path to go here", runs through the chosen doorway into the cell. A player who wants another way in splits the move into smaller steps. A route stops at anything chance decides (a roll, a card draw, a question). Crossing a barrier room is an engine action, so routes never cross one. The d-pad's left and right (Tab on the keyboard) step through the choices in an order fixed until the choices change.

**The route preview:** pointing at a target shows its route, its cost ("3 of 4 spaces") and every rule it would trigger on the way. The warnings come from what the engine actually does on the way, never from a list of room names. Room damage at the end of a turn gets no warning: the engine applies it at turn end, not on the way. The preview is one small serialisable value (the target, the figure, the route, the spaces, what is left, the warnings), worded on the screen that receives it, so it can be broadcast to other players online. The route's tag stays inside the screen's edges.

**Committing** sends the route's actions one at a time, and drops the rest when the pending decision changes. The walk plays after the state has moved, and any input skips it. The floor follows the explorer's stairs.

## Placing a room

A discovered room shows as a ghost of the actual room on its cell, with each doorway marked at its edge by what it would do (joins a door, faces a wall, opens onto the unexplored). The player turns it through its legal ways round, which are the decision's choices and step like any others, then places it. A room that fits only one way is placed by the engine and shown as the tile appearing, with no prompt. Rooms that cards and rooms move (the Mystic Elevator, The Beckoning) use the same ghost, with the cells they may go to glowing. A ghost only ever means "not yet placed": a room placed, or carried by a rule, shows solid at once in a flat moon light until its baked light lands (`lighting.md`).

## Dice

The engine makes the randomness, so there are no physical or 3D dice and no thrown-dice animation. A roll still shows: each die's value (0, 1 or 2), the total, and the outcome for what it means, a pass or fail against the target, a damage amount, the haunt roll against the omens, an attack's comparison: as die faces and icons where icons say it, with a short note only where they can't. A reroll card (the Lucky Stone, the Rabbit's Foot) picks from the dice shown, with no special case. Before a roll the box offers Roll and each card that acts on it once, with the card's consequence said once; a card whose options differ only by the number they name (the Angel Feather's result, 0 to 8) opens one row of those numbers, each previewing what it would mean (a pass or fail, the damage) in icons.

## Cards

The card sort (`card-presentation.md`) sorted all 110 cards by how they show in the house, and is the direction:

1. **A draw is an in-world beat**: the card's name as a title over the room, in its colour (amber for an item, violet for an omen, an event's mood colour), the effect playing out in the room, the result shown, and one caption line. Most events and every card that never needs reading take no panel.
2. **Held cards live on the figure**: items and omens carried, companions beside it. Until their 3D props are built, a mark under each explorer carries the seat's dot and a pip per card in the card's colour, drawn smaller as the camera zooms out; choosing the mark or the nameplate opens the explorer's character card with its cards and their text (see "Stats").
3. **A card on the floor is a thing in the room**: dropped, it lies on its plate in its colour (see "Things in rooms"), pointing at it names it, choosing it reads it, and Pick up is offered there and on the explorer's sheet alike.
4. **Reading happens at the point of use**: a card that applies surfaces as an offer with a one-line consequence ("Idol: +2 dice, −1 Sanity").
5. **A panel only where nothing else works**: the 15 each-use cards whose odds table is the decision, deck searches and peeks, trait picks, and cards with several written options.
6. **Kept statuses are a mark on the figure**, the way out a tap away. Debris and Webs offer "free them" to explorers in the same room.

## Stats

Hidden by default and shown when useful: in a roll's prompt, on the damage tracks, as a float on a gain or loss, and in the details (below). More of it is contextual after the haunt.

**Details.** Holding R3, Z or the Details button labels what is useful at a glance, and letting go returns the clean house at once (`components/play/details.tsx`): each explorer's mark becomes its nameplate, one size and shape for every explorer whatever their name: the seat's colour down its edge, the short name the card calls them by (`play/short-name.ts`: Flash, Ox, Rhinehardt), the pips, and the stats in brief, each trait's icon and value (in the danger colour on the last step above a live skull); nameplates show only while the details are held; each room on the floor showing is named in ink on a dark plate on its far side from the camera, by its back wall, with where its stairs lead when they go to another floor; and each thing in a room is named where it lies, a room's objects in one list over their spot. The labels come from the seat's own view, like everything else on the screen. The marks and the things' labels are kept apart as the marks are (`art/pins-apart.ts`), and slid back onto the screen whole at its edge; a room's name gives way, drawn under them.

**A trait is a track, as the character card prints it** (`play/tracks.ts`): the character's own values in a row, the clip on its step, the starting step marked, the top as the ceiling, and the skull below the lowest, padlocked before the haunt (when no one can die) and bare after. One track component is used everywhere: on the character card, in a damage preview (where the choice in focus would leave the clip) and, as just the icon and value, in the details. It is HTML and SVG, not 3D.

**The character card** is Your explorer, a sheet over the house, docked in one place whichever tab it shows (a bottom sheet on a phone, a panel at the right on a wide screen, clear of the status box), so switching tabs changes only its contents; the mark of the explorer it shows is lit. A tab for each explorer, then the explorer's portrait, its four tracks and the cards it holds, with their text. Another explorer's tab is for reading only.

## Actions

**Your explorer** holds the turn's actions that aren't places. It opens with Y, I, the seat's button at the top left (which counts the turn's actions), the explorer's mark or its nameplate. On the acting player's own tab, in their turn, the character card carries the actions on fixed rows (`play/sheet.ts`): each card held with its uses, what using one costs, and Drop; each card on the floor that can be picked up; and a trade with each explorer who can. The rows keep the engine's order, never rearranged, so a row stays where the player learnt it. The status box offers only those needed often, where they apply (Pick up, a card's uses, a haunt's actions); Drop and trading are here only. End turn is always in reach.

**Trading** is a sheet of its own: what you give and what you take, a card at most each way and either side empty, previewed as it is built. Offering it puts the question to the other explorer's seat, named in the prompt, which answers Accept or Decline in the status box.

**The game menu** (Menu on any pad, M, or its button) holds the device's setup, not moves: the seats and their pads, the speed of what plays by itself, and leaving the game. Any pad may work it.

## Haunt selection

Choosing the haunt is a feature. At setup a game is set to "as the rules decide" or to one chosen haunt; at a reveal that lands on an unbuilt haunt, the game offers the built ones. The traitor comes from the chosen haunt's rule.

## Live previews online

When online play comes, other players see the acting player's preview before it is committed (the focused choice, the route and its warnings, the ghost being turned, a trade being built), so a game feels live and players wait less. A preview is ephemeral UI state, never game state: never stored and never validated, sent on change over a Supabase Realtime broadcast channel on the same connection as the game-row subscription, and dropped on commit, on a change of decision and on disconnect. It must never leak a secret: only public decisions are broadcast, filtered by the per-seat view. Monopoly showed the value of the same idea (property management and trades). PeerJS stays a known upgrade path only if previews ever feel laggy.

## The house

### The cutaway

Every wall between two rooms is cut down to a 45 cm stub from every view; only the outside walls at the back of the house stand full. A room's walls are seen whole by raising them (hold L3, V or the Walls button); the game never raises them or moves in close by itself. Most of the time a room is read from its floor and what stands below the cut height.

**Walls under the cutaway.** A wall's meaning to the rules survives the cut, on the stub, the floor or an icon (the research is in `cutaway-research.md`). Decided, with no switch:

- **Doors:** a lit amber threshold strip in the gap.
- **False doors** are boarded: a shut leaf with boards across it, and boards across the cut stub's top, so it reads from every view.
- **Windows:** a frame and glass strip on the stub's cap, and a pool of window light on the floor. The stage draws the pool; rooms don't draw their own.
- **False windows** are boarded, and let no moonlight in.
- **The stub's cap** is light stone.
- **Raise the walls** by holding a key, a pad button or an on-screen button (see "Input"). The walls snap back, with no fade or hysteresis: a fade isn't cheap.

**Wall marks** (a picture's ghost, a stain, a scorch, a worn door edge) are painted into the wall's own texture, a shared stage feature (`art/wall-marks.ts`), never hung as geometry, so they fight nothing; a mark above the cut height shows only where the wall stands full. Known gap: a mark also shows on the wall's outer face.

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
| Spectral teal | a haunting: a presence, unease (the Bedroom's glow under the bed) |
| Sickly green | the corrupt: rot, poison, the ghoulish |
| Red | danger, blood, the traitor |
| Violet | magic and omens |
| Gold | the holy: the Blessing, the Holy Symbol, the Chapel |

Lean into coloured, dynamic light, faked where it can be (glows, additive pools, lights that last a second or two). Only permanent signature lights count against a room's budget. The opportunities:

- signature room lights (the Furnace Room, Pentagram Chamber, Underground Lake, laboratories, Conservatory, the charred and bloody rooms, Graveyard, Ballroom);
- event moments (Lights Out, Burning Man, Bloody Vision, Shrieking Wind, Night View, A Moment of Hope, Mists, Smoke, Image in the Mirror, Possession, The Beckoning);
- carried lights (the Candle, glowing omens);
- an omen draw pulses the house's light, for the haunt roll;
- the haunt reveal shifts the whole house's light, and the traitor's colour marks them and their monsters;
- a storm outside, shelved for now (see "Ideas").

A room may carry slow, quiet "something's wrong" motion (the Foyer's chandelier, the Upper Landing's rocking chair).

### Figures in rooms

Explorers are miniatures on a base ringed in the player's colour, which is the character card's; the active explorer has a soft warm light from above, which follows them wherever they stand. Nothing on an explorer glows; a monster may. Every character has a figure of their own, and an explorer's main clothing colour never matches another character card's colour, so a figure is never mistaken for someone else's seat. Colour rings and object plates share one definition (`FLOOR_RINGS`, in `art/room.ts`).

**Where figures stand.** One solver (`art/placement.ts`) places every figure in a room on its free floor, read off the built room. A room gives only its prime place (a barrier room one in each half), and keep-clear areas where it needs them, in front of a signature prop; its doorways and walking lanes are always kept clear. A figure keeps its place until it moves, whoever's turn it is: passing the turn moves no one, and the active explorer is shown where they stand, by their light. A figure arriving takes the prime place if it is free, or else the best free floor (open, near the group, off the lanes). At the start of a game the first player stands on the prime place and the rest follow in turn order. Figures stand apart, colour rings never touching, while the room has room. Past capacity it degrades visibly in steps, never an error: rings overlap (and figures may stand on the lanes); a large figure takes its crowded footprint; then figures stand partly behind each other, in the keep-clear areas too, with a count badge over the room. The worst case's slight clipping is accepted. Every built room holds three explorers apart and six with rings overlapping at worst. A figure's colour ring writes no depth and draws after the room, so overlapping rings never fight.

**Walking.** A room may give walking lanes where a straight walk would be blocked, and a barrier room a crossing path. During a walk the others stand still, so a walk that would pass through a standing figure's base is planned again on the room's free floor with their bases blocked out; when several figures move at once they are planned in order, each round the destinations of those before it. Where no way round avoids a base, the walker squeezes past. A crossing is walked; a failed crossing shows nothing. A crossing always walks for now, though heroes should run it after the haunt.

**Batching and cloth.** A figure's parts are drawn in a batch per material. Cloth is going the way of the net: a position-based simulation of our own (`art/explorers/cloth-sim.ts`), with a fabric per garment (heavy wool for Father Rhinehardt's robe, a cotton dress for Zoe, gauze for the Banshee), carried to the frame's own time. A twirl on the spot is felt fully, while running round a corner stays damped, and the Banshee's shroud is kept off her robe. It isn't perfect, but it is the best so far, and robed explorers build on it. Hair, a doll, scarf ends, stoles and coat tails waiting on strands in the same solver are on the polish list (`v1-play.md`).

**Size classes.** A figure is small (swarms and animals), person-sized (explorers, companions, most named monsters, zombies and cultists) or large (the Spider, the Dragon, the Demon Lord, the Ouroboros heads: four or five figures, each in one haunt). A figure is never shrunk to fit, no room reserves floor for a large figure, and furniture never fades out of the way. A big monster's footprint spreads over its neighbours'. Where its full spread doesn't fit, it takes a per-monster "crowded pose" (the Spider coiled), a smaller footprint; the Spider's coiled pose is footprint-only until it is built. A swarm is one instanced group clustered round its place.

**Things in rooms.** Everything the game leaves in a room is one of three kinds, decided per token kind as data (`play/things.ts`), never by code: an **object** (a dropped card, a haunt's numbered object, a pile, the Closet, Safe or Skeletons), a small model on a plate in its card's colour, placed by the same solver as figures in one more size class: a room's objects cluster on one spot, off the doorways, the lanes and the prime place, and keep it until the last goes, with a count past four; a **room effect** (the Blessing, Smoke, the Drip), light or air sized to the tile; a **connection** (the Secret Passage and Stairs, the Wall Switch, the Slide), a mark on a wall stub or the floor. Pointing at a thing names it and choosing it reads its card over it; a card on the floor offers the turn's Pick up there, the same choice as the explorer sheet's row, and pointing at that row points at the thing. Objects are lit from the probes, never baked. Models are stand-ins until the art wave (`art/things/looks.ts`); each kind has one example built, the Blessing's gold and the Secret Passage's door ajar. Still to design, from the survey of both sets: a whole-room state (collapsed, burned, flipped), a blocker on a door (Locks, Barricades), face-down objects, and a haunt naming the role its tokens play.

**Gait.** An explorer's pace comes from their current Speed, the value their card's clip stands on: Speed is public and decides how far they move, so the house shows it, and an explorer who loses Speed visibly slows. One bounded function maps it, the middle of the tracks' range walking at 1.5 m/s and running at 3.6 m/s, each point of Speed 10% faster or slower, from 0.7 times that pace at the lowest value printed to 1.3 times at the highest. A walk keeps the Speed it started with. Each figure keeps its own step length, so its stride shows its character; its cadence follows the pace, so its feet never slide. Before the haunt everyone walks; slow exploration adds to the atmosphere. After the haunt starts, heroes run and the traitor walks calmly; in a hidden-traitor haunt everyone runs, because a gait must never give away hidden information. Pace never gives it away either: it reads the printed track every seat sees, never a hidden rule's change to the trait. Monsters move their own way, at the house's middle pace, since a monster's Speed can be its own side's secret. The tuning of the speeds is polish.

**Moves a card makes**, agreed in principle and to be confirmed in play: voluntary movement walks before the haunt; a card that makes an explorer flee (Burning Man) may run; jumps and falls get animations of their own; a neutral "put your explorer there" gets a quick transition; the Dog runs.

**Moves that aren't a walk.** Every base-game move other than walking through doorways falls into one of four transitions, shared rather than built per room or card, so no explorer ever pops to a new spot. Until each is built, the move shows as a jump; the room features they pass through (the chute, token marks, the secret door) are drawn with the rooms.

| Transition | What triggers it | How it looks |
|---|---|---|
| **Drop or slide** to a lower floor | the Coal Chute; the Collapsed Room (a failed roll, or a fall on purpose later); the Gallery (to the Ballroom); the Mystic Slide; The Beckoning (a jump out to the Patio) | walk to the edge, chute or window; drop out of sight; the camera follows down; land, staggering where there is damage |
| **Secret way**, token to token or through a hidden door | Secret Stairs; Secret Passage; the Stairs from Basement's secret door to the Foyer; the Revolving Wall | walk to the token or wall, slip through, step out at the other end |
| **The room carries you** | the Mystic Elevator; What The . . . ? | built: the room flies to its new cell with everyone in it |
| **Put there** | Burning Man (flee to the Entrance Hall, running where there is a path); Funeral; The Lost One; The Walls; the Bottle; the Dark Dice's 6 | vanish where they stand, appear at the destination |

The Dark Dice's push and free move and the Bell's pull are always to an adjacent room, so they walk. No base-game omen moves an explorer; the Widow's Walk moves wait for that expansion.

**Animations**, in priority order: the walk (through doorways, up and down stairs); a startle on discovering a room; physical and mental hurt; attack and defend; death; the traitor's turn (optional). No item pickups or celebrations.

## Art scope

**Built:**
- **32 rooms:** the starting tile (the Entrance Hall, Foyer and Grand Staircase), the Upper Landing, the Chapel, Library, Master Bedroom, Mystic Elevator, Chasm, Furnace Room, Kitchen, Graveyard, Underground Lake, Basement Landing, Stairs from Basement, Wine Cellar, Creaky Hallway, Dusty Hallway, Statuary Corridor, Junk Room, Attic, Pentagram Chamber, Catacombs, Tower, Game Room, Organ Room, Storeroom, Bedroom, Abandoned Room, Dining Room and Servants' Quarters, and the Drawing Room, a Widow's Walk tile kept as the reference room.
- **7 explorers:** Professor Longfellow, Ox Bellows, Zoe Ingstrom, Father Rhinehardt, Darrin "Flash" Williams, Brandon Jaspers and Peter Akimoto, sculpted as smooth forms, with arms that hold things, an idle, a walk and a run. Every other character stands as a pawn in their card's colour.
- **The kit's shared pieces**, among them a silhouette picture library (`art/kit/pictures.ts`; no painting repeats on a floor) and closed vessels (`art/kit/vessel.ts`). Decorations never promise mechanics that don't exist: the Storeroom's padlocked cage became an open bay.
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

## Ideas

Shelved, with what was learnt, for when they are picked up again.

- **A whole-house view:** the floors spread apart sideways in a fixed order, with small height steps between them and the stair links drawn between floors. Stacking the floors is ruled out: it hides the lower ones, and lines up rooms that aren't connected.
- **A storm outside:** light rain on the outdoor rooms only, and mild lightning through the real windows, driven by a flicker signal. It stays mild, so haunt 57 and Lightning Strikes stand apart from it. Thunder waits on audio.
- **A life pass:** an enhanced idle in which explorers stand around a room as people would: walk a few steps, look at the props, turn to each other, talk. The turn-start step onto the prime place brought figures to life, but read as a meaningless move. Life motion must be clearly ambient, never looking like a game move nor taking a figure off its place in a way that suggests a rule did it, and it waits for a pass of its own.
- **A night backdrop** (`?backdrop=night`, off): tabled. Pixel-art trees read as a glitch, the scale and proportion need design, and the moon showed only at some tilts.

## Open questions

`v1-play.md` lists the questions paused for the playtest: the reveal's light, pacing, phase 3's small calls, the phone layout, the lake's water look, the backlight, and soft or hard shadows. The longer-standing ones:

- **One device per player, a shared screen with phones as controllers, or both**, once online play comes. A TV could show what everyone may see (the house, whose turn it is) as a spectator client of the game row, while each phone renders its own seat's `viewFor`: its cards, its choices and, after the reveal, its side's half of the haunt. That suits the server-authoritative design and the traitor's secrets, and could sit beside one device per player.
- **The layout on phones and on wide screens**, around the status box: how much of a phone it may cover, and what extra width shows.
- **The reveal's light:** the house turned red (the default) or its moon blue pushed deeper (`?mood=cold`).
- **The lake's water look:** `shader` or `shader-palette` (`?water=`).
- **Whether to light a figure lit only from behind** with a rim (the backlight, on by default; `?backlight=off` to compare). Bounce light gives figures some fill from below.
- **Soft or hard shadows** (`lighting.md`).

