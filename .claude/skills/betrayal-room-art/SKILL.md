---
name: betrayal-room-art
description: Build or rework the 3D art of one Betrayal at House on the Hill room (src/projects/betrayal/art/), as code on the shared stage, and review it from screenshots until it is done. Use whenever a Betrayal room's art is built, extended or reworked, or the owner asks for a room ("do the Kitchen", "the Crypt next").
---

# Betrayal room art

Each room tile of the house is a little 3D room, seen as a dollhouse with the
walls nearest the camera cut away. Read "Visual style" in
`src/projects/betrayal/CLAUDE.md` first. The 3D house is the game's
presentation (see `design/presentation.md`).

**Claude makes the art, so lean into Claude's strengths and find
workarounds for its weaknesses.** All of it is code: low-poly shapes with
adjustable dimensions, small pixel textures drawn only from one palette and
shown with hard pixel edges, SVG decals snapped to that palette, and
lighting (candles, moonlight, fog, glows) to carry the mood. A room is
built from simple shapes, never sculpted (figures are: see the
`betrayal-figure-art` skill), and nothing is painted. When a thing is hard to model (water, fire,
a deep pit, a face), don't model it harder: fake it with what works (a
stepping pixel texture, a glow on a light's flicker signal, an unlit
self-shaded lining, a silhouette and a colour).

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
- **Figures stand where the placement solver puts them** on the room's
  free floor, the active explorer on the room's prime place (see "Where
  figures stand"), and walk in through the centre of each doorway and up
  and down the stairs, round anyone standing in the way.

**The bench** (`?bench=<room-id>`) shows one room on its own, under an orbit
camera, with only the two walls facing the camera cut. It is where a room is
built and judged up close. It lights the room as the house does (the same
bake, the house's fill and moon, the tile laid unturned, its explorer lit as
the house lights one), but with no neighbours: no light spills in, and its
doorways are shut in the bake, as the house shuts a doorway onto the
unexplored dark, so the moon comes in only through windows.

**The review house** (`?house&layout=room:<room-id>`) builds a small house
round one room: plain rooms joined to every doorway, so every wall between
rooms is cut as the house cuts it.
`node src/projects/betrayal/tools/house-shots.mjs <label> --room=<room-id>`
shoots it into `sheet-room-<room-id>.png`: the floor from four views, the
room framed close from two, and a phone shot. So the bench is the workshop,
and the review house is the test: **every new room is checked there, with
every interior wall cut.** Anything that reads only because a wall is
standing, or only without its neighbours, fails there.

## The foundation

Everything lives in `src/projects/betrayal/art/`. Read these before building:

- `room.ts`: the units (one unit is a metre, the tile is 6 m square, walls
  3.2 m), the layout constants (`OUTDOOR` among them), `RoomDefinition`,
  `LightSpec` and `FlickerSignal`, placements, `Contact`, `FloorOpening`,
  `primePlaces`, `onWall`, and `MARK_PLANES` (the heights the house draws
  its marks at).
- `stage.ts`: builds the shell from the definition (floor, walls, wainscot,
  trim, doors and windows from the room data, or an outdoor tile's low
  walls, railings and gates), places the props and gathers their lights.
  Its limits throw; see "Rules". `pieceOf` says what each built piece is.
- `wall-marks.ts`: wall marks (`wallMarks` on the definition), drawn into
  one wall's own texture at its pixel size: a picture's ghost, a stain, a
  scorch, a worn door edge. A mark recolours the wall's palette colours or
  paints one over them, with an optional dithered soft rim. Being surface,
  it stands off nothing and fights nothing, and above the cut height it
  shows only where the wall stands full. Anything that must be a mark on a
  wall is one of these, never a plane or block set against the wall.
- `lighting.ts`, `freeze.ts`, `bake.ts`, `lit-floor.ts`: how a built room is
  drawn. `freezeRoom` merges every still piece into a few meshes by how it
  draws, and lays out the room's lightmap; the bake (run on workers by
  `bake-workers.ts`) works out each lamp's and the moon's light, shadows and
  all, into that lightmap and into light probes; `createLitFloor` draws a
  floor of baked rooms, cuts their walls for the camera, and re-bakes a room
  and its neighbours when the layout changes. `lighting.ts` holds the
  house's light, the flicker signals (`flickerOf`), the lightmap's density
  (`LIGHTMAP`), the bounce's strength (`BOUNCE`) and the render budgets.
  Room work doesn't change them. `design/lighting.md` explains the whole.
- `palette.ts`: `PALETTE`, its keys and `RAMPS`. The only colours there are.
  The ramps that end bright enough to glow carry the lighting language.
- `textures.ts`: seeded generators (`woodPlanks`, `flagstones`, `plaster`,
  `wallpaper`, `panelling`, `bricks` on the `brick` ramp, `earth` for
  outdoor ground), `pixelTexture` for hand-placed pixel art, and
  `svgTexture` for SVG decals. `TEXELS_PER_METRE` fixes the pixel size of
  every surface, so props and walls share one pixel grid.
- `shapes.ts`: `box` and `cylinder` stand on their base, not their centre,
  so props are built bottom-up; `lathe`, `pixelPlane`, `batch`,
  `projectUvs`, and the materials `flat`, `textured`, `glow` and
  `lightMaterial`.
- `light-anchor.ts`: `lightAnchor` puts a light inside a prop, so the light
  goes wherever the prop is placed. It is baked where the prop stands when
  the room is built.
- `wind.ts`: a room's air (`roomWind`, `withGust`, `blowsOn`, `windOf`; see
  "Outdoors").
- `page-search.ts`: `pageSearch`, the one browser check for code a worker may
  load (see "Rules").
- `animate.ts`: `animated` marks a piece the stage poses every frame from
  the clock (a pure function of the seconds, so a frozen clock always shows
  the same pose). An animated piece is kept out of the merge and lit by
  light probes of its own.
- `kit/`: pieces several rooms share. Lights: `candle`, `candelabra`,
  `chamberstick`, `lantern`. Furniture: `table`, `chair`. Stores: `crate`,
  `cask`. Rope: `strand` and `slung` (into a batch), `coil`. Floor openings:
  `pitShell` (the dark round and under a hole) and `pitHaze`. Decor: `rug`,
  `pictureFrame`, which hangs a named picture from the silhouette library
  (`pictures.ts`; no two on one floor are the same), `cobweb`. Turned
  things: `vessel.ts` (`vessel` for anything with an inside, `solidLathe`
  for a shut one). Water: `water.ts`, for any water (a lake,
  flooding, a puddle, a fountain). Shape: `wall-mass.ts` (`wallMass`), solid
  wall standing inside the tile, for a room that isn't square; a piece set
  against a mass clears its skirting. And `pawn`, the scale pawn.
- `rooms/`: one file per room. `drawing-room.ts` is the reference for a
  room's shape; `chapel.ts` and `library.ts` hold most of the indoor
  techniques; `grand-staircase.ts` and `upper-landing.ts` show a stair link;
  `chasm.ts` a pit, `underground-lake.ts` water, `furnace-room.ts` fire,
  `graveyard.ts` an outdoor tile, `mystic-elevator.ts` a moving room. Read
  the ones nearest yours closely before the first prop.
- `overlap.ts` and `overlap.slow.test.ts`: the overlap check, with `zfight.ts`
  for faces that share a plane (see "Build it").
- `bench.ts`: the art bench and its control surface,
  `window.__betrayalBench`: views, zoom, camera, resolution, which explorer
  stands in the room (`setExplorer`), framing the room, the explorer or one
  prop (`setSubject`, `props`), and `freezeClock` to stop flicker and
  animation at a fixed time. Its URL takes `bench=<room-id>`,
  `explorer=<id>` (a figure, a line-up, or a crowd: `crowd-6`, `crowd-7`,
  `crowd-spider`, and `place-1` to `place-6`, `place-6-spider` and
  `place-worst`, the worst case a haunt can bring), `frame=explorer`,
  `paths` (the prime place, the keep-clear areas, each figure's footprint
  coloured by how crowded it stands, and the walks across the room, drawn
  over it; `tools/placement-shots.mjs` shoots every crowd in a room),
  `bounce=off` and `water=<style>`. The house takes `bake-debug`, which shows
  the bake at work.
- `house*.ts`: the house view and its layouts. Read them to know what the
  house does with a room; room work doesn't change them.

The room's facts come from outside `art/`: its rule text and floors from
`content/rooms.md`, its doors, windows, passages and whether it is outdoors
from `data/rooms.ts` (the stage reads them; never restate them in the room
file).

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
| Outdoors | earth, low stone walls, and the night sky |

A room that can lie on several floors takes the zone that suits its
character, and records it in the ledger: the Kitchen, on the ground floor
or in the basement, is a cellar kitchen of brick and flagstone. The Mystic
Elevator, on every floor, is a deliberate exception: a machine, in iron and
brass, belonging to no floor. A roof or an attic may break its floor's zone
too (the Tower's stone roof, the Attic's bare plank walls). Whatever its
zone, it must look right on every floor it can lie on, the basement
included, where no moonlight comes in: its own lamps carry it there.

### The lighting language

Colour means something, in light, glows and decals alike:

| Colour | Means | Ramp |
|---|---|---|
| Cold moon blue | the baseline: night, the house itself | `moon` |
| Warm amber | human and safe-ish: candles, lamps, explorers | `fire` (amber, flame) |
| Orange | fire itself, which counts as amber: warm and human | `fire` (ember, amber) |
| Spectral teal | a haunting: a presence, unease (the Bedroom's glow under the bed) | `spectre` (one key) |
| Sickly green | the corrupt: rot, poison, the ghoulish | `wraith` |
| Red | danger, blood, the traitor | `scarlet` |
| Violet | magic and omens | `violet` |
| Gold | the holy: the Blessing, the Holy Symbol, the Chapel | `gold` |
| Cyan | water | `tide` |

Lean into coloured light. A lamp is baked, so it costs load time, not frame
time: a room may give each source it shows (every sconce, the hearth, the
glowing book) a light of its own, with shadows. Fake what a point light
can't give: a surface that is its own light (`glow`), and coloured pools,
haze and beams (`lightMaterial`).

**Moonlight is the house's, never a room's.** It comes only through real
windows, baked, from the house's moon, and it has no gameplay. No room
effect may be lined up by hand with the moon: a room's build doesn't know
how its tile will be turned, so a beam or pool aimed at the moon is wrong
in three turns out of four. Every real window gets a pool of window light
falling straight out of it, a stylised glow of the window rather than the
moon; the stage draws it, so a room never adds its own.

### The ledger

One row per finished room. A new room reads it before choosing its identity
and takes nothing another room owns: not its signature shape, not its
signature light's colour and source, and not its zone's surfaces where a
neighbour on the same floor already wears them in the same way. Adding the
room's row is part of done.

The last two columns are its light (see "Measure its light"): the intent,
dark, normal or bright, which `tools/room-light.mjs` reads from this table,
and the measured median lightness (L*, 0 black to 100 white) with its 10th
to 90th percentiles. A bold note is what the tool flagged. The normal band
is derived from the normal rooms' medians each run (Tukey's fences); on
these numbers it is L* 0 to 5.0. An intent marked "(proposed)" was read from
the room's description and waits for the owner's word. The numbers are a
first baseline, taken while the soft shadows, the picture decor and the
lightmap density were in flux; re-measure the house once they settle.

| Room | Zone and surfaces | Signature shape | Signature light | Light intent | Measured: median L*, p10–p90 |
|---|---|---|---|---|---|
| Drawing Room | upper: wood boards, plum (`bruise`) damask, wood panelling | a stone hearth with its fire, and a candlelit table | the hearth's ember glow | normal (proposed) | 1.3 (0.4–15.5) |
| Chapel | ground, formal | ranks of pews down a red runner to the altar, under a lancet | gold holy light, and a stylised jewel-coloured pool in front of its stained window | normal (proposed) | 2.3 (0.5–22.2) |
| Library | upper: wood boards, verdigris damask, wood panelling | every wall shelved with books, one bookcase fallen | a sickly green glowing book on the floor (`verdigrisLight`) | normal (proposed) | 2.1 (0.5–17.1) |
| Grand Staircase | ground: the starting hall's dress, chequered marble, moon-blue papered walls, wood panelling | a broad carpeted flight climbing the back wall | the newel lamp's amber, and the tall window's moon on the marble | normal (proposed) | 1.3 (0.4–14.3) |
| Foyer | ground: the starting hall's dress | a brass chandelier hung out of true over the runner | the chandelier's amber | normal (proposed) | 1.9 (0.6–18.5) |
| Entrance Hall | ground: the starting hall's dress | the tall barred front door under its fanlight, between standing lamps | twin amber lamps, and the moonlit fanlight | normal (proposed) | 1.8 (0.5–16.3) |
| Upper Landing | upper: wood boards, in the starting hall's dress above them | the head of the grand staircase in a balustraded well | the newel lamp's amber | normal (proposed) | 1.6 (0.4–13.6) |
| Master Bedroom | upper: wood boards, faded rose (`blood`) sprig paper, wood panelling | a pale four-poster with an open tester, its curtains tied back | one bedside candle's amber against the stage's window pool | normal (proposed) | 1.4 (0.4–19.8) |
| Mystic Elevator | **the machine exception**: iron tread plate, dark panelled walls, soot-iron kick panels, brass trim | a telegraph dial column in a floor sigil, pulley wheels turning in floor slots | the dial's violet glow and violet haze from the slots; one failing amber lamp | normal (proposed) | 2.4 (0.6–15.4) |
| Chasm | basement: flagstones, brick (`brick` ramp) over a stone footing, stone trim | a ragged gulf wall to wall, crossed by a plank bridge between hand-line posts | sickly green from the depths, under a lone amber lantern | dark (proposed) | 2.7 (0.4–17.6), **meant dark, but not darker than most normal rooms** |
| Furnace Room | basement: worn brick, a soot-black brick dado, dark grey flagstones | a squat round iron furnace with pale ducts, its mouth turned to a corner | orange fire from the open mouth and from below (ash pit, floor grate), hard flicker | bright (proposed) | 3.3 (0.6–25.8) |
| Graveyard | outdoors: earth with dead grass, a fieldstone low wall, ash iron railings, a gravel path | headstones round an open grave, with an obelisk | the wisp's green over a faint glow from the pit, on moon-blue ground; an amber gate lantern | normal (proposed) | 7.3 (1.2–44.5), **brighter than the normal band** |
| Underground Lake | basement: flagstones, rough block-stone walls, a dark wet tide-mark dado, stone trim | a sunken lake (the water kit) with a jetty and an empty rowing boat | the lake's cold cyan rippling up the walls; the boat's amber lantern | dark (proposed) | 3.7 (0.6–20.2), **meant dark, but not darker than most normal rooms** |
| Kitchen | basement (fits ground too): flagstones, grimy limewashed brick, a bare smoke-browned brick dado | a black iron kitchener between brick piers, pots on the hob | sickly green from inside the boiling pots | normal (proposed) | 6.1 (0.6–30.1), **brighter than the normal band** |
| Basement Landing | basement anchor: brick-paved floor, pale ashlar walls, a dark ashlar plinth | a pale flag cross from door to door round an iron drain | one iron lamp-standard's amber | normal (proposed) | 3.9 (0.6–30.6) |
| Stairs from Basement | basement: big flagstones, ashlar | a steep stone flight up the left wall, its rail torn | amber falling from the Foyer over the head of the flight | normal (proposed) | 5.7 (0.9–23.9), **brighter than the normal band** |
| Wine Cellar | basement: grey setts, brick over ashlar | casks on cradles, heads to the aisle | amber bottle candles on an upended cask | normal (proposed) | 2.4 (0.5–15.5) |
| Creaky Hallway | upper: wood boards, charcoal paper | loose boards sprung into a tent over a hole | sickly green up through every seam | dark (proposed) | 1.0 (0.4–14.2) |
| Dusty Hallway | upper, greyed by dust | dust sheets, and footprints ending at a lantern | the lantern's amber in a dust haze | normal (proposed) | 7.5 (0.6–30.2), **brighter than the normal band** |
| Statuary Corridor | ground, formal: pale marble, charcoal damask | statues in red-lined niches, one stepped down | the moved statue's red eye-light; amber votives | normal (proposed) | 0.8 (0.3–15.9) |
| Dining Room | ground, formal: warm cream marble, wine-dark (`blood`) damask, wood panelling, a violet rug | a long table laid for eight under a pale cloth, with a shut silver cloche; the host's chair turned to the window, a guest's knocked over | violet: two silver candelabra whose candles burn violet, flooding the cloth; one amber candle on the sideboard | normal (proposed) | 1.7 (0.5–25.4) |
| Catacombs | basement: an earth floor, near-black rock | a wall of bones with an arch of skulls | sickly green from the skulls' eyes | dark (proposed) | 2.1 (0.4–35.0), **meant dark, but not darker than most normal rooms** |
| Tower | outdoors, a roof. **Breaks its zone**: a stone roof | the fallen belfry and its bell across the roof | an amber-orange beacon fire | bright (proposed) | 2.8 (0.6–29.0), **meant bright, but not brighter than most normal rooms** |
| Pentagram Chamber | basement: black flagstones, dark brick | a circle and star in light across the whole floor | violet | dark (proposed) | 1.6 (0.4–19.0) |
| Junk Room | upper | junk heaped into every corner | an amber oil lamp on the heap | normal (proposed) | 2.1 (0.5–16.9) |
| Attic | upper. **Breaks its zone**: bare plank walls | bare joists over lath, a boarded way through | an amber storm lantern | normal (proposed) | 1.4 (0.4–14.9) |
| Bedroom | upper: wood boards, moon-blue paper with pale stars, cream-painted panelling | two narrow iron bedsteads side by side, one made with a patchwork quilt and a doll, one stripped, its quilt drawn in under it | spectral teal (`spectre`) welling out from under the empty bed; a low amber night-lamp between them | normal (proposed) | 1.3 (0.4–28.5) |
| Storeroom | upper (fits basement too): pale scrubbed boards, bone limewash plaster, a dark tarred dado | an open slatted store bay in a corner | an amber lantern burning in the bay that nobody lit, its slats barring the floor and walls | normal (proposed) | 8.9 (0.7–38.0), **brighter than the normal band** |
| Abandoned Room | ground, formal stripped bare (fits basement): wood boards with pale grime-rimmed ghosts where furniture stood, dark gilt (`brass` on `woodDark`) damask with unfaded oblongs where pictures hung, wood panelling | a dapple rocking horse on red bows, alone on its rug's ghost, rocking by itself | a wrong amber: the steady, unflickering pool of a lamp that is no longer there, on the horse and its rug's ghost; a guttered candle by a picture turned to the wall | normal (proposed) | 1.8 (0.5–20.7) |
| Game Room | ground, formal (fits every floor): wood boards, oxblood (`brickDark`) paper with a spade pip, wood panelling | a green baize billiard table, a cue stroking at the cue ball with no one holding it | twin amber-glass shades hung low, a hard pool of amber on the baize | normal (proposed) | 1.9 (0.5–15.1) |
| Servants' Quarters | upper (fits basement): plain dark boards, grimy grey-buff limewash, a brown painted board dado | four black iron cots in two rows, a maid's uniform laid out flat on each like a sleeper; the fourth's gone, its blanket flung back, muddy wet boots and prints from the door at its foot | two tallow dips' low amber on stools by the cots' heads | dark (proposed) | 4.3 (0.6–29.3), **meant dark, but not darker than most normal rooms** |
| Organ Room | ground, formal (fits every floor): dark grey marble, charcoal paper with a moon-blue damask, wood panelling | a pipe organ against the back wall, pale tin pipes in three towers between wooden end towers, its bench knocked over and its music blown across a red rug | a cold pale (`moonLight`) breath from the pipe mouths; amber keydesk candles; its keys go down and up by themselves | normal (proposed) | 2.6 (0.4–16.3) |
| Gymnasium | upper (fits basement): narrow wood strip boards, cold grey distemper plaster, narrow dark wood panelling | a red leather vaulting horse on splayed legs beside three climbing ropes that swing slowly, out of step, in a draught that stirs nothing else; wall bars on one wall | spectral teal (`spectre`) welling up in an empty corner from nothing; a frosted gas globe's amber over the horse | normal (proposed) | 3.2 (0.8–15.4) |
| Larder | basement: red quarry tiles, cold blue limewash (`moon`), a slate dado | a long slate thrall down one wall, heaped with cheeses, a ham, a pie and eggs, crocks beneath | amber glowing from inside the jars of preserves on it, lit by nothing; everything on it has had one bite taken | normal (proposed) | 4.3 (0.8–24.9) |
| Crypt | basement: big dressed stone slabs in staggered courses, dark coursed-stone walls, a stone bench round three walls under sealed burial niches cut with names | a stone sarcophagus on a plinth in the middle, its lid shoved askew off the head end | sickly green (`wraith`), the rot welling out of the open tomb and lying round its plinth; amber candles on the bench, and the mason's candle by a pale new tablet whose name is only half cut (a place made ready, not something moving) | normal | 4.5 (0.6–23.2) |
| Operating Laboratory | the laboratories' dress, upper or basement: grey quarry tiles in a chequer, pale grey glazed tile walls, a dark green tiled dado with a band | an iron operating table across a corner, its straps undone, under a standing lamp with a deep pale shade | the lamp's sickly green (`wraithLight`), a hard pool round the table; on the floor beside it the shadow of someone standing there, though no one is; one amber chamberstick on the bench | normal (proposed) | 5.1 (0.7–25.2), **at the top of the normal band: the lamp's pool is the point** |
| Research Laboratory | the laboratories' dress (as the Operating Laboratory) | a tall glowing bell jar on a pedestal, beside an island bench of apparatus and a wall of specimen jars | spectral teal (`spectre`) from a presence caught under the bell jar, glass shards at its foot where the jar has begun to give; an amber spirit lamp under a brewing flask | normal (proposed) | 3.2 (0.7–17.0) |

Four rooms (the starting hall and the Upper Landing) share one dress and one
amber light, so telling them apart rests on their shapes alone. Green is the
supernatural in several rooms (the Library, the Chasm, the Graveyard, the
Kitchen, the Creaky Hallway, the Catacombs, the Crypt): no two of them should sit on
one floor with the same green source.

## Workflow

### 1. Read the room

From `content/rooms.md`: the rule text (what happens here), the floors it
can be on (a basement-only room is a cellar), its symbols. From
`data/rooms.ts`: which edges have doors, windows or open passages, whether
it is outdoors, and whether it has a fixed link (a stair) to another room.
Every door is centred on its wall. A window is centred too, unless its wall
also has a door, when it sits beside the door to the right as you face the
wall (the stage sets where). A passage edge has no wall at all. Then read
the ledger, and pick the room's zone.

### 2. Decide its one-second identity

Before any code, write one sentence: what makes this room recognisable in
one second, from any of the four views, on a phone, **with every wall cut
down** as the house shows it. One signature shape and one signature light,
not a list of props, and neither already in the ledger. The light's colour
follows the lighting language. The shape stands on the floor, or is a wall
piece below the cut height: a portrait, a window or a tall cabinet is lost
in the house. A tall identity piece may keep more of itself by setting its
own cut height, as the Grand Staircase keeps its first seven steps.

**Face the signature into the room, not against a wall.** A piece backed
against a wall is seen from behind in the two views that cut that wall (the
Kitchen's range, the Furnace's mouth facing a door): stand it free, turn it
across a corner, or make its back read too.

Then add the story: something is wrong here. A toppled pew, a shelf given
way, a cracked font, candles mostly burnt out, a fallen bookcase. **Eerie,
never gory**: no bodies, wounds or blood as gore; the `blood` keys are for
cloth, leather and lacquer.

**Settle the uncanny note against the ledger, not just its colour.** Two
rooms may share a light's colour; they must not share the kind of wrong.
Several rooms already use "moves by itself" (the Game Room's cue, the
Abandoned Room's horse, the organ's keys, the Upper Landing's chair): find
another note unless the room's rules call for it.

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
- **The prime place**: a keep-clear zone, floor and air above it alike.
- **Windows**, unless blocking one is the point.

#### Where figures stand

A room doesn't list where figures stand: the placement solver
(`placement.ts`) places every figure on the room's free floor, from the
floor plan the overlap check reads off the built room. The room gives it
only two things:

- **The prime place** (`prime`): where the active explorer stands, and the
  bench stands its explorer. Put it in open floor, where a figure standing
  there reads and doesn't hide the identity, with open floor towards the
  middle of the room as well. It must be clear for a base, reachable from
  every door and out of the doorways' lanes; the overlap check holds it to
  that. A barrier room gives one in each half: `prime` in one, and
  `primeAcross` in the other.
- **Keep-clear areas** (`keepClear`), only where the room needs them: floor
  in front of what makes the room (the range in the Kitchen, the open grave
  in the Graveyard), so no figure stands between the player and the
  identity. Each is a stroke: a segment and a radius round it. Most rooms
  need none.

**Things that live in rooms aren't the room's art.** Dropped cards, haunt
objects and tokens are placed in any room by a shared system: objects by
the placement solver, room effects sized to the tile, connections on the
tile's edges. A room never reserves places for them; the prime place and
its keep-clear areas are all it gives.

The doorways and the walking lanes are always kept clear without being
listed: no figure stands on a lane until the room is crowded enough that
the rings overlap. Figures stand apart, rings never touching, while the
room has room; past that it degrades in steps, never failing: rings
overlap; a large figure takes its crowded pose; then figures stand partly
behind each other, in the keep-clear areas too, and the room shows a count
badge. The overlap check places three explorers and six in every room (on
each side of a barrier room): three must stand apart, and six with their
rings overlapping at worst. If a room fails that, open up its floor.

**Walks.** A walker needs clear floor of the base's radius (0.36 m) round
it, and anything solid from the step-over height (7 cm) to 1.8 m blocks it.
Walks go straight; where a straight walk would be blocked, give the room
`lanes` to keep to round the obstacle. A barrier room gives its `crossing`,
the path from one half to the other. A stair link needs both rooms' halves
of the path (see "Build it"). In play a walk also keeps round the figures
standing still in the room, planned on its free floor. `?paths` on the
bench draws where figures stand and the walks over the room.

**Leave room for a big monster.** A large monster (the Spider, the Dragon)
may stand in a room one day, its footprint spreading over its neighbours'.
No room reserves floor for one, but where it doesn't cost the
room's identity, keep tall clutter out of the middle of the floor. The
overlap check reports each room's largest open floor circle; it never fails
on it.

Use `onWall` for anything backed against a wall: `along` is metres from the
wall's centre, positive to the right as you face the wall, and `out` stands
the piece off the wall face.

**Free-standing tall furniture never cuts**: only walls cut, so a wardrobe,
a four-poster or a screen standing in the room stands full height in every
view. Keep it open above the cut height (posts, an open tester, a frame,
not a solid box), or put it against a wall and split it (see "Rules").

### 4. Build it

A room is one file, `rooms/<room-id>.ts`, exporting one `RoomDefinition`:
surfaces (floor, wall, optional wainscot, trim colour) from its zone, props,
lights of its own, the close-up `focus`, and the prime place (`prime`).
The bench stands its first explorer there, a person at 1.6 m;
shoot with `--explorer=pawn` for the plain scale pawn. Props the room alone
needs are functions in that file, each with a one-line doc comment saying
what it is and which way it faces. Give every seeded texture a seed of the
room's own, so rooms don't repeat each other's pattern.

The stage puts each built piece in a holder that takes the placement, so a
position, turn or scale the build gives its own piece is kept: build in
whatever frame is easiest (local, or room metres placed at `[0, 0]`).

A room with a stair link gives `stairs` a walk path for each room it links
to: points in room metres from its floor up (or down) the flight to where
it leaves the room. The two rooms' paths meet, one going up and the other
coming down (the Grand Staircase and the Upper Landing), and both halves
are needed. The Foyer's secret door down to Stairs from Basement has its
path but no drawn door yet.

**Run the overlap check** after every change to the props:
`npx vitest run --config vitest.slow.config.ts src/projects/betrayal/art/overlap.slow.test.ts` (headless). It
builds each room in a worker with a time limit, so a build that loops
forever fails alone instead of hanging the run. It fails when a solid
passes into another piece, a wall's body or the floor by more than 2 cm (or
a third of the thinner piece, so a book half sunk in the floor counts), or
when a piece stands in a doorway's lane or on the prime place. It tests
each piece's real shape, splitting touching solids into convex parts, so a
fallen bookcase is judged as it lies. The few millimetres neighbours
overlap to hide a crack pass, and so does standing into a wall's dressing
(skirting, wainscot, casings), which the piece hides. A piece's own parts
are built into each other on purpose, so only their z-fighting counts.

**It finds z-fighting too**: faces of any two solids, the shell included,
lying within about a millimetre of one plane, facing the same way and
sharing area. It checks the room with its walls standing, cut and
half-cut; rooms against each other in a house; every tile's bare shell;
and every face against the house's mark planes (`MARK_PLANES`: the choice
glow's fill, ring and border, and the figures' colour ring). Fix a fight
with an inset of a few millimetres, or a butt joint (one wall run stops at
the other's face), never by declaring it.

When a piece is meant to pass into something, declare it on the piece, in
one line, with the reason:
`contacts: [{ with: "left", because: "it has fallen against the wall" }]`.
`with` names a wall's edge, `floor`, a zone (`prime place`, `doorway top`) or
another piece by its name. A piece's name is its build function's, or its
`name` when it has one: give one to any piece built by an inline arrow,
which the check otherwise calls `prop`. A declared contact that no longer
happens fails the check too, so declarations don't outlive their reason.
Prefer fixing the geometry to declaring: a contact is for a piece that
truly rests in or against another. There is no baseline: every room passes
the check, or declares each intended contact with its reason.

### 5. Screenshot, review, repeat

See "The review loop". Expect many rounds. Fix the biggest problem each
round, not the smallest.

### 6. Measure its light

A room is lit by eye, on its own, and the camera has no auto-exposure, so
a room can drift far brighter or darker than the house without anyone
meaning it, and the player sees it beside its neighbours. Very dark or very
bright is fine when it is the room's point; by accident it isn't.

Decide the room's light intent from its identity: dark, normal or bright.
Then measure it with `tools/room-light.mjs --rooms=<room-id>` (its header
says how to serve the app for it): it renders the four views fully lit and
reports the room's median lightness (L*) and its dark and bright spots (the
10th and 90th percentiles), over the room's own pixels. Compare it with the
ledger: a normal room sits in the normal band, and a dark or bright one
clearly below or above it. Where it lands anywhere else, change the light,
or say in the report why the room belongs where it is. Re-run the whole
house (no `--rooms`) after a change to the shared lighting, which moves
every room and the band with them.

### 7. Register it

Add the definition to `BENCH_ROOMS` in `rooms/index.ts`; the bench, the
house and `shots.mjs` only know rooms listed there. The id must be a tile id
in `data/rooms.ts` (the stage throws otherwise). Add the room's row to the
ledger, with its light intent and its measured median and range.

## Rules

- **Palette keys only.** Never write a hex value or a raw colour anywhere in
  the art; only `palette.ts` has them. SVG decals take their colours from
  `paletteHex`, and `svgTexture` snaps every pixel to the palette anyway. A
  new palette key changes how existing decals snap at their edges, so
  adding one means re-shooting every room and checking it is unchanged.
  The skin keys are for figures only: decals never snap to them.
- **Pixels match.** Size a decal or pixel plane from `TEXELS_PER_METRE`
  (`pixelPlane` does it for you), and draw SVGs at that pixel size, never
  finer. A surface's pixel art moves a whole texel at a time, never
  smoothly. Light and water are not pixel art: water's surface, its
  reflections and caustics, and light itself may move smoothly.
- **Light makes shine; paint never does.** Never paint shine into a pixel
  texture: no glints, speckles, highlight pixels, pale bevels or pale
  "reflection" tones standing in for light catching a surface. Mark a shiny
  surface instead, with a preset from `SHINES` (`shine.ts`): `shiny(material,
  SHINES.brass)` for a prop's material, `shinyAll` for a built piece. It then
  takes real highlights from the room's lamps, flickering with them and
  stopped where the bake says they are shadowed. Use the preset's name,
  never numbers; add a preset to `SHINES` when no name fits. A metal takes
  its surface colour, so paint it one flat mid tone. `?shine=off` shows the room without highlights, for comparison.
  Each shine is its own draw call in the room, so a room keeps to a few.
- **A room's shell never shines.** Shine is for things that clearly shine:
  metal, mirrors, glass, glaze, wax and polished furniture on the props.
  Floors, walls, wainscot and trim are matte, marble and panelling included:
  this is an old, dusty house, not a showroom, and a lamp's gleam on a floor
  draws the eye from the figures. Only the windows' glass shines, which the
  stage marks itself. Marble floors are honed, with no vein lines (dark veins
  read as cracks at this pixel size): nearly flat, at most a faint broad
  two-tone. The shine bench (`?bench=shine`, `shine-bench.ts`) lays every
  room's floor side by side under a lamp, a candle, the moon or a coloured
  light, from the game's high camera or a low one, and tries a preset on them
  live.
- **Doorways and the prime place stay clear** (see "Lay it out"); the
  overlap check enforces it.
- **Wall-hung props and the cutaway.** A wall that is cut stands only to
  `CUT_HEIGHT`. A prop placed with `walls` (which `onWall` sets) and a `y`
  at or above the cut height hides whenever any of its walls is cut, and
  so does an animated one; a corner piece names both walls. A prop below
  the cut height stays visible. So split tall wall furniture: a base no
  taller than the cut height on the floor, and the rest hung on the wall
  above it. Anything on a wall that must survive the cut (a caustic band,
  a stain) stops below the cut height.
- **Lights are baked, and many are allowed.** A room's lights (its
  `lights`, and every `lightAnchor` in its props) are baked into its
  lightmap when it is built, every one with shadows: up to 16 a room (the
  stage throws past it; each costs load time, not frame time). Kit candles
  bring a light each unless told not to, and take a `range`. A cluster of
  flames still takes one light, as the candelabra does: lights a few
  centimetres apart only bake slower. A light just above a surface blows
  it out: lift it (the kit's chamberstick takes a `lift`).
- **What stays live is limited.** Only what moves is lit live: the active
  explorer's light, and in time a carried candle or a haunt's short event
  light. At most two live lights may cast shadows, and those are the
  house's to add, never a room's. A room has no live lights.
- **Flicker modulates the baked light.** A light's `flicker` (at most 0.5)
  makes everything it lights waver, its spill next door included. It
  wavers with a named `signal`: one of the four flame signals (0–3), or
  `water`, a slower swell for light thrown off water. Unnamed, a flame
  picks a flame signal by its place in the room, so two candles may waver
  in step. A glow doesn't flicker by itself; to make one follow its light
  (a fire's mouth, glowing cracks), name the light's signal and drive the
  glow from `flickerOf` in an `animated` piece.
- **Light spills; walls stop it.** A lamp lights whatever it reaches within
  its `range`, through doorways and passages into the next room, and stops
  at walls and shut doors. Give a light the range its brightness deserves,
  not one cut to its tile.
- **What breaks the bake.** A light inside a piece that casts shadows is
  smothered by it: a piece that holds a light must not cast shadows (mark
  it `noShadow`, as the kit's candles and lanterns do), nor may glass,
  haze and decals. A piece that moves after the build (an `animated` one)
  is baked where it stands when built, so its shadow stays there, and so
  does a light anchored in it. Changing a light while the game runs
  (dimming a lamp, putting out a candle) needs a re-bake: report the need
  rather than faking it.
- **The house owns the fill, the fog and the moon.** A room can't set its
  own. A windowless room lights itself with its own lamps and glows and
  what spills in from next door, never with more fill. The moon comes in
  only through windows, on the bench as in the house (see "The lighting
  language").
- **Floor openings** (a stairwell, a lake, a pit) are `floorOpenings`:
  rectangles, or polygons for a ragged edge. The stage cuts the slab; the
  room builds what is below (see "Pits and openings").
- **Vessels are closed solids.** A pot, cup, decanter, urn or bowl is built
  with `vessel` or `solidLathe` (`kit/vessel.ts`), never as an open,
  one-sided lathe shell: from the house's camera a shell's inside shows
  through its back. `openEdges` is the check.
- **Decorations never promise mechanics that don't exist.** A padlock, a
  cage, a lever or a sealed door reads as something to use: if the rules
  have nothing there, don't build it (the Storeroom's padlocked cage became
  an open bay).
- **Show before telling.** Anything a room signals shows in 3D or on the
  board first, then as an icon, and in text only for what only text can
  explain.
- **Code a worker may load reads the page with `pageSearch`**
  (`page-search.ts`), never a `typeof window` or `document` check: both give
  the wrong answer inside a worker bundle or a headless test.
- **Shared code.** Room-specific props stay in the room's file. A piece goes
  to `kit/` only when a second room needs it: then move it there in the
  same change, generalise it with options, switch the first room to the kit
  version, and re-shoot that room to confirm it is unchanged. The same goes
  for helpers: reuse what `shapes.ts`, `textures.ts` and the kit export
  before writing a new one.

## Kinds of room

### Outdoors

An outdoor tile (`outside` in the tile data) has no walls and no ceiling.

- **Edges.** The stage builds a low wall exactly the cut height tall, with
  iron railings above it in the room's `trim` colour, and stone piers at
  the gates and corners; cutting an edge drops only the railings and the
  piers' upper part. Doors are gateways between piers, and a false door is
  a shut iron gate. Piers reach 10 cm into the floor (`OUTDOOR`), so keep
  props at least 15 cm off them. Railings are today's only edge; the edge
  style is a per-room choice (hedges for the Gardens, a balustrade for the
  Balcony), to be added to the stage when such a room is built.
- **Surfaces.** `wall` is the low wall's face, and `floor` is the ground:
  `earth()`, with grass or without.
- **Light.** The open sky lets the moon fall on every surface: make the
  ground dark enough that moonlight doesn't flatten it, and carry the
  colour on fog and glows. The baseline is cold moon blue, and low fog
  (additive `lightMaterial` layers about 0.1–0.3 m up) is the outdoor
  zone's shared atmosphere.
- **No windows**: the stage throws if an outdoor tile has one.
- **Sunken features** use `floorOpenings`, their own walls rising about
  2 cm above the ground so they don't fight its plane.
- **Next to an indoor room**, the indoor room's wall on that edge cuts like
  any wall between rooms.
- **Wind.** Indoors the air is still; outdoors a gentle, gusty breeze blows
  (`wind.ts`), with a gust hook for events that whip up the air. Cloth and
  anything else that moves answers it. A room is outdoors when its content
  says "Outside: yes" (`content/rooms.md`); the Conservatory counts.

### Pits and openings

Below a floor opening the room builds three things:

- **The lining**: the opening's sides, a few centimetres thick, standing
  just inside the edge of the floor they line. The house fill lights a
  lining as brightly as the floor, which flattens the drop into a shallow
  tray, so a deep lining is **unlit and self-shaded**: `MeshBasicMaterial`
  with vertex colours graded by depth (the Chasm's rock goes from the
  room's dim light at the lip to dark, then to the glow far below). A
  merged lining makes one hull for the overlap check; build it from boxes.
- **The shell** (`pitShell`): the dark round and under it, in the
  background's colour, so the pit can't be seen from outside the room
  below the slab.
- **Haze or glow** (`pitHaze`) at a depth or two, for colour rising out of
  it.

The camera sees only about 1–1.5 m down a pit, so anything deeper reads by
light and colour, not shape.

### Water

Water is one kit piece (`kit/water.ts`) for any water: a lake, flooding, a
puddle, a fountain. The Underground Lake is the reference. Its baked lights
flicker on `water`, a slow swell, not a flame's waver. Its reflections and
the caustics it throws up the walls are light, added over the surfaces
(the walls' band stops below the cut height). The lake's look is pending
the owner, between two styles (`?water=shader` and `shader-palette`).

### Fire

The Furnace Room is the reference. Give the fire a strong light with a
high flicker on a named signal, and make its glows (the mouth, the flame
tongues, cracks in the floor) follow that signal with `flickerOf`. Light
from below (an ash pit, a grate) says fire more than light from above.

### Rooms that change in play

A room whose art changes during play (the Vault: closed, then opened and
emptied) declares each of its states, and a change of state re-bakes that
room, as `design/lighting.md` says any changing light needs.

### Moving rooms

The Mystic Elevator moves between floors. The house doesn't yet move a
room: today it is baked in place like any other. Moving it will need it
shown live while it travels (its probes and a live light), then both
neighbourhoods re-baked; and its dial driven by game state, not the clock.
Build such a room so it reads at rest, and report what its movement needs.

## Lessons learned

- **No two faces in one plane.** Coplanar faces z-fight, which shows as a
  shimmer of dots and passes for a lighting problem. The wall's own dressing
  counts: the wainscot stands `WAINSCOT_DEPTH` off the wall, and the
  skirting, crown, door casings and window sills stand further out. A piece
  backed against a wall keeps its faces out of their planes. Inside a prop,
  a rail, cap or trim that meets a post or board stands a little proud of
  it or sits inside it, never flush with its face. The overlap check finds
  these.
- **Touching is not joined.** Two boxes that only meet leave a crack the
  dark behind shows through as a line of dots; overlap neighbours by a few
  millimetres (the Library's books do).
- **Judge detail at native resolution; judge identity at house distance.**
  Fine detail is for close views. Anything the room's identity or a rule
  depends on must read as a shape at house distance, not as a relief or a
  thin line. A detail of another colour standing only millimetres off a
  surface fights it at a distance and flickers: stand it a centimetre or
  more proud, or make it flush, a slice of the surface in its own colour
  (the Library's book bands) or part of the texture.
- **Thin hanging shapes read as poles** at house distance (chains, a
  chandelier's drops, a pan rack's hangers): make what hangs broad, or let
  the thing it holds carry the read.
- **Texture brightness beats light strength.** A dark texture stays dark
  however strong the light on it (the Furnace's coal heap, a black range).
  Lighten the texture's ramp before adding light.
- **Coloured light shifts hue on warm surfaces.** Green or red on bone,
  brick or wood turns yellowish; a coloured light reads truest on grey
  stone and on its own glows.
- **No patterned texture on smooth metal.** The Tower's bell, textured,
  read as paint; it is one flat colour.
- **Fine noise in a pixel texture reads as dots, not as material.** At this
  resolution a speckle of lighter or darker texels never reads as grain,
  polish or wear: it reads as noise. Prefer flat colour, with structure (a
  plank's edge, a tile's grout, a vein) drawn as shapes, and let light give
  the surface its finish.
- **Pale cloth reads cold** blue-grey under the house fill. Warm it in its
  palette keys, or light it warm.
- **Merge many small pieces** with `batch()`: one mesh, coloured by palette
  key per box. Shelves of books, rails, rungs, a heap of debris, rope.
- **Glows, pools and beams use `lightMaterial`**: it adds light to whatever
  is behind, so the surface still shows through. `glow` is for things that
  are their own light (flames, embers, stained glass seen face on).
- **Animated pieces' shadows stand still**: they are baked where the piece
  stands when built. Make the motion read without its shadow (the rocking
  chair's sway, the boat's rocking). Their light comes from probes of
  their own, so a moving piece is lit where it is.
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
  sparingly to lead the eye. Small held or dropped things vanish unless
  pale and large.

## Connections between rooms

What lies through a door or window is decided by the layout, not the room.
A door that ends up against a neighbour's wall is a **false door**: it can't
be passed. The house tells the stage which doors are false, and the stage
boards them: a shut leaf with boards across it, and boards across the cut
stub's top (a shut gate outdoors). A window against a neighbour is a
**false window**: boarded, and letting no moonlight in. Both matter to the
rules (haunts make false doors passable, and many cards ask whether a
window faces outside), and both are the stage's to build, not a room's,
along with every other cutaway marking (`design/presentation.md`, "The
cutaway"). Build the room for its real openings, and report anything about
a room that only works when an opening is live.

## The review loop

- **The dev server is the owner's**, on port 3001. Check it answers
  (`curl` the page); if it doesn't, ask the owner. Never start it yourself.
- **Never use the chrome-devtools MCP**; it drives the owner's real browser.
  All looking is through headless Playwright.
- **Shoot a labelled run on the bench:**
  `node src/projects/betrayal/tools/shots.mjs <room-id> <room-id>-v<n> --compare=<room-id>`,
  a new label each round so rounds can be compared. It draws at the
  screen's native resolution, as the game does (a lowered render is not
  the house's look); `--res=<short side>` draws smaller, for a performance
  or debug check only. It writes, under
  `src/projects/betrayal/.shots/<label>/<room-id>/` (gitignored):
  `contact-sheet.png` (the four dollhouse views, a close-up, the explorer
  framed close and a phone view); `close-ups.png`, every prop framed close
  at full resolution from the view that faces it; and with `--compare`,
  `compare-<room-id>.png`, the room beside a finished one in the same
  views, clock, explorer and resolution. Compare with the finished room
  nearest in zone or character (see the ledger). The bench's clock is
  frozen for every shot, so two runs differ only where the art does.
  `--explorer=<id>` picks who stands in the room; `--idle` adds
  `idle-strip.png`, the explorer at a run of frozen times. If building the
  room throws (a light limit, a pixel character missing from its legend, a
  room id the data doesn't have), the run stops at once with that error.
- **Shoot it in the review house** every few rounds and before done:
  `house-shots.mjs <label> --room=<room-id>`. This is where the cut walls,
  the spill to and from its neighbours, and its read at house distance are
  judged. A plain `house-shots.mjs` run also writes `sheet-spill.png`
  (light through a doorway and through a wall).
- **Read every sheet each round**: the contact sheet, the close-ups, the
  comparison and the review-house sheet, then the single shots they raise
  questions about. Judge the pair on the comparison together, as one
  house: palette, pixel size, light, detail and finish should match; only
  the contents differ.
- **Close checks.** The close-up aims at the definition's `focus`: point it
  at the piece under review, re-shoot, and set it back to the room's best
  close-up when done. A prop's close-up is often blocked by a wall, a pier
  or the explorer: judge it from another view or by orbiting rather than
  moving the prop. For anything more, a throwaway Playwright script
  modelled on `shots.mjs` drives `window.__betrayalBench` (views, zoom, a
  prop as the subject, `setResolution`, and mouse drags on the canvas to
  orbit from the current view). It must live inside the repo while it runs
  (packages resolve from the script's folder); delete it afterwards. Wait
  on `isReady()` and the frame counter advancing, never a sleep.

Judge each round in this order, and don't polish detail while a higher item
fails:

1. **Silhouette and readability.** Is the identity clear in one second in
   all four views and in the phone shot, with its walls cut as the house
   cuts them? Can the main pieces be told apart at a glance? Is the scale
   right against the explorer?
2. **Every view with its walls cut.** Nothing floating where a wall was cut,
   no tall piece blocking the room from one side, no hung piece left
   hanging in the air, no signature seen only from behind, doors and
   windows where the data says.
3. **Lighting.** Dark and eerie, but the identity lit; the colours saying
   what the lighting language says; no blown-out white areas, no corner so
   dark it reads as missing; flicker and glows where they belong; what
   spills to and from the neighbours in the review house.
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

All four views and the phone view pass the checklist on the bench and in
the review house, the close-ups show no detail faults, lint and typecheck
are clean, the overlap check passes, and the room is
registered with its ledger row. The builder reports back:

- the room's file, the one-sentence identity, and its ledger row;
- its measured light against its intent and the normal band, and why it
  sits there;
- the path of the final contact sheet, comparison and review-house sheet
  (and the label of the run before it, for comparison);
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
