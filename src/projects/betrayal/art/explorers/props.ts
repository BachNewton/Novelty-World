import * as THREE from "three";
import { ball, drum, figureMaterial, form, rod, roundBox, sculpt } from "../forms";
import type { Prop } from "./hands";

/*
 * Stand-in props for the hands to hold, until the items get art of their
 * own: one of each way a thing is carried, at its real size. Each is built
 * round its grip, as `Prop` says: its handle's axis along +y through the
 * origin, +z along the hand towards the fingertips.
 */

/** A revolver: a wooden grip in the fist, the cylinder and frame above the
 *  thumb, and the barrel running on along the hand. Carried hanging at the
 *  side, muzzle down. */
function revolverGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(roundBox([0, -0.004, -0.004], [0.0105, 0.042, 0.013], 0.008, [0.18, 0, 0]), "woodMid")
    .add(roundBox([0, 0.05, 0.018], [0.009, 0.014, 0.032], 0.005), "stone", 0.006)
    .add(drum([0, 0.052, 0.03], 0.017, 0.016, 0.004, [Math.PI / 2, 0, 0]), "stoneLight", 0.003)
    .add(rod([0, 0.06, 0.03], [0, 0.06, 0.16], 0.0075), "stone", 0.004)
    .add(rod([0, 0.045, 0.04], [0, 0.03, 0.06], 0.004), "ash")
    .geometry(0.0035);
}

/** A candle held in the fist, its wax rising above the thumb and its flame on top. */
function candleGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(drum([0, 0.055, 0], 0.014, 0.1, 0.004), "boneLight")
    .add(ball([0, 0.145, 0], 0.011), "boneLight", 0.012)
    .add(rod([0, 0.155, 0], [0, 0.17, 0], 0.0018), "soot")
    .add(rod([0, 0.172, 0], [0, 0.205, 0], 0.009, 0.002), "flame", 0.006)
    .geometry(0.003);
}

/** A spear carried upright: a long wooden shaft held a third of the way up,
 *  an iron head on top and a butt cap below. */
function spearGeometry(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.4, 0], [0, 1.08, 0], 0.012, 0.011), "woodMid")
    .add(rod([0, -0.42, 0], [0, -0.36, 0], 0.014), "ash", 0.004)
    .add(rod([0, 1.06, 0], [0, 1.11, 0], 0.016, 0.014), "ash", 0.004)
    .add(roundBox([0, 1.2, 0], [0.032, 0.1, 0.006], 0.004), "stoneLight", 0.01)
    .add(rod([0, 1.28, 0], [0, 1.32, 0], 0.012, 0.002), "stoneLight", 0.01)
    .geometry(0.006);
}

let meshed: { revolver: THREE.BufferGeometry; candle: THREE.BufferGeometry; spear: THREE.BufferGeometry } | undefined;

function parts() {
  meshed ??= { revolver: revolverGeometry(), candle: candleGeometry(), spear: spearGeometry() };
  return meshed;
}

function prop(geometry: THREE.BufferGeometry, name: string): THREE.Mesh {
  const mesh = form(figureMaterial(), geometry);
  mesh.name = name;
  return mesh;
}

export function revolver(): Prop {
  return { object: prop(parts().revolver, "revolver"), handle: 0.011, carry: "hang" };
}

export function candle(): Prop {
  return { object: prop(parts().candle, "candle"), handle: 0.014, carry: "upright" };
}

export function spear(): Prop {
  return { object: prop(parts().spear, "spear"), handle: 0.012, carry: "upright" };
}

/** Every stand-in, by name, for the bench and the tests. */
export const STAND_INS = { revolver, candle, spear } as const;
