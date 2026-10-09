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
`src/projects/betrayal/CLAUDE.md` first. The 3D house is a prototype, not
yet the decided presentation (see `design/presentation.md`).

## The house and the bench

A room is built for **the house**: the engine's layout of rooms, shown one
floor at a time, with explorers walking between them (`?house`, built by
`house.ts`). The house is where a room has to work, and it treats a room
differently from how it looks alone:

- **Every wall between two rooms is cut down** to the cut height, from every
  view; only outside walls at the back of the house stand full. The one
  exception is the close view of a room an explorer has just entered, which
  keeps its back walls standing, as the bench does.
- **The house owns the light a room can't**: one fill, one fog and one moon,
  shining from a fixed corner of the board, for every room (`HOUSE_LIGHT` in
  `lighting.ts`). A room brings only its own lamps, glows and fakes.
- **Light runs between rooms.** A room's lamps are baked with the whole
  floor in the way, so they spill through open doorways and passages onto
  the rooms next door, and walls (and a shut door) stop them. A room is lit
  partly by its neighbours, and lights them in turn.
- **Explorers stand at the room's `pawn` spot** (a second one 90 cm from it,
  towards the middle of the room), and walk in through the centre of each
  doorway and up and down the stairs.

**The bench** (`?bench=<room-id>`) shows one room on its own, under an orbit
camera, with only the two walls facing the camera cut. It is where a room is
built and judged up close. It lights the room exactly as the house does
(the same bake, the house's fill and moon, the tile laid unturned), but with
no neighbours, so no light spills in. So the bench is the workshop, and the
house is the test: anything that reads only because a wall is standing, or
only without its neighbours, fails in the house. `tools/house-shots.mjs`
shoots the house view, which shows the rooms in its fixture layout.

## The foundation

Everything lives in `src/projects/betrayal/art/`. Read these before building:

- `room.ts`: the units (one unit is a metre, the tile is 6 m square, walls
  3.2 m), the layout constants, `RoomDefinition`, `Mood`, `LightSpec`,
  placements, `Contact` and `onWall`.
- `stage.ts`: builds the shell from the definition (floor, walls, wainscot,
  trim, doors and windows from the room data), places the props and gathers
  their lights. Its limits throw; see "Rules". `pieceOf` says what each built
  piece is (a prop, the floor, a wall).
- `lighting.ts`, `freeze.ts`, `bake.ts`, `lit-floor.ts`: how a built room is
  drawn. `freezeRoom` merges every still piece into a few meshes by how it
  draws, and lays out the room's lightmap; the bake (run on workers by
  `bake-workers.ts`) works out each lamp's and the moon's light, shadows and
  all, into that lightmap and into light probes; `createLitFloor` draws a
  floor of baked rooms, cuts their walls for the camera, and re-bakes a room
  and its neighbours when the layout changes. `lighting.ts` holds the
  house's light, the lightmap's density and filtering (`LIGHTMAP`), and the
  render budgets. Room work doesn't change them.
- `palette.ts`: `PALETTE`, its keys and `RAMPS`. The only colours there are.
  The ramps that end bright enough to glow carry the lighting language.
- `textures.ts`: seeded generators (`woodPlanks`, `flagstones`, `plaster`,
  `wallpaper`, `panelling`), `pixelTexture` for hand-placed pixel art, and
  `svgTexture` for SVG decals. `TEXELS_PER_METRE` fixes the pixel size of
  every surface, so props and walls share one pixel grid.
- `shapes.ts`: `box` and `cylinder` stand on their base, not their centre,
  so props are built bottom-up; `lathe`, `pixelPlane`, `batch`, and the
  materials `flat`, `textured`, `glow` and `lightMaterial`.
- `light-anchor.ts`: `lightAnchor` puts a light inside a prop, so the light
  goes wherever the prop is placed. It is baked where the prop stands when
  the room is built.
- `animate.ts`: `animated` marks a piece the stage poses every frame from
  the clock (a pure function of the seconds, so a frozen clock always shows
  the same pose), the way `lightAnchor` marks a light. An animated piece is
  kept out of the merge and lit by the room's light probes.
- `kit/`: pieces several rooms share (candles, a candelabra, table, chair,
  rug, picture frame, cobweb, the scale pawn).
- `explorers/`: the explorer figures, rigid parts on pivots at the joints,
  animated with `animated`; `figure.ts` holds their shared base, the
  two-bone `reach` and the seeded `burst` for occasional movements.
  `BENCH_EXPLORERS` lists who the bench can stand at a room's pawn spot.
- `rooms/`: one file per room. `drawing-room.ts` is the reference for a
  room's shape; `chapel.ts` and `library.ts` hold most of the techniques
  that worked; `grand-staircase.ts` and `upper-landing.ts` show a stair link.
  Read them closely before the first prop.
- `overlap.ts` and `overlap.test.ts`: the overlap check (see "Build it").
- `bench.ts`: the art bench and its control surface,
  `window.__betrayalBench`: views, zoom, camera, resolution, which explorer
  stands in the room (`setExplorer`), framing the room, the explorer or one
  prop (`setSubject`, `props`), and `freezeClock` to stop flicker and
  animation at a fixed time.
- `house*.ts`: the house view. Read them to know what the house does with a
  room; room work doesn't change them.

The room's facts come from outside `art/`: its rule text and floors from
`content/rooms.md`, its doors, windows and passages from `data/rooms.ts`
(the stage reads them; never restate them in the room file).

## One house, many rooms

The house is constant and the contents vary. A player walking from room to
room must feel they are in one building.

**Constant, never a room's to change:** the palette, the pixel size and the
scale; the architecture (wall thickness, door and window style, trim and
wainscot heights, all from `room.ts` and the stage); the lighting family
(warm flame against cold moon, on a dark baseline); the construction style
and level of detail (simple shapes, pixel textures, decals, the existing
rooms' density of props); and the tone (eerie, never gory).

**Each room owns:** one signature shape, one signature light (with its
colour), and its story detail: the thing that is wrong here.

### Zones

Each area of the house has its own family of surfaces, so a floor reads as
one place:

| Zone | Surfaces |
|---|---|
| Basement | stone and brick |
| Ground floor, formal | marble, panelling, damask |
| Upper floor, domestic | wood floors, papered walls |
| Outdoors | earth, and the night sky |

A room that can lie on several floors takes the zone that suits its
character, and records it in the ledger.

### The lighting language

Colour means something, in light, glows and decals alike:

| Colour | Means | Ramp |
|---|---|---|
| Cold moon blue | the baseline: night, the house itself | `moon` |
| Warm amber | human and safe-ish: candles, lamps, explorers | `fire` (amber, flame) |
| Orange | fire itself | `fire` (ember, amber) |
| Sickly green | the supernatural | `wraith` |
| Red | danger, blood, the traitor | `scarlet` |
| Violet | magic and omens | `violet` |
| Gold | the holy: the Blessing, the Holy Symbol, the Chapel | `gold` |
| Cyan | water | `tide` |

Lean into coloured light. A lamp is baked, so it costs load time, not frame
time: a room may give each source it shows (every sconce, the hearth, the
glowing book) a light of its own, with shadows. Fake what a point light
can't give: a surface that is its own light (`glow`), and coloured pools
and beams through glass (`lightMaterial`).

### The ledger

One row per finished room. A new room reads it before choosing its identity
and takes nothing another room owns: not its signature shape, not its
signature light's colour and source, and not its zone's surfaces where a
neighbour on the same floor already wears them in the same way. Adding the
room's row is part of done.

| Room | Zone and surfaces | Signature shape | Signature light |
|---|---|---|---|
| Drawing Room | upper: wood boards, plum (`bruise`) damask, wood panelling | a stone hearth with its fire, and a candlelit table | the hearth's ember glow |
| Chapel | ground: flagstones, stone plaster, a dark stone dado. **Breaks its zone**: stone is the basement's | ranks of pews down a red runner to the altar, under a lancet | the moon through stained glass, thrown on the floor as a jewel-coloured pool; amber altar candles |
| Library | upper: wood boards, verdigris damask, wood panelling | every wall shelved with books, one bookcase fallen | a sickly green glowing book on the floor (`verdigrisLight`) |
| Grand Staircase | ground: the starting hall's dress, chequered marble, moon-blue papered walls, wood panelling | a broad carpeted flight climbing the back wall | the newel lamp's amber, and the tall window's moon on the marble |
| Foyer | ground: the starting hall's dress | a brass chandelier hung out of true over the runner | the chandelier's amber |
| Entrance Hall | ground: the starting hall's dress | the tall barred front door under its fanlight, between standing lamps | twin amber lamps, and the moonlit fanlight |
| Upper Landing | upper, in the starting hall's dress, marble included. **Breaks its zone**, to carry on the stair it tops | the head of the grand staircase in a balustraded well | the newel lamp's amber |

For the review pass: the Chapel's holy light is amber, where the language
says gold, and its stone takes the basement's surfaces; the Upper Landing's
marble breaks the upper floor's boards; and four rooms (the starting hall
and the Upper Landing) share one dress and one amber light, so telling them
apart rests on their shapes alone.

## Workflow

### 1. Read the room

From `content/rooms.md`: the rule text (what happens here), the floors it
can be on (a basement-only room is a cellar), its symbols. From
`data/rooms.ts`: which edges have doors, windows or open passages, and
whether it has a fixed link (a stair) to another room. Every door is
centred on its wall. A window is centred too, unless its wall also has a
door, when it sits beside the door to the right as you face the wall (the
stage sets where). A passage edge has no wall at all. Then read the ledger,
and pick the room's zone.

### 2. Decide its one-second identity

Before any code, write one sentence: what makes this room recognisable in
one second, from any of the four views, on a phone, **with every wall cut
down** as the house shows it. One signature shape and one signature light,
not a list of props, and neither already in the ledger. The light's colour
follows the lighting language. The shape stands on the floor, or is a wall
piece below the cut height: a portrait, a window or a tall cabinet is lost
in the house. A tall identity piece may keep more of itself by setting its
own cut height, as the Grand Staircase keeps its first seven steps.

Then add the story: something is wrong here. A toppled pew, a shelf given
way, a cracked font, candles mostly burnt out, a fallen bookcase. **Eerie,
never gory**: no bodies, wounds or blood as gore; the `blood` keys are for
cloth, leather and lacquer.

### 3. Lay it out

Sketch the plan in metres before building: the walkable floor is within
`INNER` of the centre on both axes. Place the identity pieces first, then
the furniture that supports them, then the small story props. Spend the
effort on the floor and on what stands below the cut height: players mostly
see a room's walls whole only in the close-up when an explorer first walks
in, so wall dressing comes last. Keep clear:

- **Every doorway and passage**: nothing stands in its 40 cm depth (the two
  walls between rooms), nor in the lane the house walks straight in through
  its centre, 80 cm deep from the tile's edge.
- **The pawn spot and the floor around it**, and the spot 90 cm from it
  towards the middle, where a second explorer stands. Choose `pawn` in open
  floor.
- **Windows**, unless blocking one is the point.

Use `onWall` for anything backed against a wall: `along` is metres from the
wall's centre, positive to the right as you face the wall, and `out` stands
the piece off the wall face.

### 4. Build it

A room is one file, `rooms/<room-id>.ts`, exporting one `RoomDefinition`:
surfaces (floor, wall, optional wainscot, trim colour) from its zone, props,
lights of its own, the close-up `focus`, and where the explorer stands
(`pawn`). The bench stands its first explorer there, a
person at 1.6 m; shoot with `--explorer=pawn` for the plain scale pawn.
Props the room alone needs are functions in that file, each with a one-line
doc comment saying what it is and which way it faces. Give every seeded
texture a seed of the room's own, so rooms don't repeat each other's
pattern.

A room with a stair link gives `stairs` a walk path for each room it links
to: points in room metres from its floor up (or down) the flight to where
it leaves the room. The two rooms' paths meet, one going up and the other
coming down (the Grand Staircase and the Upper Landing).

**Run the overlap check** after every change to the props:
`npx vitest run src/projects/betrayal/art/overlap.test.ts` (headless, a
couple of seconds). It builds each room and fails when a solid passes into
another piece, a wall's body or the floor by more than 2 cm (or a third of
the thinner piece, so a book half sunk in the floor counts), when a piece
stands in a doorway's lane or on the pawn spot, or when two faces of
different colour share a plane facing the same way (z-fighting). It tests
each piece's real shape, so a fallen bookcase is judged as it lies. The few
millimetres neighbours overlap to hide a crack pass, and so does standing
into a wall's dressing (skirting, wainscot, casings), which the piece
hides. A piece's own parts are built into each other on purpose, so only
their z-fighting counts.

When a piece is meant to pass into something, declare it on the piece, in
one line, with the reason:
`contacts: [{ with: "left", because: "it has fallen against the wall" }]`.
`with` names a wall's edge, `floor`, a zone (`pawn`, `doorway top`) or
another piece by its name. A piece's name is its build function's, or its
`name` when it has one: give one to any piece built by an inline arrow,
which the check otherwise calls `prop`. A declared contact that no longer
happens fails the check too, so declarations don't outlive their reason.

The test also holds a baseline: the overlaps the first seven rooms had when
the check arrived, reported but not failing. A new room adds nothing to it.
The review pass empties it, fixing each entry or declaring it.

### 5. Screenshot, review, repeat

See "The review loop". Expect many rounds. Fix the biggest problem each
round, not the smallest.

### 6. Register it

Add the definition to `BENCH_ROOMS` in `rooms/index.ts`; the bench, the
house and `shots.mjs` only know rooms listed there. The id must be a tile id
in `data/rooms.ts` (the stage throws otherwise). Add the room's row to the
ledger.

## Rules

- **Palette keys only.** Never write a hex value or a raw colour anywhere in
  the art; only `palette.ts` has them. SVG decals take their colours from
  `paletteHex`, and `svgTexture` snaps every pixel to the palette anyway. A
  new palette key changes how existing decals snap at their edges, so
  adding one means re-shooting every room and checking it is unchanged.
- **Pixels match.** Size a decal or pixel plane from `TEXELS_PER_METRE`
  (`pixelPlane` does it for you), and draw SVGs at that pixel size, never
  finer.
- **Doorways and the pawn spot stay clear** (see "Lay it out"); the overlap
  check enforces it.
- **Wall-hung props and the cutaway.** A wall that is cut stands only to
  `CUT_HEIGHT`. A prop placed with `walls` (which `onWall` sets) and a `y`
  at or above the cut height hides whenever any of its walls is cut; a
  corner piece names both walls. A prop below the cut height stays visible.
  So split tall wall furniture: a base no taller than the cut height on the
  floor, and the rest hung on the wall above it.
- **Lights are baked, and many are allowed.** A room's lights (its
  `lights`, and every `lightAnchor` in its props) are baked into its
  lightmap when it is built, every one with shadows: up to 16 a room (the
  stage throws past it; each costs load time, not frame time). Kit candles
  bring a light each unless told not to. A cluster of flames still takes
  one light, as the candelabra does: lights a few centimetres apart only
  bake slower.
- **What stays live is limited.** Only what moves is lit live: the active
  explorer's light, and in time a carried candle or a haunt's short event
  light. At most two live lights may cast shadows, and those are the
  house's to add, never a room's. A room has no live lights.
- **Flicker modulates the baked light.** A light's `flicker` (at most 0.5)
  makes everything it lights waver, its spill next door included. Flames
  share four flicker signals, so two candles may waver in step. A `glow`
  doesn't flicker, nor does the probe light on an animated piece or an
  explorer.
- **Light spills; walls stop it.** A lamp lights whatever it reaches within
  its `range`, through doorways and passages into the next room, and stops
  at walls and shut doors. Give a light the range its brightness deserves,
  not one cut to its tile.
- **What breaks the bake.** A light inside a piece that casts shadows is
  smothered by it: a piece that holds a light must not cast shadows (mark
  it `noShadow`, as the kit's candles do), nor may glass and decals. A
  piece that moves after the build (an `animated` one) is baked where it
  stands when built, so its shadow stays there, and so does a light
  anchored in it. Changing a light while the game runs (dimming a lamp,
  putting out a candle) needs a re-bake: report the need rather than
  faking it.
- **The house owns the fill, the fog and the moon.** A room can't set its
  own. A windowless room lights itself with its own lamps and glows and
  what spills in from next door, never with more fill. The moon comes in
  only through windows (the unseen ceiling and every wall, cut or not,
  stop it in the bake), and it shines from one corner of the board, so how
  much of it a window lets in depends on how the tile is turned.
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
  backed against a wall keeps its faces out of their planes. Inside a prop,
  a cap or trim that sits on a board stands a little above or proud of it,
  never flush with its face. The overlap check finds these.
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
- **A fake lined up with the moon must follow the house's moon.** The
  Chapel builds its shaft and floor pool along `moonPosition`, straight out
  of its own window, but the baked moon comes from a corner of the board,
  so the pool lies off the real moonlight, on the bench too (known, left
  for the review pass). A room's build doesn't learn how its tile is
  turned, so a new room avoids moon-aligned fakes, or reports the need.
- **Animated pieces' shadows stand still**: they are baked where the piece
  stands when built. Make the motion read without its shadow (the rocking
  chair's sway, the chandelier's swing).
- **Small faces take one light value.** A face under 40 cm each way gets a
  single lightmap texel, so no shadow edge ever crosses a book or a candle:
  it reads as flat-shaded. A shadow meant to show has to fall on something
  larger.
- **A cut-wall-height base under tall wall furniture** keeps the room open
  when that wall is cut, as the Library's bookcases do: the cupboard stays,
  the shelves above hide with the wall.
- **A coloured pool of light is a strong signature** (the Chapel). A single
  strong colour or light source does more for identity than many props.
- **Irregularity reads as real.** Uneven heights, gaps, leans, a few things
  knocked over: regular rows read as stripes, not objects.
- **Pale unlit details catch the eye in the dark** (the cobwebs): use them
  sparingly to lead the eye to corners.

## Connections between rooms

What lies through a door or window is decided by the layout, not the room.
A door that ends up against a neighbour's wall is a **false door**: it can't
be passed. Today the house tells the stage which doors are false, and the
stage shuts them with a plain closed leaf in the trim colour, so a false
door looks like an ordinary closed one. A window against a neighbour is a
**false window**: it lets no moonlight in, because the neighbour's wall
behind it stops the moon in the bake; but its glass still glows as if
moonlit, and a room's own moon fakes (the Chapel's pool) still show. How a
false door should look (boarded or bricked, rather than an ordinary closed
door) and how a false window should look are the stage's to settle, not a
room's: build the room for its real openings, and report anything about a
room that only works when an opening is live.

## The review loop

- **The dev server is the owner's**, on port 3001. Check it answers
  (`curl` the page); if it doesn't, ask the owner. Never start it yourself.
- **Never use the chrome-devtools MCP**; it drives the owner's real browser.
  All looking is through headless Playwright.
- **Shoot a labelled run:**
  `node src/projects/betrayal/tools/shots.mjs <room-id> <room-id>-v<n> --compare=<room-id>`
  (`--native` draws at the screen's own resolution instead of the bench's
  default; the render resolution isn't decided, so judge both),
  a new label each round so rounds can be compared. It writes, under
  `src/projects/betrayal/.shots/<label>/<room-id>/` (gitignored):
  `contact-sheet.png` (the four dollhouse views, a close-up, the explorer
  framed close and a phone view); `close-ups.png`, every prop framed close
  at full resolution from the view that faces it; and with `--compare`,
  `compare-<room-id>.png`, the room beside a finished one in the same
  views, clock, explorer and resolution. Compare with the finished room
  nearest in zone or character (see the ledger). The bench's clock is
  frozen for every shot, so two runs differ only where the art does.
  `--explorer=<id>` picks who stands in the room; `--idle` adds
  `idle-strip.png`, the explorer at a run of frozen times, for judging an
  animation. `house-shots.mjs` (also with `--native`) writes
  `sheet-spill.png`: light from a lit room into a dark one through a
  doorway, and the same pair through a wall. If building the room throws
  (a light limit, a pixel character
  missing from its legend, a room id the data doesn't have), the run stops
  at once with that error.
- **Read every sheet each round**: the contact sheet, the close-ups and the
  comparison, then the single shots they raise questions about. Judge the
  pair on the comparison together, as one house: palette, pixel size,
  light, detail and finish should match; only the contents differ.
- **Close checks.** The close-up aims at the definition's `focus`: point it
  at the piece under review, re-shoot, and set it back to the room's best
  close-up when done. For anything more, a throwaway Playwright script
  modelled on `shots.mjs` drives `window.__betrayalBench` (views, zoom, a
  prop as the subject, `setResolution` to see the art at 270p for a small
  phone or native for detail, and mouse drags on the canvas to orbit from
  the current view). It must live inside the repo while it runs (packages
  resolve from the script's folder); delete it afterwards. Wait on
  `isReady()` and the frame counter advancing, never a sleep.

Judge each round in this order, and don't polish detail while a higher item
fails:

1. **Silhouette and readability.** Is the identity clear in one second in
   all four views and in the phone shot, with its walls cut as the house
   cuts them? Can the main pieces be told apart at a glance? Is the scale
   right against the explorer?
2. **Every view with its walls cut.** Nothing floating where a wall was cut,
   no tall piece blocking the room from one side, no hung piece left
   hanging in the air, doors and windows where the data says.
3. **Lighting.** Dark and eerie, but the identity lit; the colours saying
   what the lighting language says; no blown-out white areas, no corner so
   dark it reads as missing; flicker and glows where they belong.
4. **One house.** Beside the finished room it is compared with, does it
   look like the same house?
5. **Detail.** Each prop in the close-ups: z-fighting dots, cracks between
   pieces, details too thin to draw, textures whose pixels don't match the
   room's, colour clashes.

Then `npm run lint` and `npm run typecheck`, both clean, and the overlap
check passing.

### A review pass over many rooms

When several rooms are reviewed together, shoot them all:
`node src/projects/betrayal/tools/shots.mjs --all <label>` writes, under
`.shots/<label>/rooms/`, `rooms.png` (view 0 of every room, named) and
`rooms-blind.png` (the same, numbered in a shuffled order, with the names in
`rooms-blind-key.txt`). Two checks:

- **Same house?** Side by side on `rooms.png`, does any room look like it
  comes from another house? Bring it back to the constants.
- **Tell them apart?** On `rooms-blind.png`, name each numbered room from
  the picture alone, then check the key. When two get confused, the weaker
  one gets a stronger identity.

## Done means

All four views and the phone view pass the checklist, the close-ups show no
detail faults, lint and typecheck are clean, the overlap check passes with
no new findings, and the room is registered with its ledger row. The
builder reports back:

- the room's file, the one-sentence identity, and its ledger row;
- the path of the final contact sheet and comparison (and the label of the
  run before it, for comparison);
- the overlap check's result: passing, and every contact the room declares,
  with its reason;
- its light count against the limit, and how its light reads in the house
  beside its neighbours (what spills in, what it throws next door); and
  whether a limit held the room back, and what it settled for instead.
  The limits are a starting budget, not a ceiling the art must always fit
  under: say so whenever the workaround made the room worse;
- any piece promoted to the kit, and the re-shot room it came from;
- anything that needs the owner's eye or decision, and any gap found in
  the foundation (reported, not patched around).

Commit only if the brief says to; an orchestrator usually commits.
