# Adventure

A cozy 3D adventure in the spirit of *Stardew Valley* and *Animal Crossing*: a gentle world to live in rather than a challenge to beat. It is assembled from Kenney's CC0 3D asset packs (kenney.nl), and grown in small slices, each one seen working before the next is chosen. It is its own game, unrelated to Hearthwood.

## Goals

- **Cozy, not testing.** Nothing about play is decided yet beyond the feel: what a day holds, what the player does, whether anything can fail.
- **The look is Kenney's.** Art comes from Kenney's packs as made, so the game shares one simple, toy-like style without art built in code. Where packs leave a gap, how to fill it is open.
- **Built in slices.** Each slice settles only the decisions it meets; the rest stay open below.

## Open

To decide when a slice meets them, by the game's goals:

- Who it is for, and the floor device: desktop only, or phones too.
- Inputs: keyboard and mouse at least; whether a controller and touch play.
- The world: its scale, whether it streams, and its units (the characters are about 0.7 units tall as made).
- Real-time or turn-based, and solo or multiplayer.
- The camera in play.
- How long the game is meant to live, and so whether saves must stay readable.
- The game's own visual style beyond the packs: palette tokens, light, sky.

## Decided

- **Rendering.** Plain three.js on `WebGPURenderer` (`three/webgpu`), which falls back to WebGL 2 by itself, so its reach is WebGL's while it stays on the path three.js is developing. The page shows which backend it got, and a lost device stops drawing and says so. No React Three Fiber: the frame loop owns the scene, React only the overlay.
- **Assets are served as Kenney ships them**, for now: the pack's GLB files copied unchanged into `public/adventure/`. The characters already stand on the ground at the origin, facing +z, in one unit system across the pack, so there is nothing yet for an offline build step to normalise. A build tool (compression, merged meshes, one shared texture, a chosen world scale) comes when a slice needs one, most likely the first world built from several packs.
- **Clips are read from the file**, never listed in code: every character carries the same set, and the viewer offers whatever the loaded file holds.

## The debug view

The page is, for now, a debug view: the player, Female F, on a grid floor (a line every unit, a stronger one every five), with a picker for which of her animations plays, and the camera orbiting round her (drag, or the arrow keys: left and right swing it round, up and down tilt it) and zooming (wheel, pinch, or + and −). Panning is off, and the camera never goes below the floor. It opens on idle.

WASD walks the character about, relative to the camera (W goes away from it), and Shift with them sprints; the camera follows, and so does the sun's shadow box, small and sharp round the player. Only the player casts a shadow, so nothing else moves in and out of the sun's reach. A small village built from the town kit's pieces stands round where the player starts: a stone cottage, an inn of stone below and timber above with a balcony up its side and a chimney at its back, a windmill on a stone tower, a mill house whose wheel turns in a race along its back, a stone smithy with a fenced yard, and a lookout under a pointed roof, round a square with market stalls and lanterns. Trees of every kind the kit has stand round it. Every other character of the pack stands about the village playing its idle, each placed by what is there (keeping a stall, at a door, by a cart), their idles out of step so none breathe together; like the town, they cast no shadow. Space jumps, on the press, so holding it doesn't bounce; the player can still steer in the air. The jump clips hold a pose without moving the body, so the game supplies the height: `jump` plays while rising and `fall` while coming down. Walking, sprinting and standing still play the `walk`, `sprint` and `idle` clips, blended into each other, and the animation picker shows what plays; a clip picked while standing plays until the character sets off. The ground speeds keep a planted foot still: each is how fast its clip sweeps a foot backward as it touches down, measured from the clip's leg swing. The character moves on the frame's own time step, which is all a debug walk needs: whether play runs on a fixed step stays open with real-time play. The keyboard is the game's own controls, and a picker lets go of the keyboard once a choice is made, so WASD walks again. The player can hold one of the pack's weapons in either hand; the `holding-*`, `*-shoot` and `attack-melee-*` clips are the ones made for a held weapon. `?clip=<name>&weapon=<id>&hand=<right|left>` opens on exactly that, and the address follows each pick. The shared frame meter sits in the top right.

## Building with the town kit

A session placing or building with the Fantasy Town Kit starts from three tools, not from guesses at the pieces:

- **`buildings.ts`** holds the kit's rules for putting a building together, in its opening comment: which way a wall's outside faces and so where its piece goes, posts, storeys, the roofs (gabled two cells or one cell wide, hipped, pointed, each high and red or low and teal), what hangs on a wall, chimneys and balconies. `building()` turns a footprint, its storeys and their wall pieces into placements, facing any way. Its tests pin the turns and ends that are easy to get wrong. A shape the kit offers that the builder can't make yet is worked out on the bench, then added to the builder and its rules. Pieces that aren't part of a building's shell (sails, a mill wheel, stalls, fences, lanterns) are placed directly.
- **The piece bench**, `?view=pieces`: every piece on the grid, named, with a pink arrow along its own +x (where a wall stands) and a blue one along +z, to walk round.
- **`tools/kit-bounds.mjs`** measures pieces from their files: their extent, and where their highest points lie, which tells which end of a slope is up.

A piece's name is not proof of what it is. Some of the kit's pieces aren't what their names suggest (`wall-wood-window-small` is a plaster wall with no timber, `wall-wood-corner-edge` a wall bent across its cell rather than a post), and some decorations are made to lie in a wall's very face. So each new piece is looked at on the bench before it is used.

Pieces are named by `TownPiece`, so a misspelt piece fails the typecheck. A building is judged in the running game from all round, as art is.

## Code map

- `characters.ts`: the Mini Characters roster, by file name, and where each is served.
- `villagers.ts`: which character the player is, and where every other one stands and which way they look.
- `input/controls.ts`: the game's keyboard: actions bound to keys by their place on the keyboard, held keys tracked outside React, and read by the frame loop once a frame as what the player asks for. A game's input is not a page's: it is read per frame in actions, not handled per key event, so it doesn't use the shared hooks built for tools.
- `fantasy-town.ts`: every piece of the town kit by name, and where each is served.
- `town.ts`: the town as placements on the grid: the trees, the village's buildings and what stands round them.
- `buildings.ts`: the kit's rules for a building, and the builder.
- `bench.ts` and `scene/bench-marks.ts`: the piece bench's layout, and its names and axis arrows.
- `scene/town.ts`: builds the placed pieces, each file loaded once and every placement a clone.
- `player.ts`: the player on foot, pure: position, facing and gait, stepped from a move, and the gaits' ground speeds.
- `scene/character-viewer.ts`: the viewer: the renderer, grid floor, lights, the camera that follows the player, the player's character with its animation mixer, and the villagers, each a clone of its file with its own mixer. Each file loads once.
- `weapons.ts`: the pack's weapons, each with the point in its own model the hand closes round.
- `components/adventure.tsx`: the page: the animation and weapon pickers, the key hints, the backend, loading and any failure. In development it puts a probe on the page for tools, `window.__adventure.lookFrom(eye, at)`, which drives the camera to an exact view.
- `credits.ts`: Kenney's credit for every pack used.

## Assets

- `public/adventure/mini-characters/`: from Kenney's Mini Characters 2.0, the 20 `character-*.glb`, the 5 `weapon-*.glb`, and `Textures/colormap.png`, the one 512² colour map they all share. Each GLB refers to it by that relative path rather than embedding it, so it must stay beside them. The pack's other props (aids, wheelchairs, luggage, shields) aren't used yet.
- `public/adventure/fantasy-town/`: every GLB of Kenney's Fantasy Town Kit 2.0, and its own `Textures/colormap.png`, separate from the characters' one. Its pieces fill one unit cell each, centred on their origin, walls along the cell's +x edge with their outside facing back into the cell, so a piece is placed by its cell and quarter turns. Its walls stand about a third taller than a character.
- The skeleton has no hand joints: a held weapon is a child of its arm's joint, at a point out along the arm that fits every character, since the arms are rigid. The weapons don't all have their origin where the hand holds them, so each records its own grip point.
- The characters share one rigid seven-joint skeleton and the same clips. They are not all one height (about 0.67 to 0.85), and their bind pose has the arms out, so a bounding box of the model at rest is wider than the character as it stands in any clip.
- Each GLB loads its own copy of the shared colour map, filtered with mipmaps, as the pack sets it. Both stop mattering only once many characters share a scene, or are seen small: then one shared texture, and a look at how mipmaps blend the map's colour swatches, belong in the build step.
