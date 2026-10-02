import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cellKey, pieceCells } from "../logic";
import type { Rotation, TetrominoKind } from "../types";
import { DEPTH_RESOLUTION, SURFACE_TOLERANCE } from "../vehicles/parts";
import { faceClashes, spanning, type FaceClash } from "../world/coplanar";
import type { Placement } from "../world/geometry";
import { FROG_LOOKS, FROG_ROLES, FROG_VARIANTS, type FrogVariant } from "./look";
import { GROUND_CLEARANCE } from "../clearance";
import { frogModel, pupilCentre, type FrogEye, type FrogModel, type FrogPart } from "./model";
import {
  BONK_DURATION,
  EYES_SHUT,
  HOP_DURATION,
  LAND_DURATION,
  MOVE_LANDING,
  PUPIL_ORBIT,
  THROAT_PUFF,
  frogMotion,
  type FrogAction,
} from "./motion";

const KINDS: readonly TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const POSES = KINDS.flatMap((kind) => ROTATIONS.map((rotation) => [kind, rotation] as const));

// [left, bottom, right, top], seen head-on.
type Rect = readonly [number, number, number, number];

const faceOf = (part: FrogPart): Rect => [part.min[0], part.min[1], part.max[0], part.max[1]];

function grown(rect: Rect, scale: number): Rect {
  const [x0, y0, x1, y1] = rect;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const [hx, hy] = [((x1 - x0) / 2) * scale, ((y1 - y0) / 2) * scale];
  return [cx - hx, cy - hy, cx + hx, cy + hy];
}

// Whether any of `rect`, shrunk by the surface tolerance all round, lies
// outside every allowed rectangle. It splits the rectangle at every allowed
// edge and checks the middle of each piece.
function pokesOut(rect: Rect, allowed: readonly Rect[]): boolean {
  const t = SURFACE_TOLERANCE;
  const [x0, y0, x1, y1] = [rect[0] + t, rect[1] + t, rect[2] - t, rect[3] - t];
  if (x0 >= x1 || y0 >= y1) return false;
  const cuts = (lo: number, hi: number, edges: number[]): number[] =>
    [...new Set([lo, hi, ...edges.filter((e) => e > lo && e < hi)])].sort((a, b) => a - b);
  const xs = cuts(x0, x1, allowed.flatMap((r) => [r[0], r[2]]));
  const ys = cuts(y0, y1, allowed.flatMap((r) => [r[1], r[3]]));
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const [mx, my] = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      if (!allowed.some((r) => mx > r[0] && mx < r[2] && my > r[1] && my < r[3])) return true;
    }
  }
  return false;
}

function bottomSpan(model: FrogModel): [number, number] {
  const cols = model.cells.filter(({ cell }) => cell.row === 0).map(({ cell }) => cell.col);
  return [Math.min(...cols), Math.max(...cols) + 1];
}

// The frog's cells, lifted by its clearance, and the clearance band under
// its bottom row, where the legs stand.
function allowedSpace(model: FrogModel): Rect[] {
  const c = model.clearance;
  const cells = model.cells.map(({ cell }): Rect => [cell.col, cell.row + c, cell.col + 1, cell.row + 1 + c]);
  const [from, to] = bottomSpan(model);
  return c > 0 ? [...cells, [from, 0, to, c]] : cells;
}

// Where a pupil reaches, head-on, anywhere on its dazed circle.
function pupilReach(eye: FrogEye): Rect {
  const half = [0, 1].map((axis) => (eye.pupil.max[axis] - eye.pupil.min[axis]) / 2);
  const centres = Array.from({ length: 24 }, (_, k) =>
    pupilCentre(eye, { angle: (2 * Math.PI * k) / 24, radius: PUPIL_ORBIT }),
  );
  const xs = centres.map((c) => c[0]);
  const ys = centres.map((c) => c[1]);
  return [Math.min(...xs) - half[0], Math.min(...ys) - half[1], Math.max(...xs) + half[0], Math.max(...ys) + half[1]];
}

// Every part at its furthest reach: the throat fully puffed, the pupils
// anywhere on their dazed circle.
function reaches(model: FrogModel): { name: string; part: FrogPart; rect: Rect }[] {
  const found: { name: string; part: FrogPart; rect: Rect }[] = [];
  for (const { cell, body, details, eyes, throat } of model.cells) {
    const at = cellKey(cell);
    for (const part of [...body, ...details]) found.push({ name: `${at} ${part.role}`, part, rect: faceOf(part) });
    for (const eye of eyes) {
      found.push({ name: `${at} eye bump`, part: eye.bump, rect: faceOf(eye.bump) });
      found.push({ name: `${at} eye white`, part: eye.white, rect: faceOf(eye.white) });
      found.push({ name: `${at} pupil`, part: eye.pupil, rect: faceOf(eye.pupil) });
      found.push({ name: `${at} dazed pupil`, part: eye.pupil, rect: pupilReach(eye) });
    }
    if (throat) found.push({ name: `${at} throat`, part: throat, rect: grown(faceOf(throat), THROAT_PUFF) });
  }
  for (const [i, leg] of model.legs.entries()) {
    for (const part of leg.parts) found.push({ name: `leg ${String(i)}`, part, rect: faceOf(part) });
  }
  return found;
}

// The frog's flat-faced parts as boxes for the face scanner: its cells'
// skin, which carries the cell border, and its marks, belly, mouth and throat.
// A disc is scanned as the box it fills (see the fleet's scan). Balls are
// left out: a ball meets a plane or another ball at a point or along a
// curve, never over an area, so it can't share a plane with anything.
interface ScanBox extends Placement {
  role: FrogPart["role"];
  body: boolean;
  what: string;
}

function scanBoxes(model: FrogModel): ScanBox[] {
  const box = (part: FrogPart, body: boolean, what: string): ScanBox => ({ ...spanning(part.min, part.max), role: part.role, body, what });
  return model.cells.flatMap(({ cell, body, details, throat }) => {
    const at = cellKey(cell);
    return [
      ...body.map((part) => box(part, true, `${at} skin`)),
      ...[...details, ...(throat ? [throat] : [])].map((part) => box(part, false, `${at} ${part.role} ${part.shape}`)),
    ];
  });
}

// The camera never goes below the road, under the frog's legs.
const EYE = { lowest: 0, highest: Infinity };

const fights = ({ a, b }: FaceClash<ScanBox>): boolean => a.body || b.body || a.role !== b.role;

function modelFor(kind: TetrominoKind, rotation: Rotation, variant: FrogVariant, clearance?: number): FrogModel {
  const { markings, pupil } = FROG_LOOKS[variant];
  return frogModel(kind, rotation, { markings, pupil, clearance });
}

describe("the silhouette check", () => {
  const model = modelFor("T", 0, "p1");
  const part = (rect: Rect): FrogPart => ({
    shape: "box",
    min: [rect[0], rect[1], 0],
    max: [rect[2], rect[3], 0.1],
    role: "skin",
  });
  const intrudes = (rect: Rect): boolean => pokesOut(faceOf(part(rect)), allowedSpace(model));

  it("allows a part standing just proud of a cell", () => {
    expect(intrudes([1.2, 1.9, 1.8, 2.28])).toBe(false);
  });

  it("catches a part reaching into an empty cell", () => {
    expect(intrudes([0.2, 1.1, 0.5, 1.6])).toBe(true);
  });

  it("catches a part hanging into the gap under a raised cell", () => {
    expect(intrudes([1.2, 0, 1.5, 0.2])).toBe(false);
    const s = modelFor("S", 0, "p1");
    expect(pokesOut([2.2, 0.9, 2.6, 1.3], allowedSpace(s))).toBe(true);
  });
});

describe.each(FROG_VARIANTS)("the %s frog", (variant) => {
  describe.each(POSES)("as %s in rotation %i", (kind, rotation) => {
    const model = modelFor(kind, rotation, variant);

    it("keeps every part inside its cells and the clearance under them, seen head-on", () => {
      const allowed = allowedSpace(model);
      expect(reaches(model).filter(({ rect }) => pokesOut(rect, allowed)).map(({ name }) => name)).toEqual([]);
    });

    it("keeps every part above the road and within its depth", () => {
      for (const { name, part } of reaches(model)) {
        expect(part.min[1], name).toBeGreaterThanOrEqual(0);
        expect(part.min[2], name).toBeGreaterThanOrEqual(-SURFACE_TOLERANCE);
        expect(part.max[2], name).toBeLessThanOrEqual(model.depth + SURFACE_TOLERANCE);
      }
    });

    it("stands its legs only in the clearance under its bottom row", () => {
      const [from, to] = bottomSpan(model);
      expect(model.legs.length).toBe(4);
      for (const part of model.legs.flatMap((leg) => leg.parts)) {
        expect(part.min[0]).toBeGreaterThanOrEqual(from);
        expect(part.max[0]).toBeLessThanOrEqual(to);
        expect(part.min[1]).toBeGreaterThanOrEqual(0);
        expect(part.max[1]).toBeLessThanOrEqual(model.clearance + 1e-9);
      }
      for (const leg of model.legs) {
        expect(leg.hip[1]).toBeCloseTo(model.clearance);
      }
    });

    it("fills every cell's square head-on with its skin", () => {
      const c = model.clearance;
      for (const { cell, body } of model.cells) {
        const full = body.some(
          (part) =>
            part.min[0] <= cell.col &&
            part.max[0] >= cell.col + 1 &&
            part.min[1] <= cell.row + c &&
            part.max[1] >= cell.row + 1 + c,
        );
        expect(full, cellKey(cell)).toBe(true);
      }
    });

    it("has two eyes on top of its top row, peaking at the top of its cells", () => {
      const eyes = model.cells.flatMap((cell) => cell.eyes.map((eye) => ({ cell: cell.cell, eye })));
      expect(eyes).toHaveLength(2);
      for (const { cell, eye } of eyes) {
        expect(cell.row).toBe(model.height - 1);
        expect(eye.bump.max[1]).toBeCloseTo(model.height + model.clearance);
      }
      expect(model.cells.filter((cell) => cell.throat !== null)).toHaveLength(1);
    });

    it("marks every cell's back the same, so the cells count from behind", () => {
      const counts = model.cells.map(
        ({ details }) => details.filter((part) => part.role === "mark" && part.min[2] >= model.depth).length,
      );
      expect(new Set(counts).size).toBe(1);
      expect(counts[0]).toBeGreaterThan(0);
    });

    it("layers its paints far enough apart for the depth buffer, and never in one plane", () => {
      const clashes = faceClashes(scanBoxes(model), DEPTH_RESOLUTION, EYE).filter(fights);
      expect(clashes.map(({ a, b, gap }) => `${a.what} ~ ${b.what}, ${gap.toFixed(4)} apart`)).toEqual([]);
    });

    it("covers exactly its piece's cells", () => {
      expect(model.cells.map(({ cell }) => cellKey(cell)).sort()).toEqual(
        pieceCells(kind, rotation).map(cellKey).sort(),
      );
    });
  });
});

describe("the clearance", () => {
  it("lifts the frog by what it is given, legs and all", () => {
    for (const clearance of [0.1, 0.4]) {
      for (const [kind, rotation] of POSES) {
        const model = modelFor(kind, rotation, "p1", clearance);
        const allowed = allowedSpace(model);
        expect(reaches(model).filter(({ rect }) => pokesOut(rect, allowed))).toEqual([]);
        for (const part of model.legs.flatMap((leg) => leg.parts)) {
          expect(part.max[1]).toBeLessThanOrEqual(clearance + 1e-9);
        }
      }
    }
  });

  it("leaves a frog with no clearance without legs, resting on the road", () => {
    const model = modelFor("L", 1, "p2", 0);
    expect(model.legs).toEqual([]);
    expect(Math.min(...model.cells.flatMap(({ body }) => body.map((part) => part.min[1])))).toBe(0);
  });

  it("stands in the shared ground clearance by default", () => {
    expect(modelFor("L", 0, "p1").clearance).toBe(GROUND_CLEARANCE);
  });
});

describe("the frog's motion", () => {
  const ACTIONS: readonly FrogAction[] = ["idle", "hop", "land", "bonk"];
  const STRIDE = 0.22;
  const MOVES = [null, ...[0, 0.05, 0.11, 0.2, 0.25, 0.3, 1].map((since) => ({ since, duration: STRIDE }))];
  const times = Array.from({ length: 400 }, (_, i) => i * 0.037);

  it("only ever shrinks the cells, and keeps every motion within its limits", () => {
    const within = (value: number, low: number, high: number): boolean => value >= low && value <= high;
    const broken: string[] = [];
    for (const action of ACTIONS) {
      for (const [since, move] of [0, 0.05, 0.1, 0.2, 0.4, 1, 2].flatMap((since) => MOVES.map((move) => [since, move] as const))) {
        for (const time of times.filter((_, i) => i % 3 === 0)) {
          const m = frogMotion({ time, action, since, seed: 3, move });
          const ok =
            m.cell.every((scale) => within(scale, 0.5, 1)) &&
            within(m.eyeball, EYES_SHUT, 1) &&
            within(m.throat, 1, THROAT_PUFF) &&
            within(m.tuck, 0, 1) &&
            (m.pupilOrbit === null || m.pupilOrbit.radius <= PUPIL_ORBIT);
          if (!ok) broken.push(`${action} since=${String(since)} move=${JSON.stringify(move)} t=${String(time)}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("blinks now and then, at the same moments for the same seed, and out of step for another", () => {
    const shut = (seed: number): boolean[] =>
      times.map((time) => frogMotion({ time, action: "idle", since: 0, seed }).eyeball < 0.8);
    expect(shut(1).some(Boolean)).toBe(true);
    expect(shut(1)).toEqual(shut(1));
    expect(shut(2)).not.toEqual(shut(1));
  });

  it("settles back to idle once an action is over", () => {
    const idle = frogMotion({ time: 1, action: "idle", since: 0, seed: 1 });
    for (const [action, over] of [
      ["land", LAND_DURATION],
      ["bonk", BONK_DURATION],
    ] as const) {
      expect(frogMotion({ time: 1, action, since: over + 0.01, seed: 1 })).toEqual(idle);
    }
  });

  it("tucks its legs away for the whole hop, and puts them down on landing", () => {
    const hop = (since: number) => frogMotion({ time: 1, action: "hop", since, seed: 1 });
    expect(hop(0).tuck).toBe(0);
    expect(hop(HOP_DURATION + 2).tuck).toBe(1);
    expect(hop(HOP_DURATION + 2).cell).toEqual(frogMotion({ time: 1, action: "idle", since: 0, seed: 1 }).cell);
    expect(frogMotion({ time: 1, action: "land", since: 0, seed: 1 }).tuck).toBe(1);
    expect(frogMotion({ time: 1, action: "land", since: LAND_DURATION, seed: 1 }).tuck).toBe(0);
  });

  it("hops a little on a move, legs half up, and settles once it has landed", () => {
    const idle = frogMotion({ time: 1, action: "idle", since: 0, seed: 1 });
    const move = (since: number) => frogMotion({ time: 1, action: "idle", since: 0, seed: 1, move: { since, duration: STRIDE } });
    expect(move(0)).toEqual(idle);
    expect(move(STRIDE / 2).tuck).toBeCloseTo(0.5);
    expect(move(STRIDE / 2).cell[0]).toBeLessThan(idle.cell[0]);
    expect(move(STRIDE + MOVE_LANDING / 2).cell[1]).toBeLessThan(idle.cell[1]);
    expect(move(STRIDE + MOVE_LANDING)).toEqual(idle);
  });

  it("keeps a move's hop from cutting a hop or a bonk short", () => {
    const during = { since: STRIDE / 2, duration: STRIDE };
    expect(frogMotion({ time: 1, action: "hop", since: 1, seed: 1, move: during }).tuck).toBe(1);
    expect(frogMotion({ time: 1, action: "bonk", since: 0.8, seed: 1, move: during }).pupilOrbit).not.toBeNull();
  });

  it("flattens a bonked frog along the road and leaves it dazed", () => {
    const hit = frogMotion({ time: 1, action: "bonk", since: 0, seed: 1 });
    expect(hit.cell[2]).toBeLessThan(0.7);
    expect(frogMotion({ time: 1, action: "bonk", since: 0.8, seed: 1 }).pupilOrbit).not.toBeNull();
  });
});

describe("the frogs' colours", () => {
  const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
  const tokens = new Map(
    [...css.matchAll(/(--color-frogmino-frog-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]),
  );
  const hex = (token: string): string => {
    const value = tokens.get(token);
    if (value === undefined) throw new Error(`${token} is not defined in globals.css`);
    return value;
  };
  const rgb = (value: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
  const distance = (a: string, b: string): number => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const lightness = (value: string): number => {
    const [r, g, b] = rgb(value);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it("defines every token a frog is painted from", () => {
    for (const variant of FROG_VARIANTS) {
      for (const role of FROG_ROLES) expect(hex(FROG_LOOKS[variant].tokens[role])).toMatch(/^#/);
    }
  });

  it("paints each frog's skin, marks, belly and feet its own colours", () => {
    for (const role of ["skin", "mark", "belly", "foot"] as const) {
      const colours = FROG_VARIANTS.map((variant) => hex(FROG_LOOKS[variant].tokens[role]));
      expect(new Set(colours).size, role).toBe(FROG_VARIANTS.length);
    }
  });

  it("tells the partners apart by lightness as well as hue, and by their markings", () => {
    const [p1, p2] = [hex(FROG_LOOKS.p1.tokens.skin), hex(FROG_LOOKS.p2.tokens.skin)];
    expect(distance(p1, p2)).toBeGreaterThan(150);
    expect(Math.abs(lightness(p1) - lightness(p2))).toBeGreaterThan(20);
    expect(FROG_LOOKS.p1.markings).not.toBe(FROG_LOOKS.p2.markings);
    expect(FROG_LOOKS.p1.pupil).not.toBe(FROG_LOOKS.p2.pupil);
  });

  it("keeps every skin well away from Tetris's piece colours", () => {
    const guideline = ["#00f0f0", "#00ffff", "#f0f000", "#ffff00", "#a000f0", "#800080", "#00f000", "#00ff00", "#f00000", "#ff0000", "#0000f0", "#0000ff", "#f0a000", "#ff7f00"];
    for (const variant of FROG_VARIANTS) {
      const skin = hex(FROG_LOOKS[variant].tokens.skin);
      for (const colour of guideline) expect(distance(skin, colour), `${variant} near ${colour}`).toBeGreaterThan(100);
    }
  });
});
