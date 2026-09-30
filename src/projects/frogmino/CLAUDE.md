# Frogmino

Brain Wall (the Japanese game show) meets Tetris, with Frogger-style hopping. The player is a frog shaped like a tetromino, and walls with holes in them come at it down a corridor. It is real-time, seen from behind the frog in real 3D with Three.js (through `@react-three/fiber`). Faked 2D depth was considered and rejected: it is harder to get right than real 3D.

The owner and a friend designed it. What follows is decided unless it sits under Open questions.

## Code map

- `types.ts`: cells on the wall face, tetromino kinds, the frog, openings.
- `logic.ts`: pure rules, no React and no Three. The tetromino definitions, rotation, the cells a frog covers, and the pass test.
- `components/frogmino.tsx`: the root component. The scene is loaded browser-only because it reads its colours from the live stylesheet.
- `components/scene.tsx`: the 3D scene. Its colours come from the design tokens in `globals.css` through `themeColor` in `src/shared/lib/three/`, never hardcoded.

The project is scaffolding so far: the scene is a static placeholder showing the concept (camera behind and above the frog, a floor, a T-shaped frog, one wall with an opening larger than it). There are no controls, no game loop and no store yet.

## The wall face

A wall is a grid of cells: columns across the corridor, rows up from the floor. An opening is a set of those cells. The frog is a tetromino with a lateral column (its leftmost cell), a rotation of quarter turns clockwise as the player sees it from behind, and a hop height of 0 or 1. A rotated piece always rests on the floor, or one cell above it when hopping.

## The pass test

The frog passes a wall if every cell it covers is inside an opening: a subset test, checked when the wall reaches the frog's depth. Any covered cell that meets the wall is a bonk. Openings are usually larger than the piece; how tight they are is the difficulty dial.

## Controls

- **Move** left and right across the corridor.
- **Rotate** the piece.
- **Hop**: vertical, exactly one cell, for raised openings. The pass test decides a hop like anything else: a needless hop is fine as long as the piece still clears the opening, and it bonks only when there is no room above. A special rule punishing unneeded hops would be confusing.
- **Jump** forward or back along the corridor in discrete depth steps, to go faster or to buy reading time.

Hop and jump forward are different actions.

On touch screens (a starting point, to be tuned once it is playable):

- **Drag** left or right to move, one column per step of finger travel.
- **Tap** the left or right side to rotate counter-clockwise or clockwise.
- **Swipe up** to hop. A swipe fires as soon as the finger has travelled far enough, while a tap has to wait for the finger to lift before it can rule out a swipe, so the timing-critical hop belongs on a swipe.
- **Tap the centre** to jump forward, **swipe down** to jump back.
- **Tap the hold box** to hold.

## Pieces

The game deals the shapes; the player never chooses them. There is a next-piece preview and a Tetris-style hold, usable once per wall.

## Courses and medals

A level is a course with a finish line, run against the clock: gold, silver and bronze times, in the manner of time-trial marble games. There is no endless mode and there are no lives. A bonk knocks the frog back, and the time it costs is the penalty.

## Co-op

Solo is fully playable; co-op is optional. It runs over PeerJS through the repo's shared PeerJS wrapper (see Multiplayer in the root `CLAUDE.md`).

- Co-op players share the same space.
- Openings can be separate (who takes which) or shared (both frogs must squeeze into one).
- Players may need to hop together, or one hops and the other doesn't.
- Frogs are always solid to each other at the same depth. They get past each other by jumping forward or back a depth step.
- **Openings fill in.** A frog that passes through an opening fills the cells it used, like a landed Tetris piece, and a partner must fit through what is left. That is what makes a shared opening different from two separate ones: how the first frog goes through decides whether the second can. It also stops a trailing partner reusing the cells the leader just used, whatever their depths.
- **The team's time is the average of its players' finish times**, as in Forza Horizon 2's co-op Bucket List challenges: a fast player banks time a slower partner can spend. Everyone's result rides on everyone else's.
- The walls generated depend on the player count.
- The rules are written for a list of players from the start, with solo as a list of one. Wall generation, the pass test, frog-to-frog solidity, filled openings and the team clock all work on that list, so co-op is never retrofitted onto solo-only systems.

## Levels

v1 levels are hardcoded or generated from a fixed seed. The generator places real piece placements first and grows the openings around them, so every wall is solvable. A level editor is a later idea.

## Look

Fun, quirky and colourful, in keeping with Novelty World. Art comes after gameplay: nothing about the frog's look is decided yet.

## Open questions

- How long is a hop's airtime? To be tuned in playtesting.
- Networked co-op hop timing: each player's hop should be judged on their own timeline, with forgiving airtime. How exactly is still open.
