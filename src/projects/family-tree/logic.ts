import {
  coordSimplex,
  decrossOpt,
  decrossTwoLayer,
  graphStratify,
  sugiyama,
} from "d3-dag";
import type {
  Gender,
  LaidOutEdge,
  LaidOutNode,
  Layout,
  Person,
  Tree,
} from "./types";

export const NODE_W = 160;
export const NODE_H = 64;
export const SPOUSE_GAP = 28;
export const ROW_GAP = 96;
export const SUBTREE_GAP = 72;

export const ROOT_ID = "kyle-hutchinson";
export const ROOT_NAME = "Kyle Hutchinson";

export function createInitialTree(): Tree {
  return {
    rootId: ROOT_ID,
    persons: {
      [ROOT_ID]: {
        id: ROOT_ID,
        name: ROOT_NAME,
        gender: "M",
        parentIds: [],
        spouseIds: [],
      },
    },
  };
}

function clone(tree: Tree): Tree {
  const persons: Record<string, Person> = {};
  for (const [id, p] of Object.entries(tree.persons)) {
    persons[id] = { ...p, parentIds: [...p.parentIds], spouseIds: [...p.spouseIds] };
  }
  return { rootId: tree.rootId, persons };
}

export function addParent(
  tree: Tree,
  childId: string,
  newId: string,
  name: string,
  gender: Gender,
): Tree {
  const next = clone(tree);
  const child = next.persons[childId];
  if (child.parentIds.length >= 2) return tree;
  next.persons[newId] = {
    id: newId,
    name,
    gender,
    parentIds: [],
    spouseIds: [],
  };
  child.parentIds.push(newId);

  if (child.parentIds.length === 2) {
    const otherParentId = child.parentIds.find((p) => p !== newId)!;
    const otherParent = next.persons[otherParentId];
    const newParent = next.persons[newId];
    if (!otherParent.spouseIds.includes(newId)) {
      otherParent.spouseIds.push(newId);
      newParent.spouseIds.push(otherParentId);
    }
  }
  return next;
}

export function addChild(
  tree: Tree,
  parentId: string,
  newId: string,
  name: string,
  gender: Gender,
): Tree {
  const next = clone(tree);
  const parent = next.persons[parentId];
  const parents = [parentId];
  if (parent.spouseIds.length > 0) parents.push(parent.spouseIds[0]);
  next.persons[newId] = {
    id: newId,
    name,
    gender,
    parentIds: parents,
    spouseIds: [],
  };
  return next;
}

export function addSpouse(
  tree: Tree,
  personId: string,
  newId: string,
  name: string,
  gender: Gender,
): Tree {
  const next = clone(tree);
  const person = next.persons[personId];
  next.persons[newId] = {
    id: newId,
    name,
    gender,
    parentIds: [],
    spouseIds: [personId],
  };
  person.spouseIds.push(newId);
  // Without divorce in the model, marrying X means becoming the second
  // parent of any of X's children who only have X listed.
  for (const candidate of Object.values(next.persons)) {
    if (
      candidate.parentIds.length === 1 &&
      candidate.parentIds[0] === personId
    ) {
      candidate.parentIds.push(newId);
    }
  }
  return next;
}

export function renamePerson(tree: Tree, id: string, name: string): Tree {
  const next = clone(tree);
  next.persons[id].name = name;
  return next;
}

export function setGender(tree: Tree, id: string, gender: Gender): Tree {
  const next = clone(tree);
  next.persons[id].gender = gender;
  return next;
}

export function deletePerson(tree: Tree, id: string): Tree {
  if (id === tree.rootId) return tree;
  const next = clone(tree);
  delete next.persons[id];
  for (const p of Object.values(next.persons)) {
    p.parentIds = p.parentIds.filter((pid) => pid !== id);
    p.spouseIds = p.spouseIds.filter((sid) => sid !== id);
  }
  return next;
}

// Reconcile any children who only list one parent when that parent has a
// (single) spouse — the spouse becomes the second parent. This heals data
// written before addSpouse propagated to existing single-parent kids.
// `changed` reports whether any normalization actually modified the input,
// so callers can decide whether to persist the fix back.
export function normalizeTree(raw: unknown): { tree: Tree; changed: boolean } {
  const t = raw as Tree;
  let changed = false;
  const persons: Record<string, Person> = {};
  for (const [id, person] of Object.entries(t.persons)) {
    persons[id] = {
      id: person.id,
      name: person.name,
      gender: person.gender,
      parentIds: [...person.parentIds],
      spouseIds: [...person.spouseIds],
    };
  }
  for (const child of Object.values(persons)) {
    if (child.parentIds.length !== 1) continue;
    const onlyParent = persons[child.parentIds[0]];
    if (onlyParent.spouseIds.length === 1) {
      child.parentIds.push(onlyParent.spouseIds[0]);
      changed = true;
    }
  }
  return { tree: { rootId: t.rootId, persons }, changed };
}

// ---------- Relations ----------

// Walk the parent DAG breadth-first and record the shortest distance
// from `id` up to every reachable ancestor (including `id` at distance 0).
function ancestorsWithDistance(tree: Tree, id: string): Map<string, number> {
  const result = new Map<string, number>();
  result.set(id, 0);
  let frontier: string[] = [id];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const nextFrontier: string[] = [];
    for (const cur of frontier) {
      const person = tree.persons[cur];
      for (const parentId of person.parentIds) {
        if (!result.has(parentId)) {
          result.set(parentId, depth);
          nextFrontier.push(parentId);
        }
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

interface BloodPath {
  distFrom: number;
  distTo: number;
}

// Find the most-recent common ancestor of `from` and `to`. Returns the
// generation distances from each (0 means the person itself).
function findBloodPath(tree: Tree, fromId: string, toId: string): BloodPath | null {
  const fromAnc = ancestorsWithDistance(tree, fromId);
  const toAnc = ancestorsWithDistance(tree, toId);
  let best: BloodPath | null = null;
  for (const [id, distTo] of toAnc) {
    const distFrom = fromAnc.get(id);
    if (distFrom === undefined) continue;
    const sum = distFrom + distTo;
    if (best === null || sum < best.distFrom + best.distTo) {
      best = { distFrom, distTo };
    }
  }
  return best;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function pickByGender(gender: Gender, male: string, female: string, neutral: string): string {
  if (gender === "M") return male;
  if (gender === "F") return female;
  return neutral;
}

function ancestorTerm(distance: number, gender: Gender): string {
  if (distance === 1) return pickByGender(gender, "father", "mother", "parent");
  const base = pickByGender(gender, "grandfather", "grandmother", "grandparent");
  const greats = "great-".repeat(Math.max(0, distance - 2));
  return greats + base;
}

function descendantTerm(distance: number, gender: Gender): string {
  if (distance === 1) return pickByGender(gender, "son", "daughter", "child");
  const base = pickByGender(gender, "grandson", "granddaughter", "grandchild");
  const greats = "great-".repeat(Math.max(0, distance - 2));
  return greats + base;
}

function siblingTerm(gender: Gender): string {
  return pickByGender(gender, "brother", "sister", "sibling");
}

function auntUncleTerm(greats: number, gender: Gender): string {
  const base = pickByGender(gender, "uncle", "aunt", "aunt/uncle");
  return greats === 0 ? base : "great-".repeat(greats) + base;
}

function nieceNephewTerm(greats: number, gender: Gender): string {
  const base = pickByGender(gender, "nephew", "niece", "niece/nephew");
  if (greats === 0) return base;
  // grandniece (one generation deeper than niece), great-grandniece, etc.
  const grandBase = pickByGender(
    gender,
    "grandnephew",
    "grandniece",
    "grandniece/nephew",
  );
  return "great-".repeat(greats - 1) + grandBase;
}

function cousinTerm(degree: number, removed: number): string {
  const base = `${ordinal(degree)} cousin`;
  if (removed === 0) return base;
  if (removed === 1) return `${base} once removed`;
  if (removed === 2) return `${base} twice removed`;
  return `${base} ${removed} times removed`;
}

function classifyBlood(path: BloodPath, gender: Gender): string | null {
  const { distFrom, distTo } = path;
  if (distFrom === 0 && distTo === 0) return null;
  if (distFrom === 0) return descendantTerm(distTo, gender);
  if (distTo === 0) return ancestorTerm(distFrom, gender);
  if (distFrom === 1 && distTo === 1) return siblingTerm(gender);
  // P is descendant of R's ancestor (sibling of an ancestor's lineage)
  if (distFrom === 1) return nieceNephewTerm(distTo - 2, gender);
  if (distTo === 1) return auntUncleTerm(distFrom - 2, gender);
  // Both > 1: cousins
  const degree = Math.min(distFrom, distTo) - 1;
  const removed = Math.abs(distFrom - distTo);
  return cousinTerm(degree, removed);
}

function spouseTerm(gender: Gender): string {
  return pickByGender(gender, "husband", "wife", "spouse");
}

function siblingInLawTerm(gender: Gender): string {
  return pickByGender(gender, "brother-in-law", "sister-in-law", "sibling-in-law");
}

function parentInLawTerm(gender: Gender): string {
  return pickByGender(gender, "father-in-law", "mother-in-law", "parent-in-law");
}

function childInLawTerm(gender: Gender): string {
  return pickByGender(gender, "son-in-law", "daughter-in-law", "child-in-law");
}

export interface Relation {
  label: string | null;
  isSelf: boolean;
}

// Internal: try every "single-name" rule and return a label if one fits,
// otherwise return null. The chain fallback below uses this to collapse
// long paths into idiomatic English ("brother-in-law's wife" rather than
// "wife's brother's wife").
function describeStructured(
  tree: Tree,
  rootId: string,
  targetId: string,
): string | null {
  if (targetId === rootId) return null;

  const root = tree.persons[rootId];
  const target = tree.persons[targetId];

  // 1. Direct spouse.
  if (root.spouseIds.includes(targetId)) return spouseTerm(target.gender);

  // 2. Blood relation.
  const blood = findBloodPath(tree, rootId, targetId);
  if (blood !== null) return classifyBlood(blood, target.gender);

  // 3. Sibling-in-law: spouse of any sibling, or sibling of any spouse.
  for (const spouseId of root.spouseIds) {
    const path = findBloodPath(tree, spouseId, targetId);
    if (path !== null && path.distFrom === 1 && path.distTo === 1) {
      return siblingInLawTerm(target.gender);
    }
  }
  for (const targetSpouseId of target.spouseIds) {
    const path = findBloodPath(tree, rootId, targetSpouseId);
    if (path !== null && path.distFrom === 1 && path.distTo === 1) {
      return siblingInLawTerm(target.gender);
    }
  }

  // 4. Parent-in-law: parent of any spouse.
  for (const spouseId of root.spouseIds) {
    const path = findBloodPath(tree, spouseId, targetId);
    if (path !== null && path.distFrom === 1 && path.distTo === 0) {
      return parentInLawTerm(target.gender);
    }
  }

  // 5. Child-in-law: spouse of any child.
  for (const targetSpouseId of target.spouseIds) {
    const path = findBloodPath(tree, rootId, targetSpouseId);
    if (path !== null && path.distFrom === 0 && path.distTo === 1) {
      return childInLawTerm(target.gender);
    }
  }

  // 6. Through one of root's spouses to a blood relative of that spouse.
  for (const spouseId of root.spouseIds) {
    const path = findBloodPath(tree, spouseId, targetId);
    if (path === null) continue;
    const inner = classifyBlood(path, target.gender);
    if (inner !== null) {
      const spouseGender = tree.persons[spouseId].gender;
      return `${spouseTerm(spouseGender)}'s ${inner}`;
    }
  }

  // 7. Target is married into the family — spouse of root's blood relative.
  // English folds spouses-of-aunts/uncles into "aunt"/"uncle" themselves, so
  // gender-flip when the inner relation is an aunt/uncle (or great-).
  for (const targetSpouseId of target.spouseIds) {
    const path = findBloodPath(tree, rootId, targetSpouseId);
    if (path === null) continue;
    if (path.distTo === 1 && path.distFrom > 1) {
      return classifyBlood(path, target.gender);
    }
    const inner = classifyBlood(path, tree.persons[targetSpouseId].gender);
    if (inner !== null) return `${inner}'s ${spouseTerm(target.gender)}`;
  }

  return null;
}

export function describeRelation(
  tree: Tree,
  rootId: string,
  targetId: string,
): Relation {
  if (targetId === rootId) return { label: null, isSelf: true };
  const structured = describeStructured(tree, rootId, targetId);
  if (structured !== null) return { label: structured, isSelf: false };
  const chain = chainLabel(tree, rootId, targetId);
  return { label: chain, isSelf: false };
}

interface ChainStep {
  edge: "parent" | "child" | "spouse";
  fromId: string;
  toId: string;
}

function buildChildrenIndex(tree: Tree): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const p of Object.values(tree.persons)) {
    for (const parentId of p.parentIds) {
      const list = idx.get(parentId);
      if (list === undefined) {
        idx.set(parentId, [p.id]);
      } else {
        list.push(p.id);
      }
    }
  }
  return idx;
}

function shortestPath(tree: Tree, fromId: string, toId: string): ChainStep[] | null {
  if (fromId === toId) return [];
  const childrenIdx = buildChildrenIndex(tree);
  const prev = new Map<string, ChainStep>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === toId) break;
    const person = tree.persons[cur];

    const visit = (otherId: string, edge: ChainStep["edge"]): void => {
      if (visited.has(otherId)) return;
      visited.add(otherId);
      prev.set(otherId, { edge, fromId: cur, toId: otherId });
      queue.push(otherId);
    };

    for (const parentId of person.parentIds) visit(parentId, "parent");
    for (const childId of childrenIdx.get(cur) ?? []) visit(childId, "child");
    for (const spouseId of person.spouseIds) visit(spouseId, "spouse");
  }

  if (!visited.has(toId)) return null;

  const path: ChainStep[] = [];
  let curId = toId;
  while (curId !== fromId) {
    const step = prev.get(curId);
    if (step === undefined) return null;
    path.unshift(step);
    curId = step.fromId;
  }
  return path;
}

// Walk the shortest path greedily: at each anchor, advance to the FARTHEST
// person whose relation to the anchor has a structured (single-term) label.
// The chain is the join of those labels, e.g. "brother-in-law's wife" rather
// than "wife's brother's wife".
function chainLabel(tree: Tree, fromId: string, toId: string): string | null {
  const path = shortestPath(tree, fromId, toId);
  if (path === null || path.length === 0) return null;

  const persons = [fromId, ...path.map((s) => s.toId)];
  const parts: string[] = [];
  let anchorIdx = 0;

  while (anchorIdx < persons.length - 1) {
    const anchorId = persons[anchorIdx];
    let bestIdx = -1;
    let bestLabel: string | null = null;
    for (let i = anchorIdx + 1; i < persons.length; i++) {
      const label = describeStructured(tree, anchorId, persons[i]);
      if (label !== null) {
        bestIdx = i;
        bestLabel = label;
      }
    }
    if (bestLabel === null) {
      // Single-edge fallback — should be rare since direct edges always
      // produce a structured label, but stay defensive.
      const step = path[anchorIdx];
      const next = tree.persons[persons[anchorIdx + 1]];
      bestLabel =
        step.edge === "parent"
          ? pickByGender(next.gender, "father", "mother", "parent")
          : step.edge === "child"
            ? pickByGender(next.gender, "son", "daughter", "child")
            : spouseTerm(next.gender);
      bestIdx = anchorIdx + 1;
    }
    parts.push(bestLabel);
    anchorIdx = bestIdx;
  }

  if (parts.length === 0) return null;
  return parts.join("'s ");
}

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
// that minimizes edge crossings (decrossOpt) and the per-couple x via a
// simplex LP that maximizes edge verticality (coordSimplex) — i.e., children
// land directly under their parents whenever the global ordering allows it.
// Because the LP solves all layers jointly, the same simplification handles
// both per-row order and spacing, so descendants of one branch don't end up
// inside another branch's elbow span.

interface CoupleUnit {
  id: string;
  members: string[]; // [primary] or [primary, partner]
  generation: number;
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
      ...p.spouseIds,
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

function computeGenerations(tree: Tree): Map<string, number> {
  const childrenIdx = buildChildrenIndex(tree);
  const gen = new Map<string, number>();
  gen.set(tree.rootId, 0);
  const queue: string[] = [tree.rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    const person = tree.persons[id];
    const visit = (otherId: string, otherGen: number): void => {
      if (gen.has(otherId)) return;
      gen.set(otherId, otherGen);
      queue.push(otherId);
    };
    for (const parentId of person.parentIds) visit(parentId, g - 1);
    for (const spouseId of person.spouseIds) visit(spouseId, g);
    for (const childId of childrenIdx.get(id) ?? []) visit(childId, g + 1);
  }
  for (const id of Object.keys(tree.persons)) {
    if (!gen.has(id)) gen.set(id, 0);
  }
  return gen;
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
    const p = tree.persons[id];
    const partner = p.spouseIds.find((sid) => !coupleOf.has(sid)) ?? null;
    couples.push({
      id,
      members: partner !== null ? [id, partner] : [id],
      generation: gen.get(id)!,
    });
    coupleOf.set(id, id);
    if (partner !== null) coupleOf.set(partner, id);
  }
  return { couples, coupleOf };
}

function coupleWidth(couple: CoupleUnit): number {
  return couple.members.length === 2 ? 2 * NODE_W + SPOUSE_GAP : NODE_W;
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

export type DecrossStrategy = "opt" | "two-layer";

// Hand the couple-DAG to d3-dag's sugiyama pipeline and return the per-couple
// center x. The decross strategy picks the layer ordering: "opt" minimizes
// crossings via an integer program (slow but optimal — exponential worst case);
// "two-layer" is a fast barycenter heuristic (good enough for a progressive
// first pass while the optimal pass runs). coordSimplex assigns x via an LP
// that pulls children under their parents (subject to the layer ordering and
// width/gap constraints).
// Returns null on failure (degenerate graph the LP solver can't handle); the
// caller falls back to a flat per-layer placement.
function layoutCouplesViaSugiyama(
  couples: CoupleUnit[],
  parentCouplesOf: Map<string, string[]>,
  strategy: DecrossStrategy,
): Map<string, number> | null {
  if (couples.length === 0) return null;
  interface CoupleData { id: string; parentIds: string[] }
  const data: CoupleData[] = couples.map((c) => ({
    id: c.id,
    parentIds: parentCouplesOf.get(c.id) ?? [],
  }));
  const widthById = new Map(couples.map((c) => [c.id, coupleWidth(c)] as const));

  try {
    // d3-dag's chained types narrow to <never, never> when decross/coord run
    // before nodeSize, so we cast the assembled layout to a callable that
    // accepts our typed dag. The runtime is unaffected — nodeSize only ever
    // needs node.data.id, which is present on the stratified data.
    const dag = graphStratify()(data);
    // `slow` lets the LP solver attempt graphs the default `fast` check
    // would refuse.
    const decross = strategy === "opt"
      ? decrossOpt().check("slow")
      : decrossTwoLayer();
    const layout = sugiyama()
      .decross(decross)
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
  } catch {
    return null;
  }
}

// Last-resort placement when sugiyama bails: walk each generation top-to-
// bottom and place couples left-to-right with minimum gap, in BFS order. Bad
// crossings, but avoids dropping nodes from the render.
function fallbackLayout(
  couples: CoupleUnit[],
  layered: LayeredOrdering,
  fallbackOrder: Map<string, number>,
): Map<string, number> {
  const centerX = new Map<string, number>();
  for (const g of layered.sortedGens) {
    const layer = (layered.byGen.get(g) ?? []).slice().sort(
      (a, b) => (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0),
    );
    let cursor = 0;
    for (const c of layer) {
      const w = coupleWidth(c);
      centerX.set(c.id, cursor + w / 2);
      cursor += w + SUBTREE_GAP;
    }
  }
  // Disconnected couples (shouldn't happen for a normally-built tree).
  let extraCursor = 0;
  for (const x of centerX.values()) extraCursor = Math.max(extraCursor, x);
  for (const c of couples) {
    if (centerX.has(c.id)) continue;
    const w = coupleWidth(c);
    centerX.set(c.id, extraCursor + SUBTREE_GAP + w / 2);
    extraCursor += w + SUBTREE_GAP;
  }
  return centerX;
}

export interface ComputeLayoutOptions {
  decross?: DecrossStrategy;
}

export function computeLayout(
  tree: Tree,
  options: ComputeLayoutOptions = {},
): Layout {
  const decross: DecrossStrategy = options.decross ?? "opt";
  const order = bfsOrder(tree);
  const gen = computeGenerations(tree);
  const { couples, coupleOf } = buildCoupleUnits(tree, order, gen);

  const orderIndex = new Map<string, number>();
  order.forEach((id, i) => { orderIndex.set(id, i); });
  const fallbackOrder = new Map<string, number>();
  for (const couple of couples) {
    fallbackOrder.set(couple.id, orderIndex.get(couple.id) ?? 0);
  }

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
  const sugiyamaCenterX = layoutCouplesViaSugiyama(
    couples,
    parentCouplesOf,
    decross,
  );
  const rawCenterX =
    sugiyamaCenterX ?? fallbackLayout(couples, layered, fallbackOrder);

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

  // Each parent couple gets its own elbow row (so child-drops from different
  // parents don't visually merge). We need at least ELBOW_FIRST_OFFSET below
  // the parent for the topmost elbow, ELBOW_SPACING between elbows, and
  // ELBOW_LAST_MARGIN below the bottommost elbow before the child top. When
  // a generation has many parent couples this grows the row gap dynamically.
  const ELBOW_FIRST_OFFSET = 28;
  const ELBOW_SPACING = 32;
  const ELBOW_LAST_MARGIN = 28;

  const rowGapAfter = (g: number): number => {
    const inGen = layered.byGen.get(g) ?? [];
    const numParentCouples = inGen.filter(
      (c) => (childCouplesOf.get(c.id) ?? []).length > 0,
    ).length;
    if (numParentCouples <= 1) return ROW_GAP;
    const required =
      ELBOW_FIRST_OFFSET +
      (numParentCouples - 1) * ELBOW_SPACING +
      ELBOW_LAST_MARGIN;
    return Math.max(ROW_GAP, required);
  };

  const yByGen = new Map<number, number>();
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
  const yFor = (g: number): number => yByGen.get(g) ?? 0;

  const layout: Layout = { nodes: [], edges: [], width: 0, height: 0 };

  // Within-couple spouse ordering: place each spouse on the side closer to
  // their own parents. Doesn't affect couple-level crossings but reduces
  // visual length of the parent→spouse drops.
  const spouseSideOrder = new Map<string, string[]>();
  for (const couple of couples) {
    if (couple.members.length < 2) {
      spouseSideOrder.set(couple.id, [couple.members[0]]);
      continue;
    }
    const [a, b] = couple.members;
    const idealFor = (memberId: string): number | null => {
      const member = tree.persons[memberId];
      const parentCoupleIds = member.parentIds
        .map((pid) => coupleOf.get(pid))
        .filter((id): id is string => id !== undefined);
      const xs = parentCoupleIds
        .map((cid) => centerX.get(cid))
        .filter((x): x is number => x !== undefined);
      if (xs.length === 0) return null;
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    const aIdeal = idealFor(a);
    const bIdeal = idealFor(b);
    let leftId = a;
    let rightId = b;
    if (aIdeal !== null && bIdeal !== null && aIdeal > bIdeal) {
      leftId = b;
      rightId = a;
    } else if (aIdeal === null && bIdeal !== null) {
      // Prefer the spouse with parents on the inside (closer to couple
      // center), the one without parents on the outside.
      const center = centerX.get(couple.id) ?? 0;
      if (bIdeal < center) {
        leftId = b;
        rightId = a;
      }
    }
    spouseSideOrder.set(couple.id, [leftId, rightId]);
  }

  for (const couple of couples) {
    const center = centerX.get(couple.id)!;
    const y = yFor(couple.generation);
    const w = coupleWidth(couple);
    const leftX = center - w / 2;
    const sides = spouseSideOrder.get(couple.id) ?? couple.members;
    layout.nodes.push({ id: sides[0], x: leftX, y, w: NODE_W, h: NODE_H });
    if (sides.length === 2) {
      layout.nodes.push({
        id: sides[1],
        x: leftX + NODE_W + SPOUSE_GAP,
        y,
        w: NODE_W,
        h: NODE_H,
      });
      layout.edges.push({
        kind: "spouse",
        aId: sides[0],
        bId: sides[1],
      });
    }
  }

  // Assign each parent couple its own elbow Y, sorted left-to-right by x.
  // Spacing is absolute (ELBOW_SPACING) so adjacent rows are visually
  // distinct regardless of how many parents share a generation.
  const elbowYByCouple = new Map<string, number>();
  for (const g of layered.sortedGens) {
    const inGen = layered.byGen.get(g) ?? [];
    const parentCouples = inGen.filter(
      (c) => (childCouplesOf.get(c.id) ?? []).length > 0,
    );
    parentCouples.sort(
      (a, b) => (centerX.get(a.id) ?? 0) - (centerX.get(b.id) ?? 0),
    );
    const parentBottomY = yFor(g) + NODE_H;
    if (parentCouples.length === 1) {
      elbowYByCouple.set(parentCouples[0].id, parentBottomY + ROW_GAP / 2);
    } else {
      parentCouples.forEach((couple, i) => {
        elbowYByCouple.set(
          couple.id,
          parentBottomY + ELBOW_FIRST_OFFSET + i * ELBOW_SPACING,
        );
      });
    }
  }

  // One parent-child edge per child. The renderer drops from the midpoint of
  // the parents' marriage line (or the lone parent's center) down to the
  // child — so in-laws naturally get their own visible drop into their child.
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0) continue;
    const parentCoupleId = coupleOf.get(person.parentIds[0]);
    const parentGen = parentCoupleId !== undefined
      ? gen.get(person.parentIds[0]) ?? 0
      : 0;
    const elbowY = parentCoupleId !== undefined
      ? elbowYByCouple.get(parentCoupleId) ?? yFor(parentGen) + NODE_H + ROW_GAP / 2
      : yFor(parentGen) + NODE_H + ROW_GAP / 2;
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

export type NavDirection = "up" | "down" | "left" | "right";

export function nearestInDirection(
  current: LaidOutNode,
  all: LaidOutNode[],
  dir: NavDirection,
): LaidOutNode | null {
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;
  let best: LaidOutNode | null = null;
  let bestScore = Infinity;
  for (const n of all) {
    if (n.id === current.id) continue;
    const nx = n.x + n.w / 2;
    const ny = n.y + n.h / 2;
    const dx = nx - cx;
    const dy = ny - cy;
    let principal: number;
    let perp: number;
    if (dir === "up") { principal = -dy; perp = Math.abs(dx); }
    else if (dir === "down") { principal = dy; perp = Math.abs(dx); }
    else if (dir === "left") { principal = -dx; perp = Math.abs(dy); }
    else { principal = dx; perp = Math.abs(dy); }
    if (principal <= 0) continue;
    // Bias the score toward the requested axis so off-axis nodes lose to
    // straighter neighbors of similar distance.
    const score = principal + perp * 2;
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

export const GENDER_CYCLE: Gender[] = ["M", "F", "NB"];

export function nextGender(g: Gender): Gender {
  const i = GENDER_CYCLE.indexOf(g);
  return GENDER_CYCLE[(i + 1) % GENDER_CYCLE.length];
}

export function countChildren(tree: Tree, parentId: string): number {
  let count = 0;
  for (const p of Object.values(tree.persons)) {
    if (p.parentIds.includes(parentId)) count++;
  }
  return count;
}

// ---------- Optimistic layout patching ----------
//
// `computeLayout` runs in a Web Worker and can take seconds for large trees.
// While it runs, we still need to show the user the result of their click.
// `optimisticPatch` produces a "good enough" layout by reusing the previous
// layout's positions and dropping new nodes near a relative whose position is
// already known. The real layout replaces it when the worker returns.

export interface TreeDiff {
  added: string[];
  removed: string[];
  structurallyEqual: boolean;
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Topology only — names and genders don't count, since they don't affect the
// layout. Used to skip worker dispatch on cosmetic-only edits.
export function diffTree(prev: Tree, next: Tree): TreeDiff {
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of Object.keys(next.persons)) {
    if (!(id in prev.persons)) added.push(id);
  }
  for (const id of Object.keys(prev.persons)) {
    if (!(id in next.persons)) removed.push(id);
  }
  let structurallyEqual = added.length === 0 && removed.length === 0;
  if (structurallyEqual) {
    for (const id of Object.keys(next.persons)) {
      const a = prev.persons[id];
      const b = next.persons[id];
      if (
        !sameStringArray(a.parentIds, b.parentIds) ||
        !sameStringArray(a.spouseIds, b.spouseIds)
      ) {
        structurallyEqual = false;
        break;
      }
    }
  }
  return { added, removed, structurallyEqual };
}

// Reuse positions from `current` for surviving nodes. For each newly-added
// person, place them near a known relative: below a parent, beside a spouse,
// or above a child. Then rebuild edges from `nextTree` (so newly-added
// relationships render right away) and shift everything so min x/y = 0.
export function optimisticPatch(
  current: Layout,
  nextTree: Tree,
  diff: TreeDiff,
): Layout {
  const nodes: LaidOutNode[] = current.nodes
    .filter((n) => n.id in nextTree.persons)
    .map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const id of diff.added) {
    const person = nextTree.persons[id];
    let pos: { x: number; y: number } | null = null;

    for (const pid of person.parentIds) {
      const p = byId.get(pid);
      if (p) {
        pos = { x: p.x, y: p.y + p.h + ROW_GAP };
        break;
      }
    }
    if (!pos) {
      for (const sid of person.spouseIds) {
        const s = byId.get(sid);
        if (s) {
          pos = { x: s.x + s.w + SPOUSE_GAP, y: s.y };
          break;
        }
      }
    }
    if (!pos) {
      // Newly-added person is somebody else's parent.
      for (const candidate of Object.values(nextTree.persons)) {
        if (!candidate.parentIds.includes(id)) continue;
        const c = byId.get(candidate.id);
        if (c) {
          pos = { x: c.x, y: c.y - c.h - ROW_GAP };
          break;
        }
      }
    }
    if (!pos) pos = { x: 0, y: 0 };

    const node: LaidOutNode = { id, x: pos.x, y: pos.y, w: NODE_W, h: NODE_H };
    nodes.push(node);
    byId.set(id, node);
  }

  const edges: LaidOutEdge[] = [];
  const seenSpouse = new Set<string>();
  for (const person of Object.values(nextTree.persons)) {
    if (!byId.has(person.id)) continue;
    for (const sid of person.spouseIds) {
      if (!byId.has(sid)) continue;
      const key = person.id < sid ? `${person.id}|${sid}` : `${sid}|${person.id}`;
      if (seenSpouse.has(key)) continue;
      seenSpouse.add(key);
      edges.push({ kind: "spouse", aId: person.id, bId: sid });
    }
    if (person.parentIds.length === 0) continue;
    const parent = byId.get(person.parentIds[0]);
    if (!parent) continue;
    edges.push({
      kind: "parent-child",
      parentAId: person.parentIds[0],
      parentBId: person.parentIds.length === 2 ? person.parentIds[1] : null,
      childId: person.id,
      elbowY: parent.y + parent.h + ROW_GAP / 2,
    });
  }

  // Newly-added parent goes to negative y; shift so min x/y = 0 to keep the
  // canvas origin sane.
  let minX = Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  }
  const dx = isFinite(minX) ? -minX : 0;
  const dy = isFinite(minY) ? -minY : 0;
  if (dx !== 0 || dy !== 0) {
    for (const n of nodes) {
      n.x += dx;
      n.y += dy;
    }
    for (const e of edges) {
      if (e.kind === "parent-child") e.elbowY += dy;
    }
  }

  let width = 0;
  let height = 0;
  for (const n of nodes) {
    if (n.x + n.w > width) width = n.x + n.w;
    if (n.y + n.h > height) height = n.y + n.h;
  }
  return { nodes, edges, width, height };
}

export const EMPTY_LAYOUT: Layout = {
  nodes: [],
  edges: [],
  width: 0,
  height: 0,
};
