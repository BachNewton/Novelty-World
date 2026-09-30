// Where the connectors between cards are drawn, shared by the renderer and
// the layout (and its tests) so all of them reason about the same lines.

import type { LaidOutEdge, LaidOutNode, Layout } from "./types";

export type ParentChildEdge = Extract<LaidOutEdge, { kind: "parent-child" }>;
export type UnionEdge = Extract<LaidOutEdge, { kind: "spouse" }>;

export interface Point {
  x: number;
  y: number;
}

// ---------- Brackets ----------
//
// A union between two people who aren't neighbours in their chain (someone
// with more partners than a card has sides) is drawn as a bracket under the
// cards between them: down from the bottom of one card, along under the
// cards between, and up into the bottom of the other. Its whole shape is set
// here.
//
// Depths are measured down from the cards' bottom edge. The shallowest
// bracket runs below two rows of heritage chips (about 39px) and the bottom
// corner flags (at most about 22px); each bracket that must pass under
// another runs one step deeper.
export const BRACKET_DEPTH = 44;
export const BRACKET_LEVEL_STEP = 10;
// Where a bracket's leg meets a card, measured in from the card's edge that
// faces the other end: clear of a corner flag (at most about 27px either
// side of the corner) and of the lone-parent drop from the card's bottom
// center. Each level down meets the card a step further in, so a deeper
// bracket's leg stands outside a shallower one's run.
const BRACKET_INSET = 40;
const BRACKET_INSET_STEP = 16;
// A couple joined by a bracket drops their children from the middle of its
// run. With both legs near the facing edges that middle would fall on or
// near a card center or a gap between cards, where other drops leave the
// row. So such a bracket's far leg (into the partner with fewer partners)
// meets that card past its center, by this much: the middle then falls
// about halfway between the columns other drops can use.
const BRACKET_FAR_LEG = 70;
// Brackets stacked this deep would meet a card too close to its center.
export const MAX_BRACKET_LEVELS = 4;

export function bracketDepth(level: number): number {
  return BRACKET_DEPTH + (level - 1) * BRACKET_LEVEL_STEP;
}

// How a union is drawn: a straight line between neighbours at the cards'
// mid-height, or a bracket from `x1` on the left card's bottom edge (at `y`)
// down to `runY`, along, and up to `x2` on the right card's. A bracket whose
// couple has children drops them from `drop`, the middle of its run.
export type UnionPath =
  | { kind: "line"; x1: number; x2: number; y: number }
  | { kind: "bracket"; x1: number; x2: number; y: number; runY: number; drop: Point | null };

// The points a union path runs through, left to right.
export function unionPoints(path: UnionPath): Point[] {
  if (path.kind === "line") {
    return [
      { x: path.x1, y: path.y },
      { x: path.x2, y: path.y },
    ];
  }
  return [
    { x: path.x1, y: path.y },
    { x: path.x1, y: path.runY },
    { x: path.x2, y: path.runY },
    { x: path.x2, y: path.y },
  ];
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface RowUnion {
  aId: string;
  bId: string;
  hasChildren: boolean;
}

// The path of each union in one row of cards, keyed by `pairKey`. Two
// partners are neighbours when no card of the row sits between them. Every
// choice depends only on the people, never on which way round the row runs,
// so a chain drawn reversed draws the mirror image: the layout's crossing
// count relies on that.
export function rowUnionPaths(
  cards: readonly LaidOutNode[],
  unions: readonly RowUnion[],
  partnerCount: (id: string) => number,
): Map<string, UnionPath> {
  const row = [...cards].sort((a, b) => a.x - b.x);
  const slot = new Map(row.map((card, i) => [card.id, i]));
  const card = (id: string): { node: LaidOutNode; slot: number } => {
    const i = slot.get(id);
    if (i === undefined) throw new Error(`A union joins ${id}, who isn't in its row`);
    return { node: row[i], slot: i };
  };

  const paths = new Map<string, UnionPath>();
  const brackets: Array<{ key: string; left: LaidOutNode; right: LaidOutNode; union: RowUnion }> = [];
  for (const union of unions) {
    const a = card(union.aId);
    const b = card(union.bId);
    const [left, right] = a.slot < b.slot ? [a.node, b.node] : [b.node, a.node];
    const key = pairKey(union.aId, union.bId);
    if (Math.abs(a.slot - b.slot) === 1) {
      paths.set(key, { kind: "line", x1: left.x + left.w, x2: right.x, y: left.y + left.h / 2 });
    } else {
      brackets.push({ key, left, right, union });
    }
  }

  const levels = bracketLevels(brackets.map(({ key, left, right }) => ({ key, left: left.x, right: right.x + right.w })));
  brackets.forEach(({ key, left, right, union }, i) => {
    const inset = BRACKET_INSET + (levels[i] - 1) * BRACKET_INSET_STEP;
    let x1 = left.x + left.w - inset;
    let x2 = right.x + inset;
    const y = left.y + left.h;
    const runY = y + bracketDepth(levels[i]);
    if (!union.hasChildren) {
      paths.set(key, { kind: "bracket", x1, x2, y, runY, drop: null });
      return;
    }
    const byPartners = partnerCount(union.aId) - partnerCount(union.bId);
    const farId = byPartners < 0 || (byPartners === 0 && union.aId > union.bId) ? union.aId : union.bId;
    if (farId === left.id) x1 = left.x + left.w / 2 - BRACKET_FAR_LEG;
    else x2 = right.x + right.w / 2 + BRACKET_FAR_LEG;
    paths.set(key, { kind: "bracket", x1, x2, y, runY, drop: { x: (x1 + x2) / 2, y: runY } });
  });
  return paths;
}

// Each bracket's level, from the span of cards it reaches across. Brackets
// whose spans overlap get different levels, the shorter one shallower, so no
// two runs lie along each other. Ties go by the partners, not by position,
// so a mirrored row gets the same levels.
function bracketLevels(spans: ReadonlyArray<{ key: string; left: number; right: number }>): number[] {
  const order = spans
    .map((span, i) => ({ span, i }))
    .sort(
      (a, b) =>
        a.span.right - a.span.left - (b.span.right - b.span.left) || (a.span.key < b.span.key ? -1 : 1),
    );
  const levels = new Array<number>(spans.length).fill(0);
  order.forEach(({ span, i }, k) => {
    let level = 1;
    for (const { span: other, i: j } of order.slice(0, k)) {
      if (Math.max(span.left, other.left) < Math.min(span.right, other.right)) {
        level = Math.max(level, levels[j] + 1);
      }
    }
    if (level > MAX_BRACKET_LEVELS) {
      throw new Error(`A row needs ${level} levels of union brackets, more than a card has room for`);
    }
    levels[i] = level;
  });
  return levels;
}

// Every union's path in a laid-out tree.
export function unionPaths(layout: Layout): (edge: UnionEdge) => UnionPath | null {
  const parentPairs = new Set<string>();
  const partners = new Map<string, number>();
  const unionsByRow = new Map<number, RowUnion[]>();
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  for (const edge of layout.edges) {
    if (edge.kind === "parent-child" && edge.parentBId !== null) {
      parentPairs.add(pairKey(edge.parentAId, edge.parentBId));
    }
  }
  for (const edge of layout.edges) {
    if (edge.kind !== "spouse") continue;
    const a = byId.get(edge.aId);
    if (a === undefined || !byId.has(edge.bId)) continue;
    for (const id of [edge.aId, edge.bId]) partners.set(id, (partners.get(id) ?? 0) + 1);
    const union = { aId: edge.aId, bId: edge.bId, hasChildren: parentPairs.has(pairKey(edge.aId, edge.bId)) };
    unionsByRow.set(a.y, [...(unionsByRow.get(a.y) ?? []), union]);
  }

  const paths = new Map<string, UnionPath>();
  for (const [y, unions] of unionsByRow) {
    const cards = layout.nodes.filter((n) => n.y === y);
    for (const [key, path] of rowUnionPaths(cards, unions, (id) => partners.get(id) ?? 0)) {
      paths.set(key, path);
    }
  }
  return (edge) => paths.get(pairKey(edge.aId, edge.bId)) ?? null;
}

// ---------- Parent-child lines ----------

// A parent-child connector: a drop from the parents to the elbow row, a
// crossbar along it, and a descent to the top center of the child's card.
// Two parents joined by a union drop from the middle of its line, wherever it
// runs: at the cards' mid-height between neighbours, or from the middle of a
// bracket's run. A lone parent, or two with no union between them, drop from
// the bottom of the cards.
export function parentChildPaths(layout: Layout): (edge: ParentChildEdge) => Point[] | null {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const unionOf = unionPaths(layout);
  const unionDrop = new Map<string, Point>();
  for (const edge of layout.edges) {
    if (edge.kind !== "spouse") continue;
    const path = unionOf(edge);
    if (path === null) continue;
    const drop = path.kind === "line" ? { x: (path.x1 + path.x2) / 2, y: path.y } : path.drop;
    if (drop !== null) unionDrop.set(pairKey(edge.aId, edge.bId), drop);
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
      drop = unionDrop.get(pairKey(edge.parentAId, bId)) ?? { x: (left.x + left.w + right.x) / 2, y: a.y + a.h };
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
