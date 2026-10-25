import { Matrix3 } from "three";
import { cameraPosition, dot, floor, Fn, fract, If, mix, positionWorld, sin, uniform, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { typed } from "../tsl";
import type { SkyUniforms } from "./sky";

/*
 * What the sky's features share: the direction a pixel of the dome looks
 * along, and noise in three dimensions, so a pattern can lie on the sphere
 * of the stars or on the moon with no seam.
 */

/**
 * The sky's frame as the features drawn on the sphere of the stars read it:
 * the celestial axes and a pixel's width, copied from the sky's own
 * uniforms (`followSky`) by each such feature's per-frame update, since a
 * stage is given only the air.
 */
export const skyFrame = {
  celestial: uniform(new Matrix3()),
  pixel: uniform(0.001),
};

export function followSky(sky: SkyUniforms): void {
  skyFrame.celestial.value.copy(sky.uCelestial.value);
  skyFrame.pixel.value = sky.uSkyPixel.value;
}

/** A direction on the sphere of the stars: the world's direction in the celestial frame. */
export function celestial(dir: Node<"vec3">): Node<"vec3"> {
  return typed<"vec3">(dir.mul(skyFrame.celestial));
}

/** The direction from the eye through this pixel of the sky's dome. */
export function skyDirection(): Node<"vec3"> {
  return positionWorld.sub(cameraPosition).normalize();
}

/** Four cheap hashes of a 3D point, each 0 to 1. */
export const skyHash4 = Fn(([p]: [Node<"vec3">]) => {
  const q = vec4(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)), dot(p, vec3(246.1, 124.6, 311.7)));
  return fract(sin(q).mul(43758.5453));
}).setLayout({ name: "skyHash4", type: "vec4", inputs: [{ name: "p", type: "vec3" }] });

const hash = (p: Node<"vec3">): Node<"float"> => typed<"vec4">(skyHash4(p)).x;

/** Value noise in three dimensions, 0 to 1. Like the hash, a function of its own in the shader, called rather than pasted in at every octave and use. */
export const skyNoise3 = Fn(([p]: [Node<"vec3">]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const corner = (x: number, y: number, z: number) => hash(i.add(vec3(x, y, z)));
  const near = mix(mix(corner(0, 0, 0), corner(1, 0, 0), u.x), mix(corner(0, 1, 0), corner(1, 1, 0), u.x), u.y);
  const far = mix(mix(corner(0, 0, 1), corner(1, 0, 1), u.x), mix(corner(0, 1, 1), corner(1, 1, 1), u.x), u.y);
  return mix(near, far, u.z);
}).setLayout({ name: "skyNoise3", type: "float", inputs: [{ name: "p", type: "vec3" }] });

/** A few octaves of it, each half the last, 0 to 1. */
export function skyFbm3(p: Node<"vec3">, octaves = 3): Node<"float"> {
  let sum: Node<"float"> = typed<"float">(skyNoise3(p)).mul(0.5);
  let total = 0.5;
  let weight = 0.5;
  let at = p;
  for (let i = 1; i < octaves; i++) {
    at = at.mul(2.03).add(vec3(1.7, 9.2, 3.1));
    weight *= 0.5;
    total += weight;
    sum = sum.add(typed<"float">(skyNoise3(at)).mul(weight));
  }
  return sum.div(total);
}

/** A colour changed by `change` only where `when` holds, so a sight that is not there (the night's, by day) costs a pixel nothing but the test. */
export function onlyWhere(when: Node<"bool">, colour: Node<"vec3">, change: (colour: Node<"vec3">) => Node<"vec3">): Node<"vec3"> {
  return typed<"vec3">(
    Fn(() => {
      const out = colour.toVar();
      If(when, () => {
        out.assign(change(out));
      });
      return out;
    })(),
  );
}
