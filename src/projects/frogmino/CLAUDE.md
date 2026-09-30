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
- **Hop**: vertical, exactly one cell, for raised openings. Hopping at a floor-level opening bonks.
- **Jump** forward or back along the corridor in discrete depth steps, to go faster or to buy reading time.

Hop and jump forward are different actions.

## Pieces

The game deals the shapes; the player never chooses them. There is a next-piece preview and a Tetris-style hold, usable once per wall.

## Co-op

Solo is fully playable; co-op is optional. It runs over PeerJS through the repo's shared PeerJS wrapper (see Multiplayer in the root `CLAUDE.md`).

- Co-op players share the same space.
- Openings can be separate (who takes which) or shared (both frogs must squeeze into one).
- Players may need to hop together, or one hops and the other doesn't.
- Frogs are always solid to each other at the same depth. They get past each other by jumping forward or back a depth step.
- The walls generated depend on the player count.

## Levels

v1 levels are hardcoded or generated from a fixed seed. The generator places real piece placements first and grows the openings around them, so every wall is solvable. A level editor is a later idea.

## Open questions

- Is a bonk a knock-back or a knock-out?
- How long is a hop's airtime?
- Does co-op partners staggering their depths to reuse one opening need limiting?
- Networked co-op hop timing: each player's hop should be judged on their own timeline, with forgiving airtime. How exactly is still open.
