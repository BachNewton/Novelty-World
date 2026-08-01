import { describe, expect, it } from "vitest";
import { rentDue } from "../../../logic";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import {
  encodeRl,
  EXPECTED_DICE_TOTAL,
  featLayout,
  obsSpec,
  packFeat,
  PLAYER_FEATURES,
  playerWidth,
  rentCapacity,
  unpackFeat,
} from "./encode-rl";

// The motivating pathology: mortgaging is BOOK-VALUE-NEUTRAL (cash replaces the
// property), so net worth barely moves while the rent stream goes to zero. These
// tests pin the one property the feature exists for — a mortgaged holding
// contributes exactly 0 — plus the rent rules it must inherit from the engine.

const ON = { obsRentCapacity: true } as const;

/** Board positions used below (see data.ts SPACES). */
const MEDITERRANEAN = 1; // brown, base 2
const BALTIC = 3; // brown, base 4
const ORIENTAL = 6; // light-blue, base 6
const RAILROADS = [5, 15, 25, 35];
const ELECTRIC = 12;
const WATER = 28;

function own(state: GameState, id: string, positions: number[]): GameState {
  const ownership = { ...state.ownership };
  for (const pos of positions) ownership[pos] = id;
  return { ...state, ownership };
}

function mortgage(state: GameState, pos: number): GameState {
  return { ...state, mortgaged: { ...state.mortgaged, [pos]: true } };
}

function build(state: GameState, pos: number, houses: number): GameState {
  return { ...state, houses: { ...state.houses, [pos]: houses } };
}

function game(): GameState {
  return freshGame("rent-capacity", undefined, 4);
}

describe("obs-rent-capacity — per-player rent-collection capacity", () => {
  it("capacity strictly DROPS when a property is mortgaged and returns when unmortgaged", () => {
    const base = own(game(), "p1", [MEDITERRANEAN, BALTIC, ORIENTAL]);
    const before = rentCapacity(base, "p1");
    const mortgaged = mortgage(base, ORIENTAL);
    const after = rentCapacity(mortgaged, "p1");
    expect(after).toBeLessThan(before);
    // ORIENTAL is unimproved and not a full set -> its whole base rent vanishes.
    expect(before - after).toBe(6);
    // Unmortgaging restores it exactly.
    expect(rentCapacity({ ...mortgaged, mortgaged: {} }, "p1")).toBe(before);
    // Mortgaging EVERY holding zeroes the capacity outright.
    let allMortgaged = base;
    for (const pos of [MEDITERRANEAN, BALTIC, ORIENTAL]) {
      allMortgaged = mortgage(allMortgaged, pos);
    }
    expect(rentCapacity(allMortgaged, "p1")).toBe(0);
  });

  it("the mortgaged-property drop is visible in the obs row (where net worth is not)", () => {
    // p2 holds a railroad so the SHARE column has a live rival to shift toward.
    const base = own(
      own(game(), "p1", [MEDITERRANEAN, BALTIC, ORIENTAL]),
      "p2",
      [RAILROADS[0]],
    );
    const rowBefore = encodeRl(base, "p1", ON).players[0];
    const rowAfter = encodeRl(mortgage(base, ORIENTAL), "p1", ON).players[0];
    const CAP = PLAYER_FEATURES; // capacity column (nw-share off)
    expect(rowAfter[CAP]).toBeLessThan(rowBefore[CAP]);
    expect(rowAfter[CAP + 1]).toBeLessThan(rowBefore[CAP + 1]);
  });

  it("scales with houses and hotels", () => {
    const base = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    const levels = [0, 1, 2, 3, 4, 5].map(
      (h) => rentCapacity(build(base, BALTIC, h), "p1"),
    );
    // Strictly increasing with development level.
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
    // Exact: Baltic's table, plus Mediterranean's doubled base (full brown set).
    expect(levels[1]).toBe(20 + 2 * 2);
    expect(levels[4]).toBe(320 + 2 * 2);
    expect(levels[5]).toBe(450 + 2 * 2); // hotel
  });

  it("doubles the unimproved rent of a FULL colour set", () => {
    const partial = own(game(), "p1", [MEDITERRANEAN]);
    expect(rentCapacity(partial, "p1")).toBe(2); // single brown, no doubling
    const set = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    expect(rentCapacity(set, "p1")).toBe(2 * 2 + 4 * 2); // both doubled
  });

  it("railroad rent scales with the owner's railroad COUNT", () => {
    const caps = [1, 2, 3, 4].map((n) =>
      rentCapacity(own(game(), "p1", RAILROADS.slice(0, n)), "p1"),
    );
    // RAILROAD_RENT = [25, 50, 100, 200], summed over each owned railroad.
    expect(caps).toEqual([25, 2 * 50, 3 * 100, 4 * 200]);
  });

  it("utility rent uses the EXPECTED dice total (7) × the applicable multiplier", () => {
    expect(EXPECTED_DICE_TOTAL).toBe(7);
    const one = own(game(), "p1", [ELECTRIC]);
    expect(rentCapacity(one, "p1")).toBe(4 * EXPECTED_DICE_TOTAL);
    const both = own(game(), "p1", [ELECTRIC, WATER]);
    expect(rentCapacity(both, "p1")).toBe(2 * (10 * EXPECTED_DICE_TOTAL));
    // Mortgaging one utility drops its whole expected contribution.
    expect(rentCapacity(mortgage(both, WATER), "p1")).toBe(10 * EXPECTED_DICE_TOTAL);
  });

  it("agrees with the rent the engine ACTUALLY charges (anti-divergence)", () => {
    // A developed property, a full set, a railroad and a utility — the feature
    // and the engine's charge path must agree term for term.
    let state = own(game(), "p1", [MEDITERRANEAN, BALTIC, ORIENTAL, ...RAILROADS, ELECTRIC]);
    state = build(state, BALTIC, 3);
    state = mortgage(state, MEDITERRANEAN); // charged rent here is null (0)
    let charged = 0;
    for (const pos of [MEDITERRANEAN, BALTIC, ORIENTAL, ...RAILROADS, ELECTRIC]) {
      // `rentDue` is the exact amount `resolveLanding` charges a lander; the
      // utility term is dice-driven, so evaluate it at the same expected roll.
      charged += rentDue(state, pos, EXPECTED_DICE_TOTAL, "p2") ?? 0;
    }
    expect(charged).toBeGreaterThan(0);
    expect(rentCapacity(state, "p1")).toBe(charged);
  });

  it("the share column sums to 1 across players with nonzero capacity", () => {
    let state = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    state = own(state, "p2", RAILROADS.slice(0, 2));
    state = own(state, "p3", [ELECTRIC]);
    const obs = encodeRl(state, "p1", ON);
    const CAP = PLAYER_FEATURES;
    const MONEY_SCALE = 1000; // mirrors encode-rl
    const total =
      rentCapacity(state, "p1") + rentCapacity(state, "p2") + rentCapacity(state, "p3");
    let shareSum = 0;
    for (const row of obs.players) {
      expect(row).toHaveLength(PLAYER_FEATURES + 2);
      expect(Number.isFinite(row[CAP + 1])).toBe(true);
      expect(row[CAP + 1]).toBeGreaterThanOrEqual(0);
      expect(row[CAP + 1]).toBeLessThanOrEqual(1);
      if (row[0] === 1) {
        expect(row[CAP + 1]).toBeCloseTo((row[CAP] * MONEY_SCALE) / total, 9);
      } else {
        expect(row[CAP]).toBe(0);
      }
      shareSum += row[CAP + 1];
    }
    expect(shareSum).toBeCloseTo(1, 9);
  });

  it("degenerate all-zero capacity ⇒ share 0 (finite, no NaN)", () => {
    const obs = encodeRl(game(), "p1", ON); // nobody owns anything
    const CAP = PLAYER_FEATURES;
    for (const row of obs.players) {
      expect(Number.isFinite(row[CAP + 1])).toBe(true);
      expect(row[CAP]).toBe(0);
      expect(row[CAP + 1]).toBe(0);
    }
  });

  it("OFF: player width and rows are byte-identical to legacy", () => {
    expect(playerWidth()).toBe(PLAYER_FEATURES);
    expect(playerWidth({ obsRentCapacity: false })).toBe(PLAYER_FEATURES);
    expect(obsSpec({ obsRentCapacity: false })).toEqual(obsSpec());
    expect(featLayout({ obsRentCapacity: false })).toEqual(featLayout());
    const state = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    const off = encodeRl(state, "p1");
    const offExplicit = encodeRl(state, "p1", { obsRentCapacity: false });
    expect(offExplicit.players).toEqual(off.players);
    for (const row of off.players) expect(row).toHaveLength(PLAYER_FEATURES);
    expect(packFeat(offExplicit, { obsRentCapacity: false })).toEqual(packFeat(off));
  });

  it("ON: width +2 and the float layout grows by exactly 2×max_seats", () => {
    expect(playerWidth(ON)).toBe(PLAYER_FEATURES + 2);
    expect(obsSpec(ON).player).toBe(PLAYER_FEATURES + 2);
    const grew = featLayout(ON).float_count - featLayout().float_count;
    expect(grew).toBe(2 * obsSpec().max_seats);
    expect(featLayout(ON).byte_length - featLayout().byte_length).toBe(
      4 * 2 * obsSpec().max_seats,
    );
    // Composes with obs-nw-share: the widths add (nw-share column first).
    const both = { obsNwShare: true, obsRentCapacity: true };
    expect(playerWidth(both)).toBe(PLAYER_FEATURES + 3);
    const state = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    const nwOnly = encodeRl(state, "p1", { obsNwShare: true }).players[0];
    const combined = encodeRl(state, "p1", both).players[0];
    expect(combined.slice(0, PLAYER_FEATURES + 1)).toEqual(nwOnly);
  });

  it("packFeat/unpackFeat round-trips the widened player rows", () => {
    let state = own(game(), "p1", [MEDITERRANEAN, BALTIC]);
    state = own(state, "p2", RAILROADS.slice(0, 3));
    const obs = encodeRl(state, "p1", ON);
    const blob = packFeat(obs, ON);
    expect(blob.length).toBe(featLayout(ON).byte_length);
    const back = unpackFeat(blob, ON);
    for (let i = 0; i < obs.players.length; i++) {
      for (let j = 0; j < PLAYER_FEATURES + 2; j++) {
        expect(back.players[i][j]).toBeCloseTo(obs.players[i][j], 5);
      }
    }
  });
});
