# Junctions: what's left

The junction work still to do, after the surface described in `pipeline/CLAUDE.md` ("The road surface"). All of it needs a tile rebuild and a new `TILES_VERSION`, and it was left out of the rebuild shared with the forest stands so that the forest wouldn't wait. A rebuild, a publish and landing on main are each the owner's call. Junction work is judged by the owner in `?junction-lab`, and seams must pass.

## Paint

Aprons are bare road. Paint is procedural, with lines drawn from each apron's own shape:

- Edge lines follow the outline.
- Give-way lines cross each road's mouth.
- Small driveway aprons stay plain.

`junctionMarks` in `art/surfaces` came from separate work on road dressing. Check how far it has got before starting, as it may cover part of this.

## Islands

The apron's closing step paves some real splitter islands and leaves slivers. OSM's road lines say where the road really runs, so a real island should stay land and a sliver should go.

## Open faults

Places are in the scene's east and north-negative coordinates, as `render/junction-spots.ts` uses them.

- **Speckle** at the Nya Godbyvägen merge (2280, -7525): not explained and not yet looked at by eye. Terrain is ruled out. Shoulders lying within 1–3 cm of the apron were the suspect, but dropping them barely changed the measure, and what's left looks like a thin band at the ribbon's edge.
- **Steep aprons:** 25 on L2334F are over 25%, none explained one by one.
- **Worst jolts:** 5.58 g at (-1294, 8737) and 5.34 g at (-2392, 6455) on L2334E, and 3.68 g at (12521, -5607) on L3121C, which was 2.66 g on the old surface. The car was off the carriageway for 7–18 m at each, so they may be the driver's rather than the road's.
- **A respawn** at (3515, -8349) on L2343H.
- **Movements that got worse:** 16 on L2334F fail on the new surface and passed on the old.
- **Roundabouts:** 14 of 246 movements fail, on both surfaces, all on L2334F. (-2525, 4891) is the driver running wide at sharp exits. (-3571, 3548) and (-2321, 4783) aren't traced.
- **Loops in the map:** `road_map` no longer collapses closed-loop roads, but `map.json.gz` needs rebuilding for that to show.

## The junction check

`tools/junction-check.ts` is a diagnostic to run by hand on a few spots, not a gate. Its jolt readings led to real faults, and it showed that the first aprons were worse than the old surface on L2334F. Its pass/fail count says little: across eight tiles, 553 of 23,478 movements failed on the old surface and 564 on the new, and 365 of those are turns of 100° or more that fail on both. It has never been tried against a planted fault. A whole tile costs up to about 40 minutes.
