# Roads: what is still wrong, and the fix planned for each

What was seen and left when the roads were given their real width, their junctions, their paint and their town paths (`docs/ROAD-SURFACES.md`, Where the trial stands). None of it is decided and none is built. Each entry says what is wrong, why where that is known, and what would fix it. They are in the order I would take them. What is a matter of taste rather than a fault is `ideas/road-feel.md`.

## The island has not been built with this pipeline

Players see none of the road work until the island is rebuilt and published, which is the owner's call (`docs/HANDOFF.md`, Decisions waiting on the owner). Three tiles were built with all of it, Godby's L2343H and Mariehamn's L2334E and L2334F, and five country tiles with the real widths alone. The other 86 have never been through it, so the island build is where it meets a junction or a shape no trial tile had.

- **A tile may stop.** One window of Mariehamn could not join its paved shape in GEOS until the shape was joined on a fine grid (`ground_shape`). The same failure in another union would stop a tile, and the same grid there is the fix.
- **Measure it once built.** `check_seams.py` first. Then `tools/road-check.ts --out` and `tools/bridge-check.ts` on the island, against the published island's numbers in `docs/HANDOFF.md`: neither was run on the three rebuilt town tiles. `tools/junction-check.ts` was run on Godby's tile alone, and Mariehamn's two are where the junctions are densest. `pipeline/look_census.py` counts what a player would see wrong on any built tile.
- **What the publish carries** is in `docs/ROAD-SURFACES.md`, Getting it to players. A street no longer runs on as a footpath, so a rebuilt tile numbers its chains differently: the lane map, every race's racing line, the racers' ruler and the challenges' targets are remade from the rebuilt island, and so is anything else kept by chain.
- **The paved path has no browser test.** The e2e fixture is still ribbons.

## Paths that meet in town end ragged

Three kinds are left on Mariehamn's tiles, and most of the slivers and sharp corners the census still counts there are these:

- a sidewalk that ends against a car park's lane ends in steps (Strandgatan);
- a cycleway that ends against a sidewalk's slabs leaves a stepped tab about a metre across;
- where gravel paths meet slabs at a park's corner, their ends show as prongs.

**Why.** The strip between a street's carriageway and the paths beside it has no surface of its own: each piece of it wears the surface of the nearest path running alongside (`_paths_worn` in `pipeline/paving.py`). The pieces are whatever shapes the outlines of everything nearby cut the strip into. So where the lending path changes along the street, the line between the two surfaces follows those pieces' outlines, not the street.

**The fix planned.** Cut the strip straight across the street at the place along it where the nearest path changes, before the pieces are given their surfaces, as a way is cut where its own surface changes (`look_changes`). Every piece then lies beside one lender, and two surfaces part on a line square to the street. Where a path simply ends, the strip past its end takes the next path's surface from that same line, or the street's own shoulder where there is none.

**How to tell.** A test in `test_paving.py`: a street with a slab sidewalk that ends half way along and a tarmac path that carries on, the two surfaces parting on one straight line across the strip. Then Strandgatan in a window (`pipeline/paving_window.py`), then the census on the three town tiles: slivers and sharp corners fall and nothing else rises.

## A ramp on Getavägen jolts the road it joins

East of Godby a service road drops off Getavägen's embankment (east 114211, north 6699561, as `?at=` takes them). The junction check, driving straight through on Getavägen, meets a jolt of about 5 g there, on the published tile and the rebuilt one alike, 23 m apart. It was not looked into.

**Where to start.** The check's own record of that movement says where along it the jolt is; the paving's heights across the mouth, read in a window, say whether the ramp's surface and the through road's stand apart there. My guess, unchecked, is that the ramp's last metres keep their own slope to the through road's edge and leave a step in its shoulder. If so the fix is in how a lesser road eases on to the greater one's surface where the ground falls away steeply, and it belongs with the heights (`solve_heights`), not the corners.

A corner is filled with asphalt only where the two roads part no faster than one in ten (`_part_as_streets`), which leaves this ramp's mouth square. That limit is there because of this ramp: with its corner paved the jolt was 8.9 g.

## A path's corner on a slope stays square

The asphalt corner between two carriageways follows the grade rule above. The shoulder's corner, which rounds the paving's outline where any two ways meet, paths included (`_corners`), still asks the two to stand within 0.4 m of each other over the whole corner. On a slope they don't, a few metres out, so a path's corner with a street there is as square as the angle between them.

**The fix planned.** The same grade rule for both. Run the junction check on Godby's tile before and after, since a corner paved where it shouldn't be is a jolt.

## A thin splitter is bare asphalt, and its zebra is half a zebra

Where the wedge between a roundabout's entry and exit is under 1.5 m wide it is filled with asphalt (`gores`) and nothing is painted on it, so the two lanes run together unmarked for a few metres. A real one is hatched.

The zebra there covers the entry lane alone. The game paints a zebra across the end of a lesser road in town (`art/surfaces/road-attributes.ts`), and of the two one-way arms only the entry ends on the ring.

**The fix planned.** The pipeline now knows every crossing, tagged or not (`with_crossings` in `pipeline/vectors.py`). Write where each crosses its street into the tile, and paint a zebra there on every carriageway it spans, in place of guessing one at a road's end. For the wedge, its points say they are a wedge's, as an edge line's cells say what they are, and the road's paint hatches them. Both change what a tile holds, so they go with a rebuild.

## Junctions at a tile's edge

None of the junction work applies within 8 m of a tile's edge (`EDGE_BAND_M`), where each tile sees only its own side of the seam: a mouth there keeps its square corner, and only the painted edge line runs through. Count them first, from the roads as kept: on a 94-tile island it may be a handful.

**The direction, if it is worth it.** Each tile lays the junctions near its edge from roads read a little past it, as it already reads the ground with a rim, and keeps its own side. Both tiles then make the same junction from the same data, and `check_seams.py` says whether the halves meet.

## Winter

- **A road is hard to make out where roads meet in open ground.** With the road's snow the land's own, a road is its faint tracks and the land's shape, and at a junction in a field that is little. Nordic roads are staked for the plough, and the plough leaves a bank along the edge. I would add both, as roadside art placed along the strip's edge while the season's snow lies, before making the tracks any stronger.
- **Far off, a winter road is a grey line.** Past the reach of the drawn roads the terrain paints them itself (`render/game.ts`), with a smaller share of the snow than the near road has. Giving the far road the near road's share makes them one.
- **A low winter sun leaves a darker band on the verge's slope** beside a road. Seen, and no fix worked out.
- **The scripted driver slides wide on packed snow.** On studded tyres it left the road through the Getavägen fork at 32 km/h, and holds a straight road at 43. A tool that drives in winter needs a speed for the condition, as the racers' speed plan works one out.
- **Whether main roads should be ploughed to the tarmac** is `ideas/road-feel.md`: as built, a winter road is packed snow nearly all winter.

## The racers read a road as one surface

A road is asphalt or gravel stretch by stretch, as its own OSM way says, and a point of paving carries which (`art/surfaces/road-attributes.ts`). The look and the tyre's grip read it there. The racers' road as laid (`sim/road-net.ts`) still takes one surface for a whole chain, so on a road that turns to gravel half way the speed plan is wrong for one half. It should read the surface along the road as it reads the heights.

## What the junctions cost

Godby's tile is 252,000 triangles of paving as published and 359,000 rebuilt, and the three town tiles' road files grow from 16.9 to 22.2 MB together. It comes from the mouths' arcs, the wedges and the painted lines' own cells; which costs most was not counted. Nothing was done to bring it down, and no frame's cost was measured against it (`tools/frame-cost.mjs` on the rebuilt town tiles would say). If it shows: an edge line's cells only where a line is painted, and an arc's steps by its radius.

## The junction check leaves the paving more often

On Godby's tile the car's middle is off the paving for over 3 m on 425 ways through a junction, where it was 384. I put that down to a road being its real width, with land beside it where there was a shelf, and did not check it way by way. Comparing the two builds' records would say which ways are new, and whether any is a mouth built worse.

## The tools

- **`tools/look.mjs` stands a camera at a height above whatever ground is loaded when it is asked.** The first look at a far place can be metres off; asking for the same look twice in one run gives the right one. It should wait for the ground at the camera's place to land before standing it.
- **`tools/film.mjs` takes the page's clock over part way through.** Under the climate's own weather the air then reads nonsense. `tools/film-drive.mjs` runs the page on the tool's clock from before it loads, and the older tool wants the same.
