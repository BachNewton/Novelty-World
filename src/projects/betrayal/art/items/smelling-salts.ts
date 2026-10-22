import * as THREE from "three";
import { drum, ellipsoid, ring, rod, sculpt } from "../forms";
import { figureParts } from "../figure-parts";
import { SHINES } from "../shine";
import { assembled, itemModel, ON_ITS_SIDE, piece } from "./item";

/*
 * The Smelling Salts (item): a lady's vial of smelling salts, a flattened
 * teardrop of cut cobalt glass, its facets catching the light, under a tall
 * silver cap with a beaded rim and a knob to unscrew. It reads by the small
 * deep-blue drop under its bright silver crown, about two and a half times
 * life-size, apart from the Bottle's tall green glass and cork. Gripped
 * round the vial, cap up; on the floor it lies on its side.
 */

/** The vial's middle, its half-sizes (flat through x), where the cap sits and how tall it is. */
const VIAL = { y: 0.026, thin: 0.017, tall: 0.05, wide: 0.024 };
const CAP = { foot: 0.064, top: 0.09, radius: 0.0148 };
const FACETS = 8;

/** The glass: a flattened drop, narrowing to a neck under the cap, cut in facets down its sides. */
function glassGeometry(): THREE.BufferGeometry {
  const { y, thin, tall, wide } = VIAL;
  const shape = sculpt()
    .add(ellipsoid([0, y, 0], [thin, tall, wide]), "moon")
    .add(rod([0, y + tall * 0.6, 0], [0, CAP.foot + 0.008, 0], CAP.radius * 0.95, CAP.radius * 0.72), "moon", 0.012);
  // Flat facets round the drop: each a slice taken off its side.
  for (let k = 0; k < FACETS; k++) {
    const angle = (k / FACETS) * Math.PI * 2;
    const [nx, nz] = [Math.cos(angle), Math.sin(angle)];
    const reach = Math.hypot(thin * nx, wide * nz) * 0.93;
    shape.carve({
      distance: (x, py, z) => reach - (x * nx + z * nz) - Math.abs(py - y) * 0.12,
      min: [-wide * 2, y - tall * 2, -wide * 2],
      max: [wide * 2, y + tall * 2, wide * 2],
    }, { blend: 0.0015 });
  }
  return shape.geometry(0.0011);
}

/** The silver cap: a fluted drum over the neck, a beaded rim at its foot, a domed top and a flat knob. */
function capGeometry(): THREE.BufferGeometry {
  const { foot, top, radius } = CAP;
  const shape = sculpt()
    .add(drum([0, (foot + top) / 2 - 0.004, 0], radius, (top - foot) / 2 - 0.004, 0.003), "stoneLight")
    .add(ellipsoid([0, top - 0.007, 0], [radius * 0.95, 0.008, radius * 0.95]), "stoneLight", 0.003)
    .add(drum([0, top + 0.001, 0], 0.005, 0.0025, 0.0012), "stoneLight", 0.003)
    .add(ring([0, foot + 0.002, 0], radius * 1.02, 0.0028), "stoneLight", 0.0015);
  for (let k = 0; k < 10; k++) {
    const angle = (k / 10) * Math.PI * 2;
    shape.carve(rod([Math.cos(angle) * radius * 1.12, foot + 0.009, Math.sin(angle) * radius * 1.12], [Math.cos(angle) * radius * 1.12, top - 0.01, Math.sin(angle) * radius * 1.12], 0.0028), { blend: 0.001 });
  }
  return shape.geometry(0.001);
}

const PARTS = figureParts("item:smelling-salts", () => ({ glass: glassGeometry(), cap: capGeometry() }));

function smellingSalts(): THREE.Group {
  const parts = PARTS.get();
  const glass = piece(parts.glass, "smelling salts", SHINES.glass);
  const cap = piece(parts.cap, "smelling salts cap", SHINES.silver);
  return assembled("smelling salts", [glass, cap], [{ between: [glass, cap], at: [0, CAP.foot + 0.004, 0], radius: CAP.radius * 2 }]);
}

export const SMELLING_SALTS = itemModel({
  card: "smelling-salts",
  parts: [PARTS],
  held: () => ({ object: smellingSalts(), handle: VIAL.wide, carry: "upright" }),
  plate: ON_ITS_SIDE,
});
