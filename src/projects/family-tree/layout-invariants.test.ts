// Behavioral invariants that must hold for any layout `computeLayout`
// produces, run against every fixture in NAMED_FIXTURES. These are hard-
// correctness checks — anything tripping here is a bug, not a quality
// regression. Quality metrics (crossing counts, edge lengths, etc.) live
// elsewhere. The productionTree variant lives in the slow suite because
// the exact solve on its full size takes a few seconds.

import { beforeAll, describe, it, expect } from "vitest";
import { computeLayout } from "./layout/compute-layout";
import { currentPartnerIds } from "./logic";
import type { LaidOutNode, Layout, Tree } from "./types";
import { NAMED_FIXTURES } from "./__fixtures__/trees";

interface Couple {
  members: string[]; // [a] or [a, b]
}

// Reproduce the same couple-pairing rule computeLayout uses internally so
// the spouse-adjacency invariant doesn't false-positive when a person has
// multiple current partners (only the first un-paired one counts as "the" couple).
function pairCouples(tree: Tree): Couple[] {
  const paired = new Set<string>();
  const couples: Couple[] = [];
  for (const id of Object.keys(tree.persons)) {
    if (paired.has(id)) continue;
    const partner = currentPartnerIds(tree.persons[id]).find(
      (sid) => !paired.has(sid),
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
