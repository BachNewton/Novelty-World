# The way builder

A design, not yet built. It replaces the editor's face brush: steps, ramps and bridges stop being decorations of a cliff's edge and become what a way is made of where it changes height, as paths are built in RollerCoaster Tycoon 2. Raise and lower stay for shaping the land into levels; getting between the levels is a way the owner draws.

## The problem it solves

Flat ground is easy to make: paint its kind, raise and lower it. Moving between two heights is not: today a climb is a face set on a raised cell (steps, a ramp), chosen by a brush that cycles through faces, with no say in where the climb starts, which way it runs or what it is built of. RCT2 shows the other way: the player draws the route a tile at a time, saying up, level or down, and the game lays the piece that does that and joins it to the last.

## Ways are a 3D path, made of pieces with sockets

The hard part is knowing which pieces join which, in three dimensions, for every kit, including ones not yet added. The builder never knows a piece by its name. Each piece's **sockets** are measured from its geometry, the way its collision stand-in is:

- A way piece fills one or more cells. On each side of each cell it fills, where a player can walk across that side, its socket is the height of its walking surface at that side's middle (and how wide the walkable stretch is). A side nothing can be walked across has no socket.
- Two pieces join across a side when their sockets there are at the same height. That is the whole rule. A flight of stairs is a piece with a socket low on one side and high on the opposite one; a landing has all four sockets at one height; a bridge's span has sockets at each end, over a cell whose ground is lower.
- The land has sockets too: flat ground offers one on every side at its height. So a way joins the land wherever their heights meet, and a climb is any chain of way pieces from one height to another.

The catalogue of every piece's sockets is built by a tool from the kits' files, like `town-variants.ts`, and checked: a piece meant to be walked whose sockets come out wrong (a flight that can't be got onto, a gap between steps) is listed for a look. A new pack is measured, not described.

## Seeing that the sockets are right

The owner sees the socket system work before anything is built on it, in a debug view of its own:

- **Every piece's sockets on the bench.** The piece bench (`?view=pieces`) marks each socket on its piece: a disc at the side's middle at the socket's height, its width drawn along the side, and its height as a label. A walkable side with no socket, or a socket floating off the walking surface, shows at a glance.
- **Every join, built.** For a piece chosen on the bench, a row of it joined to each piece its sockets say fits it, on each side, laid as the builder would lay them: a flight met by each landing and each flight that fits its top and its foot, from both kits. Each join is drawn as the pieces really meet, so a step in the walking surface, a gap or an overlap where two pieces join is seen, not computed. A join the sockets allow and the eye rejects is the evidence that the measuring is wrong.
- **Where no piece fits**, the builder says so rather than laying something wrong. A cell whose sockets ask for a piece no kit has (a flight turning a corner as it climbs, say) is drawn crossed out, with the sockets it needs shown on its sides, so the gap in the kits is seen for what it is, never mistaken for the builder joining badly. The path painter does the same today for shapes the Nature Kit has no tile for.
- **In the world, the ~ overlay** draws the sockets of the way cells round the player, green where they join a neighbour and red where a side's socket meets nothing at its height.

The player can walk the joins on the bench, too: what the sockets say is walkable is what the collision stand-ins hold up.

## Several valid pieces: V, as on the paths

Where more than one piece fits a cell's sockets (stone stairs, timber stairs, the Nature Kit's cliff steps, a road slope; a plain landing or one with a rail), the builder lays the plain one, and V on the cell gives the next that fits, as it does for the path tiles today. A cell remembers what it was given while its sockets still allow it. The eyedropper picks up a way piece as its style, and the builder carries on in it: pick up timber stairs and the next climb is timber. So the rule for which piece is valid is mechanical (the sockets match), and which of the valid ones is used is the owner's choice, with a plain default.

## Drawing a way

- **Drag a route** from a cell, as the ground is painted. On land it follows the land; where the land steps up or down, it climbs by the shortest chain the style's pieces make (a flight, a landing, a turn), and shows it see-through before the button is let go.
- **Up, level, down while drawing** (keys, as RCT's buttons) build a way off the land: a raised walk the builder props on supports (the kit's posts or blocks), or a cut into a rise.
- **Over water or a drop** the route becomes a bridge where the style has one.
- **Undo** takes the whole stroke back, as with the ground's.

## In the map's file

A way is cells, each with the piece it is (or a plain default) and its height, like the ground's chosen tiles; the faces list loses steps and ramps. Caves and cut corners stay as decorations of a cliff, set as today.

## Every family of joining pieces

The kits hold more families than the ground's dirt and water that join by their neighbours, and today each is placed by hand, piece by piece:

- **Ways laid flat:** the Nature Kit's plank path (`path_wood`, its corner and end) and stone path (`path_stone`, corner, end, a round one), and the town kit's paving (`road`, its edges, curbs, corners, bend and slopes).
- **Lines along the cells' edges:** the town's fences and hedges, small and large, with their curves, gates and broken stretches, and the Nature Kit's fences.

Sockets cover them all, so they are one tool, not one each. A flat way is a style of way: drawn as dirt is, its tiles chosen by the sockets its neighbours offer, V among the ones that fit, the eyedropper taking up its style, and a shape no piece fits crossed out. A fence or hedge is the same idea along the edges between cells instead of across them: a socket at each end of a piece, where the next joins, drawn as a line, with its corners and curves chosen by where the line turns, and a gate or a gap where the owner asks for one. The dirt and water painter becomes the first style of the same tool.

## A first slice

Ways on the land only: drag a route, climbs laid where the land changes height, V among the pieces that fit, the eyedropper's style. Raised walks with supports, bridges and cuts come after, on the same sockets.

## To settle

- How a socket's width counts: a narrow footbridge joining a broad street.
- Whether a way is a layer of its own beside the ground's (as in RCT) or a kind of ground.
- What the editor shows while drawing: the see-through route, the height of the cell under the pointer, the sockets on offer.
