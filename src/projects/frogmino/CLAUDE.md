# Frogmino

Brain Wall (the Japanese game show) meets Tetris, with Frogger-style hopping. The player is a frog shaped like a tetromino, and shaped vehicles come at it down a road: side by side, leaving a gap it must match (staggered vehicles to weave between are tabled: see Traffic). It is real-time, seen from behind the frog in real 3D with Three.js (through `@react-three/fiber`). Faked 2D depth was considered and rejected: it is harder to get right than real 3D.

The owner and a friend designed it. What follows is decided unless it sits under Open questions.

The obstacles are rows of traffic (see Traffic). The rules still call a row a wall, from the prototype: a row's vehicles are its solid cells and everything else on the face is its opening, so wherever the sections below speak of walls and openings, they mean a row as the rules see it.

## Code map

- `types.ts`: cells on the wall face, tetromino kinds, the frog, openings.
- `logic.ts`: pure piece rules, no React and no Three. The tetromino definitions, rotation, piece sizes, turning inside the corridor with a wall kick, the cells a frog covers, and the pass test.
- `run.ts`: pure run rules. The rule state of one playthrough (frog, walls, clock), the frog's and a wall's thickness, the player's actions and held jumps, `advance` for moving time on, judging walls as they reach the frog, keeping the frog out of a wall's solid cells while they overlap, riding, the bonk, the looping traffic, and the start and end zones.
- `traffic.ts`: a row of traffic (which vehicles, in which lanes) and the opening it leaves, refusing a row whose vehicles share a lane or leave the road.
- `composer.ts`: the answer-first row composer, the difficulty rules, and the poses a frog can take and which of them pass an opening.
- `course.ts`: the seeded course: fifteen rows up the difficulty ramp, and where each starts along the course.
- `tuning.ts`: the feel knobs (wall speed and placement, course length, hop airtime, ease duration, corridor size, jump distance, held-jump repeat interval, bonk knock-back, and the camera's height, follow distance and look-ahead), in one constants object. Tuning is done by editing it; there is no settings UI.
- `store.ts`: the Zustand store holding the current run, with actions for key presses and releases, frame ticks and restart.
- `fleet.ts`: the 19 vehicle ids, derived from the tetromino definitions and rotation in `logic.ts`, and each vehicle's cells. It is the one definition of the vehicles; the rules and the art both key by its ids.
- `vehicles/`: the fleet's designs. `parts.ts` is the vehicle's own frame, the paints, the surface-detail tolerance and the helpers that place details on a cell's faces; `kit.ts` holds details many vehicles share (headlights, bumpers, windscreens, rings); `i.ts` to `l.ts` hold one piece's vehicles each; `index.ts` gathers them as `VEHICLES` and builds a `vehicleModel` from an id.
- `components/frogmino.tsx`: the root component, with the key legend and the end-of-course overlay, or the garage when the URL has `?garage`. The scene is loaded browser-only because it reads its colours from the live stylesheet.
- `components/scene.tsx`: the 3D scene and the per-frame loop. It draws the frog and each row's vehicles as thick as the rules count them, from the thicknesses `run.ts` exports. Its colours come from the design tokens in `globals.css` through `themeColor` in `src/shared/lib/three/`, never hardcoded.
- `components/use-frog-keys.ts`: the keyboard controls, including holding and releasing the jump keys.
- `components/vehicle-view.tsx`: the placeholder traffic art the game draws for now: each vehicle as its four cubes in one flat colour of its own, from the placeholder tokens in `globals.css`. It is the seam for the fleet's art: `Vehicle` takes the same props, so the scene swaps `VehicleView` and its assets for `Vehicle` and `makeVehicleAssets`, and nothing else changes.
- `components/vehicle.tsx`: the `Vehicle` component, drawing any of the 19 by id at a lane and depth, in the scene's axes. `components/vehicle-assets.ts` holds its materials, per-paint merged detail geometry, and the cell-border masks, which the scene's frog and placeholder vehicles share.
- `components/garage.tsx`: the garage (see The fleet).

The project is a solo, keyboard-only prototype so far, proving controls, motion and collision: one fixed L piece for the whole run (no pull-offs yet), fifteen rows of traffic from a fixed seed ramping from easy to hard, drawn with placeholder art, that loop as endless traffic, riding, the bonk, and an end-zone overlay with restart. There is no clock or medals, no touch controls and no co-op yet.

## The wall face

A wall is a grid of cells: columns across the corridor, rows up from the floor. An opening is a set of those cells. The frog is a tetromino with a lateral column (its leftmost cell), a rotation of quarter turns clockwise as the player sees it from behind, and a hop height of 0 or 1. A rotated piece always rests on the floor, or one cell above it when hopping.

## The motion model

What the rules decide is kept apart from what the player sees.

- **The course is a road of fixed length** with a start zone behind it and an end zone at its far end. Walls are placed along it and all move toward the start at the course's wall speed. The frog does not run on its own: it advances only by jumping forward, with no limit on how far ahead it may race, and reaching the end zone completes the course.
- **The start zone is safe,** like Frogger's sidewalk: a wall that reaches its edge disappears there, and never reaches a frog standing in it.
- **Traffic loops, and never runs out.** A wall that disappears at the start edge reappears at the far end with the same opening, a wall spacing (with seeded jitter) behind the rearmost wall, so waiting in the start zone never clears the road. If the frog has raced past every wall, the wall reappears that spacing ahead of the frog instead. Either way it comes back ahead of the frog and beyond every wall already coming at it, and it is judged afresh when it arrives.
- **The frog's rule state is discrete** (column, rotation, depth and whether it is up from a hop) and changes the instant a key is pressed, with no tick delay. One press is one action, and the operating system's key repeat is ignored; only a held jump key repeats (see Controls). Its depth changes a jump or a bonk at a time.
- **The drawn frog eases toward its rule state** over the ease duration: position, rotation and depth. The rules never see the in-between. While a wall overlaps the drawn frog, it is drawn exactly at its rule state instead: an eased turn swings cells through places neither pose covers, and a move made just before a wall arrives may not have finished easing, so either would draw the frog inside the wall.
- **Walls move continuously.** A wall's depth is a real number that falls by the wall speed times each frame's elapsed time. Frame time is clamped, so returning to a backgrounded tab doesn't lurch the course forward.
- **Every wall the frog hasn't passed is ahead of it, and every wall it has passed is behind it.** Each rule keeps that true, and it is what makes each arrival judged exactly once.
- **The frog and every wall have depth:** one cube each, as drawn. A wall overlaps the frog while their depth ranges along the course intersect: from the instant the wall's front face reaches the frog's until its back face goes by the frog's.
- **A wall is judged when it reaches the frog,** when the overlap begins, using the frog's rule column, rotation and hop at that instant. Within a frame, everything happens in order at its own instant (each wall arriving, each hop landing, each repeat of a held jump), so a long frame can't carry a wall past the frog unjudged, and the hop is read at the instant of arrival rather than at the frame's end. A jump forward that reaches a wall's face is judged at once in the same way.
- **The frog is solid against a wall that overlaps it.** Having passed, its cells are all inside the opening, and they stay there until the wall has gone by: a move, a turn (wall kick included) or a hop that would put a cell into the wall's solid cells is refused, just as a move off the corridor edge is ignored, while moves that stay inside the opening are fine. A jump forward only takes the frog away from a wall it has passed.
- **The bonk.** A wall the frog fits passes around it. A wall it doesn't fit bonks it: the frog is knocked back from the wall's face by the bonk knock-back, a few jumps' distance, and no further than the start zone. The wall stays solid and keeps coming, so it bonks the frog again when it arrives unless the frog fits by then or has got clear. A jump forward into a wall the frog doesn't fit is a bonk too. Walls never let through a frog that doesn't fit, and never carry it along: the obstacles are becoming vehicles, and being carried along by one looks wrong. The walls are spaced so that a knock-back always lands the frog clear of every wall, and never reaches one it has passed; the rules refuse tuning that would allow it. That spacing also means no two walls overlap the frog at once.
- **Feedback is for bonks only.** A bonked frog is drawn knocked back along a low arc, squashed flat against the wall at first, and flashes pink. A pass has no feedback on the frog.
- **A jump back into a passed wall is refused.** A jump back that would leave the frog overlapping a wall it has already passed doesn't happen, just as a move off the corridor edge is ignored: no bonk, and no passing back through. So the frog can't jump back at all while a wall overlaps it.
- **A hop lifts the frog one cell for its airtime,** then it lands. A hop pressed while airborne is ignored. It is drawn as a smooth arc that rises quickly to a full cell and falls once the frog lands.
- **Riding.** A frog that is up while a row overlaps it rides the row: it stays up, gliding across the vehicles' low parts, until the row's back face has gone by, then lands, however long ago its airtime ran out. This is a mechanic, not a safeguard. It makes the hop's timing forgiving: a hop pressed early, whose airtime would end while the row goes by, still carries the frog across. And it looks like the frog gliding across a car's hood. The riding frog can still slide within the opening, and can jump forward, in the same pose and height, which stays inside the opening, so it reaches the row's back face and lands sooner. A held jump keeps repeating while it rides. A jump back follows the usual rule: refused while it would overlap the row. Riding has no visual of its own; the hop arc simply stays up.
- **Turning** is about the piece's middle. A turn that would poke out of the corridor is nudged one column back in, Tetris-style; if it still doesn't fit, the turn fails. A move off the corridor edge is ignored.
- The rules are pure functions of the run state and elapsed time, called from the render loop; the drawing updates Three objects directly, so React does not re-render per frame.

## The camera

The camera follows the frog from behind and above, higher than the tallest wall, so a wall passes beneath it and the camera never goes through one. It is pitched down at the floor a little ahead of the frog: steep enough to keep the frog in view, shallow enough to read the incoming wall's opening and judge how far away it is. A camera too high flattens depth. Its height, follow distance and look-ahead are knobs in `tuning.ts`.

## The fit outline

The frog's cells, at its current column, rotation and hop height, are always projected onto the face of the next wall it will meet, as an outline only: no fit colouring and no toggle. It follows the rule state instantly, so the player reads the fit from where the outline sits against the opening.

## The pass test

The frog passes a wall if every cell it covers is inside an opening: a subset test, checked when the wall reaches the frog. Any covered cell that meets the wall is a bonk, which knocks the frog back. Openings are usually larger than the piece; how tight they are is the difficulty dial.

## Controls

- **Move** left and right across the corridor.
- **Rotate** the piece.
- **Hop**: vertical, exactly one cell, for raised openings. The pass test decides a hop like anything else: a needless hop is fine as long as the piece still clears the opening, and it bonks only when there is no room above. A special rule punishing unneeded hops would be confusing.
- **Jump** forward or back along the course a fixed distance at a time. Jumping forward is the only way the frog advances; jumping back buys reading time. Holding a jump key keeps jumping at a steady cadence, so the player needn't mash it: the first jump comes on the press, then another every held-jump repeat interval, timed by the rules' own clock rather than the operating system's key repeat. A bonk doesn't stop the repeat: the next held jump comes a full repeat interval after the bonk, never at once, and a refused jump back doesn't stop it either. Releasing the key, or the window losing focus, lets go.

Hop and jump forward are different actions.

On touch screens (a starting point, to be tuned once it is playable):

- **Drag** left or right to move, one column per step of finger travel.
- **Tap** the left or right side to rotate counter-clockwise or clockwise.
- **Swipe up** to hop. A swipe fires as soon as the finger has travelled far enough, while a tap has to wait for the finger to lift before it can rule out a swipe, so the timing-critical hop belongs on a swipe.
- **Tap the centre** to jump forward, **swipe down** to jump back.

## Pieces

The frog's piece changes only at pull-offs. There is no Tetris-style hold, no dealt-piece queue and no next-piece preview.

- **Pull-offs** are lanes that appear at times on the left or right edge of the road, outside the traffic lanes, like the pull-offs on a mountain road. Level design chooses where they come and on which side.
- **A piece waits in each.** The frog can jump into a pull-off to rest there, and choose to take its piece. Its old piece is left behind in the pull-off: it can swap back, or a co-op partner can take it. The frog rejoins the traffic by jumping back onto the road.
- **Taking the piece is optional,** but the level can make it the smart way, or the only way, through the traffic ahead. Reading the road ahead is part of the skill.
- **In co-op only one player can take a waiting piece,** so the partners decide who.
- **A pull-off is wide enough for both its pieces** in some rotation, which the course builder guarantees.

Pull-offs aren't built yet.

## Courses and medals

A level is a course with an end zone, run against the clock: gold, silver and bronze times, in the manner of time-trial marble games. There is no endless mode and there are no lives. A bonk costs time: the ground it knocks the frog back is the penalty.

## Co-op

Solo is fully playable; co-op is optional. It runs over PeerJS through the repo's shared PeerJS wrapper (see Multiplayer in the root `CLAUDE.md`).

- Co-op players share the same space.
- Openings can be separate (who takes which) or shared (both frogs must squeeze into one).
- Players may need to hop together, or one hops and the other doesn't.
- Frogs are always solid to each other at the same depth. They get past each other by jumping forward or back.
- **Openings fill in.** A frog that passes through an opening fills the cells it used, like a landed Tetris piece, and a partner must fit through what is left. That is what makes a shared opening different from two separate ones: how the first frog goes through decides whether the second can. It also stops a trailing partner reusing the cells the leader just used, whatever their depths.
- **The team's time is the average of its players' finish times**, as in Forza Horizon 2's co-op Bucket List challenges: a fast player banks time a slower partner can spend. Everyone's result rides on everyone else's.
- The walls generated depend on the player count.
- The rules are written for a list of players from the start, with solo as a list of one. Wall generation, the pass test, frog-to-frog solidity, filled openings and the team clock all work on that list, so co-op is never retrofitted onto solo-only systems.

## Traffic

Obstacles are shaped vehicles on a road, not walls. "Wall" is prototype vocabulary and will go away.

- **For now, vehicles arrive lined up in rows at one speed.** Side by side as one row, they leave a gap the frog must match to pass: the Brain Wall moment.
- **A row is vehicles from the 19, side by side, one per lane.** Each vehicle (see The fleet) takes the lanes its silhouette spans, no two share a lane, and lanes may stay empty. There is no stacking yet. A row's solid cells are its vehicles' cells; everything else within the four rows is the opening. So the pass test, the bonk, a row's solidity while it overlaps the frog, riding and the looping traffic all work on a row exactly as on a wall.
- **No filler vehicles.** Smaller one-, two- and three-cell fillers were tried in analysis: they added clutter and didn't close the gaps they were meant to.
- **Rows are composed answer-first.** The composer picks the intended answer (a rotation, a column, and whether it hops), fills lanes one vehicle at a time with vehicles that keep the answer's cells open, then counts how many distinct poses the finished row lets through. It keeps the row only if that count suits the difficulty, and tries again otherwise. Easy rows let 4 to 14 poses through, medium 2 to 5, hard 1 or 2, and a hard row lets through none of the placements that passed the row before it, so the frog must change something. The harder the row, the more it prefers vehicles that close the open cells beside the answer. A raised answer must need its hop: a row built around one is kept only if no grounded pose passes. Every row is passable, because its answer is.
- **Known gap: rows rarely force the frog to lie flat.** A pose held down by a ceiling needs an overhang reaching over it from a neighbouring lane, and one vehicle per lane seldom gives one. If that is missed in play, the idea to try is vehicles carrying vehicles (stacking): analysis showed it raises the poses a row can force from 129 to 202 of 210.
- **Mixed speeds and staggered vehicles are tabled.** Staggered vehicles the frog weaves between, as in Frogger, and vehicles travelling at different speeds were part of the direction. The design problem that tabled them: getting vehicles at different speeds to arrive lined up into a matching row at the right moment is hard. Two v1 rules are proposed for when they are revisited: within a lane, a vehicle nearer the frog is never slower than one behind it; and a vehicle keeps a constant silhouette along its length, with solid sides. The earlier idea that a hop onto a vehicle stands on it is adopted, as riding (see The motion model).
- **Vehicle shapes are silhouettes chosen for gameplay,** and the art serves them: see The fleet.

## The fleet

The traffic is exactly the 19 fixed tetrominoes: every rotation of the seven pieces, with rotations that look the same counted once (I 2, O 1, S 2, Z 2, T 4, J 4, L 4). Each is its own vehicle, with an id made of its piece and the first rotation that gives its shape, such as `J2`. A vehicle drives head-on at the frog and never rotates. Its front silhouette, as the player sees it from behind the frog, is exactly its piece's four cells on the lane × row grid, resting on the road. Funky shapes, such as a long bar on top of a single wheeled cell, are intended.

The art serves the shape: fun, quirky vehicles that never hide which four cells they fill.

- **The silhouette is sacred.** Seen head-on, a vehicle's solid volume fills exactly its four cells. Nothing reaches into an empty cell of its bounding box or a neighbouring lane: not wheels, mirrors, antennas, exhausts, cargo, flags or smoke, because an intrusion would lie to the player about the opening. Details stay inside the cells' volume, standing proud of an outer face by no more than the surface-detail tolerance in `vehicles/parts.ts`, a few hundredths of a cell. A unit test checks every detail's front-projected bounds against its vehicle's cells.
- **Cells stay countable.** Every body cell carries the darker inset border the walls and the frog have: all round on its front and back, and along the seams on its sides and top, so the border never stretches with the length. Details sit inset from the cell edges so the seams show, and colour blocking by cell (a deck, an awning, a load) helps the count.
- **The silhouette is constant along the length.** Each body cell is one solid box the vehicle's whole length, one to three cells to suit its archetype, so the opening is the same wherever along the vehicle the frog is. Length is visual for now; the rules judge the front face.
- **No Tetris colours.** The paints are the fleet's own design tokens in `globals.css`, and none belongs to a piece: not the standard seven-colours-per-piece mapping, and never one main colour for every rotation of a piece (a test checks this). Vehicles are told apart by archetype, silhouette and decoration, not colour alone. This is deliberate distance from Tetris's protected look; see the legal note in `ideas/tetris-worlds-look.md`.
- **Procedural, in the game's look.** Vehicles are boxes and discs built in code and merged per paint, in the plain lit materials and lights of Look. There are no models, textures or fonts, so there is nothing to credit.

| Id | Name | Archetype |
|---|---|---|
| I0 | Plowzilla | Snowplough |
| I1 | Stack Attack | Quadruple-decker bus |
| O0 | Mr. Sprinkles | Ice-cream van |
| S0 | Happy Camper | Camper van |
| S1 | Sub Standard | Road submarine |
| Z0 | Bread Winner | Bakery van |
| Z1 | Land Galleon | Pirate ship on wheels |
| T0 | Big Cab | Taxi |
| T1 | Taco Tower | Food truck |
| T2 | Mow Problemo | Ride-on mower |
| T3 | Beach Patrol | Lifeguard tower buggy |
| J0 | Tractor Factor | Farm tractor |
| J1 | Claw Daddy | Crane truck |
| J2 | Top Dog | Hot-dog cart |
| J3 | Moon Hauler | Rocket transporter |
| L0 | Trash Panda | Garbage truck |
| L1 | Tall Latte | Coffee cart |
| L2 | Deck Hand | Car carrier |
| L3 | Cherry on Top | Cherry picker |

**The garage** shows the whole fleet: `?garage` on Frogmino's URL. Each vehicle appears twice: head-on through an orthographic camera, which is exactly its silhouette, over a faint lane × row grid, and turning slowly on a lane-grid plate in three-quarter view. One canvas behind the page draws every view into its card, so the page needs one WebGL context however many vehicles it shows.

## Levels

v1 levels are hardcoded or generated from a fixed seed, with rows from the answer-first composer (see Traffic). A floor row may let through fits that hop alongside a grounded one; that is good level design, not a flaw. The demo course has fifteen rows, spaced for a new player to read each one, ramping up by thirds: five easy, five medium, five hard. Raised rows come at the rate the composer finds natural, rarely when easy and more often as the difficulty climbs, about three a course. A level editor is a later idea.

## Look

Fun, quirky and colourful, in keeping with Novelty World: bright, flat and cartoony. Inspiration: see `ideas/tetris-worlds-look.md`.

- **Cells touch,** in walls and the frog, with no gaps between cubes. Every cell face has a darker inset border so the grid still reads.
- **Plain lit materials,** with no cel shading and no outline around shapes: toon bands and an inverted-hull outline were tried and dropped. The cell borders are what keep shapes and cells readable.
- **Lighting is simple:** one ambient light and one directional light. Richer lighting (postprocessing, ambient occlusion) is deferred.
- Walls are solid and opaque at all times.

## Theme

The obstacles are oncoming cars and trucks, as in Frogger (see Traffic). Cells blocked above an empty floor cell are fine: they are odd-looking vehicles with overhanging parts, like trailers and cabs. That is why the traffic moves toward the frog rather than the frog running at it. Nothing about the frog's look is decided yet.

## Sound

Sound comes later, with ZzFX: the MIT micro-library that generates retro sounds in code from arrays of parameters. There are no audio files and nothing to credit; the game designs its own sounds and varies their pitch, such as a subtle random pitch on the frequent move sound and a rising pitch on consecutive passes. Frequently played sounds are rendered once and replayed, not rebuilt on every play. Nothing is built yet.

## Open questions

- Is 0.7 s the right hop airtime? To be tuned in playtesting, like the bonk knock-back (three jumps) and the held-jump repeat interval (0.22 s).
- Networked co-op hop timing: each player's hop should be judged on their own timeline, with forgiving airtime. How exactly is still open.
- Vehicle length: how long must a fit be held?
- How co-op's "openings fill in" rule translates to vehicles.
- The code rename from wall to vehicle terminology, once the model changes.
