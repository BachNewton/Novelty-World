import { describe, expect, it } from "vitest";
import type { SeaLight } from "../art/night/sea-lights";
import { LIGHTS_ON_MARKS, lightsOnMarks, REGISTER_MARKS } from "./lights-on-marks";

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
