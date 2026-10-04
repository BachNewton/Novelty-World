---
name: betrayal-room-art
description: Build or rework the 3D art of one Betrayal at House on the Hill room (src/projects/betrayal/art/), as code on the shared stage, and review it from screenshots until it is done. Use whenever a Betrayal room's art is built, extended or reworked, or the owner asks for a room ("do the Kitchen", "the Crypt next").
---

# Betrayal room art

Each room tile of the house is a little 3D room, seen as a dollhouse with the
walls nearest the camera cut away. Claude makes all of the art, so all of it
is code, built to Claude's strengths: low-poly shapes with adjustable
dimensions, small pixel textures drawn only from one palette and shown with
hard pixel edges, SVG decals snapped to that palette, and lighting (candles,
moonlight, fog) to carry the mood. It avoids Claude's weaknesses: nothing is
sculpted and nothing is painted. Read "Visual style" in
`src/projects/betrayal/CLAUDE.md` first; it is the decided direction.

## The foundation

Everything lives in `src/projects/betrayal/art/`. Read these before building:

- `room.ts`: the units (one unit is a metre, the tile is 6 m square, walls
  3.2 m), the layout constants, `RoomDefinition`, `Mood`, `LightSpec`,
  placements and `onWall`.
- `stage.ts`: builds the shell from the definition (floor, walls, wainscot,
  trim, doors and windows from the room data), places the props, adds the
  lights and the moon, and cuts the walls away for the camera. Its limits
  throw; see "Rules".
- `palette.ts`: `PALETTE`, its keys and `RAMPS`. The only colours there are.
- `textures.ts`: seeded generators (`woodPlanks`, `flagstones`, `plaster`,
  `wallpaper`, `panelling`), `pixelTexture` for hand-placed pixel art, and
  `svgTexture` for SVG decals. `TEXELS_PER_METRE` fixes the pixel size of
  every surface, so props and walls share one pixel grid.
- `shapes.ts`: `box` and `cylinder` stand on their base, not their centre,
  so props are built bottom-up; `lathe`, `pixelPlane`, `batch`, and the
  materials `flat`, `textured`, `glow` and `lightMaterial`.
- `light-anchor.ts`: `lightAnchor` puts a real light inside a prop, so the
  light moves with it.
- `kit/`: pieces several rooms share (candles, a candelabra, table, chair,
  rug, picture frame, the scale pawn).
- `rooms/`: one file per room. `drawing-room.ts` is the reference for a
  room's shape; `chapel.ts` and `library.ts` hold most of the techniques
  that worked. Read all three closely before the first prop.
- `bench.ts`: the art bench at `?bench=<room-id>` and its control surface,
  `window.__betrayalBench`.

The room's facts come from outside `art/`: its rule text and floors from
`content/rooms.md`, its doors, windows and passages from `data/rooms.ts`
(the stage reads them; never restate them in the room file).

## Workflow

### 1. Read the room

From `content/rooms.md`: the rule text (what happens here), the floors it
can be on (a basement-only room is a cellar), its symbols. From
`data/rooms.ts`: which edges have doors, windows or open passages. Every
door is centred on its wall. A window is centred too, unless its wall also
has a door, when it sits beside the door to the right as you face the wall
(the stage sets where). A passage edge has no wall at all.

### 2. Decide its one-second identity

Before any code, write one sentence: what makes this room recognisable in
one second, from any of the four views, on a phone. One or two big shapes
and one lighting idea, not a list of props. The existing rooms:

- **Drawing Room:** a fire in a stone hearth and a candlelit table under
  plum damask.
- **Chapel:** ranks of pews down a red runner to a candlelit altar, and the
  stained-glass window's colours thrown across the floor by the moon.
- **Library:** every wall is books, lit warm by sconces and candles, with
  one eerie glowing book on the floor.

Then add the story: something is wrong here. A toppled pew, a shelf given
way, a cracked font, candles mostly burnt out, a fallen bookcase. **Eerie,
never gory**: no bodies, wounds or blood as gore; the `blood` keys are for
cloth, leather and lacquer.

### 3. Lay it out

Sketch the plan in metres before building: the walkable floor is within
`INNER` of the centre on both axes. Place the identity pieces first, then
the furniture that supports them, then the small story props. Keep a clear
lane from every door into the room, and stand nothing on a door's centre.
Stand nothing against a window that would block its light, unless that is
the point. Use `onWall` for anything backed against a wall: `along` is
metres from the wall's centre, positive to the right as you face the wall,
and `out` stands the piece off the wall face.

### 4. Build it

A room is one file, `rooms/<room-id>.ts`, exporting one `RoomDefinition`:
surfaces (floor, wall, optional wainscot, trim colour), props, lights of its
own, mood, the close-up `focus`, and where the scale `pawn` stands (1.6 m,
for judging proportions; keep it in an open spot). Props the room alone
needs are functions in that file, each with a one-line doc comment saying
what it is and which way it faces. Give every seeded texture a seed of the
room's own, so rooms don't repeat each other's pattern.

### 5. Screenshot, review, repeat

See "The review loop". Expect many rounds. Fix the biggest problem each
round, not the smallest.

### 6. Register it

Add the definition to `BENCH_ROOMS` in `rooms/index.ts`; the bench and
`shots.mjs` only know rooms listed there. The id must be a tile id in
`data/rooms.ts` (the stage throws otherwise).

## Rules

- **Palette keys only.** Never write a hex value or a raw colour anywhere in
  the art; only `palette.ts` has them. SVG decals take their colours from
  `paletteHex`, and `svgTexture` snaps every pixel to the palette anyway.
- **Pixels match.** Size a decal or pixel plane from `TEXELS_PER_METRE`
  (`pixelPlane` does it for you), and draw SVGs at that pixel size, never
  finer.
- **Doors stay clear.** Nothing on a door's centre line, inside its frame or
  in the lane into the room.
- **Wall-hung props and the cutaway.** In each view the two walls facing the
  camera are cut down to `CUT_HEIGHT`. A prop placed with `walls` (which
  `onWall` sets) and a `y` at or above the cut height hides whenever any of
  its walls is cut; a corner piece names both walls. A prop below the cut
  height stays visible. So split tall wall furniture: a base no taller than
  the cut height on the floor, and the rest hung on the wall above it.
- **Lights are limited.** At most 8 point lights per room, and at most 2 of
  them casting shadows; the stage throws past either. Kit candles bring a
  light each unless told not to, and every `lightAnchor` counts. Give a
  cluster of flames one light (as the candelabra does), and make the rest
  of the flames glow without lights. The moon is extra and always casts
  shadows. A piece that holds a light must not cast shadows itself (mark
  it `noShadow`, as the kit's candles do), or it throws its own silhouette
  over the room; so must glass and decals.
- **The ceiling blocks the moon.** The unseen ceiling stays in the shadow
  pass, so moonlight enters only through windows. A room without windows
  sets `moon` to 0 and raises `ambient` to make up for it (the Library);
  rooms with windows keep ambient low. Darkness is the point, but every
  identity piece must still read.
- **Shared code.** Room-specific props stay in the room's file. A piece goes
  to `kit/` only when a second room needs it: then move it there in the
  same change, generalise it with options, switch the first room to the kit
  version, and re-shoot that room to confirm it is unchanged. The same goes
  for helpers: reuse what `shapes.ts` and `textures.ts` export before
  writing a new one.

## Lessons learned

- **No two faces in one plane.** Coplanar faces z-fight, which shows as a
  shimmer of dots and passes for a lighting problem. The wall's own dressing
  counts: the wainscot stands `WAINSCOT_DEPTH` off the wall, and the
  skirting, crown, door casings and window sills stand further out. A piece
  backed against a wall stands clear of all of them, not in their plane.
  Inside a prop, a cap or trim that sits on a board stands a little above
  or proud of it, never flush with its face.
- **Touching is not joined.** Two boxes that only meet leave a crack the
  dark behind shows through as a line of dots; overlap neighbours by a few
  millimetres (the Library's books do).
- **Nothing stands less than about 1.5 cm proud.** At the bench's 540p, one
  screen pixel covers 7 to 16 mm of the room, so a detail standing 5 mm off
  a surface draws as a broken row of dots. Make it flush instead: a slice
  of the surface in its own colour (the Library's book bands), or part of
  the texture.
- **Merge many small pieces** with `batch()`: one mesh, coloured by palette
  key per box. Shelves of books, rails, rungs, a heap of debris.
- **Glows, pools and beams use `lightMaterial`**: it adds light to whatever
  is behind, so the surface still shows through. `glow` is for things that
  are their own light (flames, embers, stained glass seen face on).
- **Line light up with the moon** through `moonPosition`: the Chapel builds
  its shaft and floor pool in room coordinates along it, so they follow the
  stage's real moonlight.
- **A cut-wall-height base under tall wall furniture** keeps the room open
  when that wall is cut, as the Library's bookcases do: the cupboard stays,
  the shelves above hide with the wall.
- **A coloured pool of window light is a strong signature** (the Chapel).
  A single strong colour or light source does more for identity than many
  props.
- **Irregularity reads as real.** Uneven heights, gaps, leans, a few things
  knocked over: regular rows read as stripes, not objects.
- **Pale unlit details catch the eye in the dark** (the cobwebs): use them
  sparingly to lead the eye to corners.

## The review loop

- **The dev server is the owner's**, on port 3001. Check it answers
  (`curl` the page); if it doesn't, ask the owner. Never start it yourself.
- **Never use the chrome-devtools MCP**; it drives the owner's real browser.
  All looking is through headless Playwright.
- **Shoot a labelled run:**
  `node src/projects/betrayal/tools/shots.mjs <room-id> <room-id>-v<n>`,
  a new label each round so rounds can be compared. It writes the four
  dollhouse views, a close-up, a phone view and `contact-sheet.png` under
  `src/projects/betrayal/.shots/<label>/<room-id>/` (gitignored). Read the
  contact sheet, then the single shots it raises questions about. If
  building the room throws (a light limit, a pixel character missing from
  its legend, a room id the data doesn't have), the run stops at once with
  that error.
- **Close checks.** The close-up aims at the definition's `focus`: point it
  at the piece under review, re-shoot, and set it back to the room's best
  close-up when done. For anything more, a throwaway Playwright script
  modelled on `shots.mjs` drives `window.__betrayalBench` (views, zoom,
  `setResolution` to see the art at 270p for a small phone or native for
  detail, `setCamera("free")` and mouse drags for an orbit camera). It must
  live inside the repo while it runs (packages resolve from the script's
  folder); delete it afterwards. Wait on `isReady()` and the frame counter
  advancing, never a sleep.

Judge each round in this order, and don't polish detail while a higher item
fails:

1. **Silhouette and readability.** Is the identity clear in one second in
   all four views and in the phone shot? Can the main pieces be told apart
   at a glance? Is the scale right against the pawn?
2. **Every view with its walls cut.** Nothing floating where a wall was cut,
   no tall piece blocking the room from one side, no hung piece left
   hanging in the air, doors and windows where the data says.
3. **Lighting.** Dark and eerie, but the identity lit; no blown-out white
   areas, no corner so dark it reads as missing; flicker and glows where
   they belong.
4. **Detail.** Z-fighting dots, cracks between pieces, details too thin to
   draw, textures whose pixels don't match the room's, colour clashes.

Then `npm run lint` and `npm run typecheck`, both clean.

## Done means

All four views and the phone view pass the checklist, lint and typecheck
are clean, and the room is registered. The builder reports back:

- the room's file and the one-sentence identity;
- the path of the final contact sheet (and the label of the run before it,
  for comparison);
- its light count and shadow-casting lights against the limits;
- any piece promoted to the kit, and the re-shot room it came from;
- anything that needs the owner's eye or decision, and any gap found in
  the foundation (reported, not patched around).

Commit only if the brief says to; an orchestrator usually commits.
