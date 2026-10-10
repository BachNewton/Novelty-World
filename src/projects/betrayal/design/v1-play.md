# v1: local hot-seat play

The first real game: three to six players on one device, playing in the 3D house with the art and the new UI, up to and through the haunt. It comes before online play. Hot-seat is a feature, not a stand-in: one device, N seats, and when multiplayer comes the seats move to devices. In v1 players look away from what isn't theirs; there is no hiding mechanism.

`presentation.md` holds the design this plan builds; this file holds the plan, what is built, and what comes next.

## Where we left off

The goal for the coming sessions: a fully playable local hot-seat game, with all its UI and art up to and including the haunt reveal.

Done: phase 0 (the house scene split from its demo), phase 1 (the playable skeleton), the camera and its controls, the rotation ghost (with rooms that cards move, on the same ghost), the status box, and the engine's forced-step refinement, so a player's act always asks. Then:

- the review pass over the first 14 rooms, with the owner's taste calls on the four pilot rooms resolved: they stay as they are;
- the cutaway markings, decided (`presentation.md`, "The cutaway");
- phase 2: moves of several rooms, walking and the route preview, hardened (two e2e races fixed, the lookahead's cost cut by about a third), with walking lanes and barrier crossings;
- the z-fighting detector, in the overlap check;
- several controllers on one device (`pads.ts`), part of P7;
- the bake in passes, with bounce light (`lighting.md`);
- 11 new rooms (the Basement Landing, Stairs from Basement, Wine Cellar, Creaky Hallway, Dusty Hallway, Statuary Corridor, Junk Room, Attic, Pentagram Chamber, Catacombs and Tower) and Father Rhinehardt;
- the skin ramp.

Next, in order:

1. **Startup speed and frame smoothness.** The first load takes about 7–8 s, and frames drop while baking. Measure where the time goes, and build the visible floor first.
2. **P3, the presenter**, including stable standing spots: a figure keeps its spot until it moves; the active explorer steps into spot 1 at the start of its turn; at the game's start the first player is on spot 1 and the rest follow in turn order. Today spots are recounted on every update, so figures can shuffle, and spot 1 goes to the first seat, not the active one.
3. **P4, P5, P6 and P7 in parallel**, with P5's design pass on actions per input held with the owner early.
4. **Art throughout.**

What remains for the goal:

- **UI:** P4, the room-moved animation, the Mystic Elevator across floors, and the room option on `chooseOne` (an engine gap); P5, actions per input and the trade sheet; P6, cards in the house, dice, damage and the stats overlay, with the debug panel retired; P7, setup polish with portraits, haunt selection and the reveal moment.
- **Rooms:** the 23 base rooms left: the Game Room, Organ Room, Gymnasium, Operating Laboratory, Research Laboratory, Servants' Quarters, Storeroom, Vault, Balcony, Bedroom, Gallery, Bloody Room, Charred Room, Collapsed Room, Conservatory, Ballroom, Coal Chute, Dining Room, Gardens, Patio, Abandoned Room, Crypt and Larder.
- **Explorers:** the 8 left: Flash, Missy, Brandon, Peter, Vivian, Madame Zostra, Heather and Jenny.
- **Room features:** secret passages and stairs, the Coal Chute, falls through the Collapsed Room and the Gallery, the Foyer's secret door down to the basement stairs, and the Tower's battlements.
- **Props and figures:** held items and omens, companions, room tokens; startle and hurt animations; flat art icons.

**Tabled or pending the owner:** the look of cloth in motion (Zoe's skirt, Father Rhinehardt's robe); the lake's water look; what happens when a room is overfilled.

## The decisions and events

The engine raises 14 decision kinds, plus a ready wait; the `turn` decision has 10 sub-acts (`TurnChoice`).

**Places, chosen in the house**
- `turn` move: reachable rooms and the doorways beyond them glow, a room on another floor glows as its staircase, and each half of a barrier room is its own target. Shown by walking.
- `turn` discover: an unexplored doorway glows. Shown by the ghost, then the tile appearing and the floor re-baking.
- `turn` end: End turn, an explicit action in the status box, never automatic.
- `rotation`: the ghost tile on its cell, turned through its legal ways round. A tile that fits one way is placed by the engine.
- `place-tile` (the Mystic Elevator, The Beckoning, cards that move rooms, haunt 13's top-up rooms): the legal cells glow on any floor, and the tile's own cell means "leave it". `room-moved` animates the tile lifting and moving with its figures (phase 4).
- `choose-one` with room options (the Bottle's teleport): **an engine gap**, since options carry labels only. An optional room per option in `chooseOne` (`engine/effects.ts`) makes them places; until then the choice is a button.

**Not places: the status box, shown only when needed**
- `turn` action, drop and pickup: buttons for now; the action bar per input in phase 5.
- `turn` trade: a trade sheet. `trade-offer` goes to another seat mid-turn, named in the prompt.
- `roll-before` and `roll-after`: the roll's dice, total and outcome.
- `split-damage` and `damage-kind`: the stat tracks, with where the damage would land.
- `choose-one` (event cards): the card, per `card-presentation.md`.
- The ready wait (the haunt reveal): the reveal.

**Haunt 13**
- activate and attack targets are figures (figures are treated as places); done is an action.
- `attack-mode` and `attack-steal` take a choice in the box; `replace-figure` is a yes or no; `place-tile` for top-up rooms is the traitor's; escape and wake are actions, with the escape rooms glowing.

**Events**
- House animation: movement, layout changes, tokens, haunt figures, the turn starting (light and camera).
- A moment in the box (non-blocking, any input skips it): cards, rolls, stats, haunt events.
- Told in words only: bookkeeping, forced steps, the decks and room stack, the haunt's odds and ends.

## The architecture as built

**`play/`, the client.** Nothing in it knows about three.js.
- `sync.ts`: client sync as one pure function over four events (a server state, a local action, accepted, rejected), with `shown` working out what the screen shows. A local transport stands in for the server.
- `store.ts`: the game as a store for `useSyncExternalStore`, holding the sync state, the seat holding the device and that seat's view, which is all the screen renders. Every accepted write saves the game as its share code in localStorage, so closing the tab loses nothing.
- `seat.ts`: the holder follows whoever the game waits on. Ending a turn is passing the device, with no handover screen; a question for another seat mid-turn names that seat in its prompt.
- `choices.ts`: the pending decision split by where it is answered: places become house targets, a tile to place becomes a ghost, everything else goes to the box, and End turn is an action of its own. A target's id names the choice, never the room.
- `ghost.ts`: what each way round of a tile would do to the doorways round it, worked out from the engine's own board rules.
- `status.ts`: the status box in words: what the latest write did and why, each rule in one plain sentence with its source.
- `lookahead.ts`: every room and doorway reachable this turn, with its route and the actions that reach it, found on copies of the state through movement-only writes, and memoised per decision.
- `preview.ts`: the route preview as one small serialisable value, and its words.
- `pads.ts`: which seats each controller plays, and whether a pad may act now.

**`components/play/`, the screen.** `play-game.tsx` sets up a game or resumes the saved one; the game is the page's default, with the debug view at `?debug`. `play-screen.tsx` is the house plus the status box; `status-box.tsx` the box, with `box-pad.ts` for a controller inside it; `ghost-placer.tsx` placing a tile; `seat-colour.ts` the seat's colour, which is the character card's; `routes.ts` turns a route into the house's targets and walks; `seats-panel.tsx` lists the seats and the pads that play them. The old debug panel (`PendingPanel`) still answers any decision the box doesn't handle yet, and shrinks phase by phase.

**The house.**
- `art/house-scene.ts`: the house as a picture of whatever it is fed (a layout, figures, targets, whose turn it is, beats of animation), with no game in it. Layout changes are diffed and re-baked with their neighbours (`art/lit-floor.ts`), through the bake scheduler (`art/bake-schedule.ts`: passes, priorities, stale work dropped). Its performance readout is opt-in, on for the demo only.
- `art/house-demo.ts`: the stand-in game for `?house` and its e2e, until phase 2 retires it.
- `art/house-camera.ts`: the camera's tilt limits and height; `art/house-targets.ts`: each target placed, marked and laid out on the screen for input.
- `art/explorers/by-character.ts`: a character's figure, or a pawn in their seat's colour; `art/part-batch.ts` batches a placed figure's parts per material.
- `art/zfight.ts`: finding faces that share a plane, for the overlap check; `art/path-overlay.ts`: a room's spots and walks drawn over it on the bench (`?paths`).
- `input/controls.ts`, `gestures.ts` and `navigate.ts`: the three input methods, driving the free camera and picking choices through the same few intents.

**Tests:** the sync reducer against duplicated, reordered and dropped updates; `choices.ts`, the ghost, the seat and the status words; the camera and gestures; and the e2e in `e2e/betrayal-play.spec.ts` (a seeded game through a discovery, an event card, a move and ended turns; setup and resume; the ghost and the status box on all three inputs) `e2e/betrayal-house.spec.ts` (the house and its camera), `e2e/betrayal-pads.spec.ts` (several controllers) and `e2e/betrayal-bake.spec.ts` (the bake's passes); and the lookahead against the engine (a slow test).

## The owner's UI answers

1. **Rotation:** a ghost tile you turn, then confirm.
2. **Cards:** the card sort's direction (`presentation.md`, "Cards").
3. **Dice:** no physical dice; each die's value, the total and the outcome in words.
4. **Stats:** hidden by default and shown when useful, with a hold to overlay them all.
5. **Actions:** per input and per action, in a design pass of their own; buttons meanwhile.
6. **The log:** no log panel in v1; explanations live in the status box.
7. **An unbuilt haunt at the reveal:** haunt selection is a feature, at setup and at such a reveal.
8. **Handover:** no banner or curtain; ending the turn is the device pass.
9. **"Stop here":** gone; End turn is separate, and movement is spent freely around actions.
10. **Seat colour:** the character card's.
11. **Pacing:** automatic beats with a speed setting; a card's text waits for a tap.
12. **The default page:** the game; debug at `?debug`.

## Phases

- **P0: split the house view.** Done. The house scene and its demo, layouts and figures that change, doorway, cell and self marks, the figure registry.
- **P1: the playable skeleton.** Done. Sync, store, seat and choices; the play screen with the house and the status box; setup and resume; moves one room at a time, discovery doorways, End turn; everything snaps, with no animation.
- **P2: legs, walking and preview before commit.** Done. The lookahead, committing a route one action at a time, walking, the floor following the explorer's stairs, and the route preview (`presentation.md`, "Moving").
- **P3: the presenter and narration in the moment.** A pure `beats(previous view, events, next view)`; the state never waits, input fast-forwards, beats are de-duplicated by event id, and the status box tells any event without a beat. The entering moment, the active explorer's light, the forced-step beat. Tests: every event type has a beat or words.
- **P4: discovery and placement.** The rotation ghost is done, and so is `place-tile` on the same ghost. Left: `room-moved` animated, the Mystic Elevator across floors with its e2e, and the room option on `chooseOne`.
- **P5: the action bar per input, and trading.**
- **P6: cards, dice and damage.** After it, a test asserts the old debug panel is never used in a scripted exploration game.
- **P7: hot-seat setup polish.** Setup with portraits, resume, haunt selection as a feature (at setup, and at a reveal on an unbuilt haunt), the v1 reveal. Several controllers on one device are done.
- **P8: haunt 13 in the house.** Last.

P4, P5 and P6 can run in parallel after P3. Each phase's review: a preview link, screenshots on phone and desktop, and a short recording.

**Later, for online play:** live previews (`presentation.md`, "Live previews online") over Supabase Realtime broadcast, never stored. The engine's `lastEvents` holds only the latest write's events, so a client that skips writes can't animate the gap: keep a ring of recent writes, or snap to the state and narrate from the events table; decide before going online. The lookahead needs the full `GameState`, which the public row gives every client.

## Risks

1. The bake's cost: re-baking on phones during discovery, a first load of several seconds, and frames dropping while baking (`lighting.md`, "Known gaps").
2. The lookahead's cost, a copy of the state per step: about 0.75 ms median before the haunt, and at worst about 54 ms in haunt 13, on desktop. The fallback is a routes query in the engine.
3. About 75 event types: coverage and pacing need playtests.
4. Information reaching the wrong seat in hot-seat.
5. `lastEvents` covers one write only (matters online).
6. `choose-one` and other opaque parameters need engine metadata.
7. Touch targets overlapping on phones: picking needs a priority by kind.
8. Art coverage: most of the house will be plain shells and pawns at first.
9. Saved games: an engine change to recorded actions must raise `SHARE_FORMAT`.

## Open questions for the owner

- Whether to brighten a figure lit only from behind.
- How the turn's actions are offered on each input (phase 5's design pass).
- The phone layout round the status box, and what extra width shows on desktop.
- What happens when a room is overfilled, at the first haunt that can.
- The lake's water look.
