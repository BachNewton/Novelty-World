import { describe, expect, it } from "vitest";
import { ADD_ON_MODELS, villaAddOns, type AddOnKind } from "./add-ons";
import { buildChurch } from "./church";
import { CHURCHES } from "./churches";
import IDS from "./facade-ids.json";
import { painter, triangles } from "./paint";
import { fuelStation, supermarketEntrance } from "./roadside-shops";

const ADD_ON_MOST = 150;
const CHURCH_MOST = 2500;
const WHITE = "#ffffff";
const paint = painter(() => WHITE);

describe("what the budget allows", () => {
  it("keeps every add-on model under its triangles", () => {
    for (const kind of Object.keys(ADD_ON_MODELS) as AddOnKind[]) expect(triangles(ADD_ON_MODELS[kind](paint)), kind).toBeLessThan(ADD_ON_MOST);
    expect(triangles(fuelStation(paint, "TÄRNAN", 1))).toBeLessThan(ADD_ON_MOST);
    expect(triangles(supermarketEntrance(paint, "MATHOLMEN", 1))).toBeLessThan(ADD_ON_MOST);
  });

  it("keeps every church, its yard wall included, under its triangles", () => {
    for (const spec of CHURCHES) {
      const church = buildChurch(spec, () => WHITE, () => 0);
      expect(triangles(church.near), spec.id).toBeLessThan(CHURCH_MOST);
      expect(triangles(church.far), spec.id).toBeLessThan(triangles(church.near) / 3);
    }
  });
});

describe("the sign words", () => {
  it("never carries a chain's real name", () => {
    const real = ["ST1", "TEBOIL", "NESTE", "ABC", "S-MARKET", "K-MARKET", "ALKO", "H&M", "JYSK", "RUSTA", "WOODY", "KAPPAHL", "STADIUM", "SYNSAM", "ELGIGANTEN", "EURONICS", "VIANOR", "MEKONOMEN"];
    expect(IDS.words.filter((word) => real.includes(word))).toEqual([]);
  });
});

describe("a villa's add-ons", () => {
  /** One building: a wall with the door, a 12 m wide facade running along +x, then its roof. */
  function villaCell(style: number) {
    const positions = Float32Array.from([0, 0, 0, 12, 0, 0, 12, 6, 0, 0, 6, 0, 6, 8, -4]);
    const facades = Float32Array.from([0, 0, 12, 6, 12, 0, 12, 6, 12, 6, 12, 6, 0, 6, 12, 6, 0, 0, 0, 0]);
    const tints = Uint8Array.from([6, 128, 8, style, 6, 128, 8, style, 6, 128, 8, style, 6, 128, 8, style, 90, 90, 90, 0]);
    return { x: 0, z: 0, positions, facades, tints, indices: new Uint16Array() };
  }

  it("stands on the street side of the wall, facing out of the building", () => {
    const addOns = villaAddOns([villaCell(IDS.styles.villa)]);
    expect(addOns.length).toBeGreaterThan(0);
    expect(addOns[0].outZ).toBeGreaterThan(0.99);
    expect(addOns[0].x).toBeCloseTo(6);
  });

  it("stands only on villas", () => {
    expect(villaAddOns([villaCell(IDS.styles.block)])).toEqual([]);
  });
});
