import { describe, it, expect } from "vitest";
import { DIFFICULTIES, fits, normalFits, placementKey, type Difficulty, type Face } from "./composer";
import { COURSE_SEED } from "./course";
import { VEHICLE_IDS, VEHICLE_LENGTHS } from "./fleet";
import { frogCells } from "./logic";
import { NEEDS_GATE_REACH, RAMP, gateReach, rowStream, type StreamRow } from "./stream";
import { gateLanes, insideGate, lanesOf, rowBack, rowOpening, rowSolids } from "./traffic";
import { TUNING } from "./tuning";
import type { TetrominoKind } from "./types";

const FACE: Face = { cols: TUNING.corridorCols, rows: TUNING.wallRows };
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
// Deep enough into the waves after the ramp to meet every kind of beat.
const DEPTH = 40;

function rowsOf(seed: number, count = DEPTH): StreamRow[] {
  const stream = rowStream(seed, TUNING);
  return Array.from({ length: count }, (_, i) => stream.row(i));
}

const STREAMS = SEEDS.map((seed) => rowsOf(seed));
const ROWS = STREAMS.flat();

// Whether a piece gets through a row keeping itself: through a normal
// opening, not a gate.
function passes(kind: TetrominoKind, row: StreamRow): boolean {
  return normalFits(kind, FACE, row.opening, row.gates).length > 0;
}

// Every place the frog could be once through the row: each piece it could
// hold, through a normal opening, and each gate's piece inside its gate.
function through(row: StreamRow) {
  const kept = row.holding.flatMap((kind) => normalFits(kind, FACE, row.opening, row.gates));
  const taken = row.gates.flatMap((gate) => fits(gate.kind, FACE, row.opening).filter((p) => insideGate(frogCells(p), gate)));
  return row.needsGate ? kept.filter((p) => passes(p.kind, row)) : [...kept, ...taken];
}

describe("the row stream", () => {
  it("is the same for the same seed and index, whatever order its rows are asked for in", () => {
    const backwards = rowStream(COURSE_SEED, TUNING);
    const late = backwards.row(DEPTH - 1);
    const forwards = rowsOf(COURSE_SEED);
    expect(late).toEqual(forwards[DEPTH - 1]);
    expect(Array.from({ length: DEPTH }, (_, i) => backwards.row(i))).toEqual(forwards);
    expect(rowsOf(COURSE_SEED + 1)).not.toEqual(forwards);
  });

  it("numbers its rows by where they come in it", () => {
    for (const rows of STREAMS) rows.forEach((row, i) => expect(row.index).toBe(i));
  });

  it("builds for hundreds of seeds, and deep into the stream", () => {
    expect(ROWS).toHaveLength(SEEDS.length * DEPTH);
    for (const seed of [COURSE_SEED, 7, 99]) expect(rowStream(seed, TUNING).row(800).index).toBe(800);
  });

  it("begins with the designed ramp, five easy, five medium and five hard rows", () => {
    const ramp = RAMP.flatMap((beat) => beat.difficulties);
    expect(ramp).toEqual([...Array<Difficulty>(5).fill("easy"), ...Array<Difficulty>(5).fill("medium"), ...Array<Difficulty>(5).fill("hard")]);
    for (const rows of STREAMS) expect(rows.slice(0, 15).map((row) => row.difficulty)).toEqual(ramp);
  });

  it("puts the ramp's gates at rows 3, 9 and 12, with rows 10 and 14 needing theirs", () => {
    for (const rows of STREAMS) {
      expect(rows.slice(0, 15).flatMap((row, i) => (row.gates.length > 0 ? [i] : []))).toEqual([3, 9, 12]);
      expect(rows.slice(0, 15).flatMap((row, i) => (row.needsGate ? [i] : []))).toEqual([10, 14]);
    }
  });

  it("goes on after the ramp with a gate every five rows, needed more often than not", () => {
    const after = STREAMS.flatMap((rows) => rows.slice(15));
    const gates = after.filter((row) => row.gates.length > 0).length;
    expect(gates / after.length).toBeCloseTo(1 / 5, 5);
    const needed = after.filter((row) => row.needsGate).length;
    expect(needed / gates).toBeGreaterThan(0.5);
    expect(needed / gates).toBeLessThan(0.95);
  });

  it("builds every row from the 19 vehicles, one per lane, clear of its gates' lanes, with the opening they leave", () => {
    for (const row of ROWS) {
      const lanes = row.vehicles.flatMap(lanesOf);
      expect(new Set(lanes).size).toBe(lanes.length);
      for (const v of row.vehicles) expect(VEHICLE_IDS).toContain(v.id);
      for (const gate of row.gates) {
        const { first, last } = gateLanes(gate);
        expect(lanes.filter((lane) => lane >= first && lane <= last)).toEqual([]);
      }
      expect(row.opening).toEqual(rowOpening(row.vehicles, FACE.cols, FACE.rows, row.gates));
      expect(row.solids).toEqual(rowSolids(row.vehicles, row.gates));
      const vehicles = row.solids.filter((solid) => "cells" in solid);
      expect(vehicles.map((solid) => solid.length)).toEqual(row.vehicles.map((v) => VEHICLE_LENGTHS[v.id]));
    }
  });

  it("tracks the pieces the frog could hold: the start piece, plus each gate's, back to the gate's alone at a needs-gate row", () => {
    for (const rows of STREAMS) {
      let holding: TetrominoKind[] = ["L"];
      let latestGate: TetrominoKind | null = null;
      for (const row of rows) {
        expect([...row.holding].sort()).toEqual([...holding].sort());
        if (row.needsGate) {
          if (latestGate === null) throw new Error("A needs-gate row before any gate");
          holding = [latestGate];
        }
        for (const gate of row.gates) {
          holding = [...holding, gate.kind];
          latestGate = gate.kind;
        }
      }
    }
  });

  it("lets every piece the frog could hold through every row, keeping its piece", () => {
    for (const row of ROWS) {
      if (row.needsGate) continue;
      for (const kind of row.holding) expect(passes(kind, row)).toBe(true);
    }
  });

  it("lets only the latest gate's piece through a needs-gate row, which has no gate of its own", () => {
    for (const rows of STREAMS) {
      rows.forEach((row, i) => {
        if (!row.needsGate) return;
        expect(row.gates).toEqual([]);
        const gateRow = rows.slice(0, i).findLast((r) => r.gates.length > 0);
        if (gateRow === undefined) throw new Error("A needs-gate row before any gate");
        const piece = gateRow.gates[0].kind;
        for (const kind of row.holding) expect(fits(kind, FACE, row.opening).length > 0).toBe(kind === piece);
      });
    }
  });

  it("comes at most two rows after the gate a needs-gate row needs", () => {
    expect(NEEDS_GATE_REACH).toBe(2);
    for (const rows of STREAMS) {
      rows.forEach((row, i) => {
        if (!row.needsGate) return;
        const gateAt = rows.slice(0, i).findLastIndex((r) => r.gates.length > 0);
        expect(i - gateAt).toBeGreaterThanOrEqual(1);
        expect(i - gateAt).toBeLessThanOrEqual(NEEDS_GATE_REACH);
      });
    }
  });

  it("keeps the pieces few: at most three the frog could hold, and no row built for more than two", () => {
    for (const row of ROWS) {
      expect(row.holding.length).toBeLessThanOrEqual(3);
      expect(row.answers.length).toBeLessThanOrEqual(2);
      if (row.holding.length === 3) expect(row.needsGate).toBe(true);
    }
  });

  it("offers at a gate only a piece the frog can't already hold", () => {
    for (const row of ROWS) for (const gate of row.gates) expect(row.holding).not.toContain(gate.kind);
  });

  it("builds each row around a pose of each piece it lets through, and keeps each piece's ways through in its difficulty's range", () => {
    for (const row of ROWS) {
      const [fewest, most] = DIFFICULTIES[row.difficulty].fits;
      for (const answer of row.answers) {
        const ways = normalFits(answer.kind, FACE, row.opening, row.gates);
        expect(ways).toContainEqual(answer);
        expect(ways.length).toBeGreaterThanOrEqual(fewest);
        expect(ways.length).toBeLessThanOrEqual(most);
      }
    }
  });

  it("makes every hard row need something the row before didn't allow", () => {
    for (const rows of STREAMS) {
      rows.forEach((row, i) => {
        if (row.difficulty !== "hard" || i === 0) return;
        const before = new Set(through(rows[i - 1]).map(placementKey));
        for (const answer of row.answers) {
          for (const p of normalFits(answer.kind, FACE, row.opening, row.gates)) expect(before.has(placementKey(p))).toBe(false);
        }
      });
    }
  });

  it("raises rows more often as the difficulty climbs", () => {
    const raised = (row: StreamRow): boolean =>
      row.answers.every((answer) => normalFits(answer.kind, FACE, row.opening, row.gates).every((p) => p.hop === 1));
    const rate = (difficulty: Difficulty): number => {
      const of = ROWS.filter((row) => row.difficulty === difficulty);
      return of.filter(raised).length / of.length;
    };
    expect(rate("easy")).toBeLessThan(0.1);
    expect(rate("medium")).toBeGreaterThan(0.05);
    expect(rate("hard")).toBeGreaterThan(rate("medium"));
    expect(rate("hard")).toBeLessThan(0.55);
  });

  it("spaces the rows back to front: the gap from one row's longest vehicle's back to the next row's front", () => {
    for (const rows of STREAMS) {
      expect(Math.abs(rows[0].gap - TUNING.firstWallDepth)).toBeLessThanOrEqual(TUNING.wallJitter);
      for (const row of rows.slice(1)) expect(Math.abs(row.gap - TUNING.wallSpacing)).toBeLessThanOrEqual(TUNING.wallJitter);
    }
  });

  it("brings every row of the ramp to the frog before the finish line, however fast it goes", () => {
    // The fastest frog holds a jump the whole way: it drops at once, and
    // jumps on from when the leap lands, as though it had been jumping from
    // `lead` all along.
    const { dropDistance, dropDuration, wallSpeed } = TUNING;
    const fastest = TUNING.depthStep / TUNING.holdRepeatInterval;
    const lead = dropDistance - fastest * dropDuration;
    for (const rows of STREAMS) {
      let back = 0;
      rows.slice(0, 15).forEach((row, i) => {
        const depth = i === 0 ? row.gap : back + row.gap;
        back = rowBack({ depth, solids: row.solids });
        const meets = Math.max(dropDistance, (depth * fastest + wallSpeed * lead) / (fastest + wallSpeed));
        expect(meets).toBeLessThan(TUNING.courseLength);
      });
    }
  });

  it("keeps a needed gate within the recycling distance of the row that needs it", () => {
    expect(TUNING.recycleBehind).toBeGreaterThanOrEqual(gateReach(TUNING));
    for (const rows of STREAMS) {
      rows.forEach((row, i) => {
        if (!row.needsGate) return;
        const gateAt = rows.slice(0, i).findLastIndex((r) => r.gates.length > 0);
        const between = rows.slice(gateAt + 1, i);
        const distance = row.gap + between.reduce((sum, r) => sum + r.gap + Math.max(...r.solids.map((s) => s.length)), 0);
        expect(distance).toBeLessThanOrEqual(gateReach(TUNING));
      });
    }
    expect(() => rowStream(COURSE_SEED, { ...TUNING, recycleBehind: gateReach(TUNING) - 1 })).toThrow();
  });
});
