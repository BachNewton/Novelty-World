// Behavioral invariants that must hold for any layout `computeLayout`
// produces, run against every fixture in NAMED_FIXTURES. These are hard-
// correctness checks — anything tripping here is a bug, not a quality
// regression. Quality metrics (crossing counts, edge lengths, etc.) live
// elsewhere. The productionTree variant lives in the slow suite because
// the exact solve on its full size takes a few seconds.

import { beforeAll, describe, it, expect } from "vitest";
import {
  BRACKET_DEPTH,
  parentChildPaths,
  rowUnionPaths,
  unionPaths,
  unionPoints,
  type Point,
  type UnionPath,
} from "./edge-geometry";
import { LINE_CLEARANCE } from "./layout/coord";
import { NODE_W, SPOUSE_GAP, computeLayout } from "./layout/compute-layout";
import { currentPartnerIds } from "./logic";
import type { LaidOutNode, Layout, Tree } from "./types";
import {
  NAMED_FIXTURES,
  fourPartners,
  remarriedExes,
  threeCoParents,
  threeExes,
  widowerWithInLaws,
} from "./__fixtures__/trees";

interface Couple {
  members: string[]; // [a] or [a, b]
}

// Reproduce the same couple-pairing rule computeLayout uses internally so
// the spouse-adjacency invariant doesn't false-positive when a person has
// multiple current partners (only the first un-paired one counts as "the" couple).
// Someone with more partners than a card has sides may have their current
// partner at the end of the chain, joined by a bracket, so they're left out.
function pairCouples(tree: Tree): Couple[] {
  const paired = new Set<string>();
  const couples: Couple[] = [];
  const overflows = (id: string): boolean => tree.persons[id].unions.length > 2;
  for (const id of Object.keys(tree.persons)) {
    if (paired.has(id)) continue;
    const partner = currentPartnerIds(tree.persons[id]).find(
      (sid) => !paired.has(sid) && !overflows(id) && !overflows(sid),
    );
    couples.push({ members: partner !== undefined ? [id, partner] : [id] });
    paired.add(id);
    if (partner !== undefined) paired.add(partner);
  }
  return couples;
}

function nodeMap(layout: Layout): Map<string, LaidOutNode> {
  return new Map(layout.nodes.map((n) => [n.id, n]));
}

function rectsOverlap(a: LaidOutNode, b: LaidOutNode): boolean {
  const xOverlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x);
  const yOverlap = !(a.y + a.h <= b.y || b.y + b.h <= a.y);
  return xOverlap && yOverlap;
}

// The vertical pieces of every parent-child connector: each family's drop
// from its parents, and each child's descent from the elbow row.
interface VerticalSegment {
  family: string;
  label: string;
  x: number;
  top: number;
  bottom: number;
}

function verticalSegments(layout: Layout): VerticalSegment[] {
  const pathOf = parentChildPaths(layout);
  const segments: VerticalSegment[] = [];
  for (const edge of layout.edges) {
    if (edge.kind !== "parent-child") continue;
    const path = pathOf(edge);
    if (path === null) throw new Error(`no path for ${edge.childId}'s line`);
    const [dropTop, elbowAtDrop, elbowAtChild, childTop] = path;
    const family = [edge.parentAId, edge.parentBId ?? ""].sort().join("|");
    segments.push(
      { family, label: `the drop from ${family}`, x: dropTop.x, top: dropTop.y, bottom: elbowAtDrop.y },
      { family, label: `the descent to ${edge.childId}`, x: childTop.x, top: elbowAtChild.y, bottom: childTop.y },
    );
  }
  return segments;
}

// Pairs of parent-child lines between the same two rows that cross: one
// leaves its parents left of the other's but reaches its child right of it.
function lineCrossings(layout: Layout): Array<[string, string]> {
  const pathOf = parentChildPaths(layout);
  const lines = layout.edges.flatMap((edge) => {
    if (edge.kind !== "parent-child") return [];
    const path = pathOf(edge);
    if (path === null) throw new Error(`no path for ${edge.childId}'s line`);
    const top = path[0];
    const bottom = path[path.length - 1];
    return [{ child: edge.childId, top, bottom }];
  });
  const crossings: Array<[string, string]> = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (a.top.y !== b.top.y || a.bottom.y !== b.bottom.y) continue;
      if ((a.top.x - b.top.x) * (a.bottom.x - b.bottom.x) < 0) crossings.push([a.child, b.child]);
    }
  }
  return crossings;
}

// Every union drawn as a bracket.
interface DrawnBracket {
  aId: string;
  bId: string;
  path: Extract<UnionPath, { kind: "bracket" }>;
}

function brackets(layout: Layout): DrawnBracket[] {
  const pathOf = unionPaths(layout);
  return layout.edges.flatMap((edge) => {
    if (edge.kind !== "spouse") return [];
    const path = pathOf(edge);
    if (path === null) throw new Error(`no path for the union of ${edge.aId} and ${edge.bId}`);
    return path.kind === "bracket" ? [{ aId: edge.aId, bId: edge.bId, path }] : [];
  });
}

// The segments of a polyline.
function segments(points: Point[]): Array<[Point, Point]> {
  return points.slice(1).map((p, i) => [points[i], p]);
}

// Whether a horizontal and a vertical segment meet, ends included.
function meet(s: [Point, Point], t: [Point, Point]): boolean {
  const crosses = ([h1, h2]: [Point, Point], [v1, v2]: [Point, Point]): boolean =>
    h1.y === h2.y &&
    v1.x === v2.x &&
    Math.min(h1.x, h2.x) <= v1.x &&
    v1.x <= Math.max(h1.x, h2.x) &&
    Math.min(v1.y, v2.y) <= h1.y &&
    h1.y <= Math.max(v1.y, v2.y);
  return crosses(s, t) || crosses(t, s);
}

export function defineLayoutInvariants(name: string, build: () => Tree): void {
  let tree: Tree;
  let layout: Layout;
  // 180s mirrors layout-snapshot.slow.test.ts — the exact solve on
  // productionTree takes seconds, past the vitest 10s default for hooks.
  beforeAll(() => {
    tree = build();
    layout = computeLayout(tree);
  }, 180_000);

  it("places every person in the tree", () => {
    const placed = new Set(layout.nodes.map((n) => n.id));
    const expected = Object.keys(tree.persons);
    expect(placed.size).toBe(expected.length);
    for (const id of expected) {
      expect(placed.has(id)).toBe(true);
    }
  });

  it("does not overlap any two nodes", () => {
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        if (rectsOverlap(a, b)) {
          throw new Error(
            `${name}: nodes overlap: ${a.id} (${a.x},${a.y}) vs ${b.id} (${b.x},${b.y})`,
          );
        }
      }
    }
  });

  it("places spouses on the same y, adjacent in x", () => {
    const byId = nodeMap(layout);
    for (const couple of pairCouples(tree)) {
      if (couple.members.length !== 2) continue;
      const [aId, bId] = couple.members;
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (a === undefined || b === undefined) continue;
      expect(a.y, `${name}: spouse y mismatch ${aId}/${bId}`).toBe(b.y);
      // Adjacent in x: the gap between the inner edges should match
      // SPOUSE_GAP for a couple. Don't hard-code the constant; just check
      // no other node sits between them.
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const innerGap = right.x - (left.x + left.w);
      expect(innerGap, `${name}: spouses too far apart`).toBeLessThan(64);
      for (const other of layout.nodes) {
        if (other.id === aId || other.id === bId) continue;
        if (other.y !== a.y) continue;
        const between =
          other.x + other.w > left.x + left.w && other.x < right.x;
        if (between) {
          throw new Error(
            `${name}: ${other.id} sits between spouses ${aId} and ${bId}`,
          );
        }
      }
    }
  });

  it("never runs two families' vertical lines down the same column", () => {
    // Two families' lines on one column read as one family: a married-in
    // spouse under their in-laws' drop looks like one more of their children.
    const segments = verticalSegments(layout);
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i];
        const b = segments[j];
        if (a.family === b.family) continue;
        const sameColumn = Math.abs(a.x - b.x) < LINE_CLEARANCE;
        const spansMeet = a.top <= b.bottom && b.top <= a.bottom;
        if (sameColumn && spansMeet) {
          throw new Error(`${name}: ${a.label} and ${b.label} share the column at x=${a.x}`);
        }
      }
    }
  });

  it("draws every union once", () => {
    const drawn = new Map<string, number>();
    for (const edge of layout.edges) {
      if (edge.kind !== "spouse") continue;
      const key = [edge.aId, edge.bId].sort().join("|");
      drawn.set(key, (drawn.get(key) ?? 0) + 1);
    }
    for (const person of Object.values(tree.persons)) {
      for (const union of person.unions) {
        expect(drawn.get([person.id, union.personId].sort().join("|")), `${name}: ${person.id}'s union`).toBe(1);
      }
    }
  });

  it("joins partners who share children side by side unless one has children by three partners", () => {
    const coParents = (id: string): number =>
      tree.persons[id].unions.filter((u) =>
        Object.values(tree.persons).some((c) => c.parentIds.includes(id) && c.parentIds.includes(u.personId)),
      ).length;
    for (const { aId, bId, path } of brackets(layout)) {
      if (path.drop === null) continue;
      expect(
        Math.max(coParents(aId), coParents(bId)),
        `${name}: ${aId} and ${bId} share children but aren't side by side`,
      ).toBeGreaterThan(2);
    }
  });

  it("runs each bracket under its row, clear of the cards and of the elbow rows below", () => {
    for (const { aId, bId, path } of brackets(layout)) {
      const row = layout.nodes.filter((n) => n.y + n.h === path.y);
      // Under the chips and flags of every card it passes.
      expect(path.runY - path.y, `${name}: ${aId}-${bId} bracket depth`).toBeGreaterThanOrEqual(BRACKET_DEPTH);
      for (const card of layout.nodes) {
        const runThrough =
          path.x1 < card.x + card.w && card.x < path.x2 && card.y <= path.runY && path.runY <= card.y + card.h;
        expect(runThrough, `${name}: the ${aId}-${bId} bracket runs through ${card.id}`).toBe(false);
      }
      // Each leg meets its own partner's card, away from its corners and
      // from its center, where a lone parent's drop leaves.
      for (const x of [path.x1, path.x2]) {
        const card = row.find((n) => n.x < x && x < n.x + n.w);
        if (card === undefined || (card.id !== aId && card.id !== bId)) {
          throw new Error(`${name}: a leg of the ${aId}-${bId} bracket meets no partner's card`);
        }
        expect(Math.min(x - card.x, card.x + card.w - x), `${name}: leg near ${card.id}'s corner`).toBeGreaterThanOrEqual(30);
        expect(Math.abs(x - (card.x + card.w / 2)), `${name}: leg near ${card.id}'s center`).toBeGreaterThanOrEqual(
          LINE_CLEARANCE,
        );
      }
      // The elbow rows of the gap below keep clear under the run.
      for (const edge of layout.edges) {
        if (edge.kind !== "parent-child" || !row.some((n) => n.id === edge.parentAId)) continue;
        if (edge.elbowY < path.runY + 16) {
          throw new Error(`${name}: ${edge.childId}'s elbow row is too close under the ${aId}-${bId} bracket`);
        }
      }
    }
  });

  it("crosses a bracket only with drops leaving its row between its legs, or an interleaved bracket", () => {
    const pathOf = parentChildPaths(layout);
    const drawn = brackets(layout);
    for (const { aId, bId, path } of drawn) {
      const own = [aId, bId].sort().join("|");
      const bracketSegments = segments(unionPoints(path));
      for (const edge of layout.edges) {
        if (edge.kind !== "parent-child") continue;
        if ([edge.parentAId, edge.parentBId ?? ""].sort().join("|") === own) continue;
        const line = pathOf(edge);
        if (line === null) throw new Error(`no path for ${edge.childId}'s line`);
        segments(line).forEach((segment, i) => {
          if (!bracketSegments.some((s) => meet(s, segment))) return;
          const [top] = segment;
          const dropFromRow = i === 0 && top.y <= path.y && path.x1 < top.x && top.x < path.x2;
          if (!dropFromRow) throw new Error(`${name}: ${edge.childId}'s line crosses the ${aId}-${bId} bracket`);
        });
      }
      for (const other of drawn) {
        if (other.path === path || other.path.y !== path.y) continue;
        const crosses = bracketSegments.some((s) => segments(unionPoints(other.path)).some((t) => meet(s, t)));
        const [p, q] = [path, other.path];
        const interleaved = (p.x1 < q.x1 && q.x1 < p.x2 && p.x2 < q.x2) || (q.x1 < p.x1 && p.x1 < q.x2 && q.x2 < p.x2);
        if (crosses && !interleaved) {
          throw new Error(`${name}: the ${aId}-${bId} and ${other.aId}-${other.bId} brackets cross`);
        }
      }
    }
  });

  it("keeps bracket legs out of every family's column", () => {
    const pieces = verticalSegments(layout);
    for (const { aId, bId, path } of brackets(layout)) {
      for (const x of [path.x1, path.x2]) {
        for (const piece of pieces) {
          const spansMeet = piece.top <= path.runY && path.y <= piece.bottom;
          if (spansMeet && Math.abs(piece.x - x) < LINE_CLEARANCE) {
            throw new Error(`${name}: a leg of the ${aId}-${bId} bracket shares a column with ${piece.label}`);
          }
        }
      }
    }
  });

  it("places every child below their parents", () => {
    const byId = nodeMap(layout);
    for (const person of Object.values(tree.persons)) {
      const child = byId.get(person.id);
      if (child === undefined) continue;
      for (const parentId of person.parentIds) {
        const parent = byId.get(parentId);
        if (parent === undefined) continue;
        expect(
          child.y,
          `${name}: child ${person.id} not below parent ${parentId}`,
        ).toBeGreaterThan(parent.y);
      }
    }
  });

  it("references only existing nodes from edges", () => {
    const ids = new Set(layout.nodes.map((n) => n.id));
    for (const edge of layout.edges) {
      if (edge.kind === "spouse") {
        expect(ids.has(edge.aId)).toBe(true);
        expect(ids.has(edge.bId)).toBe(true);
      } else {
        expect(ids.has(edge.parentAId)).toBe(true);
        if (edge.parentBId !== null) {
          expect(ids.has(edge.parentBId)).toBe(true);
        }
        expect(ids.has(edge.childId)).toBe(true);
      }
    }
  });

  it(
    "is deterministic across repeated runs",
    { timeout: 180_000 },
    () => {
      const a = computeLayout(build());
      const b = computeLayout(build());
      const fmt = (l: Layout): string =>
        l.nodes
          .slice()
          .sort((x, y) => (x.id < y.id ? -1 : 1))
          .map((n) => `${n.id}:${n.x},${n.y}`)
          .join("|");
      expect(fmt(b)).toBe(fmt(a));
    },
  );

  it("reports width and height that bound every node", () => {
    for (const n of layout.nodes) {
      expect(n.x + n.w).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.h).toBeLessThanOrEqual(layout.height);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
  });
}

describe.each(Object.entries(NAMED_FIXTURES))(
  "computeLayout invariants — %s",
  (name, build) => {
    defineLayoutInvariants(name, build);
  },
);

describe("chain orientation", () => {
  it("draws a chain the way round that keeps its members' lines from crossing", () => {
    // Drawn as [late wife, widower, new wife], the late wife's parents' line would cross
    // The widower's parents' line; reversed, nothing crosses.
    const layout = computeLayout(widowerWithInLaws());
    expect(lineCrossings(layout)).toEqual([]);
  });
});

describe("partners past a card's two sides", () => {
  // The members of a row left to right.
  const rowOf = (layout: Layout, id: string): string[] => {
    const y = layout.nodes.find((n) => n.id === id)?.y;
    return layout.nodes
      .filter((n) => n.y === y)
      .sort((a, b) => a.x - b.x)
      .map((n) => n.id);
  };
  // A row read from whichever end puts `first` nearer the left.
  const readFrom = (row: string[], first: string): string[] =>
    row.indexOf(first) <= row.length - 1 - row.indexOf(first) ? row : [...row].reverse();
  const bracketOf = (layout: Layout, a: string, b: string): DrawnBracket | undefined =>
    brackets(layout).find((x) => [x.aId, x.bId].sort().join("|") === [a, b].sort().join("|"));
  const dropOf = (layout: Layout, childId: string): Point => {
    const edge = layout.edges.find((e) => e.kind === "parent-child" && e.childId === childId);
    if (edge?.kind !== "parent-child") throw new Error(`no line to ${childId}`);
    const path = parentChildPaths(layout)(edge);
    if (path === null) throw new Error(`no path to ${childId}`);
    return path[0];
  };
  const cardsUnder = (layout: Layout, bracket: DrawnBracket): string[] =>
    layout.nodes
      .filter((n) => n.y + n.h === bracket.path.y && bracket.path.x1 < n.x && n.x + n.w < bracket.path.x2)
      .map((n) => n.id);

  it("puts a third ex-wife at the end of the chain, bracketed under the one who shares a child", () => {
    const layout = computeLayout(threeExes());
    expect(readFrom(rowOf(layout, "hub"), "ex1")).toEqual(["ex1", "hub", "ex2", "ex3"]);
    const bracket = bracketOf(layout, "hub", "ex3");
    expect(bracket).toBeDefined();
    if (bracket === undefined) return;
    expect(cardsUnder(layout, bracket)).toEqual(["ex2"]);
    expect(bracket.path.drop).toBeNull();
    const edge = layout.edges.find((e) => e.kind === "spouse" && e.aId === bracket.aId && e.bId === bracket.bId);
    expect(edge?.kind === "spouse" ? edge.status : undefined).toBe("divorced");
    // The shared child hangs from the union line between neighbours.
    const hub = layout.nodes.find((n) => n.id === "hub")!;
    expect(dropOf(layout, "kid").y).toBe(hub.y + hub.h / 2);
  });

  it("drops the children of a bracketed couple from the middle of its run, apart from every other drop", () => {
    const layout = computeLayout(threeCoParents());
    const row = readFrom(rowOf(layout, "hub"), "a");
    expect(row).toEqual(["a", "hub", "c", "b"]);
    const bracket = bracketOf(layout, "hub", "b");
    if (bracket?.path.drop == null) throw new Error("expected hub and b joined by a bracket with a drop");
    const { drop, x1, x2, runY } = bracket.path;
    expect(drop).toEqual({ x: (x1 + x2) / 2, y: runY });
    for (const kid of ["bKid"]) expect(dropOf(layout, kid)).toEqual(drop);
    for (const kid of ["aKid", "cKid", "cKid2"]) expect(dropOf(layout, kid).y).toBeLessThan(runY);
    // Clear of the card it passes under, whose own children's line would
    // leave from its center, and of every other couple's drop.
    const c = layout.nodes.find((n) => n.id === "c")!;
    const columns = [c.x + c.w / 2, ...["aKid", "cKid"].map((kid) => dropOf(layout, kid).x)];
    for (const x of columns) expect(Math.abs(drop.x - x)).toBeGreaterThanOrEqual(LINE_CLEARANCE);
    // Its elbow row lies below the run.
    const edge = layout.edges.find((e) => e.kind === "parent-child" && e.childId === "bKid");
    expect(edge?.kind === "parent-child" && edge.elbowY > runY).toBe(true);
  });

  it("sends a fourth partner to the other end, so each overflow joins at the nearer end", () => {
    const layout = computeLayout(fourPartners());
    const row = readFrom(rowOf(layout, "hub"), "d");
    expect(row).toEqual(["d", "b", "hub", "a", "c"]);
    expect(bracketOf(layout, "hub", "c")?.path.drop).not.toBeNull();
    expect(bracketOf(layout, "hub", "d")?.path.drop).toBeNull();
    expect(dropOf(layout, "cKid")).toEqual(bracketOf(layout, "hub", "c")?.path.drop);
  });

  it("keeps a remarried ex between both husbands, and an overflow ex's own family on its own line", () => {
    const layout = computeLayout(remarriedExes());
    expect(readFrom(rowOf(layout, "hub"), "ex3New")).toEqual(["ex3New", "ex3", "ex2", "hub", "ex1", "ex1New"]);
    const bracket = bracketOf(layout, "hub", "ex3");
    if (bracket === undefined) throw new Error("expected hub and ex3 joined by a bracket");
    expect(cardsUnder(layout, bracket)).toEqual(["ex2"]);
    const ex3 = layout.nodes.find((n) => n.id === "ex3")!;
    expect(dropOf(layout, "ex3Kid")).toEqual({ x: ex3.x - SPOUSE_GAP / 2, y: ex3.y + ex3.h / 2 });
  });

  it("draws a reversed row as the mirror image, as the crossing count assumes", () => {
    const cards = ["a", "hub", "c", "b", "e"].map((id, i) => ({ id, x: i * 310, y: 0, w: NODE_W, h: 90 }));
    const unions = [
      { aId: "hub", bId: "a", hasChildren: true },
      { aId: "hub", bId: "c", hasChildren: true },
      { aId: "hub", bId: "b", hasChildren: true },
      { aId: "hub", bId: "e", hasChildren: false },
    ];
    const partners = (id: string): number => (id === "hub" ? 4 : 1);
    const width = 4 * 310 + NODE_W;
    const mirrored = cards.map((card) => ({ ...card, x: width - card.x - card.w }));
    const paths = rowUnionPaths(cards, unions, partners);
    const mirrorPaths = rowUnionPaths(mirrored, unions, partners);
    for (const [key, path] of paths) {
      const flip = (x: number): number => width - x;
      const expected =
        path.kind === "line"
          ? { ...path, x1: flip(path.x2), x2: flip(path.x1) }
          : { ...path, x1: flip(path.x2), x2: flip(path.x1), drop: path.drop && { ...path.drop, x: flip(path.drop.x) } };
      expect(mirrorPaths.get(key), key).toEqual(expected);
    }
  });
});
