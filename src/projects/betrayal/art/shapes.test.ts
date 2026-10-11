import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import { paletteHex, type PaletteKey } from "./palette";
import { batch, type Size } from "./shapes";

describe("batch", () => {
  it("holds exactly what three's boxes, moved and merged, would", () => {
    const rng = createRng("batch");
    const tints: PaletteKey[] = ["blood", "brass", "woodMid", "verdigris"];
    const boxes = Array.from({ length: 60 }, (_, i) => {
      const size: Size = [uniform(rng, 0.01, 2), uniform(rng, 0.01, 2), i % 10 === 0 ? 0 : uniform(rng, 0.01, 2)];
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(uniform(rng, -3, 3), uniform(rng, -3, 3), uniform(rng, -3, 3)));
      const scale = new THREE.Vector3(uniform(rng, 0.5, 2), i % 7 === 0 ? -1 : 1, uniform(rng, 0.5, 2));
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(uniform(rng, -3, 3), uniform(rng, -3, 3), uniform(rng, -3, 3)), turn, scale);
      return { size, tint: tints[i % tints.length], matrix };
    });

    const made = batch();
    for (const { size, tint, matrix } of boxes) made.add(size, tint, matrix);
    const actual = made.mesh().geometry;

    const expected = mergeGeometries(
      boxes.map(({ size, tint, matrix }) => {
        const geometry = new THREE.BoxGeometry(...size).applyMatrix4(matrix);
        const { r, g, b } = new THREE.Color(paletteHex(tint));
        const colours = new Float32Array(geometry.getAttribute("position").count * 3);
        for (let i = 0; i < colours.length; i += 3) colours.set([r, g, b], i);
        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        return geometry;
      }),
    );

    /** An array's type and its bytes, so even a zero's sign must match. */
    const bits = (array: THREE.TypedArray | undefined) => array && { type: array.constructor.name, bytes: new Uint8Array(array.buffer, array.byteOffset, array.byteLength) };
    expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
    for (const name of Object.keys(expected.attributes)) {
      expect(bits(actual.getAttribute(name).array), name).toEqual(bits(expected.getAttribute(name).array));
    }
    expect(bits(actual.index?.array)).toEqual(bits(expected.index?.array));
  });

  it("refuses to mesh nothing", () => {
    expect(() => batch().mesh()).toThrow();
  });
});
