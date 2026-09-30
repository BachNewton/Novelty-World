import { describe, expect, it } from "vitest";
import { createRng } from "./seeded-random";

function draw(seedOrState: string | number, count: number): number[] {
  const rng = createRng(seedOrState);
  return Array.from({ length: count }, () => rng.next());
}

describe("createRng", () => {
  // Pinned to the exact values the generator produced when it was shared out of
  // Monopoly, Frogmino and the SNES optimizer. Seeded games, replays, bot ratings
  // and generated courses all depend on this stream: these must never change.
  it("reproduces the pinned mulberry32 stream for numeric seeds", () => {
    expect(draw(0, 5)).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086,
    ]);
    expect(draw(1, 5)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
      0.9683778982143849,
    ]);
    expect(draw(42, 5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
    expect(draw(20260930, 5)).toEqual([
      0.7129707557614893, 0.9029586620163172, 0.8964550015516579, 0.8198657901957631,
      0.2130950081627816,
    ]);
  });

  it("reduces numeric seeds to 32 unsigned bits", () => {
    const expected = [
      0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677,
      0.8452364315744489,
    ];
    expect(draw(4294967295, 5)).toEqual(expected);
    expect(draw(-1, 5)).toEqual(expected);
  });

  it("reproduces the pinned xmur3 hash and stream for string seeds", () => {
    const cases: [string, number, number[]][] = [
      ["alpha", 2493482201, [0.05431145546026528, 0.7676264438778162, 0.7096733166836202]],
      ["mock-seed", 3065571383, [0.23679046984761953, 0.7201909173745662, 0.9573833853937685]],
      ["", 167010153, [0.9757088038604707, 0.6221915907226503, 0.6578594758175313]],
      ["héllo", 3960454150, [0.15827917261049151, 0.6811489714309573, 0.46458816179074347]],
    ];
    for (const [seed, state, values] of cases) {
      expect(createRng(seed).getState()).toBe(state);
      expect(draw(seed, 3)).toEqual(values);
    }
  });

  it("produces different streams for different seeds", () => {
    expect(draw("alpha", 1)).not.toEqual(draw("beta", 1));
  });

  it("resumes the same stream from a serialized getState() value", () => {
    const a = createRng("resume");
    a.next();
    a.next();
    const snapshot = a.getState();
    const expected = [a.next(), a.next(), a.next()];
    expect(draw(snapshot, 3)).toEqual(expected);
  });
});
