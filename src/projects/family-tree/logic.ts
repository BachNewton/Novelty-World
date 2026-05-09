import type { Gender, Layout, Person, Tree, LaidOutNode } from "./types";

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
    if (inner !== null) return `spouse's ${inner}`;
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
    if (inner !== null) return `${inner}'s spouse`;
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

export function computeLayout(tree: Tree): Layout {
  const order = bfsOrder(tree);
  const gen = computeGenerations(tree);
  const { couples, coupleOf } = buildCoupleUnits(tree, order, gen);

  const orderIndex = new Map<string, number>();
  order.forEach((id, i) => { orderIndex.set(id, i); });

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

  // Top-down placement: each couple's ideal x is the average of its already-
  // placed parent couples. Couples are sorted by ideal then placed left-to-
  // right with a min spacing, so the order respects parent positions when
  // possible without ever overlapping.
  const centerX = new Map<string, number>();
  for (const g of sortedGens) {
    const inGen = byGen.get(g)!;
    const items = inGen.map((couple) => {
      const placedParents = parentCouplesOf
        .get(couple.id)!
        .filter((pid) => centerX.has(pid));
      const ideal =
        placedParents.length > 0
          ? placedParents.reduce((sum, pid) => sum + centerX.get(pid)!, 0) /
            placedParents.length
          : null;
      return { couple, ideal };
    });
    items.sort((a, b) => {
      if (a.ideal === null && b.ideal === null) {
        return (
          (orderIndex.get(a.couple.id) ?? 0) -
          (orderIndex.get(b.couple.id) ?? 0)
        );
      }
      if (a.ideal === null) return 1;
      if (b.ideal === null) return -1;
      return a.ideal - b.ideal;
    });

    let cursor = 0;
    for (const { couple, ideal } of items) {
      const w = coupleWidth(couple);
      let center = ideal !== null ? ideal : cursor + w / 2;
      let leftX = center - w / 2;
      if (leftX < cursor) {
        leftX = cursor;
        center = leftX + w / 2;
      }
      centerX.set(couple.id, center);
      cursor = leftX + w + SUBTREE_GAP;
    }
  }

  const minGen = sortedGens.length > 0 ? sortedGens[0] : 0;
  const yFor = (g: number): number => (g - minGen) * (NODE_H + ROW_GAP);

  const layout: Layout = { nodes: [], edges: [], width: 0, height: 0 };

  for (const couple of couples) {
    const center = centerX.get(couple.id)!;
    const y = yFor(couple.generation);
    const w = coupleWidth(couple);
    const leftX = center - w / 2;
    layout.nodes.push({ id: couple.members[0], x: leftX, y, w: NODE_W, h: NODE_H });
    if (couple.members.length === 2) {
      layout.nodes.push({
        id: couple.members[1],
        x: leftX + NODE_W + SPOUSE_GAP,
        y,
        w: NODE_W,
        h: NODE_H,
      });
      layout.edges.push({
        kind: "spouse",
        aId: couple.members[0],
        bId: couple.members[1],
      });
    }
  }

  // One parent-child edge per child. The renderer drops from the midpoint of
  // the parents' marriage line (or the lone parent's center) down to the
  // child — so in-laws naturally get their own visible drop into their child.
  for (const person of Object.values(tree.persons)) {
    if (person.parentIds.length === 0) continue;
    layout.edges.push({
      kind: "parent-child",
      parentAId: person.parentIds[0],
      parentBId: person.parentIds.length === 2 ? person.parentIds[1] : null,
      childId: person.id,
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
