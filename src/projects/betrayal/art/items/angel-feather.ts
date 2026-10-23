import * as THREE from "three";
import { ellipsoid, rod, roughened, roundBox, sculpt, type Vec3 } from "../forms";
import { figureParts } from "../figure-parts";
import { assembled, blade, FACE_UP, itemModel, life, piece } from "./item";

/*
 * The Angel Feather (item): a single great white flight feather, light
 * enough to name the fall of the dice. A long pale vane, broad on one side
 * of its shaft and narrow on the other, curving a little as it rises to its
 * tip, split in a few places along its edges, with a soft down at its foot
 * and a bare quill below. It reads by its long pale plume standing up out of
 * the fist, the palest thing anyone holds, and its curve; nothing else held
 * is so tall and so thin. It is pale, never lit: it gives off no light. Built
 * at three times life-size, as every small charm is. Held upright by its
 * quill, its broad face to the front.
 */

/** Up the feather from the grip: the quill's end under the fist, where the vane begins over it, and its tip. */
const FEATHER = { quill: -0.06, vane: 0.05, tip: 0.05 + life(0.12), curve: -0.055 };
/** The vane's half-widths at its broadest: the trailing side (−x, away from the body) and the leading side. */
const WIDTH = { trailing: life(0.019), leading: life(0.008) };

/** A point on the shaft, `t` from the vane's foot (0) to its tip (1), curving away from the body as it rises. */
const spine = (t: number): [number, number] => [FEATHER.curve * t * t, FEATHER.vane + (FEATHER.tip - FEATHER.vane) * t];
/** How broad the vane is along the shaft: swelling quickly from its foot, then narrowing to the tip. */
const breadth = (t: number) => Math.sqrt(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.94))) * (1 - 0.3 * t);

/** The vane's outline, [x, y]: up its trailing side to the tip, and back down its leading side. */
function outline(): [number, number][] {
  const steps = 22;
  const along = Array.from({ length: steps + 1 }, (_, k) => k / steps);
  const side = (width: number, sign: 1 | -1) => along.slice(0, -1).map((t): [number, number] => {
    const [x, y] = spine(t);
    return [x + sign * width * breadth(t), y - 0.008 * Math.sin(Math.PI * t) * (sign === -1 ? 1 : 0.5)];
  });
  return [...side(WIDTH.trailing, -1), spine(1), ...side(WIDTH.leading, 1).reverse()];
}

function featherGeometry(): THREE.BufferGeometry {
  const shape = sculpt().add(blade(outline(), { thickness: 0.006, edge: 0.0018, bevel: 0.014, flat: "z" }), "boneLight");
  // The shaft down the middle of the vane, standing a little proud of it, and the bare quill below.
  const points: Vec3[] = Array.from({ length: 7 }, (_, k) => {
    const [x, y] = spine(k / 6);
    return [x, y, 0];
  });
  for (let k = 1; k < points.length; k++) shape.add(rod(points[k - 1], points[k], 0.0042 - 0.0004 * k, 0.0042 - 0.0004 * (k + 1)), "bone", 0.002);
  shape.add(rod([0, FEATHER.quill, 0], [0, FEATHER.vane + 0.004, 0], 0.0055, 0.0045), "bone", 0.002);
  // The splits in the vane, where its barbs have parted, slanting up and out from the shaft.
  for (const [t, sign, slant] of [[0.34, -1, 0.5], [0.58, -1, 0.45], [0.47, 1, -0.5], [0.76, -1, 0.4]] as const) {
    const [x, y] = spine(t);
    const width = (sign === -1 ? WIDTH.trailing : WIDTH.leading) * breadth(t);
    shape.carve(roundBox([x + sign * width, y, 0], [width * 0.55, 0.0016, 0.02], 0.001, [0, 0, slant]));
  }
  // The down at the vane's foot, soft and pale round the shaft.
  shape.add(roughened(ellipsoid([-0.004, FEATHER.vane + 0.008, 0], [0.026, 0.02, 0.0045]), 0.003, 0.012), "boneLight", 0.004);
  return shape.geometry(0.0016);
}

const PARTS = figureParts("item:angel-feather", () => ({ feather: featherGeometry() }));

const feather = () => assembled("angel feather", [piece(PARTS.get().feather, "angel feather")]);

export const ANGEL_FEATHER = itemModel({
  card: "angel-feather",
  parts: [PARTS],
  held: () => ({ object: feather(), handle: 0.0055, carry: "upright" }),
  plate: FACE_UP,
});
