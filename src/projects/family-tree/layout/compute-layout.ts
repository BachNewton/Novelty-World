// The layout pipeline: turns a tree into the card positions and connectors
// the viewer draws. It runs only on the desktop, in the CLI that writes the
// row, because its exact solves run in CP-SAT in a Python child process
// (decross.ts, coord.ts). The page must never import this module.

import { graphStratify, sugiyama } from "d3-dag";
import type { Graph, Layering, Separation, SugiNode } from "d3-dag";
import { computeGenerations, currentPartnerIds, formerPartnerIds, isCurrentUnion } from "../logic";
import { pairKey, rowUnionPaths } from "../edge-geometry";
import type { LaidOutNode, Layout, Tree, Union, UnionStatus } from "../types";
import { coordWithClearance, type VerticalPiece } from "./coord";
import { countCrossings, decrossCpSat, portGraph, type ChainPorts, type DecrossSolution } from "./decross";
import type { SolverOptions } from "./solver-process";

// Wide enough to fit the longest name in the tree on one line
// (Ruth-Anne "Ruthie" Hutchinson, 29 characters).
export const NODE_W = 250;
// Cards are a fixed size (the layout never measures text), so this must fit
// the tallest content: a name wrapped onto two lines, the birth-year chip,
// and the relation line.
export const NODE_H = 90;
// Wide enough that the heritage flags on a couple's facing corners never
// touch, even two at full size (see flagDiagonal in heritage-badges.tsx).
export const SPOUSE_GAP = 60;
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
// hand it to d3-dag's sugiyama pipeline. The per-layer ordering, and which
// way round each partner chain is drawn, minimize the crossings between the
// drawn lines exactly (decross.ts). The per-couple x comes from a simplex LP
// that maximizes edge verticality (coordSimplex) — i.e., children land
// directly under their parents whenever the global ordering allows it — with
// different families' vertical lines kept apart (coord.ts). Because the LP
// solves all layers jointly, the same simplification handles both per-row
// order and spacing, so descendants of one branch don't end up inside
// another branch's elbow span.

interface CoupleUnit {
  id: string;
  // A chain of partners rendered side by side: a singleton, a couple, or a
  // longer chain like [her ex, her, him, his ex]. Keeping unions between
  // neighbours keeps each marriage line short and makes each child drop
  // emerge from its own parents' marriage midpoint. This is the chain's given
  // order; the layout may draw it reversed.
  members: string[];
  generation: number;
  // Every union between two members: between neighbours, or, for someone
  // with more partners than a card has sides, a bracket under the members
  // between.
  unions: ChainUnion[];
}

interface ChainUnion {
  a: string;
  b: string;
  status: UnionStatus;
  hasChildren: boolean;
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


// Everyone reachable from `start` through `neighbours`, in breadth-first
// order.
function reachable(start: string, neighbours: (id: string) => string[]): string[] {
  const found = [start];
  const seen = new Set(found);
  for (let i = 0; i < found.length; i++) {
    for (const other of neighbours(found[i])) {
      if (seen.has(other)) continue;
      seen.add(other);
      found.push(other);
    }
  }
  return found;
}

// Grows a chain outward from `start` through `unionsOf`: a current partner to
// the right and an ex to the left, then onward through each end's next
// partner, so a remarried ex sits between both their partners. Everyone it
// takes is added to `taken`, and nobody already there is taken again.
function growChain(start: string, unionsOf: (id: string) => Union[], taken: Set<string>): string[] {
  taken.add(start);
  const nextPartner = (personId: string, preferCurrent: boolean): string | null => {
    const free = unionsOf(personId).filter((u) => !taken.has(u.personId));
    if (free.length === 0) return null;
    const union = free.find((u) => isCurrentUnion(u.status) === preferCurrent) ?? free[0];
    taken.add(union.personId);
    return union.personId;
  };
  const members = [start];
  for (let right = nextPartner(start, true); right !== null; right = nextPartner(right, true)) {
    members.push(right);
  }
  for (let left = nextPartner(start, false); left !== null; left = nextPartner(left, false)) {
    members.unshift(left);
  }
  return members;
}

// A chain where someone has more partners than a card has sides, so some
// union can't be between neighbours and is drawn as a bracket. Partners who
// share children come first for the places beside each other: they form runs
// ("blocks"), grown like a chain from the person with the most partners
// first, that stay whole and in order. The chain starts from that person's
// block and grows at its ends by any block with a partner of the end person
// at its own end, current partners first, then the right end before the
// left. When nothing more fits beside an end, the overflow joins:
// the first member's next unplaced partner, with their block, goes at the
// chain end nearest that member (the right on a tie), the partner innermost.
function arrangeOverflowChain(tree: Tree, component: string[], sharesChildren: SharesChildren): string[] {
  const hub = component.reduce((best, id) =>
    tree.persons[id].unions.length > tree.persons[best].unions.length ? id : best,
  );
  const coParentUnions = (id: string): Union[] =>
    tree.persons[id].unions.filter((u) => sharesChildren(id, u.personId));
  const blockOf = new Map<string, string[]>();
  const blocked = new Set<string>();
  for (const id of [hub, ...component]) {
    if (blocked.has(id)) continue;
    const block = growChain(id, coParentUnions, blocked);
    for (const member of block) blockOf.set(member, block);
  }
  const blockFor = (id: string): string[] => {
    const block = blockOf.get(id);
    if (block === undefined) throw new Error(`${id} is outside the partner chain being arranged`);
    return block;
  };

  let chain = [...blockFor(hub)];
  const placed = new Set(chain);
  const freeUnions = (id: string): Union[] =>
    tree.persons[id].unions.filter((u) => !placed.has(u.personId));
  // Adds a partner's block at one end, the partner as near the chain as the
  // block allows.
  const attach = (partnerId: string, atRight: boolean): void => {
    const block = blockFor(partnerId);
    const inward = block.indexOf(partnerId) <= (block.length - 1) / 2 ? block : [...block].reverse();
    chain = atRight ? [...chain, ...inward] : [...[...inward].reverse(), ...chain];
    for (const member of block) placed.add(member);
  };

  while (placed.size < component.length) {
    const beside = [true, false].flatMap((atRight) =>
      freeUnions(atRight ? chain[chain.length - 1] : chain[0])
        .filter((u) => {
          const block = blockFor(u.personId);
          return block[0] === u.personId || block[block.length - 1] === u.personId;
        })
        .map((union) => ({ union, atRight })),
    );
    if (beside.length > 0) {
      const { union, atRight } = beside.find(({ union: u }) => isCurrentUnion(u.status)) ?? beside[0];
      attach(union.personId, atRight);
      continue;
    }
    const i = chain.findIndex((id) => freeUnions(id).length > 0);
    attach(freeUnions(chain[i])[0].personId, chain.length - 1 - i <= i);
  }
  return chain;
}

type SharesChildren = (a: string, b: string) => boolean;

function sharesChildrenIn(tree: Tree): SharesChildren {
  const coParents = new Set<string>();
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 2) coParents.add(pairKey(person.parentIds[0], person.parentIds[1]));
  }
  return (a, b) => coParents.has(pairKey(a, b));
}

function buildCoupleUnits(
  tree: Tree,
  order: string[],
  gen: Map<string, number>,
): { couples: CoupleUnit[]; coupleOf: Map<string, string> } {
  const sharesChildren = sharesChildrenIn(tree);
  const partnersOf = (id: string): string[] => tree.persons[id].unions.map((u) => u.personId);

  const coupleOf = new Map<string, string>();
  const couples: CoupleUnit[] = [];
  for (const id of order) {
    if (coupleOf.has(id)) continue;
    // A chain holds everyone joined to the person through unions, so every
    // union is drawn within one chain. With nobody past two partners the
    // whole of it fits side by side.
    const component = reachable(id, partnersOf);
    const members = component.some((m) => partnersOf(m).length > 2)
      ? arrangeOverflowChain(tree, component, sharesChildren)
      : growChain(id, (m) => tree.persons[m].unions, new Set());
    if (members.length !== component.length) {
      throw new Error(`The partner chain from ${id} left out some of its partners`);
    }

    const unions: ChainUnion[] = [];
    members.forEach((a, i) => {
      for (const union of tree.persons[a].unions) {
        if (members.indexOf(union.personId) <= i) continue;
        unions.push({ a, b: union.personId, status: union.status, hasChildren: sharesChildren(a, union.personId) });
      }
    });
    couples.push({ id, members, generation: gen.get(id)!, unions });
    for (const member of members) coupleOf.set(member, id);
  }
  return { couples, coupleOf };
}

// Where each member's card and each union's line fall with the chain drawn
// in `order`, from the geometry the renderer uses: member i's card is
// centered at i * CHAIN_STEP.
interface ChainGeometry {
  // The x of the line down to the children of `parentIds`, all of them
  // members: the middle of their union's line, or of the cards.
  dropX(parentIds: readonly string[]): number;
  // The same, when the parents are joined by a bracket, else null.
  bracketDropX(parentIds: readonly string[]): number | null;
  // How far below the cards the deepest bracket runs, or 0.
  bracketDepth: number;
  // How many times the chain's brackets cross a line: a drop leaving the
  // row between a bracket's legs, or another bracket whose span interleaves.
  // Only the chain's own lines can meet its brackets, and a reversed chain
  // draws the mirror image, so the count is the chain's own, whatever the
  // order and orientation the solve chooses.
  bracketCrossings: number;
}

const CHAIN_STEP = NODE_W + SPOUSE_GAP;

function chainGeometry(tree: Tree, couple: CoupleUnit, order: readonly string[]): ChainGeometry {
  const centerOf = (id: string): number => order.indexOf(id) * CHAIN_STEP;
  const cards = order.map((id) => ({ id, x: centerOf(id) - NODE_W / 2, y: 0, w: NODE_W, h: NODE_H }));
  const paths = rowUnionPaths(
    cards,
    couple.unions.map((u) => ({ aId: u.a, bId: u.b, hasChildren: u.hasChildren })),
    (id) => tree.persons[id].unions.length,
  );
  let bracketDepth = 0;
  for (const path of paths.values()) {
    if (path.kind === "bracket") bracketDepth = Math.max(bracketDepth, path.runY - NODE_H);
  }
  const bracketDropX = (parentIds: readonly string[]): number | null => {
    const path = parentIds.length === 2 ? paths.get(pairKey(parentIds[0], parentIds[1])) : undefined;
    return path?.kind === "bracket" && path.drop !== null ? path.drop.x : null;
  };
  const dropX = (parentIds: readonly string[]): number =>
    bracketDropX(parentIds) ?? parentIds.reduce((sum, id) => sum + centerOf(id), 0) / parentIds.length;

  const drops = new Map<string, number>();
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0 || !person.parentIds.every((id) => order.includes(id))) continue;
    drops.set([...person.parentIds].sort().join("|"), dropX(person.parentIds));
  }
  const brackets = couple.unions.flatMap((u) => {
    const path = paths.get(pairKey(u.a, u.b));
    return path?.kind === "bracket" ? [{ own: [u.a, u.b].sort().join("|"), ...path }] : [];
  });
  let bracketCrossings = 0;
  for (const bracket of brackets) {
    for (const [family, x] of drops) {
      if (family !== bracket.own && bracket.x1 < x && x < bracket.x2) bracketCrossings++;
    }
  }
  for (const p of brackets) {
    for (const q of brackets) {
      if (p.x1 < q.x1 && q.x1 < p.x2 && p.x2 < q.x2) bracketCrossings++;
    }
  }
  return { dropX, bracketDropX, bracketDepth, bracketCrossings };
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

// A place along a chain in its given order, as a port: a card center is
// twice its member's index, so the midpoint of a marriage between neighbours
// is a whole number too.
function portAt(x: number): number {
  return (2 * x) / CHAIN_STEP;
}

function portOf(couple: CoupleUnit, personId: string): number {
  return 2 * couple.members.indexOf(personId);
}

// The x of a person's card center relative to their chain's center, with the
// chain drawn in the given order.
function memberOffset(couple: CoupleUnit, sides: readonly string[], personId: string): number {
  return -coupleWidth(couple) / 2 + NODE_W / 2 + sides.indexOf(personId) * (NODE_W + SPOUSE_GAP);
}

// Every drawn line between two chains, as (port on the parents' chain, port
// on the child's chain), keyed by the two chains. A line leaves the middle of
// its parents' union line or bracket (or a lone parent) and ends at the
// child's own card. Parents in two different chains are a line from each.
function chainLines(
  tree: Tree,
  couples: CoupleUnit[],
  coupleOf: Map<string, string>,
): Map<string, Array<[number, number]>> {
  const coupleById = new Map(couples.map((c) => [c.id, c] as const));
  const geometry = new Map(couples.map((c) => [c.id, chainGeometry(tree, c, c.members)] as const));
  const lines = new Map<string, Array<[number, number]>>();
  for (const child of Object.values(tree.persons)) {
    const childCouple = coupleById.get(coupleOf.get(child.id) ?? "");
    if (childCouple === undefined) continue;
    const parentsByCouple = new Map<string, string[]>();
    for (const parentId of child.parentIds) {
      const pc = coupleOf.get(parentId);
      if (pc === undefined || pc === childCouple.id) continue;
      parentsByCouple.set(pc, [...(parentsByCouple.get(pc) ?? []), parentId]);
    }
    for (const [pc, parentIds] of parentsByCouple) {
      const parentGeometry = geometry.get(pc);
      if (parentGeometry === undefined) continue;
      const port = portAt(parentGeometry.dropX(parentIds));
      const key = `${pc}>${childCouple.id}`;
      lines.set(key, [...(lines.get(key) ?? []), [port, portOf(childCouple, child.id)]]);
    }
  }
  return lines;
}

interface SugiyamaResult {
  // The proven fewest crossings between the lines to children.
  crossings: number;
  centerX: Map<string, number>;
  // Each chain's members left to right, as drawn.
  sides: Map<string, string[]>;
}

// Hand the couple-DAG to d3-dag's sugiyama pipeline and return the per-couple
// center x and each chain's orientation. The crossing minimization is exact
// (decross.ts); coordWithClearance then assigns x via an LP that pulls
// children under their parents (subject to layer ordering and width/gap
// constraints), re-solved exactly when two families' vertical lines would
// share a column (coord.ts). Solver errors propagate: swallowing them would
// disguise a failed solve as a merely ugly layout.
function layoutCouplesViaSugiyama(
  tree: Tree,
  couples: CoupleUnit[],
  coupleOf: Map<string, string>,
  parentCouplesOf: Map<string, string[]>,
  options: SolverOptions,
): SugiyamaResult {
  if (couples.length === 0) return { crossings: 0, centerX: new Map(), sides: new Map() };
  const data: CoupleData[] = couples.map((c) => ({
    id: c.id,
    parentIds: parentCouplesOf.get(c.id) ?? [],
    generation: c.generation,
  }));
  const coupleById = new Map(couples.map((c) => [c.id, c] as const));
  const coupleFor = (id: string): CoupleUnit => {
    const couple = coupleById.get(id);
    if (couple === undefined) throw new Error(`Layout has no couple ${id}`);
    return couple;
  };
  const coupleOfPerson = (personId: string): CoupleUnit => coupleFor(coupleOf.get(personId) ?? "");
  const widthById = new Map(couples.map((c) => [c.id, coupleWidth(c)] as const));

  const lines = chainLines(tree, couples, coupleOf);
  const ports: ChainPorts<CoupleData> = {
    isChain: (node) => coupleFor(node.id).members.length > 1,
    lines: (source, target) => lines.get(`${source.id}>${target.id}`) ?? [],
  };
  const decross = decrossCpSat<CoupleData, unknown>(ports, options);

  const sides = new Map<string, string[]>();
  // Runs once coordSimplex has placed the chains: settles each chain's
  // orientation, then lists the vertical pieces of every connector so the
  // placement can keep different families' pieces apart.
  const piecesOf = (layers: SugiNode<CoupleData, unknown>[][]): VerticalPiece<CoupleData>[] => {
    const sugiOf = new Map<string, SugiNode<CoupleData, unknown>>();
    const layerOf = new Map<string, number>();
    layers.forEach((layer, L) => {
      for (const node of layer) {
        if (node.data.role !== "node") continue;
        sugiOf.set(node.data.node.data.id, node);
        layerOf.set(node.data.node.data.id, L);
      }
    });
    const sugiFor = (coupleId: string): SugiNode<CoupleData, unknown> => {
      const node = sugiOf.get(coupleId);
      if (node === undefined) throw new Error(`Layout placed no node for couple ${coupleId}`);
      return node;
    };

    orientChains(tree, couples, coupleOf, layers, ports, decross.solution(), sugiFor, sides);
    const sidesOf = (couple: CoupleUnit): string[] => sides.get(couple.id) ?? couple.members;
    const at = (personId: string): { node: SugiNode<CoupleData, unknown>; offset: number } => {
      const couple = coupleOfPerson(personId);
      return { node: sugiFor(couple.id), offset: memberOffset(couple, sidesOf(couple), personId) };
    };
    const rowOf = (personId: string): number => layerOf.get(coupleOfPerson(personId).id) ?? 0;
    // Where the line to children leaves their parents: between them, or,
    // for a couple joined by a bracket, from the middle of its run.
    const dropAt = (parentIds: readonly string[]): Array<{ node: SugiNode<CoupleData, unknown>; offset: number }> => {
      const couple = coupleOfPerson(parentIds[0]);
      const drawn = sidesOf(couple);
      const dropX = chainGeometry(tree, couple, drawn).bracketDropX(parentIds);
      if (dropX === null) return parentIds.map(at);
      return [{ node: sugiFor(couple.id), offset: dropX - ((drawn.length - 1) * CHAIN_STEP) / 2 }];
    };

    // Rows and the gaps between them, in quarters of a row pitch: row L
    // spans [4L, 4L + 2] with its marriage lines at 4L + 1, and the gap below
    // it spans [4L + 2, 4L + 4]. A drop runs from its parents' marriage line
    // (or bracket, under the row) down to its elbow somewhere in the gap; a
    // descent runs from its elbow down to its child's row.
    const pieces: VerticalPiece<CoupleData>[] = [];
    const drops = new Set<string>();
    for (const child of Object.values(tree.persons)) {
      if (child.parentIds.length === 0) continue;
      const family = [...child.parentIds].sort().join("|");
      const parentRow = rowOf(child.parentIds[0]);
      const childRow = rowOf(child.id);
      if (childRow <= parentRow) continue;
      if (!drops.has(family)) {
        drops.add(family);
        pieces.push({ family, at: dropAt(child.parentIds), from: 4 * parentRow + 1, to: 4 * parentRow + 4 });
      }
      pieces.push({ family, at: [at(child.id)], from: 4 * parentRow + 2, to: 4 * childRow });
    }
    return pieces;
  };

  // d3-dag's chained types narrow to <never, never> when decross/coord run
  // before nodeSize, so we cast the assembled layout to a callable that
  // accepts our typed dag. The runtime is unaffected — nodeSize only ever
  // needs node.data.id, which is present on the stratified data.
  const dag = graphStratify()(data);
  const layout = sugiyama()
    .layering(layeringByGenerationOp)
    .decross(decross.decross)
    .coord(coordWithClearance<CoupleData, unknown>(piecesOf, options))
    .nodeSize((node: { data: CoupleData }) => [
      widthById.get(node.data.id) ?? NODE_W,
      NODE_H,
    ])
    .gap([SUBTREE_GAP, ROW_GAP]) as unknown as (g: typeof dag) => void;
  layout(dag);
  const centerX = new Map<string, number>();
  for (const node of dag.nodes()) centerX.set(node.data.id, node.x);
  return { crossings: decross.solution().crossings, centerX, sides };
}

// Which way round each chain is drawn. The solver already chose the
// orientations that minimize crossings; where flipping a chain costs no
// crossing, it is drawn whichever way puts its members nearer their own
// parents. Squared distance, because for a couple it reduces to "the spouse
// whose parents sit further left goes left".
function orientChains(
  tree: Tree,
  couples: CoupleUnit[],
  coupleOf: Map<string, string>,
  layers: SugiNode<CoupleData, unknown>[][],
  ports: ChainPorts<CoupleData>,
  solution: DecrossSolution<CoupleData>,
  sugiFor: (coupleId: string) => SugiNode<CoupleData, unknown>,
  sides: Map<string, string[]>,
): void {
  const reversed = new Set(solution.reversed);
  const graph = portGraph(layers, ports);
  const crossings = (): number => countCrossings(graph, (L, i) => reversed.has(layers[L][i]));

  const idealFor = (memberId: string): number | null => {
    const xs = tree.persons[memberId].parentIds
      .map((pid) => coupleOf.get(pid))
      .filter((id): id is string => id !== undefined)
      .map((cid) => sugiFor(cid).x);
    if (xs.length === 0) return null;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };

  for (const couple of couples) {
    if (couple.members.length < 2) continue;
    const node = sugiFor(couple.id);
    const leftX = node.x - coupleWidth(couple) / 2;
    const slotX = (i: number): number => leftX + i * (NODE_W + SPOUSE_GAP) + NODE_W / 2;
    const cost = (order: readonly string[]): number =>
      order.reduce((sum, id, i) => {
        const ideal = idealFor(id);
        return ideal === null ? sum : sum + (slotX(i) - ideal) ** 2;
      }, 0);
    const toggle = (): void => {
      if (reversed.has(node)) reversed.delete(node);
      else reversed.add(node);
    };
    const drawn = (): string[] =>
      reversed.has(node) ? [...couple.members].reverse() : [...couple.members];
    if (cost([...drawn()].reverse()) < cost(drawn())) {
      toggle();
      if (crossings() > solution.crossings) toggle();
    }
    sides.set(couple.id, drawn());
  }
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

export function computeLayout(tree: Tree, options: SolverOptions = {}): Layout {
  return solveLayout(tree, options).layout;
}

// A layout with the crossings it draws: `lineCrossings` between lines to
// children, the proven optimum of the exact solve, and `bracketCrossings`,
// where brackets cross lines, which no choice of the solve can change.
export interface SolvedLayout {
  layout: Layout;
  lineCrossings: number;
  bracketCrossings: number;
}

export function solveLayout(tree: Tree, options: SolverOptions = {}): SolvedLayout {
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

  const layered = buildLayered(couples);
  const { crossings: lineCrossings, centerX: rawCenterX, sides: spouseSideOrder } = layoutCouplesViaSugiyama(
    tree,
    couples,
    coupleOf,
    parentCouplesOf,
    options,
  );

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
  // Between a bracket's run and the highest elbow row below it.
  const BRACKET_CLEARANCE = 16;

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

  // Filled in further below — the elbow-row packer needs bar X-intervals,
  // measured from each person's final center column.
  const yByGen = new Map<number, number>();
  const yFor = (g: number): number => yByGen.get(g) ?? 0;

  const layout: Layout = { nodes: [], edges: [], width: 0, height: 0 };

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

  // Each chain's unions as drawn: where couples drop their children, and how
  // deep its brackets run under the row.
  const drawnGeometry = new Map(
    couples.map((c) => [c.id, chainGeometry(tree, c, spouseSideOrder.get(c.id) ?? c.members)] as const),
  );
  const geometryOf = (coupleId: string): ChainGeometry => {
    const geometry = drawnGeometry.get(coupleId);
    if (geometry === undefined) throw new Error(`Layout has no couple ${coupleId}`);
    return geometry;
  };
  const bracketDepthByGen = new Map<number, number>();
  for (const couple of couples) {
    const depth = geometryOf(couple.id).bracketDepth;
    bracketDepthByGen.set(couple.generation, Math.max(bracketDepthByGen.get(couple.generation) ?? 0, depth));
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

  // A bracketed couple's drop, measured in its chain's geometry from the
  // center of the chain's leftmost card.
  const bracketDropX = (ids: readonly string[]): number | null => {
    const couple = couples.find((c) => c.members.includes(ids[0]));
    if (couple === undefined) return null;
    const x = geometryOf(couple.id).bracketDropX(ids);
    const leftmost = personCenterX.get((spouseSideOrder.get(couple.id) ?? couple.members)[0]);
    return x === null || leftmost === undefined ? null : leftmost + x;
  };

  const parentMidXFromCenters = (ids: readonly string[]): number => {
    const bracketDrop = bracketDropX(ids);
    if (bracketDrop !== null) return bracketDrop;
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
  // sit at the midpoint and don't add rows — or to keep the elbow rows below
  // the brackets that run under the row.
  const rowGapAfter = (g: number): number => {
    const nRows = numConflictRowsByGen.get(g) ?? 0;
    const bracketDepth = bracketDepthByGen.get(g) ?? 0;
    const forBrackets =
      bracketDepth > 0 ? 2 * (bracketDepth + BRACKET_CLEARANCE) + (Math.max(nRows, 1) - 1) * ELBOW_SPACING : 0;
    if (nRows <= 1) return Math.max(ROW_GAP, forBrackets);
    const required =
      ELBOW_FIRST_OFFSET + (nRows - 1) * ELBOW_SPACING + ELBOW_LAST_MARGIN;
    return Math.max(ROW_GAP, required, forBrackets);
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
    // One spouse edge per union, left partner first, in drawing order:
    // by the left partner, then the nearer right partner.
    const drawnUnions = couple.unions
      .map((u) => {
        const [ia, ib] = [sides.indexOf(u.a), sides.indexOf(u.b)];
        return ia < ib ? { left: ia, right: ib, status: u.status } : { left: ib, right: ia, status: u.status };
      })
      .sort((a, b) => a.left - b.left || a.right - b.right);
    for (const { left, right, status } of drawnUnions) {
      layout.edges.push({ kind: "spouse", aId: sides[left], bId: sides[right], status });
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

  // One parent-child edge per child. The renderer drops from the middle of
  // the parents' union line or bracket (or the lone parent's center) down to
  // the child — so in-laws naturally get their own visible drop into their
  // child.
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
  // The bottom row's brackets run below its cards.
  layout.height = couples.reduce(
    (max, c) => Math.max(max, yFor(c.generation) + NODE_H + geometryOf(c.id).bracketDepth),
    0,
  );
  const bracketCrossings = couples.reduce((sum, c) => sum + geometryOf(c.id).bracketCrossings, 0);
  return { layout, lineCrossings, bracketCrossings };
}
