import * as THREE from "three";
import { ring, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, blade, bowed, FACE_UP, itemModel, piece } from "./item";

/*
 * The Spear (omen, weapon): an old hunting spear, taller than whoever holds
 * it, a long ash shaft held a third of the way up, bound in cord below a
 * broad leaf-shaped steel head on a socket, and an iron ferrule at its foot.
 * It reads as a spear by its length and its head, broad face on to whoever
 * the holder faces. Carried upright. Already long, it is built at its real
 * size, its head and shaft thickened as a miniature's are.
 */

/** Along the shaft, from the grip: its foot, where the socket takes it, the socket's top, and the point. */
const SHAFT = { foot: -0.42, top: 1.07, radius: 0.016 };
const HEAD = { socket: 1.02, base: 1.12, widest: 1.19, point: 1.42 };

/** The ash shaft, tapering a little to the head, with the cord bound round it under the socket. */
function shaftGeometry(): THREE.BufferGeometry {
  const shape = sculpt().add(rod([0, SHAFT.foot + 0.05, 0], [0, SHAFT.top, 0], SHAFT.radius, SHAFT.radius * 0.88), "woodLight");
  for (let k = 0; k < 4; k++) shape.add(ring([0, 0.93 + k * 0.022, 0], SHAFT.radius * 0.9, 0.0055), "woodDark", 0.004);
  return shape.geometry(0.0045);
}

/** The head: a socket over the shaft's top, flaring into a leaf-shaped blade, broad across the hand (x) and thin along it (z). */
function headGeometry(): THREE.BufferGeometry {
  const half = 0.055;
  const side = (sign: 1 | -1): [number, number][] => [
    [sign * 0.012, HEAD.base],
    ...bowed([sign * 0.012, HEAD.base], [sign * half, HEAD.widest], sign * -0.012, 4),
    ...bowed([sign * half, HEAD.widest], [0, HEAD.point], sign * -0.02, 7).slice(0, -1),
  ];
  const right = side(1);
  const left = side(-1).reverse();
  const outline = [...right, [0, HEAD.point] as [number, number], ...left];
  const leaf = blade(outline, { thickness: 0.016, edge: 0.0065, bevel: 0.03, flat: "z" });
  return sculpt()
    .add(rod([0, HEAD.socket, 0], [0, HEAD.base + 0.01, 0], SHAFT.radius * 1.35, SHAFT.radius * 0.95), "stoneLight")
    .add(leaf, "stoneLight", 0.008)
    .geometry(0.0032);
}

/** The iron ferrule capping the shaft's foot, which ends inside it. */
function ferruleGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, SHAFT.foot + 0.07, 0], [0, SHAFT.foot - 0.02, 0], SHAFT.radius * 1.3, SHAFT.radius * 0.5), "stone")
    .geometry(0.004);
}

const PARTS = figureParts("item:spear", () => ({ shaft: shaftGeometry(), head: headGeometry(), ferrule: ferruleGeometry() }));

function spear(): THREE.Group {
  const parts = PARTS.get();
  const shaft = piece(parts.shaft, "spear shaft");
  const head = piece(parts.head, "spear head", SHINES.steel);
  const ferrule = piece(parts.ferrule, "spear ferrule", SHINES.iron);
  return assembled("spear", [shaft, head, ferrule], [
    { between: [shaft, head], at: [0, HEAD.socket, 0], radius: SHAFT.radius * 2.5 },
    { between: [shaft, ferrule], at: [0, SHAFT.foot + 0.07, 0], radius: SHAFT.radius * 2.5 },
  ]);
}

export const SPEAR = itemModel({
  card: "spear",
  parts: [PARTS],
  held: () => ({ object: spear(), handle: SHAFT.radius, carry: "upright" }),
  plate: FACE_UP,
});
