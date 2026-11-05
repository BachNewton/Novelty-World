# Road surfaces: what makes them look broken

Why Åland Drive's roads, tracks, paths and their junctions look janky, as the owner put it after walking through many examples, and what has been learned about each cause. The town's own ground (`art/town-ground`) waits on this: paving drawn up to these edges only shows them more.

## The problem, in the owner's words

> Three issues at its core:
>
> 1. "ways" that are close together, junction, merge, end abruptly, or overlap.
> 2. "ways" that are layered on top of each other, like an under or overpass.
> 3. "ways" that are placed on terrain / elevation data that is not cleanly flat or changes quickly near a road.
>
> If we can figure out how to make all these cases look good we can have a good looking road network.

## The same three, as the pipeline sees them

Every OSM way is laid on its own (`pipeline/roads.py`): its own centre line, its own height profile smoothed over tens of metres, its own crown, painted edges and a pale shoulder strip out to the ground. The ground is a separate 4 m mesh under all of them, cut and filled to fit. Everything that looks broken is a place where these separately made pieces have to meet.

1. **Ways close to each other.** Nothing lays two ways together. Where a sidewalk runs beside a street, both are full roads at almost the same height, overlapping: their paint and shoulders poke through each other as white flecks and pale smears, and the renderer can't tell which is on top. Where they're at different heights, the strip between them is squeezed into a wall. Junctions are joined after the fact by aprons, paving stretched between the pieces; the gap between an apron and a ribbon is tucked a centimetre under it and still flickers along the seam. Every small piece of paving gets its own pale shoulder, so an island between paths becomes a patchwork of slabs. A track or path ending on a road used to lie over that road's sloping shoulder as a raised slab.
2. **Ways stacked on each other.** The pipeline has no idea of an underpass. A way OSM marks as a tunnel, such as a cycle path under a road, is laid at its own ground level through whatever is above it, and the ground is dug down to it under the road. Bridges are handled (spans held up over what they cross); the way going under is not.
3. **Ways on uneven ground.** The survey's ground is nearly raw, banks, ditches and kerbs included, averaged only over 2 m, while every way's profile is smoothed over 30 m (a path) to 280 m (a main road). On a bank the smooth way and the raw land beside it can be a metre apart within a few metres, and the 4 m mesh can't bend that sharply. The pieces between (the land levelled round each way, the shoulder's drop capped at 1 m, the ground pressed under each carriageway) fight there: floating paths, carved pits, stretched walls of ground.

The three meet: a sidewalk beside a street on a bank is all of them at once.

## What has been measured

`pipeline/surface_audit.py` finds where drawn surfaces meet badly, read from the triangles the game draws: gaps between carriageways, steps, a lesser way on top of a greater, two surfaces too close to tell apart (flicker), a shoulder lying over another carriageway (plate), ground over a road, a road's outline standing above the ground (ledge), and folds in a profile. Each place gets an `?at=` link.

`pipeline/paving_audit.py` does the same for a paved tile, by cause: strips of ground under 1.5 m wide between pieces of paving (by the ways either side and whether the ground there is a ridge, a bank or flat), steep paving, steps where cut ground and paving disagree, a path's edge drawn as a street's or a driveway's, and streets whose OSM way maps a sidewalk on itself with none drawn beside it. Each place gets an `?at=` link and `tools/look.mjs` arguments.

What each attempt did, judged by the owner on screenshots from the same cameras:

- **Tracks and paths take aprons at their ends**, as roads do, instead of sliding over the greater road's shoulder. The counts fell 20–40% for gaps, steps and plates; the pictures barely changed, and the seam flicker now runs along track ends too.
- **Ground pressed under a way only as far as that way needs**, instead of every 4 m cell it touches being flattened to its level, which dragged the ground out from under a higher way beside it. It fixed a floating path and cut ledges by about 70%; the pale slabs between paths got slightly bigger.
- **The ground at the survey's full 2 m** instead of 4 m. It removed one stretched wall of ground and changed little else, broke the trees' detail distances (they read the ground rings), and would triple the heights' size. Dropped.
- **The ground smoothed near the ways** (fully within 12 m, back to the survey by 40 m) before any way is laid, so a way and the land beside it start out agreeing. On top of the gentler pressing: a bank's stretched wall became one smooth slope, the pale slabs between paths shrank and an underpass's banks smoothed; ledges fell a further 8–16% and folds about 10%. The ways themselves (slabs, shoulders, overlaps) are unchanged.
- **Holding a way's height near a greater way beside it** changed nothing visible: the heights weren't the problem there, the ground under them was. Dropped.

## Why the attempts stay small

Every attempt above is a layer over the one before: aprons hide the gaps between ribbons, a centimetre's tuck hides the apron's fight with the ribbon, shoulders hide the drop to the ground, a cap hides the shoulder's worst drops, skipped shoulders hide the slabs, levelling, pressing and smoothing each hide some of the ground's disagreement with the ways, and the audit carries exemptions for the system's own pieces. Each layer answers a seam the last one made, so each helps less and costs more. The seams come from one choice: the ways, the joins between them and the ground are made separately and reconciled afterwards. The design below makes them together, so the seams aren't there to hide.

## The design: paving first, then its heights, then the ground round it

On trial on the two Mariehamn tiles (`pipeline/paving.py`, `build.py --paving`), with the game drawing either kind of tile. The owner judged the second trial the biggest improvement yet; "What the trial taught" below holds the rules it added.

### 1. Where paving is, in plan

Each way's footprint (its centre line, widened by its class's width, and for a motor road by its shoulder, where the kerb and paving or the stone edge is drawn) is merged with every other's into **one paved shape per level**. A junction, a merge, a way ending on another, a sidewalk along its street and a paved area are all just parts of the shape, with nothing left to join: issue 1 has no seams to make.

**One shape is not one look.** The shape is cut along every way's own outline and carriageway, and each piece belongs to the greatest way whose carriageway holds it, or failing that the greatest whose shoulder does, so a sidewalk beside its street stays the sidewalk's to the street's edge, with the sidewalk's surface and the street's paint ending on one clean line, and a side road keeps its own surface through the main road's shoulder. A piece no way's outline holds (a junction's rounded corner, a narrow gap closed between two ways) is drawn as the shoulders round it.

**Ways join only where their surfaces agree.** A gap is closed and a corner rounded only where the ways either side stand within 0.4 m of each other all across it, and two ways whose outlines touch but stand a metre or more apart along most of where they touch stay apart: the lesser stands back from the greater, and the land between them is a bank. Joined anyway, the lower way is dragged up the bank, or the paving between them is a cliff.

**Levels** answer issue 2. Every way is on the ground's level except across a **crossing span**: where a way tagged bridge passes over another, the span is on the level above; where a way tagged tunnel passes under another, the span is on the level below. Off its span the same way is on the ground level, so a bridge's approaches are embankments and an underpass's are cuttings, laid like any other way. Two ways crossing untagged, both on the ground, are a junction, as OSM means them. Åland has no stacked interchanges, so three levels (below, ground, above) are enough; a fourth is an error the build stops on.

The shape is clipped to the tile, and its edge on the tile's edge is cut at points both tiles derive the same way, so a tile's edge stays nothing to the paving.

### 2. The paving's heights, in one pass

Each way keeps the profile it has now: smoothed along its length by its class's wavelength, pinned to a greater way where it joins one, held over its bridge spans. That part is sound and stays. The new part is how the paving between centre lines gets its height.

Each way's own cross-section (its centre's height, its crown, its camber) gives a height anywhere near it. The paving's heights come from **one least-squares solve**: each point leans towards its own way's cross-section, as stiffly as that way's rank (a main road hardly bends, a path bends over several metres), and each edge between two points keeps the difference the greater of their two ways has between them. Inside one way's own piece that is only its own cross-section, crown and all; where two ways' surfaces disagree, at a junction, a merge or a sidewalk beside its street, the lesser bends smoothly to meet the greater, and a piece no way owns hangs between its neighbours. Paving's height is then one continuous surface by construction, with no step for anything to cover. A kerb, if wanted later, is a deliberate offset in that solve, not an accident of two overlapping roads.

A span on another level takes only its own way's cross-section and is never blended with the level it crosses. An underpass's own profile is dipped, smoothly as its class bends, to keep a clearance under the deck above it, and walls rise from its edges to under the deck where it runs beneath, with the deck's edge drawn down over it.

### 3. The ground, built round the paving

The ground keeps its 4 m grid everywhere a way doesn't come near. Each grid cell that paving touches, and a margin round it, is a **cut cell**: there the drawn ground isn't the grid's two triangles but a triangulation between the cell's own four corners and the paving's edge. Its outer points are the grid's own nodes, so it meets the grid exactly; its inner points are the paving's edge points, so it meets the paving exactly. The paving's own triangles fill the rest. Ground and road share their points; there's nothing between them.

Next to the paving the land follows one rule, the one real roads are built to: **an embankment or a cutting at a slope limit**. From each point of the paving's edge the land may rise or fall away no faster than the limit, so the survey's height is clamped between the edge's height plus and minus distance times the slope; past where the clamp stops biting, it is the survey. A road on a bank gets a cutting on the uphill side and an embankment downhill, a road in a dip gets its banks, and the land between two ways at different heights is a slope from one edge to the other. This replaces levelling, pressing and the smoothing near ways (issue 3).

The cut cells' grid nodes take their height from the same rule, so everything that reads the grid (below) sees the land as it's drawn, to within a cell's bending.

### What the game reads

The rest of the game reads the ground as the regular grid, and keeps doing so:

- **Drawing.** The clipmap's innermost ring skips its cut cells, and each tile's cut-cell triangles are drawn with its paving. Farther out the ring folds onto coarser grids and the cut no longer lines up, so beyond the innermost ring's exact zone the cut cells are drawn as plain grid again, under paving drawn over it, as all ground is today. Whether that change shows as the camera moves is the first thing the trial checks.
- **The car.** Collision blocks drop their cut cells' grid triangles and take the cut cells' and the paving's triangles instead: the car still touches what's drawn.
- **Trees, granite, verge, reeds, shrubs, the water's line, the cameras.** These read the grid's heights. In cut cells the grid follows the embankment rule, so it is near the drawn ground; the trial measures how near, at the paving's edge, where the verge and the reeds grow.
- **Road paint.** Paving vertices carry the across, along and class of the way whose footprint they lie in, as ribbons do now, so the road's shader draws the same paint. Junction paving, inside more than one way's footprint, carries no paint, as aprons don't now; junction paint (`JUNCTIONS.md`) is drawn from the paving's outline later. The fade from road to the ground's colour, which the shoulder carries now, moves to the cut cells' ground next to the paving's edge, which is ground and so takes the ground's colour anyway.
- **Chains.** The ways' centre lines stay in the tile as they are, for whatever drives on them.

### What goes away

Ribbons as separate meshes, aprons and their tuck, shoulders and their cap and skips, the gap fillers, the paved-area pieces (a paved area is part of the shape), levelling, pressing, the smoothing near ways, and the audit's exemptions. The audit's kinds mostly vanish with them: gaps, lips, through, flicker and plates can't happen on one shape with one height per point. What's left to measure is the surface's own folds (a kink in a blend, an embankment too steep for its limit) and where the drawn ground and the grid other things read come apart.

### What the trial taught

- **A road's edge carries its look.** Without shoulders the kerbs and sidewalk paving went, so a motor road's paving includes its shoulder; a path has none, since its shoulder made the old pale slabs.
- **The game keeps every triangle of paving.** Its rule dropping "cliffs" (a steep triangle rising over 1.2 m) was for ribbons diving through each other, which one surface can't; on paving it cut thin triangles out of steep paths and left holes.
- **Cut ground meets two heights at an underpass's portal.** Each corner of cut ground takes the height of the paving its own triangle borders, and an upright face closes any gap left along an edge, between two triangles of cut ground or between cut ground and paving. An underpass's walls are concrete, as the bridges are.
- **An underpass in the open is a way like any other** to the banks and cuttings beside it; left out, the ground was stretched from its floor up to the raw land.
- **A deck has no verge.** Where a road passes over an underpass, its paving stops at its carriageway's edge; with its shoulder the opening was a long dark box.
- **A path's look comes from its own way's tags, with no town image.** Each point of paving carries its OSM way's class, by the town bake's rules (`pipeline/path_surfaces.py`), and that way's direction, so a sidewalk is slabs, a footway or cycleway pale walked tarmac, a park path gravel and steps treads, laid along the way. The direction is one snapped value per OSM way: slabs are laid in world metres, so a direction that changed by a hair across a triangle turned the lattice into arcs.
- **A gap is judged a few metres at a time.** Judged whole, a strip running a hundred metres between a street and its path was left as ground wherever the two ways disagreed at any one place on it, or wherever a third way touching its far end did. Cut on a 4 m lattice, each piece judged by the ways either side that reach it, the strips of ground under 1.5 m wide on the two Mariehamn tiles fell from 421 places and 8,400 m² to 232 and 1,400 m². The look barely changed: a piece between ways is drawn as a shoulder, which fades to the photo's colour, so the pale band stays a band of paving, not of ground.
- **Between a street and its sidewalk is the sidewalk.** A street's shoulder beside a sidewalk is a kerb's strip, and the rest of it out to the sidewalk, with the strip paved between them, wears the sidewalk's own surface: drawn as shoulders, both faded to the photo's colour, the pale band. Each such piece wears one path's surface whole, the nearest running alongside the street, or its triangles blend two classes and two slab lattices. A sidewalk (a path beside a street, or one tagged so) also carries on across a driveway that crosses it, as real ones do; a street crossing one keeps its crossing, and a path out in the country is crossed by the drive.
- **The photo confirmed the geometry rather than improving it.** Closing gaps narrower than 3 m and a fixed shoulder per class looked like guesses, so a trial read the aerial photo at its full 0.5 m for where the ground is really hard: gaps paved only where the photo shows them hard, and each road's edge as wide as its hard ground. The owner saw almost no difference, and the narrower edges lost kerb paving the owner liked, so it was dropped. No open source measures Åland's street widths either: Digiroad's are the NLS road classes turned into constants, and the NLS class files most town streets as 4–5 m by rule.

### Trying it

On the two Mariehamn tiles, L2334E and L2334F, which hold most of the owner's examples and one underpass, built beside the current build rather than over it, and judged on the same cameras:

1. **The pipeline alone.** The paved shape, its levels, the blended heights and the embankment rule, written as tile data with the cut cells, with tests for what's easy to break: a point of paving has one height per level, the paving and the cut cells share their edge points, and two tiles agree along their edge.
2. **The game.** The clipmap skips cut cells and draws their triangles; the collision blocks follow; the road shader draws the paving.
3. **The owner's views,** before and after, and the far-ring change checked while driving.

Only if the trial reads clean on all three does the old system get deleted and the island rebuilt. If step 1 shows a flaw in the design, the design is fixed here before step 2.

### Risks

- **The far rings.** Cut cells that turn back into plain grid at a distance might show as a change while driving. The fallback is a wider exact zone for the innermost ring.
- **Tile edges.** Paving cut at a tile's edge must be cut identically from both sides, from data both tiles see; a cut that differs shows as a crack.
- **Paving over water.** A causeway's embankments run into the water, which is drawn on the grid's triangles, not the cut cells'. The shore there may need the cut cells' own water line.
- **Odd OSM.** A footprint merged from bad data (a way drawn twice, a sliver between two lines) becomes odd paving. Today's layers hide some of it by accident; the new system shows it, and each case is fixed in how the shape is made.
