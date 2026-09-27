// Where the connectors between cards are drawn, shared by the renderer and
// the layout tests so both reason about the same lines.

import type { LaidOutEdge, LaidOutNode, Layout } from "./types";

export type ParentChildEdge = Extract<LaidOutEdge, { kind: "parent-child" }>;

export interface Point {
  x: number;
  y: number;
}

// A union's line runs between the two cards at mid-height, whether the cards
// are neighbours or far apart.
export function unionLine(a: LaidOutNode, b: LaidOutNode): { x1: number; x2: number; y: number } {
  return { x1: a.x + a.w, x2: b.x, y: a.y + a.h / 2 };
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// A parent-child connector: a drop from the parents to the elbow row, a
// crossbar along it, and a descent to the top center of the child's card.
// Two parents joined by a union line drop from the middle of that line; a
// lone parent, or two with no union between them, drop from the bottom of
// the cards.
export function parentChildPaths(layout: Layout): (edge: ParentChildEdge) => Point[] | null {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const unionY = new Map<string, number>();
  for (const edge of layout.edges) {
    if (edge.kind !== "spouse") continue;
    const a = byId.get(edge.aId);
    const b = byId.get(edge.bId);
    if (a !== undefined && b !== undefined) unionY.set(pairKey(edge.aId, edge.bId), unionLine(a, b).y);
  }

  return (edge) => {
    const child = byId.get(edge.childId);
    const a = byId.get(edge.parentAId);
    if (child === undefined || a === undefined) return null;
    const bId = edge.parentBId;
    const b = bId === null ? undefined : byId.get(bId);
    let drop: Point;
    if (bId === null || b === undefined) {
      drop = { x: a.x + a.w / 2, y: a.y + a.h };
    } else {
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      drop = {
        x: (left.x + left.w + right.x) / 2,
        y: unionY.get(pairKey(edge.parentAId, bId)) ?? a.y + a.h,
      };
    }
    const childX = child.x + child.w / 2;
    return [
      drop,
      { x: drop.x, y: edge.elbowY },
      { x: childX, y: edge.elbowY },
      { x: childX, y: child.y },
    ];
  };
}
