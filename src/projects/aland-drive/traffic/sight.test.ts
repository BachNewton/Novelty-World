import { describe, expect, it } from "vitest";
import { sees, type Eye } from "./sight";

/** An eye 2 m up at the origin looking north (-z), with a view 90° wide either way across and up. */
const eye: Eye = {
  x: 0,
  y: 2,
  z: 0,
  planes: [
    [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
    [-Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
    [0, Math.SQRT1_2, -Math.SQRT1_2, -2 * Math.SQRT1_2],
    [0, -Math.SQRT1_2, -Math.SQRT1_2, 2 * Math.SQRT1_2],
    [0, 0, -1, 0],
  ],
};
const flat = () => 0;
/** A crest 4 m high halfway to a thing 200 m north. */
const crest = (_: number, z: number) => Math.max(0, 4 - Math.abs(z + 100) / 10);
const at = (x: number, z: number) => ({ x, y: 0, z, radiusM: 1, heightM: 1.8, reachM: 400 });

describe("whether the player can see a thing", () => {
  it("sees one ahead on open ground", () => {
    expect(sees(eye, flat, at(0, -200))).toBe(true);
  });

  it("doesn't see one behind the camera, out to the side of its view, or past its kind's reach", () => {
    expect(sees(eye, flat, at(0, 50))).toBe(false);
    expect(sees(eye, flat, at(-300, -100))).toBe(false);
    expect(sees(eye, flat, at(0, -450))).toBe(false);
  });

  it("doesn't see one over a crest, but does once it stands on top", () => {
    expect(sees(eye, crest, at(0, -200))).toBe(false);
    expect(sees(eye, crest, { ...at(0, -100), y: 4 })).toBe(true);
  });
});
