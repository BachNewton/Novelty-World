# Roads: ideas weighed and not taken up

Ideas for the roads that came up while they were given their real width, their verge and their winter (`pipeline/CLAUDE.md`, `docs/ROAD-SURFACES.md`, `docs/TIME-AND-WEATHER.md`). None is decided and none is built. Each says what it would take.

## Grass up to the road's edge

The verge's grass and flowers start about two and a half metres from a road's strip and thicken over the next couple, so the first metres beside every road are bare ground in the photo's colour. That is how finely the verge can tell where a road is: it reads the surface mask, 4 m to a pixel, and keeps off anything that might be carriageway (`render/verge.ts`). Raising what it tolerates would bring the grass in on a wide road and put tufts on a track, which is narrower than a pixel.

The walls already have the answer: an image following the camera of each place's distance to the nearest wall, 0.6 m to a texel, which every planting reads (`render/wall-clearing.ts`). A road's edges are lines too, so the same image, or one like it, could hold the distance to the nearest paving, and the verge would grow to a tuft's width from the strip on any road. It costs one more set of lines for each loaded tile and nothing a frame.

## Small roads that roll more

A road's height is smoothed along its length by its class, the shortest wave it keeps being 120 m on a small road and 280 m on a main one (`pipeline/CLAUDE.md`, Height). That leaves the small roads very level to drive. Measured on two country tiles, the up-and-down a car feels at a speed for the class:

| Class, speed | Half the road is under | A tenth is over | A hundredth is over |
|---|---|---|---|
| Primary, 100 km/h | 0.002 g | 0.008 g | 0.015 g |
| Tertiary, 80 km/h | 0.006 to 0.011 g | 0.02 to 0.04 g | 0.05 to 0.08 g |
| Unclassified, 72 km/h | 0.010 g | 0.04 g | 0.10 g |
| Track, 36 km/h | 0.005 g | 0.02 g | 0.07 g |

A crest that makes a car go light is about half a g, and a rolling gravel road gives a few tenths again and again. Here nine tenths of a small road gives under 0.04 g. Åland's small roads run over granite and do roll.

Keeping shorter waves on the small roads, 60 to 80 m in place of 120, would let the land's own rises through: for the same land, a wave half as long is four times the lift at the same speed. A main road is an engineered road and would stay as it is.

It wasn't done with the rest because it is a matter of feel that only driving settles, and because the smoothing is also what keeps a road off the survey's noise (a ditch or a bank caught in a 2 m sample). So it wants trying a class at a time on a tile built beside the published ones, with `tools/road-check.ts` on both for the jolts and wheel drops, and the owner driving it. The racers' speed plan already slows for a crest by the road's own heights.

## Main roads cleared to the surface

A winter road is packed snow on every class, as Åland keeps them (`docs/TIME-AND-WEATHER.md`, Decided). The other reading is that the main roads are ploughed to the tarmac a few hours after a fall and only the rest stay white, so a car on summer tyres can still use roads 1 to 4 on a clear day: a map of where it is safe to go without winter tyres.

The ground's condition is one for every surface, set by the weather, and the racers plan a whole route in it. Keeping it by class of road needs each wheel to read how its road is kept, which the simulation can do as it does for sea ice, and the racers' speed plan to read a condition for each stretch of its route as it reads the surface now.

## Grit where it's needed

Åland grits its hills, junctions and bends first, and a whole road only when it is severe. A winter road with more grip into a junction and through a bend would be true, and would help exactly where a slide costs most. It needs the same reading by place as the idea above, from the road's own shape: its grade, its bends and its junctions.

## Traffic that minds the road

The cars on the lanes keep their speeds whatever the road is under. On packed snow and ice they would drive slower and leave more room, which a player overtaking them would feel as winter.
