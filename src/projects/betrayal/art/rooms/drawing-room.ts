import * as THREE from "three";
import { candelabra, candle, chair, pictureFrame, rug, table } from "../kit";
import { RAMPS } from "../palette";
import { onWall, type RoomDefinition } from "../room";
import { box, flat, glow, group, textured } from "../shapes";
import { flagstones, panelling, wallpaper, woodPlanks } from "../textures";

/** A stone hearth with a smouldering fire and a mantel, backed against a wall.
 *  Room-specific props like this live in the room's own file. */
function fireplace(): THREE.Group {
  const stone = textured(flagstones({ stonePx: 8, size: 32, seed: "hearth" }));
  const soot = flat("void");
  const mantel = flat("woodDark");
  const result = group(
    box([0.3, 1.15, 0.4], stone, [-0.65, 0, 0.2]),
    box([0.3, 1.15, 0.4], stone, [0.65, 0, 0.2]),
    box([1.6, 0.3, 0.4], stone, [0, 0.85, 0.2]),
    box([1.0, 0.85, 0.3], soot, [0, 0, 0.16]),
    box([1.8, 0.08, 0.5], mantel, [0, 1.15, 0.25]),
    box([1.6, 0.04, 0.55], stone, [0, 0, 0.3]),
  );
  const log = flat("wood");
  for (const [x, turn] of [[-0.15, 0.3], [0.15, -0.25]]) {
    const piece = box([0.55, 0.1, 0.1], log, [0, 0, 0]);
    piece.position.set(x, 0.05, 0.25);
    piece.rotation.y = turn;
    result.add(piece);
  }
  const tongues: [number, number, number, "ember" | "amber" | "flame"][] = [
    [-0.2, 0.22, 0.09, "ember"],
    [0.18, 0.2, 0.08, "ember"],
    [-0.08, 0.32, 0.08, "amber"],
    [0.08, 0.28, 0.07, "amber"],
    [0, 0.18, 0.05, "flame"],
  ];
  for (const [x, height, radius, colour] of tongues) {
    const tongue = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), glow(colour));
    tongue.position.set(x, 0.1 + height / 2, 0.24);
    tongue.userData.noShadow = true;
    result.add(tongue);
  }
  result.add(box([0.6, 0.06, 0.22], glow("ember"), [0, 0.04, 0.25]));
  for (const x of [-0.6, 0.6]) {
    const taper = candle({ height: 0.24, light: false });
    taper.position.set(x, 1.23, 0.3);
    result.add(taper);
  }
  return result;
}

/** The demo room and the reference for every room module: one definition,
 *  the kit's pieces, and its own props defined locally. */
export const DRAWING_ROOM: RoomDefinition = {
  id: "drawing-room",
  floor: () => woodPlanks({ seed: "drawing-room" }),
  wall: () => wallpaper({ ground: "bruiseDark", stripe: "bruise", motif: "bruiseLight", seed: "drawing-room" }),
  wainscot: () => panelling({ ramp: RAMPS.wood }),
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
    { build: () => pictureFrame(), ...onWall("top", -1.7, { y: 1.35 }) },
    { build: () => pictureFrame({ frame: "woodLight" }), ...onWall("right", 1.7, { y: 1.4 }) },
    { build: () => pictureFrame(), ...onWall("bottom", 1.7, { y: 1.3 }) },
    { build: () => table({ length: 0.5, width: 0.5, height: 0.7 }), ...onWall("right", -1.9, { out: 0.3 }) },
    { build: () => candle({ height: 0.18, intensity: 1.2 }), at: [2.5, -1.9], y: 0.7 },
  ],
  lights: [{ at: [-2.3, 0.6, -1.6], colour: "ember", intensity: 5, range: 6, flicker: 0.3 }],
  focus: [0, 0.8, 0],
  pawn: [1.3, 1.7],
  spots: [[1.3, 0.85], [0.45, 1.6], [1.4, 0.0], [2.1, 1.25], [-0.4, 1.55]],
};
