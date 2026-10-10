import * as THREE from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { flat, group, type Batch } from "../shapes";

/** A quarter of a right angle: turning every other length of a rope by it about
 *  its own line keeps the faces of two lengths that overlap at a joint out of
 *  one plane. */
export const TWIST = Math.PI / 4;

/** A straight length from `a` to `to` (its centreline), `thick` square, added
 *  to a batch: a rope's run, a leaning plank. `twist` turns it about its own line. */
export function strand(b: Batch, a: THREE.Vector3, to: THREE.Vector3, thick: number, colour: PaletteKey, twist = 0) {
  const along = to.clone().sub(a);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along.clone().normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), twist));
  const middle = a.clone().add(to).multiplyScalar(0.5);
  b.add([along.length() + thick * 0.6, thick, thick], colour, new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
}

/** A rope slung between two points, sagging `sag` at its middle, added to a batch. */
export function slung(b: Batch, a: THREE.Vector3, to: THREE.Vector3, sag: number, { colour = "boneDark", thick = 0.025 }: { colour?: PaletteKey; thick?: number } = {}) {
  const steps = 8;
  const point = (t: number) => a.clone().lerp(to, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  for (let i = 0; i < steps; i++) strand(b, point(i / steps), point((i + 1) / steps), thick, colour, (i % 2) * TWIST);
}

export interface CoilOptions {
  /** Each turn's radius, from the bottom of the coil up. */
  radii?: readonly number[];
  thick?: number;
  colour?: PaletteKey;
  /** Gives each turn a seeded wobble, so the coil lies loose rather than wound. */
  seed?: string;
}

/** A coil of rope lying on the floor, its turns stacked one on another. Base at y = 0. */
export function coil({ radii = [0.2, 0.17, 0.14], thick = 0.028, colour = "boneDark", seed }: CoilOptions = {}): THREE.Group {
  const rope = flat(colour);
  const rng = seed === undefined ? null : createRng(seed);
  const result = group();
  radii.forEach((radius, i) => {
    const turn = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 4, Math.max(10, Math.round(radius * 50))), rope);
    turn.rotation.x = -Math.PI / 2 + (rng ? uniform(rng, -0.08, 0.08) : 0);
    const shift = rng ? [uniform(rng, -0.05, 0.05), uniform(rng, -0.05, 0.05)] : [i * 0.015, 0];
    turn.position.set(shift[0], thick + i * thick * 1.6, shift[1]);
    result.add(turn);
  });
  return result;
}
