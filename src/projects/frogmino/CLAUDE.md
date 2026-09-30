# Frogmino

Brain Wall (the Japanese game show) meets Tetris, with Frogger-style hopping. The player is a frog shaped like a tetromino, and shaped vehicles come at it down a road: side by side, leaving a gap it must match (staggered vehicles to weave between are tabled: see Traffic). It is real-time, seen from behind the frog in real 3D with Three.js (through `@react-three/fiber`). Faked 2D depth was considered and rejected: it is harder to get right than real 3D.

The owner and a friend designed it. What follows is decided unless it sits under Open questions.

The obstacles are rows of traffic (see Traffic). The rules still call a row a wall, from the prototype: a row's vehicles are its solid cells and everything else on the face is its opening, so wherever the sections below speak of walls and openings, they mean a row as the rules see it.

## Code map

- `types.ts`: cells on the wall face, tetromino kinds, the frog, openings, spans of lanes, and a vehicle as the rules see it: the cells it fills and its length.
- `logic.ts`: pure piece rules, no React and no Three. The tetromino definitions, rotation, piece sizes, turning inside a span of lanes with a wall kick, where a piece first fits inside a span, the cells a frog covers, and the pass test.
- `run.ts`: pure run rules. The rule state of one playthrough (frog, traffic, clock), the frog's depth, the player's actions and held jumps, `advance` for moving time on, the overpass start and the drop, judging rows as they reach the frog, keeping the frog out of the vehicles still overlapping it, riding, the bonk, recycling the traffic out of view, the finish, and the pull-off rules: the lanes the frog may use at a depth, the barriers, and the swap.
- `traffic.ts`: a row of traffic (which vehicles, in which lanes) and the opening it leaves, refusing a row whose vehicles share a lane or leave the road; the row as the rules see it, each vehicle's cells and length; and where a row's back is.
- `composer.ts`: the answer-first row composer, for one piece or several at once and refusing others, the difficulty rules, and the poses a frog can take and which of them pass an opening.
- `course.ts`: the seeded course: fifteen rows up the difficulty ramp and where each starts along the course, spaced back to front, the pull-offs, where they come among the rows and which piece waits in each, and the pieces each row is built for.
- `pull-off.ts`: a pull-off's shape: its side, stretch, width and waiting piece, its lanes, its barriers' depth, and which pull-off the camera makes room for.
- `tuning.ts`: the feel knobs (wall speed and spacing, course length, how far behind the frog a row is recycled and how far ahead it reappears, hop airtime, ease duration, the drop's and the finish leap's durations, corridor size, jump distance, held-jump repeat interval, bonk knock-back, the camera's height, follow distance and look-ahead, the pull-offs' size and the pace the course places them for, and how the camera makes room for a pull-off), in one constants object. Tuning is done by editing it; there is no settings UI.
- `store.ts`: the Zustand store holding the course, which of its rows each wall of the traffic is, and the current run, with actions for key presses and releases, frame ticks and restart.
- `fleet.ts`: the 19 vehicle ids, derived from the tetromino definitions and rotation in `logic.ts`, each vehicle's cells, and each vehicle's length. It is the one definition of the vehicles; the rules and the art both key by its ids.
- `clearance.ts`: the ground clearance, how far everything drawn in the cell grid stands above the ground under it (see Look).
- `vehicles/`: the fleet's designs. `parts.ts` is the vehicle's own frame, the paints, the surface-detail tolerance and the helpers that place details on a cell's faces; `kit.ts` holds details many vehicles share (headlights, bumpers, windscreens, rings); `i.ts` to `l.ts` hold one piece's vehicles each; `index.ts` gathers them as `VEHICLES` and builds a `vehicleModel` from an id.
- `components/frogmino.tsx`: the root component, with the touch controls, the key legend, the mute button and the end-of-course overlay, or the garage when the URL has `?garage`, the world preview when it has `?world`, the sound audition when it has `?sounds`, or the frog preview when it has `?frog`. The scene is loaded browser-only because it reads its colours from the live stylesheet.
- `components/scene.tsx`: the 3D scene and the per-frame loop. It mounts the world, draws the frog (`FrogBody`) and its silhouette, each row's vehicles, the pull-offs and the fit outline, and runs the drawn frog's easing, knock-back, drop and finish leap, and the camera. Its colours come from the design tokens in `globals.css` through `themeColor` in `src/shared/lib/three/`, never hardcoded.
- `components/use-frog-keys.ts`: the keyboard controls, including holding and releasing the jump keys.
- `components/pull-offs.tsx`: the pull-offs as drawn: their ground, barriers and marker, and the piece waiting in each.
- `touch-gestures.ts`: the pure touch gesture recogniser, from pointer samples to the same actions the keys make, with its thresholds in `GESTURE_TUNING`.
- `components/use-frog-touch.ts`: feeds the play area's pointer events to the recogniser and its commands to the store. `components/touch-controls.tsx` is the touch layer over the play area, the touch hint and the Swap button.
- `components/vehicle.tsx`: the `Vehicle` component, drawing any of the 19 by id at a lane and depth, in the scene's axes, standing on its wheels. `components/vehicle-assets.ts` holds its materials, per-paint merged detail geometry, and the cell-border masks, which the frog and the pull-offs share.
- `components/garage.tsx`: the garage (see The fleet).
- `frog/`: the frog's design (see The frog), pure with no React or Three. `look.ts` is the variants (the two players and the waiting frog), their markings and pupils, and the tokens each part is painted from; `model.ts` builds a frog of any piece and rotation in its own frame, with the ground clearance; `motion.ts` is its life as a pure function of time: breathing, blinking, the throat, and the hop, landing and bonk.
- `components/frog/`: the frog's drawing. `frog-body.tsx` is `FrogBody`, `frog-assets.ts` its unit shapes and materials, and the same shapes in one material for the silhouette, and `frog-preview.tsx` the `?frog` page.
- `view.ts`: which screen the page opens on, from its URL (see Lobby).
- `coop.ts`: the co-op wire protocol and the waiting room's pure rules: who takes the partner's seat, starting a round on a seed, and when the host's game is listed. `coop-store.ts` holds the waiting room's state for the lobby's room handlers.
- `components/lobby.tsx`: the lobby (see Lobby), owning the peer room and the open-games list. `components/coop-room.tsx` is the waiting room and the coming-soon screen.
- `world/`: the world around the road (see World), pure layout with no React or Three. `geometry.ts` is the road's edges, the world box, footprints and the ground kept clear; `paints.ts` the world's paints and their tokens; `structures.ts` the overpass, the finish gantry and the finish's road paint; `props.ts` the roadside furniture and plants as boxes; `road.ts` the road tiles, with their surfaces, markings and seeded roadside; `scenery.ts` the land's layers, the landmarks and the clouds; `preview-rows.ts` the preview's traffic.
- `components/world/`: the world's drawing. `world.tsx` is `FrogminoWorld`; `box-instances.tsx` draws a list of world boxes as one instanced mesh; `sky.tsx` the sky dome, sun and clouds; `world-assets.ts` the palette and materials; `world-preview.tsx` the `?world` page. `components/camera-fit.ts` is the gameplay camera's pitch and fitted field of view.
- `audio/`: the sound (see Sound). `sounds.ts` holds the sound designs as ZzFX parameters, with each sound's variation, minimum gap and trigger, and renders a design's layers into one buffer; `player.ts` plays with the anti-annoyance rules behind a thin `AudioOutput` seam; `sound-board.ts` is the browser side, one AudioContext and the rendered buffers, and the trigger API; `cues.ts` turns store state changes into sounds; `use-game-sounds.ts` wires that to the store; `settings.ts` keeps mute and volume; `mute-button.tsx` and `sound-lab.tsx` are the mute toggle and the `?sounds` page. `zzfx.d.ts` types the part of ZzFX the game uses.

The project is a solo prototype so far, played by keyboard or touch, proving controls, motion and collision: an L piece that changes only at the three pull-offs, fifteen rows of traffic from a fixed seed ramping from easy to hard, drawn in the fleet's art on the world's mountain road, that loop as endless traffic, riding, the bonk, a start on the overpass and a finish on the gantry, with a done overlay and restart. There is no clock or medals. Co-op connects two players in the lobby, but there is no co-op play yet.

## The wall face

A wall is a grid of cells: columns across the corridor, rows up from the floor. An opening is a set of those cells. The frog is a tetromino with a lateral column (its leftmost cell), a rotation of quarter turns clockwise as the player sees it from behind, and a hop height of 0 or 1. A rotated piece always rests on the floor, or one cell above it when hopping.

## The motion model

What the rules decide is kept apart from what the player sees.

- **The course runs from an overpass to a finish gantry** on a road that never ends either way. Rows are placed along it and all move toward the start at the course's wall speed. The frog does not run on its own: it advances only by jumping forward, with no limit on how far ahead it may race.
- **The frog starts on the overpass,** standing on its deck above the start, out of play: the traffic drives on beneath it and no row judges it. It can slide and turn there to line itself up, but not hop, jump back or swap. Its first jump forward (W, or a tap in the centre) drops it onto the road a jump ahead, into play; a drop that would land it in a vehicle going by beneath is refused, like a jump back, and a drop onto a row's face is judged like any jump forward. There is no way back up. The drop is drawn as a short hop off the deck's lip and a fall to the road.
- **There is no safe start zone.** A jump back past the start is fine, and so is a knock-back: the road goes on behind the overpass, and the traffic follows the frog down it.
- **Traffic loops, and never runs out.** The run lines the course's rows up where the course puts them, then the course's rows again in order, each the spacing (with seeded jitter) beyond the back of the one before, until the traffic reaches the traffic horizon. A row whose back is the recycling distance behind the frog, behind the camera and out of its view, reappears ahead with the same vehicles: the spacing beyond the frontmost row's back, and never nearer the frog than the traffic horizon, beyond the world's fog. So a row never appears or vanishes on screen, however far ahead or behind the start the frog is, and it is judged afresh when it arrives. Both distances are knobs in `tuning.ts`.
- **Rows are spaced back to front.** Every vehicle's front in a row lines up; each reaches back its own length from the fleet (two or three), so the row's back is wherever its longest vehicle ends. The spacing is the gap from one row's back to the next row's front, so the time to read the next row doesn't depend on how long the vehicles are.
- **Crossing the finish line ends the run.** A jump forward that reaches the finish line, under the finish gantry, crosses it: the rules stop there, so no row can judge or bonk the frog again, a held jump lets go and a hop lands. The frog springs up from the spring pad onto the gantry's deck in a celebratory leap, spinning once on the way, and stands there while the traffic keeps driving underneath. The done screen comes once it lands.
- **The frog's rule state is discrete** (column, rotation, depth and whether it is up from a hop) and changes the instant a key is pressed, with no tick delay. One press is one action, and the operating system's key repeat is ignored; only a held jump key repeats (see Controls). Its depth changes a jump or a bonk at a time.
- **The drawn frog eases toward its rule state** over the ease duration: position, rotation and depth. The rules never see the in-between. While a wall overlaps the drawn frog, it is drawn exactly at its rule state instead: an eased turn swings cells through places neither pose covers, and a move made just before a wall arrives may not have finished easing, so either would draw the frog inside the wall.
- **Walls move continuously.** A wall's depth is a real number that falls by the wall speed times each frame's elapsed time. Frame time is clamped, so returning to a backgrounded tab doesn't lurch the course forward.
- **Every wall the frog hasn't passed is ahead of it, and every wall it has passed is behind it.** Each rule keeps that true, and it is what makes each arrival judged exactly once.
- **The frog and every vehicle have depth,** as drawn: the frog one cube, each vehicle its own length. A vehicle overlaps the frog while their depth ranges along the course intersect: from the instant the row's front face reaches the frog's until the vehicle's own back face goes by the frog's.
- **A wall is judged when it reaches the frog,** once, when its front arrives and the overlap begins, against all its vehicles, using the frog's rule column, rotation and hop at that instant. Within a frame, everything happens in order at its own instant (each wall arriving, each hop landing, each repeat of a held jump), so a long frame can't carry a wall past the frog unjudged, and the hop is read at the instant of arrival rather than at the frame's end. A jump forward that reaches a wall's face is judged at once in the same way.
- **The frog is solid against the vehicles that overlap it,** each for as long as it overlaps. Having passed, its cells are all inside the opening, and they stay clear of every vehicle until it has gone by: a move, a turn (wall kick included) or a hop that would put a cell into an overlapping vehicle's cells is refused, just as a move off the corridor edge is ignored, while moves that stay clear are fine. Once a shorter vehicle has gone by, its lanes are free, while a longer neighbour still overlaps. So the opening can only grow after the row is judged, never shrink. A jump forward only takes the frog away from a wall it has passed.
- **The bonk.** A wall the frog fits passes around it. A wall it doesn't fit bonks it: the frog is knocked back from the wall's face by the bonk knock-back, a few jumps' distance, however far behind the start that takes it. The wall stays solid and keeps coming, so it bonks the frog again when it arrives unless the frog fits by then or has got clear. A jump forward into a wall the frog doesn't fit is a bonk too. Walls never let through a frog that doesn't fit, and never carry it along: the obstacles are becoming vehicles, and being carried along by one looks wrong. The rows are spaced, back to front, so that a knock-back always lands the frog clear of every row, and never reaches one it has passed, however long its vehicles; the rules refuse tuning that would allow it. That spacing also means no two walls overlap the frog at once.
- **Feedback is for bonks only.** A bonked frog is drawn knocked back along a low arc, and the frog itself flattens against the row and is left dazed (see The frog). A pass has no feedback on the frog. The pink bonk flash of the cube frog is gone: the dazed look reads on both players' frogs, where pink suited only the green one.
- **A jump back into a passed wall is refused.** A jump back that would leave the frog overlapping any vehicle of a wall it has already passed doesn't happen, just as a move off the corridor edge is ignored: no bonk, and no passing back through. So the frog can't jump back at all while a vehicle overlaps it, nor into one that has only just gone by.
- **A hop lifts the frog one cell for its airtime,** then it lands. A hop pressed while airborne is ignored. It is drawn as a smooth arc that rises quickly to a full cell and falls once the frog lands.
- **Riding.** A frog that is up while a row overlaps it rides the row: it stays up, gliding across the vehicles' low parts, until the last of the row's vehicles has gone by, then lands, however long ago its airtime ran out. This is a mechanic, not a safeguard. It makes the hop's timing forgiving: a hop pressed early, whose airtime would end while the row goes by, still carries the frog across. And it looks like the frog gliding across a car's hood. The riding frog can still slide within the opening, and can jump forward, in the same pose and height, which stays inside the opening, so it clears the vehicles and lands sooner. A held jump keeps repeating while it rides. A jump back follows the usual rule: refused while it would overlap the row. Riding has no visual of its own; the hop arc simply stays up.
- **Turning** is about the piece's middle. A turn that would poke out of the lanes the frog may use (the corridor, and a pull-off's lanes beside its stretch) is nudged one column back in, Tetris-style; if it still doesn't fit, the turn fails. A move off the corridor edge is ignored.
- The rules are pure functions of the run state and elapsed time, called from the render loop; the drawing updates Three objects directly, so React does not re-render per frame.

## The camera

The camera follows the frog from behind and above, higher than the tallest wall, so a wall passes beneath it and the camera never goes through one. It is pitched down at the floor a little ahead of the frog: steep enough to keep the frog in view, shallow enough to read the incoming wall's opening and judge how far away it is. A camera too high flattens depth. Its height, follow distance and look-ahead are knobs in `tuning.ts`. It rises and falls with the ground under the frog: the overpass's deck at the start, the road, and the finish gantry's deck at the end.

**Near a pull-off the camera pans across,** easing sideways by half the pull-off's width so the view is centred on the road and the pull-off together, and eases back once the frog has gone by the far barrier. It starts making room when the pull-off's near barrier is within the camera's pull-off reach ahead of the frog (12 units), and takes about the camera's pull-off ease (0.6 s) to get there; both are knobs in `tuning.ts`. It only pans: the road and a 3-lane pull-off fit across even a narrow portrait screen at the frog's distance, so the field of view doesn't change.

## The fit outline

The frog's cells, at its current column, rotation and hop height, are always projected onto the face of the next wall it will meet, as an outline only: no fit colouring and no toggle. It follows the rule state instantly, so the player reads the fit from where the outline sits against the opening.

## The pass test

The frog passes a wall if every cell it covers is inside an opening: a subset test, checked when the wall reaches the frog. Any covered cell that meets the wall is a bonk, which knocks the frog back. Openings are usually larger than the piece; how tight they are is the difficulty dial.

## Controls

- **Move** left and right across the corridor.
- **Rotate** the piece.
- **Hop**: vertical, exactly one cell, for raised openings. The pass test decides a hop like anything else: a needless hop is fine as long as the piece still clears the opening, and it bonks only when there is no room above. A special rule punishing unneeded hops would be confusing.
- **Jump** forward or back along the course a fixed distance at a time. Jumping forward is the only way the frog advances; jumping back buys reading time. Holding a jump key keeps jumping at a steady cadence, so the player needn't mash it: the first jump comes on the press, then another every held-jump repeat interval, timed by the rules' own clock rather than the operating system's key repeat. A bonk doesn't stop the repeat: the next held jump comes a full repeat interval after the bonk, never at once, and a refused jump back doesn't stop it either. Releasing the key, or the window losing focus, lets go.
- **Swap** the frog's piece for the one waiting in a pull-off (C), while the frog is entirely inside it (see Pieces).

Hop and jump forward are different actions.

On touch screens every finger on the play area is its own gesture, so one thumb can hold the centre while the other steers. The screen is split into thirds, left, centre and right, by where a finger comes down. A finger that stays within the tap slop (12 CSS pixels) is a tap or a hold; one that leaves it is a drag if it went more sideways than up or down, and a swipe otherwise, and it never becomes anything else. So one gesture is only ever one of tap, drag, swipe or hold.

- **Drag** left or right, anywhere, to move one lane per 32 CSS pixels of finger travel, like mobile Tetris: a fast drag moves several lanes at once, and dragging back moves back. At 360px wide the corridor fits within one thumb's sweep.
- **Tap** the left or right third to rotate counter-clockwise or clockwise.
- **Swipe up** to hop, **swipe down** to jump back. A swipe fires the moment the finger has travelled 32 CSS pixels, mid-gesture, not on lifting, and once per gesture. A tap has to wait for the finger to lift before it can rule out a swipe, so the timing-critical hop belongs on a swipe.
- **Tap the centre** to jump forward. **Press and hold** it to keep jumping, exactly as holding W: after 280 milliseconds still, the held jump starts (one jump, then one every held-jump repeat interval), and lifting the finger lets go. A still finger makes no events, so the hold's threshold is the one thing timed; a move event past it counts too. Only one finger holds at a time.
- **Swap** in a pull-off is a Swap button at the bottom centre, shown only while the frog is fully inside a pull-off, which is exactly when a swap can happen. A button was chosen over tapping the waiting piece: it is big and plain at 360px, it needs no hit-testing in the 3D scene, and it can't be mistaken for a centre tap.

Mouse pointers are left to the keyboard. The play area takes no browser gestures: no scrolling, zooming, pull-to-refresh, text selection or long-press callout. The mute button and the done screen sit above the touch layer and keep their own taps; on touch screens the done screen has a Restart button, since there is no R key.

**The touch hint** shows on touch screens only (a coarse pointer), over the play area: the three zones with their taps and the hold, and the drag and swipes beneath. It goes once the player has made three gestures, and the keyboard legend shows only for fine pointers.

## Pieces

The frog's piece changes only at pull-offs. There is no Tetris-style hold, no dealt-piece queue and no next-piece preview. The frog's piece is part of its rule state, and every rule works for all seven pieces: passing, the bonk, solidity, riding, turning with its kick, the fit outline and the drawn frog.

**Pull-offs** are like the pull-offs on a mountain road: lanes beside the road, outside the traffic lanes, on its left or right edge, spanning a fixed stretch of the course with a barrier at each end. They never move; the rows keep coming along the traffic lanes past them, and no vehicle ever enters one.

- **Size.** A pull-off is 3 lanes wide and 6 units long between its barriers: four jumps, enough that a jump from outside always lands somewhere inside it, which the rules check. Both are knobs in `tuning.ts`. A barrier is a block one unit deep in each of its lanes at each end.
- **The frog's lanes.** Traffic lanes run from 0 across the road, so a left pull-off's lanes are negative and a right one's follow the last traffic lane. The frog may use a pull-off's lanes only while its whole depth lies within the pull-off's stretch: beside a barrier, and anywhere else along the road, only the traffic lanes count.
- **Entering and leaving.** The frog slides in from the outer traffic lane, one lane a press, while its depth is inside the stretch, and leaves by sliding back. A slide or turn that would put any cell outside both the traffic lanes and the pull-off's lanes, or into a barrier, is refused, just as a move off the corridor edge is. So is a jump forward or back that would carry any part of the frog past either end of the stretch while it has a cell in pull-off lanes; a refused jump, held, keeps repeating.
- **Traffic beside a pull-off.** A frog's cells in pull-off lanes never meet a vehicle. Wherever it has cells in traffic lanes, the usual rules apply to those cells: a row passes if they are all in its opening, they must stay in the opening while the row overlaps (sliding further into the pull-off is fine, sliding onto the road into a vehicle is refused), and a frog up while a row overlaps it rides the row. A frog entirely inside a pull-off is passed by every row, and doesn't ride.
- **A row arriving at a frog straddling the edge** is judged on its cells in traffic lanes only. If they fit, it passes. If any meets a vehicle, the frog is bonked: knocked back as usual, and onto the road, shifted sideways just far enough that every cell is in traffic lanes, since the knock-back can carry it past the stretch.
- **A piece waits in each,** one of the seven, drawn resting on the pull-off's ground against its far barrier, in the frog's colour but see-through, so it reads as a piece to take rather than a second frog.
- **The swap.** C swaps while the frog is entirely inside a pull-off: every cell in its lanes, its depth within the stretch. The frog becomes the waiting piece, and its old piece is left behind as the new waiting piece, so a second swap swaps back. The new piece keeps the frog's rotation and lane if it fits there entirely inside the pull-off; otherwise it takes the first rotation, then lane, that does. Depth and hop are kept. A swap anywhere else does nothing.
- **Taking the piece is optional,** but the level can make it the smart way, or the only way, through the traffic ahead. Reading the road ahead is part of the skill.
- **A pull-off is wide enough for every piece that can be swapped in it** in some rotation, which the course builder asserts as it builds the course.

**The course keeps every stretch passable** by tracking the pieces the frog could be holding through it (see Levels). Rows are built answer-first for pieces, so each row is built for the pieces the frog could be holding when it meets it:

- **Before the first pull-off,** the start piece.
- **An either-piece stretch,** the rows from a pull-off to the next, is passable by the piece the frog may arrive with and by the waiting piece, since it may or may not have swapped. The waiting piece is one the frog can't already be holding.
- **A forced stretch** is passable only by the waiting piece, and none of its rows lets through any piece the frog may arrive with, so it must swap. A pull-off forces exactly when the frog could be holding either of two pieces as it arrives: forcing is what brings the pieces it could hold back down to one, so no row is ever built for more than two. The course data marks each pull-off as forced or not.
- **After a forced stretch** the next pull-off holds the start piece, so every row outside a forced stretch lets the start piece through.
- **Forced stretches sit among the hard rows.** Shutting a piece out takes a tight row: an easy or medium row that lets the waiting piece through several ways almost always lets the other pieces through too.

**In co-op** (design only, not built): each pull-off still holds one waiting piece, and only one player can take it, so the partners decide who. The piece left behind is waiting like any other, and either player can take it.

## Courses and medals

A level is a course with a finish line, run against the clock: gold, silver and bronze times, in the manner of time-trial marble games. There is no endless mode and there are no lives. A bonk costs time: the ground it knocks the frog back is the penalty.

## Lobby

The page opens on the lobby, built on the shared `GameLobby`. It offers three ways in:

- **Play solo** starts the solo game at once.
- **Host co-op** opens a peer room and lists it on the open-games list.
- **Join** is a click on a game in that list, which joins its room by code under the hood. There is no typing of codes: every hosted game is public, which suits a small site played among friends.

The open-games list is the shared room list (see Multiplayer in the root `CLAUDE.md`), updating live as games are hosted, fill, start or close. A game is listed only while its host is connected and waiting for a partner: co-op is two frogs, so a game drops off the list once it has a partner or starts, and when its host leaves or closes the tab. It comes back if the partner leaves before the round.

**The waiting room** lists the players by their profile names, with the room's connection status (connecting, connected, reconnecting). The host has a Start button, enabled once a partner is in. A guest whose host leaves is told so, a guest who clicks a game whose host has gone is told it has closed (the peer module's `not-found`), and a guest who arrives after the seat was taken is turned away with a note. Leaving, or closing the tab, takes the room down through the peer module.

**Co-op play isn't built yet:** the rules still handle one frog. Start moves both players to a "coming soon: you're connected!" screen showing the course seed they share, with a way back to the lobby.

**The protocol** (`coop.ts`) follows the root `CLAUDE.md`: guests send intents, the host decides and sends results. Defined so far, host to guest:

- `start`, carrying the course seed. The host draws the seed and sends it with Start, so both frogs grow the same course from it.
- `full`: the guest is turned away, because the game already has its partner or has started.

There are no guest intents yet; co-op play adds the frog's actions.

**The URL switches.** `view.ts` resolves the URL to one screen. `?play=solo` skips the lobby into solo play, so loading the page straight into the game still works; any other `play` value fails loudly. The dev views replace the game and win over `?play`: `?garage` (the fleet), `?world` (the world preview), `?sounds` (the sound audition) and `?frog` (the frog preview), in that order of precedence.

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
- **Rows are composed answer-first.** The composer picks the intended answer (a rotation, a column, and whether it hops) for each piece the row is for, fills lanes one vehicle at a time with vehicles that keep the answers' cells open, then counts how many distinct poses of each piece the finished row lets through. It keeps the row only if each count suits the difficulty, and no piece it must refuse passes at all, and tries again otherwise. Easy rows let 4 to 14 poses through, medium 2 to 5, hard 1 or 2, and a hard row lets through none of the placements that passed the row before it, so the frog must change something. The harder the row, the more it prefers vehicles that close the open cells beside the answer. A raised answer must need its hop: a row built for several pieces raises all their answers or none, and a raised row is kept only if no grounded pose of any of them passes. Every row is passable by each of its pieces, because its answers are.
- **Known gap: rows rarely force the frog to lie flat.** A pose held down by a ceiling needs an overhang reaching over it from a neighbouring lane, and one vehicle per lane seldom gives one. If that is missed in play, the idea to try is vehicles carrying vehicles (stacking): analysis showed it raises the poses a row can force from 129 to 202 of 210.
- **Mixed speeds and staggered vehicles are tabled.** Staggered vehicles the frog weaves between, as in Frogger, and vehicles travelling at different speeds were part of the direction. The design problem that tabled them: getting vehicles at different speeds to arrive lined up into a matching row at the right moment is hard. Two v1 rules are proposed for when they are revisited: within a lane, a vehicle nearer the frog is never slower than one behind it; and a vehicle keeps a constant silhouette along its length, with solid sides. The earlier idea that a hop onto a vehicle stands on it is adopted, as riding (see The motion model).
- **Vehicle shapes are silhouettes chosen for gameplay,** and the art serves them: see The fleet.

## The fleet

The traffic is exactly the 19 fixed tetrominoes: every rotation of the seven pieces, with rotations that look the same counted once (I 2, O 1, S 2, Z 2, T 4, J 4, L 4). Each is its own vehicle, with an id made of its piece and the first rotation that gives its shape, such as `J2`. A vehicle drives head-on at the frog and never rotates. Its front silhouette, as the player sees it from behind the frog, is exactly its piece's four cells on the lane × row grid, resting on the road. Funky shapes, such as a long bar on top of a single wheeled cell, are intended.

The art serves the shape: fun, quirky vehicles that never hide which four cells they fill.

- **The silhouette is sacred.** Seen head-on, a vehicle's solid volume fills exactly its four cells. Nothing reaches into an empty cell of its bounding box or a neighbouring lane: not wheels, mirrors, antennas, exhausts, cargo, flags or smoke, because an intrusion would lie to the player about the opening. The ground clearance under a vehicle's lowest cells holds its wheels, which reach down to the road, and nothing else; nothing hangs in the clearance under an empty lane. Details stay inside the cells' volume, standing proud of an outer face by no more than the surface-detail tolerance in `vehicles/parts.ts`, a few hundredths of a cell. A unit test checks every detail's front-projected bounds against its vehicle's cells.
- **Cells stay countable.** Every body cell carries the darker inset border the walls and the frog have: all round on its front and back, and along the seams on its sides and top, so the border never stretches with the length. Details sit inset from the cell edges so the seams show, and colour blocking by cell (a deck, an awning, a load) helps the count.
- **The silhouette is constant along the length.** Each body cell is one solid box the vehicle's whole length, two or three cells to suit its archetype, so the opening is the same wherever along the vehicle the frog is. The lengths are the fleet's, in `fleet.ts`, and the rules keep each vehicle solid for exactly its length (see The motion model).
- **No Tetris colours.** The paints are the fleet's own design tokens in `globals.css`, and none belongs to a piece: not the standard seven-colours-per-piece mapping, and never one main colour for every rotation of a piece (a test checks this). Vehicles are told apart by archetype, silhouette and decoration, not colour alone. This is deliberate distance from Tetris's protected look; see the legal note in `ideas/tetris-worlds-look.md`.
- **Procedural, in the game's look.** Vehicles are boxes and discs built in code and merged per paint, in the plain lit materials and lights of Look. There are no models, textures or fonts, so there is nothing to credit.
- **No depth fighting.** Paint lies on a face in layers of one thickness (`LAYER` in `vehicles/parts.ts`): a detail on a decal sits a layer higher and inset from its edges, and stripes of two paints lie side by side in one layer. A layer is more than the depth buffer resolves where the traffic is farthest, and two fit within the surface-detail tolerance. A unit test runs the world's face scanner (`world/coplanar.ts`) over every vehicle and every pose of the frog for faces of different paints closer than that.

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

## The frog

The player is a frog shaped like its piece. It has to read as the same frog character in all 28 poses (seven pieces, four rotations), change piece at a pull-off without becoming someone else, and never lie about its cells. The fleet's art rules all apply: the art serves the shape, the silhouette is sacred, cells stay countable, and it is boxes, balls and discs built in code in the plain lit materials of Look, with the shared cell border and no outlines or toon shading, so there is nothing to credit.

- **The features stay upright; the head is the top row.** Whatever the piece and rotation, the head is the piece's top row, with two eyes on top of it, centred on the row's middle half a cell apart, and the legs are under its bottom row, on the road. The eyes never rotate with the piece. A frog whose eyes turned with it would be upside down or on its side in half its poses, with its eyes underneath or facing away from the camera, and the eyes would jump round the shape on every turn. Upright, the eyes are always at the top of the shape, where the player is already looking to read the next row, and the frog always sits the right way up, like a real frog, whose eyes are its highest point. A turn still swings the whole body; the features are already seated for the new pose.
- **Seen from behind, the eyes bulge up out of the head, never above it.** The camera sees the frog's back and top, and a frog from behind is two eye bumps on its head: that is the look to keep. Eyes above the head would reach into the empty cell above it. The head's cells are shaped along their depth instead, which the silhouette doesn't see: a full-height snout ridge across the front keeps each head cell a full square head-on, the back of the head sits lower, and the eyes bulge up out of that dip to exactly the cells' top. Each eye is a skin bump holding a white with its pupil near the top, facing up and back, so the frog looks up at the player.
- **The legs stand in the ground clearance.** Everything drawn in the cell grid is lifted by the ground clearance (see Look), so feet and wheels touch the road while the rules stay unchanged; the frog takes it as a parameter, the shared clearance by default. The frog's legs live only in that gap, only under its bottom row: two hind legs at the row's ends with big webbed feet reaching back toward the camera, and two small front feet. With no clearance it has no legs. They tuck away into the body for the whole hop, so a frog riding a vehicle sits on its roof rather than standing in it.
- **Cells stay countable.** Every cell carries the cell border, and every cell's back, which always faces the camera, carries the same marks, as do exposed tops away from the head: count the spots, count the cells. The mouth, a wide dark line across the front of the head, and the throat under it are on the front, seen in a pull-off or on the turntable.
- **Distinct from Tetris.** It is plainly a frog, with eyes, spotted skin and webbed feet, and its colours are its own tokens in `globals.css`, the same for every piece and far from any Tetris piece colour (a test checks this); see the legal note in `ideas/tetris-worlds-look.md`.
- **Life, kept subtle.** It breathes, blinks now and then (sometimes twice), and puffs its throat, each on a deterministic schedule seeded per frog, so two frogs are never in step. A hop narrows it as it stretches up and tucks its legs, a landing squashes it, and a bonk flattens it against the row along the road, then leaves it dazed for a moment, its pupils circling and its lids drooping. None of it can reach into an empty cell: every cell only ever shrinks toward a point in itself, never grows, and the throat grows only as far as its cell has room for. Unit tests hold every part of every pose, with the throat fully puffed and the pupils anywhere on their circle, to the frog's cells and the clearance under its bottom row, and every motion to its limits.
- **The co-op pair.** The two players are a matched pair of real frogs, not a recolour: P1, Sprout, a leaf-green tree frog with a sunny belly, orange feet, one big round spot per cell and round pupils; P2, Splash, an azure dart frog with a pale belly, pink feet, two freckles per cell and bar pupils. Green and orange beside blue and pink complement each other, and both stand out on the slate road. Their skins differ in lightness as well as hue, and their markings in shape, so they tell apart at a glance even for a colour-blind player, and even as the same piece side by side.
- **The waiting frog,** Snooze, is the piece waiting in a pull-off: a pale sage frog with its eyes shut, breathing slow and deep, which reads as a frog you could become rather than a second player.

**The frog preview** is `?frog` on Frogmino's URL. It shows every piece in every rotation, from the gameplay camera's direction over the lane × row grid on the frog's front face (lifted by the clearance), or flat from straight behind, where the outline is exactly the silhouette on the grid; a turntable of the selected pose; the three frogs side by side; and the co-op pair together, as the same piece and as different pieces. Its buttons play a hop (up a cell and down again, as the game's arc does), a bonk and idle on every frog at once, and switch which frog the grid shows.

**In the game.** The gameplay scene draws the player's frog with `FrogBody`, as P1 (Sprout) in solo; co-op's variants come with co-op play. It is placed by the frog's pivot (`frogPivot`, the middle of its cells), so it turns about the piece's middle, and drawn at the rule rotation at once, easing only the leftover swing, since the features are seated for the rule pose. It plays a hop when a hop starts (and as it drops from the overpass or leaps onto the gantry), a landing when the drawn frog comes down, after riding too, and a bonk on a bonk. The piece waiting in a pull-off is still drawn as a see-through piece, since pull-offs are on their way out of gameplay.

## Levels

v1 levels are hardcoded or generated from a fixed seed, with rows from the answer-first composer (see Traffic). A floor row may let through fits that hop alongside a grounded one; that is good level design, not a flaw. The demo course has fifteen rows, spaced for a new player to read each one, ramping up by thirds: five easy, five medium, five hard. Raised rows come at the rate the composer finds natural, rarely when easy and more often as the difficulty climbs, about three a course. A level editor is a later idea.

The demo course has three pull-offs, the level design's choice of where they come among the rows: after the fourth row, the tenth and the twelfth. The first leads to an either-piece stretch, the second forces (its stretch is the two hard rows after it), and the third hands back the start piece. The seed chooses each pull-off's side and the waiting pieces of the first two. Each pull-off sits along the course where a frog advancing at the course's pull-off pace (4.5 units a second, counting its waits, a knob in `tuning.ts`) would be between the rows either side of it: rows come at the frog as it goes, so it meets a row well short of where the row starts.

## Look

Fun, quirky and colourful, in keeping with Novelty World: bright, flat and cartoony. Inspiration: see `ideas/tetris-worlds-look.md`.

- **Cells touch,** in walls and the frog, with no gaps between cubes. Every cell face has a darker inset border so the grid still reads.
- **Plain lit materials,** with no cel shading and no outline around shapes: toon bands and an inverted-hull outline were tried and dropped. The cell borders are what keep shapes and cells readable.
- **Lighting is simple:** one ambient light and one directional light. Richer lighting (postprocessing, ambient occlusion) is deferred.
- Walls are solid and opaque at all times.
- **The ground clearance.** Everything drawn in the cell grid stands a quarter of a cell above the ground under it: the vehicles, the frog, the fit outline and the piece waiting in a pull-off. It leaves room for a vehicle's wheels and the frog's legs to reach down to the road. It is purely visual, one constant (`GROUND_CLEARANCE` in `clearance.ts`) that the vehicles, the frog and the structures' headroom all read; the rules count rows from the top of it.
- **The frog's silhouette.** Wherever a vehicle, the overpass or the finish gantry hides the frog from the camera, its hidden parts show as a flat silhouette in its own token colour: the frog drawn a second time, in one unlit material that draws only where something is in front of it, after the traffic and the world and before the frog itself. Vehicles stay opaque.
- **Pull-offs** are packed gravel, a clear step apart from the road, with a road-works orange barrier block in each lane at each end and a tall yellow marker post, topped with a diamond, on the outer corner of the near end, to be seen from far down the road. Their colours are tokens in `globals.css`.

## Theme

The obstacles are oncoming cars and trucks, as in Frogger (see Traffic). Cells blocked above an empty floor cell are fine: they are odd-looking vehicles with overhanging parts, like trailers and cabs. That is why the traffic moves toward the frog rather than the frog running at it. The frog is a frog: see The frog.

## World

The world around the road frames the gameplay and never competes with it: the same rules as the fleet's art. Its theme is a mountain road at golden hour, the road the pull-offs are modelled on: the mountainside rising on the left with more rocks and trees, the valley side on the right with more guard rails. It is procedural, built from boxes in code in the fleet's plain lit materials, with a fainter version of the cell border on its blocks, and no models, textures or fonts, so there is nothing to credit.

- **The road never ends,** either way. A bonk can knock the frog back past the start, and traffic comes from far up the road, so the road, its roadside and the land are laid out in tiles around the camera and rebuilt as it moves onto a new one. Each tile is laid out from the course seed and its own index alone, so it comes back the same every time. The sky, the clouds and the ground follow the camera. Ahead, the road reaches past the fog's far end, so it fades into the horizon haze rather than ending.
- **The road:** a slate surface over the traffic lanes, with faint dashed lines between the lanes, a step lighter than the road so they help judge lanes without looking like the cell grid or competing with the fit outline. Solid edge lines turn dashed where a pull-off opens. Beyond each edge are a gravel shoulder and a low kerb, both stopping for each pull-off and its barriers.
- **The overpass** crosses the road at the course's start: the frog starts on its deck and jumps down to the road, and the traffic drives on under it and away. **The finish gantry** spans the road at the course's end, a chequered beam on chequered towers with pink flags, with a deck the frog can stand on after finishing. Beneath its near face a chequered finish line is painted across the road, and just short of it a pink spring pad with a chevron per lane, which is decoration until the frog leaps from it. Both decks clear the tallest vehicle, lifted by the ground clearance, with headroom, and their pillars stand clear of the lanes and verges. The frog starts on the one and finishes on the other (see The motion model).
- **Readability rules,** which unit tests hold the layout to. Nothing stands on the road or in a pull-off, or within a clearance around it. Near the road everything stays under the near-height limit, well under a cell, so it never hides a lane, a pull-off or the frog from the camera; anything taller, such as trees and hills, keeps its whole footprint beyond the tall offset from the road's edge. The world's paints are its own tokens in `globals.css`, soft and muted, and none is a vehicle's saturated body paint, so nothing beside the road reads as traffic.
- **Depth.** The land beyond the roadside comes in layers of stepped, terraced hills: grassy knolls, then ridges, then snowy peaks, with two landmarks along the course (a boulder with a frog's eyes, and a mesa shaped like a T). The further a layer, the paler and bluer its paints, and a fog in the horizon's colour carries that on, starting beyond the rows the player reads, so the background recedes and the road and traffic stand out. The camera travels along the road, so each layer's distance sets how slowly it drifts by: that is the parallax.
- **The sky** is a gradient dome from warm haze at the horizon to blue overhead, with a blocky low sun and chunky clouds drifting slowly across. At the gameplay camera's pitch, a wide screen's view ends on the ground well short of the horizon, so the sky and the far peaks show on narrow portrait screens, and the knolls, trees and nearer ridges frame the road on wide ones.
- **Cheap on older phones.** Every list of boxes is one instanced mesh, so the whole world is a handful of draw calls, and the tiles are rebuilt only when the camera crosses into a new one.
- **No depth fighting.** No two faces of the world that look the same way share a plane, since the depth buffer can't tell which is in front and they flicker. Paint lies on a surface in thin layers, paint on paint a layer higher; the chequers on a deck's faces are set into the deck rather than laid on it; and parts that touch meet face to face or only along an edge. A unit test scans the whole layout, over several seeds, for faces sharing a plane (`world/coplanar.ts`). The depth buffer's precision depends mostly on the camera's near plane, which sits as far out as the camera allows (`CAMERA_NEAR` in `components/camera-fit.ts`).

`FrogminoWorld` takes the course length, the course's pull-offs (the side, the stretch along the course and the width in lanes of each, the course's own `PullOffStretch`) and the course seed. It draws in the game scene's axes, adds the fog, and relies on the scene's lights. The gameplay scene mounts it in place of its own floor: the world's road leaves gaps in its shoulders and kerbs for exactly the course's pull-offs, and `components/pull-offs.tsx` draws each pull-off's ground, barriers and marker in them. The scene's old per-jump cross-lines are gone: the world's lane dashes and the steady rhythm of the kerb blocks and reflector posts already give distance, and lines across the lanes read as the cell grid.

**The world preview** is `?world` on Frogmino's URL: the world from the gameplay camera, with a few rows of traffic coming at a stand-in frog that takes a pose passing the next row. The frog waits on the overpass, then jumps down and drives up the road, past the finish gantry and on. The buttons drive the camera up or back down the road (past the overpass, to check the road goes on), fast or paused, restart it, and switch the world off to compare with the bare road. The pull-offs there are sample stretches with stand-in surfaces.

## Sound

Sound complements the gameplay and never gets in its way, like the art. It adds a little polish and fun, never overwhelms the player, and must not get repetitive or annoying, so only moments worth marking have a sound. It is made with ZzFX, the MIT micro-library that generates retro sounds in code from arrays of parameters: no audio files, and nothing to credit, since code libraries aren't credited. The palette is soft retro: sine and triangle waves, mostly through a low-pass filter, never harsh square beeps.

**The set.**

- **Hop:** a light springy boing as a hop starts. It can come at most once per airtime, so it is short and quiet.
- **Bonk:** a comedic thud, a falling boink over a low bump, when a row knocks the frog back.
- **Row passed:** a small pop as the frog fits through a row. Each clean pass in a row climbs one note of the major pentatonic scale, up to the octave, and a bonk or a restart starts it over: the reward for a streak, heard rather than shown.
- **Drop onto the road:** a short falling whistle and plop, as the frog drops from the start overpass.
- **Pull-off swap:** a quick two-note blip as the frog takes a pull-off's piece.
- **Finish:** a short, soft four-note fanfare as the frog reaches the end.

**Slides, turns and jumps are silent.** They are the game's constant input: a player lines up a fit with a burst of slides and turns before every row, and holds a jump key for most of a run, repeating several times a second. A sound on each would be by far the most repeated sound in the game, a drone under everything else, however quiet and varied. What they do is already shown at once by the frog and the fit outline, and forward progress is heard in the pass pops. Refused moves, landings and restarts are silent too.

**Anti-annoyance rules,** applied to every play:

- A small random stray in pitch and volume, from a range per sound, so a repeated sound doesn't sound like a recording. Musical sounds stray least: the pass pop barely, so its scale stays in tune, and the fanfare not at all.
- A minimum gap per sound, measured on the audio clock: a play sooner than that after the last play of the same sound is dropped, so no sound can machine-gun.
- Frequent sounds are the quietest and shortest.

**Playback.** One AudioContext, ZzFX's own. Browsers keep audio off until the player interacts with the page, so the sounds load on the first key press, click or tap, inside that input event: that is when ZzFX is imported, and every sound is rendered once to an AudioBuffer and replayed from it, which is cheap on older phones. ZzFX's own per-play randomness is off, since it would be baked into the one rendering; the variation comes at playback instead. A sound triggered before audio is unlocked is dropped, not queued.

**Mute.** A small button in the game's top corner, or the M key, mutes all sound. Mute and the master volume are remembered in local storage; if storage refuses, the setting still holds for the visit.

**The sound audition** is `?sounds` on Frogmino's URL. It lists each sound with its trigger, its variation and minimum gap, and its ZzFX parameters, which paste into the ZzFX designer. Each has a play button and a ten-in-a-row button, which plays it ten times at about the busiest rate the game can trigger it (passes climbing their streak), to judge how it wears. It has the master volume and the mute toggle. The designs are tuned by editing `audio/sounds.ts`.

**Triggers.** The rules know nothing about sound. The game view watches the store and turns each state change into sounds (`soundCues` in `audio/cues.ts`): a pass when the run counts a new pass, once per row each time the traffic brings it round (a row going by beneath the frog on the overpass or the gantry is no pass), a bonk when the run records a new bonk, a hop when a new hop starts, the drop when the frog leaves the overpass, a swap when the frog's piece changes (only a pull-off swap changes it), and the finish the moment the frog crosses the finish line, before its leap. A restart is silent. An event that shows in the run's state belongs there, as a new cue with a test. An event the state can't show, such as a moment in an animation, calls the trigger API, `playSound` in `audio/sound-board.ts`, with the sound's id, when it happens.

## Open questions

- **Looping traffic and the pieces.** The course guarantees each stretch for the pieces the frog could hold there in course order, but the rows loop: a frog meets them in order and then from the first again, so over the whole road it meets more than the fifteen (at the course's pace, about half of them twice), and where it meets which row depends on its pace. The start piece passes every row outside the forced stretch, so the frog can always get it back; but there is no safe zone to wait a row out, so a frog holding a piece a row can't pass is knocked back down the road by that row, again and again, until it finds a pull-off behind it or the row goes by. Whether that matters in play, and whether the answer is pull-offs spread over the whole road, rows recomposed as they loop, or something else, is to be found in playtesting.

- Is 0.7 s the right hop airtime? To be tuned in playtesting, like the bonk knock-back (three jumps) and the held-jump repeat interval (0.22 s).
- Networked co-op hop timing: each player's hop should be judged on their own timeline, with forgiving airtime. How exactly is still open.
- How co-op's "openings fill in" rule translates to vehicles.
- The code rename from wall to vehicle terminology, once the model changes.
