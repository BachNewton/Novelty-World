# Placing pieces off the grid

An open problem, not a plan: nothing here is decided. It wants a session of its own.

## The problem

The owner's rule: whatever the grid world's demo shows, the owner should be able to make themselves with the map editor. And the editor should stay simple: too fine a control stops helping, and simplicity encourages creativity.

Today those disagree. The editor places a piece on a whole cell and moves it by whole cells (keeping any offset it already has), but the demo stands about two fifths of its pieces off whole cells: 1,188 of 3,006 when last counted. They fall into three kinds:

- **Offsets the kit's pieces need** (about 470, in the village). A wall fills the outer tenth of its cell, so the builder draws each one 0.1 into its footprint to stand flush with the edge, under the roof's eaves (about 445 walls). Posts and pillars stand on a footprint's corners, between cells. Banners hang a hair out from their wall, canopies and chimneys line up with theirs. Pieces two cells across (the garden's square fountain, the paddock's trough) are centred on a shared corner; the mill wheels and the windmill's sails sit on their axles. A few were nudged by hand (the smithy's cart, the town wall's rubble).
- **Scattered decoration** (about 700, in the country, and the nine plants by the village's doors). Trees in the woods and hedgerows, flowers, grass, bushes and mushrooms, crops between cell lines, camp things, reeds and lilies, cacti and pebbles, moss hanging off the cliff faces, and the ring of standing stones. About 575 of these stand at arbitrary places, not on any regular step.
- **The rest** are on whole cells.

So the editor can't rebuild a building's walls, and can't rebuild the countryside's scatter.

## A direction to weigh

Make the demo simpler rather than the editor finer:

- **Each kind of piece carries its kit's offset.** A wall placed by the editor snaps flush to its cell's edge by itself; a pillar to its corner; a banner to its wall; a two-cell piece to its shared corner; a wheel to its axle. The owner still places by whole cells, and the offsets come from the piece. `buildings.ts` already knows these rules; they would move to where the editor can use them too.
- **Decoration on quarter cells.** The demo's scattered pieces snap to the nearest quarter cell (moving at most an eighth of a cell, which won't show), and the editor offers whole cells, and quarter cells with a modifier, and nothing finer.
- Then two step sizes, no free movement, and everything in the demo can be made by hand.

## To settle

- Whether quarter cells are fine enough for the scatter to still look natural, and for the ring of stones (which would become roughly round).
- How a piece's own offset is described: per piece in the kit's list, or derived from its shape as `buildings.ts` does.
- Whether moss on cliff faces and similar pieces placed against another piece need an offset of their own.
- Whether the rule "the demo holds only what the editor can make" is enforced by a test once it holds, and how the builder (`building()`, `winged()`) and the editor stay in agreement.

Tried and set aside: Shift for twentieth-cell steps and Ctrl for free movement on the editor's arrows. It made everything reachable, but at the cost of the simplicity the owner wants.
