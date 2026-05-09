import {
  coordCenter,
  decrossOpt,
  graphStratify,
  sugiyama,
} from "d3-dag";
import type { Gender, Layout, Person, Tree, LaidOutNode } from "./types";

export const NODE_W = 160;
export const NODE_H = 64;
export const SPOUSE_GAP = 28;
export const ROW_GAP = 96;
export const SUBTREE_GAP = 72;
// Extra horizontal gap added per BFS level above the leaves when packing
// subtrees. Closer to the focal couple = wider gap, so major branches fan
// out and leaf clusters stay tight.
export const BRANCH_LEVEL_GAP = 80;

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
  gender: Gender = null,
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
  gender: Gender = null,
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
  gender: Gender = null,
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

// Backfill gender on persons loaded from older data that predates the field,
// and reconcile any children who only list one parent when that parent has a
// (single) spouse — the spouse becomes the second parent. This heals data
// written before addSpouse propagated to existing single-parent kids.
// `changed` reports whether any normalization actually modified the input,
// so callers can decide whether to persist the fix back.
export function normalizeTree(raw: unknown): { tree: Tree; changed: boolean } {
  const t = raw as Tree;
  let changed = false;
  const persons: Record<string, Person> = {};
  for (const [id, person] of Object.entries(t.persons)) {
    if ((person as Partial<Person>).gender === undefined) changed = true;
    persons[id] = {
      id: person.id,
      name: person.name,
      gender: (person as Partial<Person>).gender ?? null,
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
// The layout runs in two phases. Phase 1 picks a *rank order* for each
// generation that minimizes parent-child edge crossings on the couple-DAG —
// couples are atomic ordering units, so spouses are always adjacent. We
// iterate barycenter sweeps top-down + bottom-up, then refine with a greedy
// adjacent-swap pass that uses an actual crossing count, escaping local
// minima the barycenter heuristic can't. Phase 2 translates the chosen order
// into pixel coordinates with our existing per-couple elbow rows.

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

// Inversion count via merge sort — O(n log n). Used by the layered crossing
// count. Mutates the input array.
function countInversions(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const mid = Math.floor(arr.length / 2);
  const left = arr.slice(0, mid);
  const right = arr.slice(mid);
  let inv = countInversions(left) + countInversions(right);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      arr[k++] = left[i++];
    } else {
      arr[k++] = right[j++];
      // Every remaining element of `left` forms an inversion with right[j-1].
      inv += left.length - i;
    }
  }
  while (i < left.length) arr[k++] = left[i++];
  while (j < right.length) arr[k++] = right[j++];
  return inv;
}

// Count parent-child edge crossings between two adjacent layers given
// the rank index of each couple in each layer.
function countCrossingsBetween(
  upperRank: Map<string, number>,
  lowerRank: Map<string, number>,
  edges: ReadonlyArray<readonly [string, string]>, // [upper, lower]
): number {
  const pairs: Array<[number, number]> = [];
  for (const [u, l] of edges) {
    const ur = upperRank.get(u);
    const lr = lowerRank.get(l);
    if (ur === undefined || lr === undefined) continue;
    pairs.push([ur, lr]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return countInversions(pairs.map(([, l]) => l));
}

interface LayeredOrdering {
  byGen: Map<number, CoupleUnit[]>;
  sortedGens: number[];
  parentCouplesOf: Map<string, string[]>;
  childCouplesOf: Map<string, string[]>;
  // Edges between layers, keyed by upper generation.
  // Each edge: [upperCoupleId, lowerCoupleId].
  edgesByUpperGen: Map<number, Array<[string, string]>>;
}

function buildLayered(
  couples: CoupleUnit[],
  parentCouplesOf: Map<string, string[]>,
  childCouplesOf: Map<string, string[]>,
): LayeredOrdering {
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

  const edgesByUpperGen = new Map<number, Array<[string, string]>>();
  for (const couple of couples) {
    for (const childId of childCouplesOf.get(couple.id) ?? []) {
      const list = edgesByUpperGen.get(couple.generation);
      const pair: [string, string] = [couple.id, childId];
      if (list === undefined) {
        edgesByUpperGen.set(couple.generation, [pair]);
      } else {
        list.push(pair);
      }
    }
  }

  return { byGen, sortedGens, parentCouplesOf, childCouplesOf, edgesByUpperGen };
}

// Total crossings across all adjacent-layer pairs given current ordering.
function totalCrossings(layered: LayeredOrdering): number {
  let total = 0;
  for (const g of layered.sortedGens) {
    const edges = layered.edgesByUpperGen.get(g);
    if (!edges || edges.length === 0) continue;
    const upper = layered.byGen.get(g);
    const lower = layered.byGen.get(g + 1);
    if (!upper || !lower) continue;
    const upperRank = new Map<string, number>();
    upper.forEach((c, i) => { upperRank.set(c.id, i); });
    const lowerRank = new Map<string, number>();
    lower.forEach((c, i) => { lowerRank.set(c.id, i); });
    total += countCrossingsBetween(upperRank, lowerRank, edges);
  }
  return total;
}

// Crossings touching a single layer (edges to the layer above and below).
function crossingsAtLayer(layered: LayeredOrdering, g: number): number {
  let total = 0;
  const here = layered.byGen.get(g);
  if (!here) return 0;
  const hereRank = new Map<string, number>();
  here.forEach((c, i) => { hereRank.set(c.id, i); });

  const upper = layered.byGen.get(g - 1);
  if (upper) {
    const upperRank = new Map<string, number>();
    upper.forEach((c, i) => { upperRank.set(c.id, i); });
    const edges = layered.edgesByUpperGen.get(g - 1);
    if (edges) total += countCrossingsBetween(upperRank, hereRank, edges);
  }
  const lower = layered.byGen.get(g + 1);
  if (lower) {
    const lowerRank = new Map<string, number>();
    lower.forEach((c, i) => { lowerRank.set(c.id, i); });
    const edges = layered.edgesByUpperGen.get(g);
    if (edges) total += countCrossingsBetween(hereRank, lowerRank, edges);
  }
  return total;
}

// Sort a single layer by the barycenter of its anchors (parents or children).
// Couples with no placed anchors keep their relative position via a stable
// tiebreak on `fallbackOrder` (BFS-derived). Mutates `layered.byGen[g]`.
function sortLayerByBarycenter(
  layered: LayeredOrdering,
  g: number,
  anchorMap: Map<string, string[]>,
  anchorGen: number,
  fallbackOrder: Map<string, number>,
): void {
  const here = layered.byGen.get(g);
  if (!here) return;
  const anchorLayer = layered.byGen.get(anchorGen);
  const anchorRank = new Map<string, number>();
  if (anchorLayer) {
    anchorLayer.forEach((c, i) => { anchorRank.set(c.id, i); });
  }
  const score = new Map<string, number | null>();
  for (const couple of here) {
    const anchors = anchorMap.get(couple.id) ?? [];
    const ranks = anchors
      .map((id) => anchorRank.get(id))
      .filter((r): r is number => r !== undefined);
    if (ranks.length === 0) {
      score.set(couple.id, null);
    } else {
      score.set(couple.id, ranks.reduce((s, r) => s + r, 0) / ranks.length);
    }
  }
  here.sort((a, b) => {
    const sa = score.get(a.id) ?? null;
    const sb = score.get(b.id) ?? null;
    if (sa === null && sb === null) {
      return (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0);
    }
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sa !== sb) return sa - sb;
    // Stable tiebreak.
    return (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0);
  });
}

// Greedy adjacent-swap refinement: for each adjacent pair in each layer, swap
// if it strictly reduces crossings touching that layer. Repeat until no swap
// improves. This catches local minima the barycenter sweep gets stuck in.
function refineByAdjacentSwaps(layered: LayeredOrdering): void {
  let improved = true;
  let safety = 0;
  while (improved && safety < 64) {
    improved = false;
    safety += 1;
    for (const g of layered.sortedGens) {
      const layer = layered.byGen.get(g);
      if (!layer || layer.length < 2) continue;
      for (let i = 0; i < layer.length - 1; i++) {
        const before = crossingsAtLayer(layered, g);
        [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
        const after = crossingsAtLayer(layered, g);
        if (after < before) {
          improved = true;
        } else {
          // Revert.
          [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
        }
      }
    }
  }
}

// Snapshot ordering so we can revert to the best-seen permutation if a sweep
// happens to make things worse.
function snapshotOrdering(layered: LayeredOrdering): Map<number, string[]> {
  const snap = new Map<number, string[]>();
  for (const [g, layer] of layered.byGen) {
    snap.set(g, layer.map((c) => c.id));
  }
  return snap;
}

function restoreOrdering(
  layered: LayeredOrdering,
  snap: Map<number, string[]>,
): void {
  for (const [g, ids] of snap) {
    const layer = layered.byGen.get(g);
    if (!layer) continue;
    const byId = new Map(layer.map((c) => [c.id, c]));
    layered.byGen.set(g, ids.map((id) => byId.get(id)!));
  }
}

// Try d3-dag's ILP-optimal decrossing for the layer ordering. Returns a
// per-couple x-coordinate map if it succeeds, or null if d3-dag bails (the
// graph is too large for the LP solver, or it throws for any reason — e.g.,
// a degenerate DAG). The actual x-values aren't used for placement; only
// their relative order within each generation matters. d3-dag's default
// simplex layering re-derives generations from the parent_couple →
// child_couple structure; for tree-shaped genealogy this matches our own
// BFS-with-spouse-propagation calculation, so we don't need a custom layering.
function optimalDecrossingViaD3Dag(
  couples: CoupleUnit[],
  parentCouplesOf: Map<string, string[]>,
): Map<string, number> | null {
  if (couples.length < 2) return null;
  const data = couples.map((c) => ({
    id: c.id,
    parentIds: parentCouplesOf.get(c.id) ?? [],
  }));

  try {
    const dag = graphStratify()(data);
    const layout = sugiyama()
      // `slow` lets the solver attempt graphs the default `fast` check would
      // refuse. `dist: true` adds a secondary objective pulling siblings
      // (nodes sharing a parent or child) closer together — exactly what
      // makes a family tree feel tidy.
      .decross(decrossOpt().check("slow").dist(true))
      .coord(coordCenter());
    layout(dag);
    const result = new Map<string, number>();
    for (const node of dag.nodes()) {
      result.set(node.data.id, node.x);
    }
    return result;
  } catch {
    return null;
  }
}

// Apply an x-coordinate map (from d3-dag) as a per-layer ordering.
function applyOrdering(
  layered: LayeredOrdering,
  xByCouple: Map<string, number>,
): void {
  for (const g of layered.sortedGens) {
    const layer = layered.byGen.get(g);
    if (!layer) continue;
    layer.sort(
      (a, b) => (xByCouple.get(a.id) ?? 0) - (xByCouple.get(b.id) ?? 0),
    );
  }
}

// Phase 1: pick a per-generation order that minimizes parent-child crossings.
// Returns a per-couple "global x" signal used by Phase 2 to sort sibling
// branches left-to-right consistently across generations. With d3-dag this is
// its real x output; with the fallback heuristic we synthesize one from the
// per-layer rank index.
function minimizeCrossings(
  layered: LayeredOrdering,
  fallbackOrder: Map<string, number>,
  parentCouplesOf: Map<string, string[]>,
): Map<string, number> {
  const allCouples = layered.sortedGens.flatMap(
    (g) => layered.byGen.get(g) ?? [],
  );
  const optimal = optimalDecrossingViaD3Dag(allCouples, parentCouplesOf);
  if (optimal !== null) {
    applyOrdering(layered, optimal);
    return optimal;
  }
  // Fallback: barycenter sweeps + adjacent-swap refinement. Same engine as
  // d3-dag's `medium` preset, used when `decrossOpt` bails (graph too large
  // for the LP solver, or a degenerate input).
  heuristicMinimizeCrossings(layered, fallbackOrder);
  // Synthesize a global x from the final rank index in each layer.
  const x = new Map<string, number>();
  for (const g of layered.sortedGens) {
    const layer = layered.byGen.get(g) ?? [];
    layer.forEach((c, i) => { x.set(c.id, i); });
  }
  return x;
}

function heuristicMinimizeCrossings(
  layered: LayeredOrdering,
  fallbackOrder: Map<string, number>,
): void {
  // Initial seed: top-down by parent barycenter (top gen falls back to
  // BFS order — its parents don't exist in the tree).
  for (const g of layered.sortedGens) {
    sortLayerByBarycenter(
      layered,
      g,
      layered.parentCouplesOf,
      g - 1,
      fallbackOrder,
    );
  }

  let best = snapshotOrdering(layered);
  let bestCrossings = totalCrossings(layered);

  const MAX_ITER = 24;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Top-down sweep using parents.
    for (const g of layered.sortedGens) {
      sortLayerByBarycenter(
        layered,
        g,
        layered.parentCouplesOf,
        g - 1,
        fallbackOrder,
      );
    }
    // Bottom-up sweep using children.
    for (let i = layered.sortedGens.length - 1; i >= 0; i--) {
      const g = layered.sortedGens[i];
      sortLayerByBarycenter(
        layered,
        g,
        layered.childCouplesOf,
        g + 1,
        fallbackOrder,
      );
    }
    const cur = totalCrossings(layered);
    if (cur < bestCrossings) {
      bestCrossings = cur;
      best = snapshotOrdering(layered);
    } else if (cur > bestCrossings) {
      // Sweep made it worse; restore the best and exit the barycenter loop —
      // further sweeps would re-derive the same worse state.
      restoreOrdering(layered, best);
      break;
    } else {
      // No progress this iteration — barycenter has converged.
      break;
    }
  }

  // Adjacent-swap refinement. Operates on the best-seen ordering and only
  // accepts strict improvements, so it can never make things worse.
  restoreOrdering(layered, best);
  refineByAdjacentSwaps(layered);
}

// Recursive subtree packing using per-generation extents. Builds a BFS tree
// from `focalId` over the couple-DAG, then walks it twice: bottom-up to
// compute each subtree's horizontal footprint at every generation it spans,
// top-down to place each couple at an offset relative to its BFS-parent.
// Above-row children (parent couples) sit centered above the couple,
// below-row children (child couples) centered below. Inter-sibling gaps grow
// with proximity to the focal couple, producing the fan-out shape.
//
// The single-width approach was buggy: a deeply nested branch could drop a
// cousin or great-aunt back onto a generation already occupied by another
// branch, since "subtree width" only considered the layered hull, not the
// per-row footprint. Tracking [min, max] per generation lets us pack siblings
// tightly while still guaranteeing no two couples on the same row collide.
//
// Disconnected couples (no path to focal) are appended at the right with the
// flat SUBTREE_GAP cursor — should be unreachable for a normally-built tree
// but the renderer must not drop them.
function packSubtrees(
  couples: CoupleUnit[],
  couplesById: Map<string, CoupleUnit>,
  focalId: string,
  parentCouplesOf: Map<string, string[]>,
  childCouplesOf: Map<string, string[]>,
  orderingX: Map<string, number>,
): Map<string, number> {
  const centerX = new Map<string, number>();
  if (!couplesById.has(focalId)) return centerX;

  // BFS from focal. Each non-focal couple's bfsParent is the couple it was
  // first discovered through; bfsChildren are couples that listed this one
  // as their bfsParent. The traversal walks both parent-couple and
  // child-couple edges, so the tree captures both ancestors and descendants
  // (and their in-laws / siblings) reachable from focal.
  const bfsParent = new Map<string, string | null>();
  const bfsChildren = new Map<string, string[]>();
  const bfsDepth = new Map<string, number>();
  bfsParent.set(focalId, null);
  bfsDepth.set(focalId, 0);
  bfsChildren.set(focalId, []);

  const queue: string[] = [focalId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = bfsDepth.get(cur)!;
    const neighbors = [
      ...parentCouplesOf.get(cur) ?? [],
      ...childCouplesOf.get(cur) ?? [],
    ];
    for (const n of neighbors) {
      if (bfsParent.has(n)) continue;
      bfsParent.set(n, cur);
      bfsDepth.set(n, d + 1);
      bfsChildren.set(n, []);
      bfsChildren.get(cur)!.push(n);
      queue.push(n);
    }
  }

  let maxDepth = 0;
  for (const d of bfsDepth.values()) if (d > maxDepth) maxDepth = d;

  // Gap between same-parent siblings, narrowing with depth so leaf clusters
  // pack tighter than top-level branches.
  const gapAtDepth = (parentDepth: number): number =>
    SUBTREE_GAP + BRANCH_LEVEL_GAP * Math.max(0, maxDepth - 1 - parentDepth);

  // Sort each couple's BFS-children into above-row (parent couples) and
  // below-row (child couples) and order each row by the global x signal.
  const aboveOf = new Map<string, string[]>();
  const belowOf = new Map<string, string[]>();
  for (const [cid, kids] of bfsChildren) {
    const parents = new Set(parentCouplesOf.get(cid) ?? []);
    const above = kids.filter((k) => parents.has(k));
    const below = kids.filter((k) => !parents.has(k));
    const cmp = (a: string, b: string): number =>
      (orderingX.get(a) ?? 0) - (orderingX.get(b) ?? 0);
    above.sort(cmp);
    below.sort(cmp);
    aboveOf.set(cid, above);
    belowOf.set(cid, below);
  }

  // Per-generation extent: x range occupied at each generation, in
  // coordinates relative to the subtree root's center (= 0).
  type Extent = Map<number, [number, number]>;
  const extentOf = new Map<string, Extent>();
  // Offset of each BFS-child relative to this couple's center.
  const childOffsetOf = new Map<string, Map<string, number>>();

  const mergeShifted = (target: Extent, src: Extent, shift: number): void => {
    for (const [g, [a, b]] of src) {
      const sa = a + shift;
      const sb = b + shift;
      const cur = target.get(g);
      if (cur === undefined) target.set(g, [sa, sb]);
      else target.set(g, [Math.min(cur[0], sa), Math.max(cur[1], sb)]);
    }
  };

  // Re-center a packed row so its midpoint sits at 0 (i.e. centered under
  // the parent). Mutates both the offsets array and the rowExtent in place.
  const centerRow = (offsets: number[], rowExtent: Extent): void => {
    let rowMin = Infinity;
    let rowMax = -Infinity;
    for (const [, [a, b]] of rowExtent) {
      if (a < rowMin) rowMin = a;
      if (b > rowMax) rowMax = b;
    }
    if (!isFinite(rowMin) || !isFinite(rowMax)) return;
    const shift = -(rowMin + rowMax) / 2;
    for (let i = 0; i < offsets.length; i++) offsets[i] += shift;
    for (const [g, [a, b]] of rowExtent) {
      rowExtent.set(g, [a + shift, b + shift]);
    }
  };

  // Detect collision between a row's combined extent and the parent's own
  // extent. Returns true if any shared generation has overlapping ranges.
  const rowCollidesWithOwn = (rowExtent: Extent, own: Extent): boolean => {
    for (const [g, [rmin, rmax]] of rowExtent) {
      const cur = own.get(g);
      if (cur === undefined) continue;
      if (rmax > cur[0] && rmin < cur[1]) return true;
    }
    return false;
  };

  // Place a sequence of kids outward from a starting extent, returning each
  // kid's offset along with the resulting combined extent. `direction = +1`
  // packs left-to-right (each kid sits to the right of the prior); `-1` packs
  // right-to-left (each kid sits to the left of the prior).
  const packOutward = (
    kids: string[],
    gap: number,
    direction: 1 | -1,
  ): { offsets: number[]; rowExtent: Extent } => {
    const offsets: number[] = [];
    const rowExtent: Extent = new Map();
    for (const k of kids) {
      const kext = extentOf.get(k)!;
      let bestOff: number;
      if (rowExtent.size === 0) {
        bestOff = 0;
      } else if (direction === 1) {
        let minOff = -Infinity;
        for (const [g, [kmin]] of kext) {
          const cur = rowExtent.get(g);
          if (cur === undefined) continue;
          const need = cur[1] + gap - kmin;
          if (need > minOff) minOff = need;
        }
        bestOff = isFinite(minOff) ? minOff : 0;
      } else {
        let maxOff = Infinity;
        for (const [g, [, kmax]] of kext) {
          const cur = rowExtent.get(g);
          if (cur === undefined) continue;
          const need = cur[0] - gap - kmax;
          if (need < maxOff) maxOff = need;
        }
        bestOff = isFinite(maxOff) ? maxOff : 0;
      }
      offsets.push(bestOff);
      mergeShifted(rowExtent, kext, bestOff);
    }
    return { offsets, rowExtent };
  };

  const shiftExtent = (e: Extent, shift: number): void => {
    for (const [g, [a, b]] of e) e.set(g, [a + shift, b + shift]);
  };

  const compute = (cid: string): Extent => {
    const cached = extentOf.get(cid);
    if (cached !== undefined) return cached;

    const above = aboveOf.get(cid) ?? [];
    const below = belowOf.get(cid) ?? [];
    for (const k of above) compute(k);
    for (const k of below) compute(k);

    const couple = couplesById.get(cid);
    const cw = couple ? coupleWidth(couple) : NODE_W;
    const cgen = couple?.generation ?? 0;
    const ext: Extent = new Map();
    ext.set(cgen, [-cw / 2, cw / 2]);

    const childOffsets = new Map<string, number>();
    const gap = gapAtDepth(bfsDepth.get(cid) ?? 0);
    const pivot = orderingX.get(cid) ?? 0;

    for (const row of [above, below]) {
      if (row.length === 0) continue;

      // First attempt: pack all kids together, center them under the parent.
      // This is the desired layout when descendants of one row don't wrap
      // back onto a generation already occupied by the parent's own footprint.
      const packed = packOutward(row, gap, 1);
      centerRow(packed.offsets, packed.rowExtent);

      let finalOffsets = packed.offsets;
      let finalExt = packed.rowExtent;

      if (rowCollidesWithOwn(packed.rowExtent, ext)) {
        // Re-pack with the row split by orderingX: kids whose ordering
        // position is left of the parent go left-of-parent (pushed outward
        // from the parent's left edge), kids on the right of pivot go right.
        // This keeps the parent geographically between its left- and
        // right-leaning subtrees instead of pushing the whole branch to one
        // side, which is what produces a sensible spouse-on-each-side layout
        // when a deep ancestor branch wraps back to the parent's own row.
        const leftKids = row.filter(
          (k) => (orderingX.get(k) ?? 0) < pivot,
        );
        const rightKids = row.filter(
          (k) => (orderingX.get(k) ?? 0) >= pivot,
        );

        const r = packOutward(rightKids, gap, 1);
        let rShift = 0;
        for (const [g, [rmin]] of r.rowExtent) {
          const own = ext.get(g);
          if (own === undefined) continue;
          const need = own[1] + gap - rmin;
          if (need > rShift) rShift = need;
        }
        for (let i = 0; i < r.offsets.length; i++) r.offsets[i] += rShift;
        shiftExtent(r.rowExtent, rShift);

        const lReversed = [...leftKids].reverse();
        const l = packOutward(lReversed, gap, -1);
        let lShift = 0;
        for (const [g, [, lmax]] of l.rowExtent) {
          const own = ext.get(g);
          if (own === undefined) continue;
          const need = own[0] - gap - lmax;
          if (need < lShift) lShift = need;
        }
        for (let i = 0; i < l.offsets.length; i++) l.offsets[i] += lShift;
        shiftExtent(l.rowExtent, lShift);

        const offsetByKid = new Map<string, number>();
        for (let i = 0; i < rightKids.length; i++) {
          offsetByKid.set(rightKids[i], r.offsets[i]);
        }
        for (let i = 0; i < lReversed.length; i++) {
          offsetByKid.set(lReversed[i], l.offsets[i]);
        }
        finalOffsets = row.map((k) => offsetByKid.get(k) ?? 0);

        finalExt = new Map();
        mergeShifted(finalExt, r.rowExtent, 0);
        mergeShifted(finalExt, l.rowExtent, 0);
      }

      for (let i = 0; i < row.length; i++) {
        childOffsets.set(row[i], finalOffsets[i]);
      }
      mergeShifted(ext, finalExt, 0);
    }

    extentOf.set(cid, ext);
    childOffsetOf.set(cid, childOffsets);
    return ext;
  };

  compute(focalId);

  // Translate the focal subtree so its leftmost point sits at x = 0.
  const focalExt = extentOf.get(focalId)!;
  let globalMin = 0;
  for (const [, [a]] of focalExt) if (a < globalMin) globalMin = a;
  const place = (cid: string, x: number): void => {
    centerX.set(cid, x);
    const offsets = childOffsetOf.get(cid);
    if (offsets === undefined) return;
    for (const [k, off] of offsets) place(k, x + off);
  };
  place(focalId, -globalMin);

  // Disconnected couples fallback. Anchor at the right edge of the focal
  // subtree's overall hull. In a normally-built tree this is empty; defensive
  // code so we never lose a node from the rendered layout.
  let focalRight = -Infinity;
  for (const [, [, b]] of focalExt) if (b > focalRight) focalRight = b;
  let extraCursor =
    (isFinite(focalRight) ? focalRight - globalMin : 0) + SUBTREE_GAP;
  for (const couple of couples) {
    if (centerX.has(couple.id)) continue;
    const w = coupleWidth(couple);
    centerX.set(couple.id, extraCursor + w / 2);
    extraCursor += w + SUBTREE_GAP;
  }

  return centerX;
}

export function computeLayout(tree: Tree): Layout {
  const order = bfsOrder(tree);
  const gen = computeGenerations(tree);
  const { couples, coupleOf } = buildCoupleUnits(tree, order, gen);

  const orderIndex = new Map<string, number>();
  order.forEach((id, i) => { orderIndex.set(id, i); });
  // Couples take their fallback rank from their primary member's BFS position.
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

  const layered = buildLayered(couples, parentCouplesOf, childCouplesOf);
  const orderingX = minimizeCrossings(layered, fallbackOrder, parentCouplesOf);

  // Phase 2: recursive subtree packing rooted at the focal couple.
  // With the rank order fixed (so crossings stay minimized) we now choose
  // x-coordinates so each branch occupies its own slot, sized to fit
  // everything inside it. Centred parents sit above their children; siblings
  // close to the leaves cluster tight; major branches near the focal fan out.
  const couplesById = new Map<string, CoupleUnit>();
  for (const couple of couples) couplesById.set(couple.id, couple);
  const centerX = packSubtrees(
    couples,
    couplesById,
    coupleOf.get(tree.rootId) ?? couples[0].id,
    parentCouplesOf,
    childCouplesOf,
    orderingX,
  );

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

export const GENDER_CYCLE: Gender[] = ["M", "F", "NB", null];

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
