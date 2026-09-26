// The layout pipeline: turns a tree into the card positions and connectors
// the viewer draws. It runs only on the desktop, in the CLI that writes the
// row, because its exact crossing minimization is a CP-SAT solve in a Python
// child process (decross.ts). The page must never import this module.

import { coordSimplex, graphStratify, sugiyama } from "d3-dag";
import type { Graph, Layering, Separation } from "d3-dag";
import { computeGenerations, currentPartnerIds, formerPartnerIds, isCurrentUnion } from "../logic";
import type { LaidOutNode, Layout, Tree, Union, UnionStatus } from "../types";
import { decrossCpSat, type DecrossOptions } from "./decross";

// Wide enough to fit the longest name in the tree on one line
// (Ruth-Anne "Ruthie" Hutchinson, 29 characters).
export const NODE_W = 250;
// Cards are a fixed size (the layout never measures text), so this must fit
// the tallest content: a name wrapped onto two lines, the birth-year chip,
// and the relation line.
export const NODE_H = 90;
export const SPOUSE_GAP = 28;
export const ROW_GAP = 96;
export const SUBTREE_GAP = 72;

// ---------- Layout ----------
//
// Standard genealogical convention: each generation sits on a horizontal row;
// spouses are placed adjacent with a marriage line; parents drop a vertical
// edge from the midpoint of their marriage line down to each child. Both
// spouses' parent couples (when present) appear on the row above with their
// own marriage lines, each connecting down to the matching spouse.
//
// We treat each couple (or singleton person) as a single layer-DAG node and
// hand it to d3-dag's sugiyama pipeline. d3-dag picks the per-layer ordering
// that minimizes edge crossings (exactly, see decross.ts) and the per-couple x via a
// simplex LP that maximizes edge verticality (coordSimplex) — i.e., children
// land directly under their parents whenever the global ordering allows it.
// Because the LP solves all layers jointly, the same simplification handles
// both per-row order and spacing, so descendants of one branch don't end up
// inside another branch's elbow span.

interface CoupleUnit {
  id: string;
  // A chain of unions rendered side by side, each union between neighbours:
  // a singleton, a couple, or a longer chain like [her ex, her, him, his ex].
  // Keeping every union adjacent keeps each marriage line short and makes
  // each child drop emerge from its own parents' marriage midpoint.
  members: string[];
  generation: number;
  // One status per adjacent marriage line; length == members.length - 1.
  // Empty for singletons.
  statuses: UnionStatus[];
}

function childrenOf(tree: Tree, parentId: string): string[] {
  return Object.values(tree.persons)
    .filter((p) => p.parentIds.includes(parentId))
    .map((p) => p.id);
}

function bfsOrder(tree: Tree): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  seen.add(tree.rootId);
  const queue: string[] = [tree.rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const p = tree.persons[id];
    const neighbours = [
      ...p.parentIds,
      ...currentPartnerIds(p),
      ...formerPartnerIds(p),
      ...childrenOf(tree, id),
    ];
    for (const rel of neighbours) {
      if (!seen.has(rel)) {
        seen.add(rel);
        queue.push(rel);
      }
    }
  }
  for (const id of Object.keys(tree.persons)) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}


function buildCoupleUnits(
  tree: Tree,
  order: string[],
  gen: Map<string, number>,
): { couples: CoupleUnit[]; coupleOf: Map<string, string> } {
  const coupleOf = new Map<string, string>();
  const couples: CoupleUnit[] = [];
  for (const id of order) {
    if (coupleOf.has(id)) continue;
    const taken = new Set([id]);
    const nextPartner = (personId: string, preferCurrent: boolean): Union | null => {
      const free = tree.persons[personId].unions.filter(
        (u) => !taken.has(u.personId) && !coupleOf.has(u.personId),
      );
      if (free.length === 0) return null;
      const union =
        free.find((u) => isCurrentUnion(u.status) === preferCurrent) ?? free[0];
      taken.add(union.personId);
      return union;
    };

    // Grow a chain outward from the person: their current partner to the
    // right, an ex to the left, then onward through each end's other
    // partners, so a remarried ex sits between both their partners. Only
    // someone with three or more partners leaves one out of the chain; the
    // post-layout sweep draws that union as a line across the gap.
    const members = [id];
    const statuses: UnionStatus[] = [];
    let right = nextPartner(id, true);
    while (right !== null) {
      members.push(right.personId);
      statuses.push(right.status);
      right = nextPartner(right.personId, true);
    }
    let left = nextPartner(id, false);
    while (left !== null) {
      members.unshift(left.personId);
      statuses.unshift(left.status);
      left = nextPartner(left.personId, false);
    }

    couples.push({
      id,
      members,
      generation: gen.get(id)!,
      statuses,
    });
    for (const member of members) coupleOf.set(member, id);
  }
  return { couples, coupleOf };
}

function coupleWidth(couple: CoupleUnit): number {
  const n = couple.members.length;
  return n * NODE_W + (n - 1) * SPOUSE_GAP;
}

interface LayeredOrdering {
  byGen: Map<number, CoupleUnit[]>;
  sortedGens: number[];
}

function buildLayered(couples: CoupleUnit[]): LayeredOrdering {
  const byGen = new Map<number, CoupleUnit[]>();
  for (const couple of couples) {
    let arr = byGen.get(couple.generation);
    if (arr === undefined) {
      arr = [];
      byGen.set(couple.generation, arr);
    }
    arr.push(couple);
  }
  const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
  return { byGen, sortedGens };
}

interface CoupleData {
  id: string;
  parentIds: string[];
  generation: number;
}

// Force sugiyama's layer assignment to match our tree-generation BFS. Without
// this, the default `layeringSimplex` minimizes total edge length and is free
// to put two couples we render on the same Y (same `gen`) in DIFFERENT sugiyama
// layers — which means coordSimplex's per-layer gap constraints don't apply
// between them, and they can land on top of each other. Setting node.y to a
// shared integer layer index per generation makes every same-generation couple
// share a sugiyama layer, so the LP's width/gap constraints are enforced where
// they're visually needed.
//
// sugifyLayer reads node.uy as an integer layer index in [0, numLayers), where
// numLayers = this function's return value + 1. Setting node.y here writes
// node.uy under the hood (node.y is a throwing view onto node.uy). The `sep`
// argument is irrelevant to integer-layer assignment — the real vertical
// spacing is applied later by sugifyLayer using nodeHeight + gap.
function layeringByGeneration<N extends CoupleData, L>(
  graph: Graph<N, L>,
  _sep: Separation<N, L>,
): number {
  const nodes = [...graph.nodes()];
  if (nodes.length === 0) return 0;
  let minGen = Infinity;
  let maxGen = -Infinity;
  for (const node of nodes) {
    if (node.data.generation < minGen) minGen = node.data.generation;
    if (node.data.generation > maxGen) maxGen = node.data.generation;
  }
  for (const node of nodes) {
    (node as unknown as { y: number }).y = node.data.generation - minGen;
  }
  return maxGen - minGen;
}

const layeringByGenerationOp: Layering<CoupleData, unknown> = layeringByGeneration;

// Hand the couple-DAG to d3-dag's sugiyama pipeline and return the per-couple
// center x. The crossing minimization is exact (decross.ts); coordSimplex then
// assigns x via an LP that pulls children under their parents (subject to
// layer ordering and width/gap constraints). Solver errors propagate:
// swallowing them would disguise a failed solve as a merely ugly layout.
function layoutCouplesViaSugiyama(
  couples: CoupleUnit[],
  parentCouplesOf: Map<string, string[]>,
  options: DecrossOptions,
): Map<string, number> {
  if (couples.length === 0) return new Map();
  const data: CoupleData[] = couples.map((c) => ({
    id: c.id,
    parentIds: parentCouplesOf.get(c.id) ?? [],
    generation: c.generation,
  }));
  const widthById = new Map(couples.map((c) => [c.id, coupleWidth(c)] as const));

  // d3-dag's chained types narrow to <never, never> when decross/coord run
  // before nodeSize, so we cast the assembled layout to a callable that
  // accepts our typed dag. The runtime is unaffected — nodeSize only ever
  // needs node.data.id, which is present on the stratified data.
  const dag = graphStratify()(data);
  const layout = sugiyama()
    .layering(layeringByGenerationOp)
    .decross(decrossCpSat(options))
    .coord(coordSimplex())
    .nodeSize((node: { data: CoupleData }) => [
      widthById.get(node.data.id) ?? NODE_W,
      NODE_H,
    ])
    .gap([SUBTREE_GAP, ROW_GAP]) as unknown as (g: typeof dag) => void;
  layout(dag);
  const result = new Map<string, number>();
  for (const node of dag.nodes()) result.set(node.data.id, node.x);
  return result;
}

// ---------- Elbow row packing ----------
//
// Each parent set in a generation draws a horizontal "sibling bar" at the
// elbow Y, spanning from min(parentMidX, leftmost child mid) to
// max(parentMidX, rightmost child mid). Two bars in the same generation can
// share an elbow row iff their X-intervals don't overlap. We solve this as
// classic interval graph coloring (greedy left-to-right) — provably uses the
// minimum number of rows, which minimizes the row gap dragged into every
// downstream generation. Strict inequality means endpoint-touching bars get
// separate rows so they don't visually merge into one continuous line.

export interface ElbowBarInterval {
  key: string;
  left: number;
  right: number;
}

export interface ElbowRowPacking {
  rowIndexByKey: Map<string, number>;
  rowCount: number;
}

export function packElbowRows(
  intervals: readonly ElbowBarInterval[],
): ElbowRowPacking {
  const sorted = [...intervals].sort((a, b) => a.left - b.left);
  const rowMaxRight: number[] = [];
  const rowIndexByKey = new Map<string, number>();
  for (const iv of sorted) {
    let placed = false;
    for (let i = 0; i < rowMaxRight.length; i++) {
      if (rowMaxRight[i] < iv.left) {
        rowMaxRight[i] = iv.right;
        rowIndexByKey.set(iv.key, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowIndexByKey.set(iv.key, rowMaxRight.length);
      rowMaxRight.push(iv.right);
    }
  }
  return { rowIndexByKey, rowCount: rowMaxRight.length };
}

export function computeLayout(tree: Tree, options: DecrossOptions = {}): Layout {
  const order = bfsOrder(tree);
  const gen = computeGenerations(tree);
  const { couples, coupleOf } = buildCoupleUnits(tree, order, gen);

  // For each couple, the set of distinct parent couples (one per spouse who
  // has parents in the tree). A couple may have 0, 1, or 2 parent couples.
  const parentCouplesOf = new Map<string, string[]>();
  for (const couple of couples) {
    const parents: string[] = [];
    for (const memberId of couple.members) {
      for (const parentId of tree.persons[memberId].parentIds) {
        const pc = coupleOf.get(parentId);
        if (pc !== undefined && pc !== couple.id && !parents.includes(pc)) {
          parents.push(pc);
        }
      }
    }
    parentCouplesOf.set(couple.id, parents);
  }

  // Inverse: for each couple, the child couples it produced.
  const childCouplesOf = new Map<string, string[]>();
  for (const couple of couples) childCouplesOf.set(couple.id, []);
  for (const couple of couples) {
    for (const pcId of parentCouplesOf.get(couple.id) ?? []) {
      const list = childCouplesOf.get(pcId);
      if (list !== undefined && !list.includes(couple.id)) {
        list.push(couple.id);
      }
    }
  }

  const layered = buildLayered(couples);
  const rawCenterX = layoutCouplesViaSugiyama(couples, parentCouplesOf, options);

  // Translate so the leftmost couple's left edge sits at x = 0.
  let minLeftEdge = Infinity;
  for (const couple of couples) {
    const cx = rawCenterX.get(couple.id);
    if (cx === undefined) continue;
    const left = cx - coupleWidth(couple) / 2;
    if (left < minLeftEdge) minLeftEdge = left;
  }
  const shift = isFinite(minLeftEdge) ? -minLeftEdge : 0;
  const centerX = new Map<string, number>();
  for (const [id, x] of rawCenterX) centerX.set(id, x + shift);

  // Sibling-bar elbow Y. Each parent-set gets a horizontal bar at the elbow
  // row connecting parentMidX to its children's columns. Two parent sets in
  // the same generation only need *different* elbow Ys when their bar
  // X-intervals overlap — otherwise they share a row. We solve this as
  // interval graph coloring once node X positions are finalized (further
  // below); for now we just stash the constants and index which parent sets
  // exist per generation. Keying by parent SET — not by couple unit — matters
  // for chains like [ex, person, current]: a kid from the left marriage
  // and a kid from the right marriage share a couple unit but represent
  // different parent sets, and their bars must still be analyzed separately.
  const ELBOW_FIRST_OFFSET = 28;
  const ELBOW_SPACING = 32;
  const ELBOW_LAST_MARGIN = 28;

  const parentSetKey = (ids: readonly string[]): string =>
    [...ids].sort().join("|");

  const parentSetKeysByGen = new Map<number, string[]>();
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0) continue;
    const parentGen = gen.get(person.parentIds[0]) ?? 0;
    const key = parentSetKey(person.parentIds);
    let arr = parentSetKeysByGen.get(parentGen);
    if (arr === undefined) {
      arr = [];
      parentSetKeysByGen.set(parentGen, arr);
    }
    if (!arr.includes(key)) arr.push(key);
  }

  // Filled in after node X positions are finalized — the elbow-row packer
  // needs bar X-intervals, which depend on the child-reorder pass below.
  const yByGen = new Map<number, number>();
  const yFor = (g: number): number => yByGen.get(g) ?? 0;

  const layout: Layout = { nodes: [], edges: [], width: 0, height: 0 };

  // Within-chain ordering: a chain reads the same either way round, so keep
  // or reverse it, whichever puts members nearer their own parents. Doesn't
  // affect couple-level crossings but shortens the parent→spouse drops.
  // Squared distance, because for a couple it reduces to "the spouse whose
  // parents sit further left goes left", which keeps their drops uncrossed.
  const idealFor = (memberId: string): number | null => {
    const xs = tree.persons[memberId].parentIds
      .map((pid) => coupleOf.get(pid))
      .filter((id): id is string => id !== undefined)
      .map((cid) => centerX.get(cid))
      .filter((x): x is number => x !== undefined);
    if (xs.length === 0) return null;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const spouseSideOrder = new Map<string, string[]>();
  for (const couple of couples) {
    const leftX = (centerX.get(couple.id) ?? 0) - coupleWidth(couple) / 2;
    const slotX = (i: number): number =>
      leftX + i * (NODE_W + SPOUSE_GAP) + NODE_W / 2;
    const cost = (sides: readonly string[]): number =>
      sides.reduce((sum, id, i) => {
        const ideal = idealFor(id);
        return ideal === null ? sum : sum + (slotX(i) - ideal) ** 2;
      }, 0);
    const reversed = [...couple.members].reverse();
    spouseSideOrder.set(
      couple.id,
      cost(reversed) < cost(couple.members) ? reversed : [...couple.members],
    );
  }

  // Marriage-aware child reordering. Within each parent couple/cluster, sort
  // children by which marriage produced them so blended families read
  // correctly: e.g. for [Maya, Gary, Marta], Maya's-side kids on the left,
  // Maya+Gary shared kids next, then Gary+Marta shared, then Marta's-side.
  // Rank is the average index of the child's bio parents within the parent
  // cluster's member array, so each marriage's kids sit under it. Limited to leaf children — translating non-leaf subtrees risks
  // descending crossings, which the full marriage-as-DAG refactor handles
  // properly.
  const coupleById = new Map(couples.map((c) => [c.id, c] as const));
  for (const parent of couples) {
    if (parent.members.length < 2) continue;
    const childIds = childCouplesOf.get(parent.id) ?? [];
    if (childIds.length < 2) continue;
    const sides = spouseSideOrder.get(parent.id);
    if (!sides || sides.length < 2) continue;
    const allLeaves = childIds.every(
      (cid) => (childCouplesOf.get(cid) ?? []).length === 0,
    );
    if (!allLeaves) continue;

    const memberIndex = new Map(sides.map((id, i) => [id, i] as const));
    const rankOf = (cid: string): number => {
      const child = coupleById.get(cid);
      if (child === undefined) return 0;
      const indices: number[] = [];
      for (const memberId of child.members) {
        for (const pid of tree.persons[memberId].parentIds) {
          const idx = memberIndex.get(pid);
          if (idx !== undefined) indices.push(idx);
        }
      }
      if (indices.length === 0) return 0;
      return indices.reduce((s, i) => s + i, 0) / indices.length;
    };
    const rankByChild = new Map<string, number>(
      childIds.map((cid) => [cid, rankOf(cid)] as const),
    );

    const oldByX = [...childIds].sort(
      (a, b) => (centerX.get(a) ?? 0) - (centerX.get(b) ?? 0),
    );
    const sortedChildren = [...childIds].sort((a, b) => {
      const diff = (rankByChild.get(a) ?? 0) - (rankByChild.get(b) ?? 0);
      if (diff !== 0) return diff;
      // Stable within a rank: preserve sugiyama's left-to-right order.
      return (centerX.get(a) ?? 0) - (centerX.get(b) ?? 0);
    });
    let unchanged = true;
    for (let i = 0; i < oldByX.length; i++) {
      if (oldByX[i] !== sortedChildren[i]) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) continue;

    // Re-pack the siblings left-to-right in the new order. Earlier code
    // permuted the existing center-x values among siblings, which silently
    // broke spacing whenever the swapped children had different couple
    // widths (e.g. a singleton getting the slot of a 3-member cluster):
    // the destination position was sized for the original occupant, so the
    // new one either overlapped its neighbor or left a giant gap.
    let cursor = Math.min(
      ...oldByX.map((id) => {
        const c = coupleById.get(id);
        return (centerX.get(id) ?? 0) - (c ? coupleWidth(c) : NODE_W) / 2;
      }),
    );
    for (const cid of sortedChildren) {
      const c = coupleById.get(cid);
      const w = c ? coupleWidth(c) : NODE_W;
      centerX.set(cid, cursor + w / 2);
      cursor += w + SUBTREE_GAP;
    }
  }

  // Now that centerX is final, compute each person's center column. This
  // feeds the elbow-row packer below, which measures each parent set's
  // sibling-bar X-interval to decide how many distinct elbow rows the
  // generation actually needs (vs. the old formula that always reserved one
  // row per parent set, dragging the whole canvas down for free).
  const personCenterX = new Map<string, number>();
  for (const couple of couples) {
    const center = centerX.get(couple.id);
    if (center === undefined) continue;
    const leftX = center - coupleWidth(couple) / 2;
    const sides = spouseSideOrder.get(couple.id) ?? couple.members;
    for (let i = 0; i < sides.length; i++) {
      personCenterX.set(
        sides[i],
        leftX + i * (NODE_W + SPOUSE_GAP) + NODE_W / 2,
      );
    }
  }

  const childrenByParentSet = new Map<string, string[]>();
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0) continue;
    const key = parentSetKey(person.parentIds);
    let arr = childrenByParentSet.get(key);
    if (arr === undefined) {
      arr = [];
      childrenByParentSet.set(key, arr);
    }
    arr.push(person.id);
  }

  const parentMidXFromCenters = (ids: readonly string[]): number => {
    if (ids.length === 2) {
      const ax = personCenterX.get(ids[0]);
      const bx = personCenterX.get(ids[1]);
      if (ax === undefined || bx === undefined) return 0;
      return (ax + bx) / 2;
    }
    const x = personCenterX.get(ids[0]);
    return x ?? 0;
  };

  // Build each parent set's sibling-bar X-interval, then split into "free"
  // bars (no overlap with anything else) and "conflicting" bars (overlap or
  // endpoint-touch with at least one other bar). Free bars always render at
  // the midpoint between parents and children — the standard genealogical
  // convention — regardless of what conflicting bars elsewhere in the
  // generation are doing. Only the conflicting bars get packed into rows.
  const intervalsByGen = new Map<number, ElbowBarInterval[]>();
  for (const [parentGen, keys] of parentSetKeysByGen) {
    const intervals: ElbowBarInterval[] = [];
    for (const key of keys) {
      const ids = key.split("|");
      const parentMidX = parentMidXFromCenters(ids);
      const childIds = childrenByParentSet.get(key) ?? [];
      if (childIds.length === 0) continue;
      let minChildX = Infinity;
      let maxChildX = -Infinity;
      for (const cid of childIds) {
        const cx = personCenterX.get(cid);
        if (cx === undefined) continue;
        if (cx < minChildX) minChildX = cx;
        if (cx > maxChildX) maxChildX = cx;
      }
      const left = Math.min(parentMidX, minChildX);
      const right = Math.max(parentMidX, maxChildX);
      intervals.push({ key, left, right });
    }
    intervalsByGen.set(parentGen, intervals);
  }

  const freeKeys = new Set<string>();
  const conflictRowIndexByKey = new Map<string, number>();
  const numConflictRowsByGen = new Map<number, number>();
  for (const [parentGen, intervals] of intervalsByGen) {
    // Two bars conflict iff their X-intervals overlap or touch endpoints.
    // The touch case matches packElbowRows' strict-< placement: an endpoint
    // collision is treated as a conflict so the bars don't visually merge.
    const conflicting = new Set<string>();
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i];
        const b = intervals[j];
        if (Math.max(a.left, b.left) <= Math.min(a.right, b.right)) {
          conflicting.add(a.key);
          conflicting.add(b.key);
        }
      }
    }
    for (const iv of intervals) {
      if (!conflicting.has(iv.key)) freeKeys.add(iv.key);
    }
    const conflictIntervals = intervals.filter((iv) =>
      conflicting.has(iv.key),
    );
    const packing = packElbowRows(conflictIntervals);
    for (const [key, idx] of packing.rowIndexByKey) {
      conflictRowIndexByKey.set(key, idx);
    }
    numConflictRowsByGen.set(parentGen, packing.rowCount);
  }

  // Row gap only needs to grow when conflicting bars stack — free bars all
  // sit at the midpoint and don't add rows.
  const rowGapAfter = (g: number): number => {
    const nRows = numConflictRowsByGen.get(g) ?? 0;
    if (nRows <= 1) return ROW_GAP;
    const required =
      ELBOW_FIRST_OFFSET + (nRows - 1) * ELBOW_SPACING + ELBOW_LAST_MARGIN;
    return Math.max(ROW_GAP, required);
  };

  if (layered.sortedGens.length > 0) {
    yByGen.set(layered.sortedGens[0], 0);
    for (let i = 1; i < layered.sortedGens.length; i++) {
      const prev = layered.sortedGens[i - 1];
      yByGen.set(
        layered.sortedGens[i],
        (yByGen.get(prev) ?? 0) + NODE_H + rowGapAfter(prev),
      );
    }
  }

  for (const couple of couples) {
    const center = centerX.get(couple.id)!;
    const y = yFor(couple.generation);
    const w = coupleWidth(couple);
    const leftX = center - w / 2;
    const sides = spouseSideOrder.get(couple.id) ?? couple.members;
    for (let i = 0; i < sides.length; i++) {
      layout.nodes.push({
        id: sides[i],
        x: leftX + i * (NODE_W + SPOUSE_GAP),
        y,
        w: NODE_W,
        h: NODE_H,
      });
    }
    // One spouse edge per adjacent pair, in drawing order (left to right).
    const statuses =
      sides[0] === couple.members[0] ? couple.statuses : [...couple.statuses].reverse();
    for (let i = 0; i < sides.length - 1; i++) {
      layout.edges.push({
        kind: "spouse",
        aId: sides[i],
        bId: sides[i + 1],
        status: statuses[i],
      });
    }
  }

  // Standard genealogical convention: the elbow sits halfway between parents
  // and children. Free bars (no conflicts) always land on this midpoint.
  // Conflicting bars form a stack centered around the midpoint — the
  // leftmost lands on the topmost row, the next below it, etc. — so the
  // elbow group's visual center stays at the midpoint regardless of how
  // many rows it spans.
  const elbowYByParentSet = new Map<string, number>();
  for (const g of layered.sortedGens) {
    const keys = parentSetKeysByGen.get(g) ?? [];
    if (keys.length === 0) continue;
    const parentBottomY = yFor(g) + NODE_H;
    const midpointY = parentBottomY + rowGapAfter(g) / 2;
    const nConflictRows = numConflictRowsByGen.get(g) ?? 0;
    const stackTopY =
      midpointY - ((nConflictRows - 1) * ELBOW_SPACING) / 2;
    for (const key of keys) {
      if (freeKeys.has(key)) {
        elbowYByParentSet.set(key, midpointY);
        continue;
      }
      const rowIdx = conflictRowIndexByKey.get(key);
      if (rowIdx === undefined) continue;
      elbowYByParentSet.set(key, stackTopY + rowIdx * ELBOW_SPACING);
    }
  }

  // Sweep the unions a chain couldn't hold (someone with three or more
  // partners) and draw each as a line across whatever distance the layout
  // put between the two people, so the relationship stays visible.
  const spouseKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const emittedSpouseKey = new Set<string>();
  for (const couple of couples) {
    for (let i = 0; i < couple.members.length - 1; i++) {
      emittedSpouseKey.add(spouseKey(couple.members[i], couple.members[i + 1]));
    }
  }
  for (const person of Object.values(tree.persons)) {
    for (const union of person.unions) {
      const key = spouseKey(person.id, union.personId);
      if (emittedSpouseKey.has(key)) continue;
      emittedSpouseKey.add(key);
      layout.edges.push({
        kind: "spouse",
        aId: person.id,
        bId: union.personId,
        status: union.status,
      });
    }
  }

  // One parent-child edge per child. The renderer drops from the midpoint of
  // the parents' marriage line (or the lone parent's center) down to the
  // child — so in-laws naturally get their own visible drop into their child.
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0) continue;
    const parentGen = gen.get(person.parentIds[0]) ?? 0;
    const key = parentSetKey(person.parentIds);
    const elbowY =
      elbowYByParentSet.get(key) ?? yFor(parentGen) + NODE_H + ROW_GAP / 2;
    layout.edges.push({
      kind: "parent-child",
      parentAId: person.parentIds[0],
      parentBId: person.parentIds.length === 2 ? person.parentIds[1] : null,
      childId: person.id,
      elbowY,
    });
  }

  layout.width = layout.nodes.reduce(
    (max: number, n: LaidOutNode) => Math.max(max, n.x + n.w),
    0,
  );
  layout.height = layout.nodes.reduce(
    (max: number, n: LaidOutNode) => Math.max(max, n.y + n.h),
    0,
  );
  return layout;
}
