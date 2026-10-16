import * as THREE from "three";
import { candelabra, candle, chair, pictureFrame, rug, table } from "../kit";
import { RAMPS } from "../palette";
import { onWall, type RoomDefinition } from "../room";
import { fire } from "../kit/flame";
import { box, flat, glow, group, textured } from "../shapes";
import { shiny, SHINES } from "../shine";
import { flagstones, panelling, wallpaper, woodPlanks } from "../textures";


/** A stone hearth with a smouldering fire and a mantel, backed against a wall.
 *  Room-specific props like this live in the room's own file. */
function fireplace(): THREE.Group {
  const stone = textured(flagstones({ stonePx: 8, size: 32, seed: "hearth" }));
  const soot = flat("void");
  const mantel = shiny(flat("woodDark"), SHINES.polishedWood);
  const result = group(
    box([0.3, 1.15, 0.4], stone, [-0.65, 0, 0.2]),
    box([0.3, 1.15, 0.4], stone, [0.65, 0, 0.2]),
    // The lintel spans between the jambs, and the hearth stands a little wider than them, so no faces meet in one plane.
    box([1.0, 0.3, 0.4], stone, [0, 0.85, 0.2]),
    // The firebox is hollow, lined with soot on its back, sides and roof, so the fire burns inside it.
    box([1.0, 0.85, 0.06], soot, [0, 0, 0.03]),
    box([0.03, 0.85, 0.34], soot, [-0.485, 0, 0.2]),
    box([0.03, 0.85, 0.34], soot, [0.485, 0, 0.2]),
    box([0.94, 0.03, 0.34], soot, [0, 0.82, 0.2]),
    box([1.8, 0.08, 0.5], mantel, [0, 1.15, 0.25]),
    box([1.64, 0.04, 0.55], stone, [0, 0, 0.3]),
  );
  const log = flat("wood");
  // The second log rests a little higher, across the first, so their tops never meet in one plane.
  for (const [x, y, turn] of [[-0.15, 0.05, 0.3], [0.15, 0.07, -0.25]]) {
    const piece = box([0.55, 0.1, 0.1], log, [0, 0, 0]);
    piece.position.set(x, y, 0.25);
    piece.rotation.y = turn;
    result.add(piece);
  }
  const flames = fire({ width: 0.5, depth: 0.18, height: 0.42, signal: FIRE_SIGNAL });
  flames.position.set(0, 0.1, 0.24);
  result.add(flames);
  result.add(box([0.5, 0.05, 0.18], glow("ember"), [0, 0.04, 0.23]));
  for (const x of [-0.6, 0.6]) {
    const taper = candle({ height: 0.24, light: false });
    taper.position.set(x, 1.23, 0.3);
    result.add(taper);
  }
  return result;
}

/** The signal the hearth's fire and its light waver with. */
const FIRE_SIGNAL = 2;

/** The demo room and the reference for every room module: one definition,
 *  the kit's pieces, and its own props defined locally. */
export const DRAWING_ROOM: RoomDefinition = {
  id: "drawing-room",
  floor: () => woodPlanks({ seed: "drawing-room", glints: false }),
  wall: () => wallpaper({ ground: "bruiseDark", stripe: "bruise", motif: "bruiseLight", seed: "drawing-room" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, glints: false }),
  trim: "woodDark",
  props: [
    { build: () => rug({ width: 2.6, length: 3.4 }), at: [0, 0] },
    { build: () => table({ length: 1.7, width: 0.9, runner: "bone" }), at: [0, 0] },
    { build: () => candelabra({ arms: 5 }), at: [0, 0], y: 0.76 },
    { build: () => chair(), at: [-0.45, -0.75] },
    { build: () => chair(), at: [0.45, -0.75] },
    { build: () => chair(), at: [-0.45, 0.75], turn: 180 },
    { build: () => chair(), at: [0.5, 0.8], turn: 160 },
    { build: () => chair({ cushion: null }), at: [-1.5, 0.1], turn: 95 },
    { build: fireplace, ...onWall("left", 1.6) },
    { build: () => pictureFrame({ picture: "whiskered gentleman" }), ...onWall("top", -1.7, { y: 1.35 }) },
    { build: () => pictureFrame({ picture: "stern couple", frame: "woodLight" }), ...onWall("right", 1.7, { y: 1.4 }) },
    { build: () => pictureFrame({ picture: "moon through a bare tree" }), ...onWall("bottom", 1.7, { y: 1.3 }) },
    { build: () => table({ length: 0.5, width: 0.5, height: 0.7 }), ...onWall("right", -1.9, { out: 0.3 }) },
    { build: () => candle({ height: 0.18, intensity: 1.2 }), at: [2.5, -1.9], y: 0.7 },
  ],
  lights: [{ at: [-2.3, 0.6, -1.6], colour: "ember", intensity: 5, range: 6, flicker: 0.3, signal: FIRE_SIGNAL, kind: "fire" }],
  focus: [0, 0.8, 0],
  prime: [1.3, 1.7],
  // Round the table, with a way in from each doorway: the left one's from
  // below, as the side chair and the hearth leave no room for a base above it.
  lanes: [
    [[0, -2.2], [0, -1.6], [1.55, -1.6], [1.55, 0], [1.55, 1.5], [0, 1.5], [-1.6, 1.5], [-2.2, 0.75], [-2.2, 0]],
    [[2.2, 0], [1.55, 0]],
    [[0, 2.2], [0, 1.5]],
  ],
};
