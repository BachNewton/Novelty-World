import { pictureFrame } from "../kit";
import { PICTURE_NAMES } from "../kit/pictures";
import { RAMPS } from "../palette";
import { onWall, type PropPlacement, type RoomDefinition } from "../room";
import { panelling, wallpaper, woodPlanks } from "../textures";

/** Where the library's pictures hang: four to a row, two rows to a wall, on the two walls without a door. */
const SLOTS = (["left", "right"] as const).flatMap((edge) =>
  [2.15, 1.1].flatMap((y) => [-1.95, -0.65, 0.65, 1.95].map((along) => ({ edge, along, y }))),
);

const FRAMES = ["brass", "woodLight", "woodMid", "woodDark"] as const;

/**
 * The whole picture library hung in one room, to judge it on the bench
 * (`?bench=pictures`). A bench view only, never in the house: it is
 * built on the Gallery's tile, a plain room with doors top and bottom, until
 * the Gallery has art of its own.
 */
export const PICTURE_LIBRARY: RoomDefinition = {
  id: "gallery",
  floor: () => woodPlanks({ seed: "picture-library" }),
  wall: () => wallpaper({ ground: "moonDark", stripe: "sootLight", motif: "moon", seed: "picture-library" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "picture-library" }),
  trim: "woodDark",
  props: PICTURE_NAMES.map((name, i): PropPlacement => {
    const { edge, along, y } = SLOTS[i];
    return { build: () => pictureFrame({ picture: name, frame: FRAMES[i % FRAMES.length] }), name, ...onWall(edge, along, { y }) };
  }),
  lights: [
    { at: [-1.2, 2.4, 0], colour: "amber", intensity: 4, range: 6 },
    { at: [1.2, 2.4, 0], colour: "amber", intensity: 4, range: 6 },
  ],
  focus: [-2.6, 1.3, 0],
  prime: [0, 0],
};
