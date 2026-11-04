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

What each attempt did, judged by the owner on screenshots from the same cameras:

- **Tracks and paths take aprons at their ends**, as roads do, instead of sliding over the greater road's shoulder. The counts fell 20–40% for gaps, steps and plates; the pictures barely changed, and the seam flicker now runs along track ends too.
- **Ground pressed under a way only as far as that way needs**, instead of every 4 m cell it touches being flattened to its level, which dragged the ground out from under a higher way beside it. It fixed a floating path and cut ledges by about 70%; the pale slabs between paths got slightly bigger.
- **The ground at the survey's full 2 m** instead of 4 m. It removed one stretched wall of ground and changed little else, broke the trees' detail distances (they read the ground rings), and would triple the heights' size. Dropped.
- **Holding a way's height near a greater way beside it** changed nothing visible: the heights weren't the problem there, the ground under them was. Dropped.

## Directions not yet tried

- **Roads and ground as one surface:** the ground cut along each way's outer edge, so its points meet the way exactly, with no shoulder strip or pressing between them. The standard approach in road games, and the largest change: the game reads the ground as a regular grid in its drawing, the car's contact, the water line, the granite and the trees.
- **Ways side by side as one surface:** a sidewalk along a street as part of one paved cross-section, not a second road over the first.
- **Underpasses:** a tunnel-tagged way dipped under what it crosses, with the ground left alone above it.
