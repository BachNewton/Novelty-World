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

The page is, for now, a character viewer: pick a character and one of its animations and watch it loop on a round floor, with the camera orbiting (drag) and zooming (wheel, or pinch) round it. Panning is off, and the camera never goes below the floor. The camera is the same for every character, so their sizes compare. `?character=<id>&clip=<name>` opens on exactly that, and the address follows each pick. The shared frame meter sits in the top right.

## Code map

- `characters.ts`: the Mini Characters roster, by file name, and where each is served.
- `scene/character-viewer.ts`: the viewer: the renderer, floor, lights, orbit camera, and one character at a time with its animation mixer. Each file loads once; a pick overtaken by a later one is never shown.
- `components/adventure.tsx`: the page: the two pickers, the backend, loading and any failure.
- `credits.ts`: Kenney's credit for every pack used.

## Assets

- `public/adventure/characters/`: the 20 `character-*.glb` of Kenney's Mini Characters 2.0, and `Textures/colormap.png`, the one 512² colour map they all share. Each GLB refers to it by that relative path rather than embedding it, so it must stay beside them. The pack's props (aids, wheelchairs, luggage, shields, weapons) aren't used yet.
- The characters share one rigid seven-joint skeleton and the same clips. They are not all one height (about 0.67 to 0.85), and their bind pose has the arms out, so a bounding box of the model at rest is wider than the character as it stands in any clip.
- Each GLB loads its own copy of the shared colour map, filtered with mipmaps, as the pack sets it. Both stop mattering only once many characters share a scene, or are seen small: then one shared texture, and a look at how mipmaps blend the map's colour swatches, belong in the build step.
