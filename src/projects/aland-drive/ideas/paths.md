# Paths that look and sit like paths

An idea, not a plan: nothing is decided or scheduled. It records what's wrong with paths today, what is known about it, and the directions open, so the work can start from here.

## What's wrong

Every OSM footway, cycleway, path and flight of steps is laid by `pipeline/roads.py` exactly as a road is: a ribbon 2 m wide with its own smoothed height profile, a crown, and a shoulder each side fading to the land, drawn with the road's asphalt by `art/surfaces/road.ts`. So in town, where OSM maps every sidewalk, park walk and staircase, they read as roads: a park crossed by footways looks like a grid of narrow streets.

Three things show:

- **The look.** A path is dark asphalt with a road's wear and patches, the same as the street beside it. Width is the only difference.
- **The heights.** Each path has a height profile of its own, smoothed along it, and where paths cross or meet they sit a little apart. Plates and small steps show at every crossing, and a path's shoulder fades to grass even where a path meets another path.
- **Steps.** `highway=steps` is a sloped ribbon, which draws a staircase as a ramp of road.

## An example

The small park beside a big car park about 350 m north of Mariehamn's bus station, in L2334E, at scene x −1845, z 6602 (ETRS 108155, 6683398). Within 30 m of it OSM has a dozen footways, three cycleways, a sidewalk, a flight of steps and two parking aisles. From above it's a lattice of dark strips. The car park beside it lies about 1.5 m below the paths, which is the land in the 2 m elevation model rather than the build, and shows as a pale bank.

## What already points the way

- **`art/town-ground`** plans the ground of town: `bake_surface.py` gives each ribbon section a class of its own (`ribbon_classes`), so a sidewalk or a park walk can be paving slabs, cobbles or gravel while a street stays tarmac. It isn't integrated yet. `docs/HANDOFF.md` lists the pipeline outputs it needs.
- **Paved gaps** (branch `claude/aland-paved-gaps`): a strip of land under 3 m wide between two laid ribbons is paved, so a sidewalk running beside its street already meets it as one surface. Whatever paths become, that rule should still join a sidewalk to its street.

## Directions open

- **A look of their own.** Paths drawn with a path's material, by class: slabs for sidewalks, a lighter surface or gravel for park walks and cycleways, never a road's asphalt. The town-ground ribbon classes are the natural carrier.
- **Lying on the land.** A path follows the ground closely, with no crown and no shoulder that rises or fades, and where paths cross they share one height rather than each keeping its own. Whether that means a path stops being a ribbon at all, and becomes ground the bake paints, is the first question to settle.
- **Steps.** Either a stair model along the line, or no surface at all, leaving the land and a mark on it.
- **Fewer paths.** Not every mapped path needs drawing. A footway on a sidewalk beside its street could be the street's own kerb and walkway, as the paved-gap rule half does already.

## What to check when it's done

The park above from a driver's eye and from above, the bus station's platforms, a sidewalk beside a busy street, and a staircase. And `tools/junction-check.ts` over a town tile, since paths that sit differently change what the car meets where a path crosses a road.
