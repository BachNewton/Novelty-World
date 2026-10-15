# v1: local hot-seat play

The first real game: three to six players on one device, playing in the 3D house with the art and the new UI, up to and through the haunt. It comes before online play. Hot-seat is a feature, not a stand-in: one device, N seats, and when multiplayer comes the seats move to devices. In v1 players look away from what isn't theirs; there is no hiding mechanism.

`presentation.md` holds the design this plan builds; this file holds the plan, what is built, and what comes next.

## Where we left off

The goal: a fully playable local hot-seat game, with all its UI and art up to and including the haunt reveal.

**Built.** Phases 0 to 7 (see "Phases"): a game can be set up, played through its exploration on any of the three inputs alone, and carried to the haunt's reveal, where every seat reads its half and says it is ready. In particular:

- **Startup and smoothness.** The bake keeps frames smooth on every page: shaders compile in the background and a room shows once its light and shaders are ready, sample placement and figure meshing run in workers (a figure stands as a pawn until its parts land), rooms are built in slices under a frame budget with the visible floor first, the bake starts before the figures, and the freeze is resumable. On a quiet machine the first frame went from 3.7 s to 0.5 s, ready from 4.9 s to 2.2 s, the longest task from 3.2 s to 0.08 s, and a re-bake's worst frame from 203 ms to 19 ms (`lighting.md`, "The bake at run time").
- **P3, the presenter**, with story before the next choice, and the placement solver in place of fixed standing spots (`presentation.md`, "Figures in rooms"), walks planned round standing figures, and gait from Speed.
- **P4:** rooms moved by a rule fly to their new cell with their figures, the Mystic Elevator across floors, and rooms as options of a choice (the engine gap closed).
- **P5:** the approved controller map with its keyboard + mouse and touch counterparts (`presentation.md`, "Input"), Your explorer with the turn's actions, the trade sheet, and the game menu.
- **P6:** cards drawn as beats in the house, dice and damage in icons on the character card's tracks, the stats overlay, and things on the floor; the old debug panel answers only the game's end and a haunt that stops the game.
- **P7:** setup with portraits, haunt selection (at setup, and at a reveal on an unbuilt haunt), the reveal in the house's red light, and review links (`?play=<share code>`) that open a set-up game in memory, never touching the saved game.

**The first playtest session** (UI first) reworked, on all three inputs (`presentation.md` holds each):

- **Setup:** four seats by default, each called by its explorer, with no name to type; seat cards that are the portrait, with a compact picker; portraits re-shot (`presentation.md`, "Setup").
- **Input:** a controller's focus shows the moment it is noticed, as a ring, and the last-used input carries into the game; the controller aims with the reticle only (catch areas, magnetism, sticky focus and the snap debug overlay are gone); button prompts are each control's own shape, shown only where the control isn't obvious; the browser's context menu never opens; the frame meter.
- **The screen:** End turn in the top right corner; the status box as what you can do now plus one line driven by the beat playing, with Why as a dialog; Your explorer docked in one fixed place; Details with nameplates only while held, and inspecting by pointing.
- **Cards, dice and damage:** one card, one place, every card drawn waiting for a press; roll tables as one component, with exact odds before and the row hit lit after, forced rolls getting their "before" beat; damage split on one slider.
- **The camera:** following or free, and the game never changes the player's zoom, turn or tilt (the first-visit close-up is gone).
- **The house:** explorers keep their places when the turn passes; options naming walls, corners, sides, tokens and figures are house targets (`card-presentation.md`), the Wall Switch and the Mystic Slide among them; placement cells only on the floor shown; a ghost only ever means "not yet placed"; rule-caused moves (the Coal Chute, falls, the Mystic Elevator) play as beats a following camera follows; room bonuses as badges in their rooms.
- **Art:** the last five explorers (Missy, Vivian, Madame Zostra, Heather and Jenny), so all twelve stand; five rooms (the Larder, Gymnasium, Crypt, and the Operating and Research Laboratories); the Upper Landing mirrored so its stair head matches the Grand Staircase's; the shared shader flame house-wide; the shine bench; the bake-only shadow caster; and teal kept for unseen presences alone.

P8, haunt 13 in the house, is last.

**Next session: the playtest goes on, UI first.** The owner plays on from setup and reports what they see; each finding becomes work, done in the agents' own worktrees under the playtest's working rules (the project's `CLAUDE.md`, "Working on long tasks"). Placeholder art is allowed wherever art isn't ready. Known to need work, picked up as the playtest reaches it:

- **A UI-size setting** for TV play: in the game menu, on every input, saved per device, scaling all UI and touch targets; 100% by default.
- **The phone and desktop layout** round the status box.
- **Roll tables' last cases:** Hanged Men's four results, and each explorer's roll, stacked into one view.
- **The open questions** below, each brought up only when the playtest reaches it.

**Engine testing, its own session** (not UI). The slow simulation sweep plays about 690 random games and takes 30 minutes or more under load, blocking any agent that runs it, yet it can only check that the engine stays consistent, never that a rule is right; its game counts were never measured against what they find. The plan:

- Review the engine for invariants the design could make impossible to break instead of checking them: a card's place as one field rather than separate lists, and an offered choice that is accepted simply because it is offered, so the dry run of every candidate at every decision isn't needed.
- A targeted scenario test for each decision kind, replacing the sweep's "every kind was answered".
- The remaining invariants run inside every engine test, with universal game rules added to them (a trait stays on its track, a dead explorer never acts).
- The random sweep shrinks to a small consistency check sized by measurement, the full run opt-in for engine changes; each bug a random game finds becomes a targeted test.

**Open questions,** the owner's call:

- The reveal's light: today's red house, or `?mood=cold` (full-house review links exist).
- Pacing: largely answered by the status box's redesign; to confirm in play.
- The phone layout round the status box.
- The lake's water look (`?water=`).
- The backlight: on by default, `?backlight=off` to compare.
- Soft or hard shadows (`?shadows=soft`).
- Card-driven moves (`presentation.md`, "Gait"): agreed in principle, to confirm in play.
- An instant floor swap: whether changing floor should cut rather than glide between floors 7 m apart (the owner has looked at all the floors at once through the page hook).
- Showing at setup who goes first, and why.
- The frame meter's default: on while playtesting, off before the game is done.

**Before launch:**

- **Saves start over at v1.** Done. The save format resets to v1 and its migrations are deleted; a save from an older format is marked outdated; and the localStorage key and the share code's prefix are new, so an old development save can't pass as the new v1.
- **The frame meter defaults to off.**

**The art review list,** not blocking:

- the explorer line-up, all twelve;
- Father Rhinehardt's and the Banshee's cloth;
- the silhouette picture library (`?bench=pictures`);
- the props gallery (`?bench=props`), with 13 likely-duplicate groups;
- the Organ Room after shine;
- the variety of the rooms' uncanny notes: several use "moves by itself" (the Game Room's cue, the Abandoned Room's horse, the organ's keys, the Upper Landing's chair).

What remains for the goal:

- **UI:** the list above, and whatever the playtest finds.
- **Rooms:** the 11 base rooms left: the Vault, Balcony, Gallery, Bloody Room, Charred Room, Collapsed Room, Conservatory, Ballroom, Coal Chute, Gardens and Patio.
- **Explorers:** all twelve have figures and portraits. Setup shows each character's tracks as the card prints them; a short description is not built, the owner's call.
- **Room features:** secret passages and stairs, the Coal Chute, falls through the Collapsed Room and the Gallery, the Foyer's secret door down to the basement stairs, and the Tower's battlements; with them, the three transitions still to build for moves that aren't a walk (drop or slide, secret way, put there; `presentation.md`, "Moves that aren't a walk"), and the connection mark for the card-made connections and the Below Collapsed Room token (`presentation.md`, "Connections").
- **Props and figures:** held items and omens, companions, room tokens; startle and hurt animations; jumps and falls; the models of things on the floor (stand-ins today).

## Polish list

Not blocking; taken up when the game plays.

- **A hair study, then one pass over every explorer** (its own session). The owner's review: every explorer's hair has the right idea and style, but its shape as rendered is off. It is a technique problem, so fixing figures one by one would repeat it. Diagnose the shared faults across all twelve (lumps, hair not following the skull, seams where pieces meet, silhouettes that misread from the house's camera); build better shared hair pieces in the figure kit (a cap that follows the skull, swept sheets for fringes and bobs, a ponytail and a bun, locks with clean edges); prove them on two explorers on the bench for the owner's approval; then apply them to all twelve and record the method in the `betrayal-figure-art` skill.
- Physics for loose things: hair, Zoe's doll, scarf ends, stoles, coat tails, as strands in the cloth solver.
- Gait speed and animation tuning.
- The shared plaster texture, to read more clearly as damp and cracks.
- Shine on figures and moving pieces (needs per-figure lamp uniforms), and a per-texture shine mask (gilt threads in damask).
- The props gallery's duplicate groups merged into the kit.
- A house-wide variety pass on the rooms' uncanny notes, each settled against the ledger, not just its colour.
- Candle shadows that move with the flame: baked from two or three flame positions and blended.

## The decisions and events

The engine raises 14 decision kinds, plus a ready wait; the `turn` decision has 10 sub-acts (`TurnChoice`).

**Places, chosen in the house**
- `turn` move: reachable rooms and the cells beyond them glow, a room on another floor glows as its staircase, and each half of a barrier room is its own target. Shown by walking.
- `turn` discover: the empty cell beyond an unexplored doorway glows, one target per cell. Shown by the ghost, then the tile appearing and the floor re-baking.
- `turn` end: End turn, an explicit action, held on a pad or the keyboard, never automatic.
- `rotation`: the ghost tile on its cell, turned through its legal ways round, which are the decision's choices. A tile that fits one way is placed by the engine. A ghost only ever means "not yet placed": once placed, a room shows solid at once in a flat moon light until its baked light lands (`lighting.md`).
- `place-tile` (the Mystic Elevator, The Beckoning, cards that move rooms, haunt 13's top-up rooms): the legal cells glow on any floor, and the tile's own cell means "leave it". `room-moved` flies the tile to its new cell with its figures (`art/room-flight.ts`).
- `choose-one` with place options (the Bottle's teleport, the Dog's run, the Revolving Wall's walls and corners, a barrier room's sides, a card's figures): an option may name a room, a side of a barrier room, a wall or corner of a room, or a figure, and those options are places (`card-presentation.md`, "Choices that are places").
- `turn` attack on a figure and activate (a monster turn): the figure is the target.

**Not places: the status box and the explorer sheet**
- `turn` action, drop and pickup: Your explorer's rows, and the same as buttons in the status box; a card on the floor is picked up from the floor too.
- `turn` trade: the trade sheet. `trade-offer` goes to another seat mid-turn, named in the prompt.
- `roll-before` and `roll-after`: the roll's dice, total and outcome, in icons.
- `split-damage` and `damage-kind`: the stat tracks, with where the damage would land.
- `choose-one` (event cards) whose options aren't places: the card, per `card-presentation.md`.
- The ready wait (the haunt reveal): the reveal.

**Haunt 13**
- activate and attack targets are figures (figures are treated as places); done is an action.
- `attack-mode` and `attack-steal` take a choice in the box; `replace-figure` is a yes or no, except for the last Nightmare in play, which is always replaced, as a forced step; `place-tile` for top-up rooms is the traitor's; escape and wake are actions, with the escape rooms glowing.

**Events**
- House animation: movement, layout changes, tokens, haunt figures, the turn starting (light and camera).
- A line in the box, in its place in the order of events, for as long as what it shows (a card's text until a press, dice turning up, a float rising); any input skips it: cards, rolls, stats, haunt events, forced steps, the decks and the haunt's odds and ends.
- Silent: bookkeeping the house or the screen already shows.

## The architecture as built

**`play/`, the client.** Nothing in it knows about three.js.
- `sync.ts`: Betrayal's binding of the shared client sync (`src/shared/lib/client-sync.ts`), one pure function over four events (a server state, a local action, accepted, rejected), with `shown` working out what the screen shows. The binding says how an action applies and which answers are the same; a local transport stands in for the server.
- `store.ts`: the game as a store for `useSyncExternalStore`, holding the sync state, the seat holding the device and that seat's view, which is all the screen renders. Every accepted write saves the game as its share code in localStorage, so closing the tab loses nothing; a review link's game is kept in memory instead.
- `seat.ts`: the holder follows whoever the game waits on. Ending a turn is passing the device, with no handover screen; a question for another seat mid-turn names that seat in its prompt.
- `choices.ts`: the pending decision split by where it is answered: places become house targets, a tile to place becomes a ghost, everything else goes to the box, and End turn is an action of its own. A target's id names the choice, never the room.
- `panels.ts`: which part of the status box answers what is pending; the old debug panel only what nothing else does, held by a test.
- `presenter.ts`: the presenter, pure: the presentation so far and the next view in, the next presentation and its beats out, in the order the events happened, each naming the events it shows. The state never waits; beats are de-duplicated by event id, and an event in no beat is silent.
- `spots.ts`: where each explorer stands, from the placement solver, as presentation that follows from the views shown, never game state.
- `things.ts`: every dropped card and token in a room as an object, a room effect or a connection, decided per token kind as data.
- `sheet.ts`: Your explorer's rows: each card held with its uses and Drop, each card on the floor to pick up, each explorer to trade with, in the engine's order so a row stays where the player learnt it.
- `tracks.ts`: a trait as the character card prints it, its clip, its top, and the skull locked before the haunt.
- `room-bonus.ts`, `inspect.ts` and `short-name.ts`: which rooms give a bonus and who has taken it, what pointing finds while the details are held, and the short name each explorer goes by.
- `cards.ts`, `dice.ts`, `damage.ts`: a card's colour and mood, a roll as the box shows it, and damage previewed on its two tracks.
- `setup.ts`: choosing seats' characters, one per card, on any input, and each character's portrait.
- `ghost.ts`, `status.ts`, `lookahead.ts`, `preview.ts` and `pads.ts`: what each way round of a tile would do, the box's words, every room and cell reachable this turn with its route, the route preview as one serialisable value, and which seats each controller plays.

**`components/`, the screen.** `play/play-game.tsx` sets up a game, resumes the saved one or opens a review link; the game is the page's default, with the debug view at `?debug`. In `play/`:
- `play-screen.tsx`, the house plus the status box (`status-box.tsx`), with the on-screen floor, Follow, walls and menu buttons; `presenting.ts` plays the presenter's beats one after another, publishing the beat playing as the one source of what the box's line, its Why, a card over its room and the floats tell, stops a skip at each card drawn until it is pressed, and holds a decision's choices until the beats before it are over; `card-beat.tsx` is the card over the room, where a card's question is answered.
- `pad-focus.ts`, the controller's one focus over the page's layers (the box, a sheet, a reader, the menu), with the d-pad moving along and between rows and B closing the topmost layer; `use-pads.ts` and `pad-picker.tsx`, the device's pads and a seat's pad.
- `figure-marks.tsx`, each explorer's mark, and Your explorer: the character card as a sheet, with the explorer's tabs, portrait, trait tracks (`trait-track.tsx`), cards and the turn's actions; `details-hold.ts` and `details.tsx`, the held details (room names, things' labels, every explorer's name and stats); `trade-sheet.tsx`, building a trade.
- `card-beat.tsx`, a card drawn as a beat over its room; `decision-panel.tsx`, rolls, damage and other questions; `roll-table.tsx`, every roll's table; `damage-split.tsx`, damage split on one slider; `roll-result.tsx` and `happening-line.tsx`, rolls and events in icons; `thing-reader.tsx`, a thing on the floor read.
- `setup.tsx` and `setup-pads.ts`, setup by portraits on every input; `reveal.tsx`, the haunt's reveal; `game-menu.tsx`, the seats and pads, the speed and leaving; `ghost-placer.tsx`, placing a tile; `seat-colour.ts`, the seat's colour, which is the character card's.
- `prompts.tsx` (beside `play/`): every button prompt, our own glyphs, each the control's own shape, the one map from a meaning to its control per input, and `PromptButton`, the button every prompt leads and every filling hold fills. `icons.tsx`: the traits, card types, damage, pass and fail, and die faces.

**The house, in `art/`.**
- `house-scene.ts`: the house as a picture of whatever it is fed (a layout, figures, things, targets, whose turn it is, beats of animation), with no game in it. Layout changes are diffed and re-baked with their neighbours (`lit-floor.ts`), through the bake scheduler (`bake-schedule.ts`). `house-mood.ts`: the house's fill and fog, moon blue exploring and red from the reveal. `house-camera.ts`, `camera-follow.ts`, `house-targets.ts`: the camera's limits, its following and free modes, and each target placed and laid out on the screen. `frame-meter.ts`: three.js's frame meter.
- `placement.ts`: the placement solver, for figures and objects alike; `room-floor.ts` and its worker read a room's free floor off the built room; `walk-around.ts` plans a walk round standing figures; `room-flight.ts`, a room a rule moves, flying to its cell; `pins-apart.ts` keeps nameplates and marks over figures from covering each other.
- `figure-mesh.ts` and its worker, with `figure-parts.ts`: figures meshed off the page's thread; `shader-prep.ts`: an object's shaders compiled before it joins the scene; `build-slices.ts`: the house's own work cut into slices under a frame budget; `bake-finish.ts`: a pass's last step, in a worker.
- `shine.ts`: real highlights from the baked lamps, by named preset; `wall-marks.ts`: marks drawn into a wall's own texture; `wind.ts`: a room's air, still indoors and a breeze outdoors; `things/`: the things in rooms drawn and pointed at (`layer.ts`), with their stand-in looks (`looks.ts`); `backdrop.ts`: a night backdrop, tabled and off (`?backdrop=night`).
- `kit/pictures.ts`, the silhouette library, `kit/vessel.ts`, closed solids of revolution, and `kit/flame.ts`, every visible flame.
- Benches: `?bench=<room>` (`bench.ts`), the props gallery (`?bench=props`, `props-gallery.ts`), the figure viewer (`?bench=figures`, `figure-viewer.ts` and `figure-motion.ts`), the picture library (`?bench=pictures`, `rooms/picture-library.ts`), the shine presets (`?bench=shine`, `shine-bench.ts`), the flames (`?bench=flames`, `flame-bench.ts`), and crowds placed by the solver (`placement-bench.ts`).
- `explorers/by-character.ts`: a character's figure, or a pawn in their seat's colour; `part-batch.ts` batches a placed figure's parts per material; `zfight.ts` finds faces that share a plane, for the overlap check; `path-overlay.ts` draws a room's places, keep-clear areas and walks on the bench (`?paths`).
- `input/controls.ts`, `gestures.ts` and `navigate.ts`: the three input methods, driving the free camera and picking choices through the same few intents.

**Tools, in `tools/`:** `shots.mjs` and `house-shots.mjs` (frozen screenshots), `placement-shots.mjs` (crowds on the bench), `portraits.mjs` (setup's portraits, from the bench), `room-light.mjs` (each room's brightness against the house, read against the room-art ledger), and `startup-perf.mjs` (the first load and the frames through a re-bake, on a production server).

**Tests:** the sync reducer against duplicated, reordered and dropped updates; the presenter (every event type has a beat or words), `choices.ts`, the ghost, the seat, the status words, the sheet, the tracks, the spots and the things; the placement solver and walking round figures; the camera and gestures; the lookahead against the engine (a slow test); and the e2e: `betrayal-play.spec.ts` (a seeded game, setup and resume, the ghost and the status box on all three inputs), `betrayal-controls.spec.ts` (each input alone, with a whole game on the pad alone from setup through the reveal), `betrayal-cards.spec.ts` (cards, dice and damage, never needing the debug panel), `betrayal-things.spec.ts` (a card dropped and picked up, on each input), `betrayal-placement.spec.ts` (the Mystic Elevator, and rooms as choices), `betrayal-house.spec.ts`, `betrayal-pads.spec.ts` and `betrayal-bake.spec.ts`, with `e2e/betrayal-game.ts` driving a game from a spec.

## The owner's UI answers

1. **Rotation:** a ghost tile you turn, then confirm.
2. **Cards:** the card sort's direction (`presentation.md`, "Cards").
3. **Dice:** no physical dice; each die's value, the total and the outcome, in icons.
4. **Stats:** on the character card's tracks, shown when useful, with a hold to overlay them all.
5. **Actions:** Your explorer, a sheet with the turn's actions on fixed rows, on every input (`presentation.md`, "Actions").
6. **The log:** no log panel in v1; explanations live in the status box.
7. **An unbuilt haunt at the reveal:** haunt selection is a feature, at setup and at such a reveal.
8. **Handover:** no banner or curtain; ending the turn is the device pass.
9. **"Stop here":** gone; End turn is separate, and movement is spent freely around actions.
10. **Seat colour:** the character card's.
11. **Pacing:** automatic beats with a speed setting; a card drawn waits for a press.
12. **The default page:** the game; debug at `?debug`.

## Phases

- **P0: split the house view.** Done.
- **P1: the playable skeleton.** Done.
- **P2: legs, walking and preview before commit.** Done.
- **P3: the presenter and narration in the moment.** Done: the pure presenter, the active explorer's light, the forced-step beat, and the placement solver.
- **P4: discovery and placement.** Done: the rotation ghost, `place-tile` on the same ghost, `room-moved` animated, the Mystic Elevator across floors, and rooms as options of a choice.
- **P5: the action bar per input, and trading.** Done, as Your explorer and the trade sheet, with the controller map.
- **P6: cards, dice and damage.** Done; a test holds that a game played up to its reveal never needs the old debug panel.
- **P7: hot-seat setup polish.** Done: setup with portraits, resume, haunt selection, the v1 reveal, several controllers on one device, and the game menu.
- **P8: haunt 13 in the house.** Last.

**Later, for online play:** live previews (`presentation.md`, "Live previews online") over Supabase Realtime broadcast, never stored. The engine's `lastEvents` holds only the latest write's events, so a client that skips writes can't animate the gap: keep a ring of recent writes, or snap to the state and narrate from the events table; decide before going online. The lookahead needs the full `GameState`, which the public row gives every client.

## Risks

1. The bake's cost on phones: re-baking during discovery has not been measured on a real phone, and the draw calls stand at 248 of 300 with every floor drawn (`lighting.md`, "Known gaps").
2. The lookahead's cost, a copy of the state per step: about 0.75 ms median before the haunt, and at worst about 54 ms in haunt 13, on desktop. The fallback is a routes query in the engine.
3. About 75 event types: coverage and pacing need playtests.
4. Information reaching the wrong seat in hot-seat.
5. `lastEvents` covers one write only (matters online).
6. `choose-one` and other opaque parameters need engine metadata.
7. Touch targets overlapping on phones: picking needs a priority by kind.
8. Art coverage: rooms not built yet show as plain shells.
9. Saved games: an engine change to recorded actions must raise `SHARE_FORMAT`.
