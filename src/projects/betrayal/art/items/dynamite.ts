import * as THREE from "three";
import { ball, drum, ring, rod, sculpt, union } from "../forms";
import { figureParts } from "../figure-parts";
import { assembled, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Dynamite (item): three sticks of dynamite in red paper, bound together
 * with two turns of pale twine, and a long fuse curling up out of the middle
 * stick, unlit. It reads as dynamite by the bright red bundle and the fuse
 * over it, the cartoon's silhouette, which nothing else in the house has.
 * Gripped round the bundle and carried upright, the fuse up, ready to throw;
 * on the floor it lies on its side.
 */

/** Each stick's radius, and how far its middle lies from the bundle's; the sticks' ends, along the grip; the twine's two turns. */
const STICK = { radius: 0.0125, out: 0.0146, foot: -0.075, top: 0.235 };
const TWINE = { at: [0.07, 0.18], radius: 0.0034 };
/** The bundle's radius round the grip, which the hand closes round. */
const BUNDLE = STICK.out + STICK.radius;
/** The stick the fuse comes out of. */
const FUSED = 0;

const stickAt = (k: number): [number, number] => {
  const angle = (k / 3) * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(angle) * STICK.out, Math.sin(angle) * STICK.out];
};

/** The three sticks, their paper ends crimped a darker red, and the twine bound round them. */
function bundleGeometry(): THREE.BufferGeometry {
  const half = (STICK.top - STICK.foot) / 2;
  const sticks = [0, 1, 2].map((k) => {
    const [x, z] = stickAt(k);
    return drum([x, STICK.foot + half, z], STICK.radius, half, 0.004);
  });
  const shape = sculpt().add(union(...sticks), "scarlet");
  // The crimped paper at each end, a darker band.
  for (const k of [0, 1, 2]) {
    const [x, z] = stickAt(k);
    for (const end of [STICK.foot + 0.006, STICK.top - 0.006]) shape.paint(drum([x, end, z], STICK.radius + 0.002, 0.007), "bloodLight");
  }
  for (const y of TWINE.at) shape.add(ring([0, y, 0], BUNDLE - 0.0012, TWINE.radius), "bone", 0.002);
  return shape.geometry(0.0024);
}

/** The fuse: a cord out of the top of one stick, rising, bending over and curling back, its end frayed pale. */
function fuseGeometry(): THREE.BufferGeometry {
  const [x, z] = stickAt(FUSED);
  const points: [number, number, number][] = [
    [x, STICK.top - 0.01, z],
    [x, STICK.top + 0.025, z * 1.1],
    [x + 0.012, STICK.top + 0.055, z * 0.6],
    [x + 0.035, STICK.top + 0.07, z * 0.1],
    [x + 0.055, STICK.top + 0.06, -z * 0.3],
    [x + 0.062, STICK.top + 0.04, -z * 0.2],
  ];
  const shape = sculpt();
  for (let k = 1; k < points.length; k++) shape.add(rod(points[k - 1], points[k], 0.0042), "boneDark", 0.004);
  shape.paint(ball(points[points.length - 1], 0.009), "bone");
  return shape.geometry(0.0018);
}

const PARTS = figureParts("item:dynamite", () => ({ bundle: bundleGeometry(), fuse: fuseGeometry() }));

function dynamite(): THREE.Group {
  const parts = PARTS.get();
  const bundle = piece(parts.bundle, "dynamite");
  const fuse = piece(parts.fuse, "dynamite fuse");
  const [x, z] = stickAt(FUSED);
  return assembled("dynamite", [bundle, fuse], [{ between: [bundle, fuse], at: [x, STICK.top, z], radius: 0.03 }]);
}

export const DYNAMITE = itemModel({
  card: "dynamite",
  parts: [PARTS],
  held: () => ({ object: dynamite(), handle: BUNDLE, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
