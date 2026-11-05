import { describe, expect, it } from "vitest";
import { turns, type SeaLight } from "../art/night/sea-lights";
import { LIGHTS_ON_MARKS, lightsOnMarks, REGISTER_MARKS } from "./lights-on-marks";

const flashing = (kind: string, x: number, z: number): SeaLight => ({ x, z, kind, heightM: 9, rangeNm: 5, sectors: [{ character: "LFl", colour: "white", periodS: 6 }] });

describe("a sea light on the register's marks", () => {
  it("turns only where the register has a lighthouse to turn in", () => {
    const lighthouse = REGISTER_MARKS.find(([model]) => model === "lighthouse");
    const skerry = REGISTER_MARKS.find(([model]) => model === "skerry-light");
    if (!lighthouse || !skerry) throw new Error("the register has lighthouses and skerry lights");
    const [onLighthouse, onSkerry] = lightsOnMarks([flashing("lighthouse", lighthouse[1] + 10, lighthouse[2]), flashing("lighthouse", skerry[1], skerry[2] + 10)], REGISTER_MARKS);
    expect(turns(onLighthouse)).toBe(true);
    expect(turns(onSkerry)).toBe(false);
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
});
