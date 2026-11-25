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

The page is, for now, a character viewer: pick a character and one of its animations and watch it loop on a grid floor (a line every unit, a stronger one every five), with the camera orbiting (drag) and zooming (wheel, or pinch) round it. Panning is off, and the camera never goes below the floor. The camera is the same for every character, so their sizes compare. It opens on Female F, idle.

WASD walks the character about, relative to the camera (W goes away from it), and Shift with them sprints; the camera and the sun's shadows follow. Walking, sprinting and standing still play the `walk`, `sprint` and `idle` clips, blended into each other, and the animation picker shows what plays; a clip picked while standing plays until the character sets off. The ground speeds keep a planted foot still: each is how fast its clip sweeps a foot backward as it touches down, measured from the clip's leg swing. The character moves on the frame's own time step, which is all a debug walk needs: whether play runs on a fixed step stays open with real-time play. The keyboard is the game's own controls, and a picker lets go of the keyboard once a choice is made, so WASD walks again. A character can hold one of the pack's weapons in either hand, kept across a change of character; the `holding-*`, `*-shoot` and `attack-melee-*` clips are the ones made for a held weapon. `?character=<id>&clip=<name>&weapon=<id>&hand=<right|left>` opens on exactly that, and the address follows each pick. The shared frame meter sits in the top right.

## Code map

- `characters.ts`: the Mini Characters roster, by file name, and where each is served.
- `input/controls.ts`: the game's keyboard: actions bound to keys by their place on the keyboard, held keys tracked outside React, and read by the frame loop once a frame as what the player asks for. A game's input is not a page's: it is read per frame in actions, not handled per key event, so it doesn't use the shared hooks built for tools.
- `player.ts`: the player on foot, pure: position, facing and gait, stepped from a move, and the gaits' ground speeds.
- `scene/character-viewer.ts`: the viewer: the renderer, grid floor, lights, the camera that follows the player, and one character at a time with its animation mixer. Each file loads once; a pick overtaken by a later one is never shown.
- `weapons.ts`: the pack's weapons, each with the point in its own model the hand closes round.
- `components/adventure.tsx`: the page: the pickers, the backend, loading and any failure.
- `credits.ts`: Kenney's credit for every pack used.

## Assets

- `public/adventure/mini-characters/`: from Kenney's Mini Characters 2.0, the 20 `character-*.glb`, the 5 `weapon-*.glb`, and `Textures/colormap.png`, the one 512² colour map they all share. Each GLB refers to it by that relative path rather than embedding it, so it must stay beside them. The pack's other props (aids, wheelchairs, luggage, shields) aren't used yet.
- The skeleton has no hand joints: a held weapon is a child of its arm's joint, at a point out along the arm that fits every character, since the arms are rigid. The weapons don't all have their origin where the hand holds them, so each records its own grip point.
- The characters share one rigid seven-joint skeleton and the same clips. They are not all one height (about 0.67 to 0.85), and their bind pose has the arms out, so a bounding box of the model at rest is wider than the character as it stands in any clip.
- Each GLB loads its own copy of the shared colour map, filtered with mipmaps, as the pack sets it. Both stop mattering only once many characters share a scene, or are seen small: then one shared texture, and a look at how mipmaps blend the map's colour swatches, belong in the build step.
