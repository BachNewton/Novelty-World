# Golf courses

An idea, not a plan: nothing is decided or scheduled, and no phase depends on it.

The owner has a friend who loves exploring golf courses when they turn up in racing games. Åland's real courses could get extra attention so that finding one and driving round it is a small pleasure of its own. What that attention is, and how far it goes, is open.

## The courses

| Club | Course | Holes |
|---|---|---|
| Ålands Golfklubb, Kastelholm | Slottsbanan | 18 |
| Ålands Golfklubb, Kastelholm | Kungsbanan | 18 |
| Ålands Golfklubb, Kastelholm | Prinsessan (short course) | 6 |
| Eckerö Golf | Eckerö | 18 |

That's 4 courses and 60 holes at 2 clubs, taken from tourism and golf-guide pages rather than the clubs' own sites.

## The data

OpenStreetMap maps the courses feature by feature, under the ODbL the game's road files already carry. A live Overpass query over Åland (south-west corner 59.7 N, 19.2 E; north-east corner 60.6 N, 21.2 E) returned:

| `golf=*` | Count |
|---|---|
| `hole` | 54 |
| `pin` | 54 |
| `green` | 54 |
| `fairway` | 60 |
| `tee` | 108 |
| `bunker` | 164 |
| `water_hazard` | 16 |
| `rough` | 5 |
| `driving_range` | 2 |
| `clubhouse` | 1 |

Holes carry a number and a par. No official course geometry turned up, so OSM is the source to use.

The gaps:

- 54 holes suggests the three 18-hole courses are mapped and Prinsessan isn't. Neither is confirmed.
- The 9 `leisure=golf_course` areas are unnamed pieces at Eckerö, and Kastelholm has no course outline at all, so holes have to be grouped by where they are, not by course name.
- Only hole 1 of Kungsbanan (`KB Hål 1`) and the Kastelholm clubhouse are named.

## What the game has now

The courses are there as the land's colour in the aerial photos, with the ground and trees the elevation model and laser give them, but nothing knows they're golf. `art/town-ground/bake_surface.py` counts `golf_course` as green land for the town ground, and that's the only reference. The pipeline doesn't draw OSM's golf features.

## Open questions

- What makes a course worth finding: mown fairways and greens, sand in the bunkers, flags, tee markers, a clubhouse, or something to do there?
- Can the car drive on a course, and does it mark the grass?
- Does a course show on the maps or get a showcase spot?
- Is Prinsessan worth mapping or placing by hand?
