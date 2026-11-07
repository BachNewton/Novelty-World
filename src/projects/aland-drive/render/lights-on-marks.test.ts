import { describe, expect, it } from "vitest";
import type { SeaLight } from "../art/night/sea-lights";
import { lampAt } from "./lighthouses";
import { LIGHTS_ON_MARKS, lightsOnMarks, REGISTER_MARKS } from "./lights-on-marks";
import { lampOnMark, seaMarkKinds } from "./sea-marks";

const flashing = (kind: string, x: number, z: number): SeaLight => ({ x, z, kind, heightM: 9, rangeNm: 5, sectors: [{ character: "LFl", colour: "white", periodS: 6 }] });

describe("a sea light on the register's marks", () => {
  it("is a lighthouse only where the register has one", () => {
    const lighthouse = REGISTER_MARKS.find(([model]) => model === "lighthouse");
    const skerry = REGISTER_MARKS.find(([model]) => model === "skerry-light");
    if (!lighthouse || !skerry) throw new Error("the register has lighthouses and skerry lights");
    const [onLighthouse, onSkerry] = lightsOnMarks([flashing("lighthouse", lighthouse[1] + 10, lighthouse[2]), flashing("lighthouse", skerry[1], skerry[2] + 10)], REGISTER_MARKS);
    expect(onLighthouse.kind).toBe("lighthouse");
    expect(onSkerry.kind).toBe("beacon");
  });

  it("stands on its mark, so its glow is in the model drawn there", () => {
    const [mark] = REGISTER_MARKS;
    const [light] = lightsOnMarks([flashing("beacon", mark[1] + 7, mark[2] - 5)], REGISTER_MARKS);
    expect([light.x, light.z]).toEqual([mark[1], mark[2]]);
  });

  it("leaves out a light with no mark drawn to shine from, such as the one OSM has by Långnäs's ferry berth", () => {
    expect(lightsOnMarks([flashing("lighthouse", 1e6, 1e6)], REGISTER_MARKS)).toEqual([]);
    expect(LIGHTS_ON_MARKS.some(({ x, z }) => Math.hypot(x - 18078, z - 6814) < 200)).toBe(false);
  });

  it("lights every lighthouse the register has lit and OSM gives a rhythm, the outer skerries' too", () => {
    // Sandbäck, Flötjan, Sälskär, Märket, Lågskär and Salkobb, in scene metres. Enskär, off the Finnish coast, has no light in OSM; the register's daymark towers are unlit.
    const lit = [[49343, -62893.4], [-14396, 37876.2], [-17432.4, -30208.5], [-44198.9, -20889.2], [-6722.3, 35016.3], [3314.9, 29069.2]];
    for (const [x, z] of lit) expect(LIGHTS_ON_MARKS.some((light) => light.x === x && light.z === z), `${x}, ${z}`).toBe(true);
  });
});

// The glows that floated: OSM's height of a light, from sea level, over a mark drawn to its own height. Every sea light on
// the island shines from the top of the very mark drawn under it, from its lamp where the model has one. A lighthouse's
// lamp is its tower's own (`render/lighthouses.ts`), held by its own tests.
describe("every sea light on the island", () => {
  it("shines from the mark drawn under it, in its lamp at the top of it", () => {
    const kinds = seaMarkKinds();
    const tops = new Map<string, number>();
    const topOf = (model: string) => {
      const geometry = kinds[model].build().near;
      geometry.computeBoundingBox();
      if (geometry.boundingBox === null) throw new Error(`the ${model} has no bounds`);
      tops.set(model, geometry.boundingBox.max.y);
      return geometry.boundingBox.max.y;
    };
    const groundM = 3;
    const lampY = lampOnMark(() => groundM);
    const off: Record<string, number> = {};
    const marked = LIGHTS_ON_MARKS.filter(({ x, z }) => lampAt(x, z) === undefined);
    for (const light of marked) {
      const [model, x, z, , floats, heightM = 0] = light.mark;
      const top = (floats === 1 ? -0.05 : groundM) + (tops.get(model) ?? topOf(model)) * (kinds[model].scaleFor?.(heightM, x, z) ?? 1);
      const y = lampY(light);
      if (light.x !== x || light.z !== z || y > top || y < top - 2) off[light.kind] = (off[light.kind] ?? 0) + 1;
    }
    expect(marked.length).toBeGreaterThan(70);
    expect(off).toEqual({});
  });
});
