import * as THREE from "three";
import { ellipsoid, rod, roughened, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Lucky Stone (item): a smooth, flat river pebble with a hole worn
 * clean through it, the old luck charm, pale fawn with a white quartz vein
 * running round it, worn smooth by rubbing. It reads by its flat oval with
 * the hole in it, pale so it catches the light, held up in the fist, its
 * narrow end in it, at about three times life-size, ready to rub; on the floor it
 * lies flat, and the plate's fit makes it big enough to read.
 */

/** The pebble's middle, its half-sizes (thin through x, across the hand), its narrow end down in the fist, and the hole through it near its top. */
const STONE = { y: 0.056, z: 0.004, thin: 0.016, tall: 0.062, wide: 0.038 };
const HOLE = { y: 0.088, z: 0.006, radius: 0.0078 };

function stoneGeometry(): THREE.BufferGeometry {
  const { y, z, thin, tall, wide } = STONE;
  const pebble = roughened(ellipsoid([0, y, z], [thin, tall, wide]), 0.0006, 0.05);
  return sculpt()
    .add(pebble, "bone")
    // Egg-shaped, as a real pebble is: fuller at its top, its narrow end down in the fist.
    .add(ellipsoid([0, y + 0.014, z], [thin * 1.04, tall * 0.7, wide * 1.06]), "bone", 0.02)
    .carve(rod([-0.04, HOLE.y, HOLE.z], [0.04, HOLE.y, HOLE.z], HOLE.radius), { blend: 0.007 })
    // The quartz vein, a pale band slanting round it.
    .paint((_, py, pz) => Math.abs(py - y + 0.016 - (pz - z) * 0.9 + 0.004 * Math.sin(pz * 90)) - 0.003, "boneLight")
    .geometry(0.0014);
}

const PARTS = figureParts("item:lucky-stone", () => ({ stone: stoneGeometry() }));

export const LUCKY_STONE = itemModel({
  card: "lucky-stone",
  parts: [PARTS],
  held: () => ({ object: piece(PARTS.get().stone, "lucky stone", SHINES.honedMarble), handle: 0.017, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
