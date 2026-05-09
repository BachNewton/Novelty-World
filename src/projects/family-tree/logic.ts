import type { Layout, Person, Tree, LaidOutNode } from "./types";

export const NODE_W = 160;
export const NODE_H = 64;
export const SPOUSE_GAP = 28;
export const SIBLING_GAP = 36;
export const ROW_GAP = 96;
export const SUBTREE_GAP = 72;

export const ROOT_ID = "kyle-hutchinson";
export const ROOT_NAME = "Kyle Hutchinson";

export function createInitialTree(): Tree {
  return {
    rootId: ROOT_ID,
    persons: {
      [ROOT_ID]: { id: ROOT_ID, name: ROOT_NAME, parentIds: [], spouseIds: [] },
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
): Tree {
  const next = clone(tree);
  const child = next.persons[childId];
  if (child.parentIds.length >= 2) return tree;
  next.persons[newId] = { id: newId, name, parentIds: [], spouseIds: [] };
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
): Tree {
  const next = clone(tree);
  const parent = next.persons[parentId];
  const parents = [parentId];
  if (parent.spouseIds.length > 0) parents.push(parent.spouseIds[0]);
  next.persons[newId] = { id: newId, name, parentIds: parents, spouseIds: [] };
  return next;
}

export function addSpouse(
  tree: Tree,
  personId: string,
  newId: string,
  name: string,
): Tree {
  const next = clone(tree);
  const person = next.persons[personId];
  next.persons[newId] = { id: newId, name, parentIds: [], spouseIds: [personId] };
  person.spouseIds.push(newId);
  return next;
}

export function renamePerson(tree: Tree, id: string, name: string): Tree {
  const next = clone(tree);
  next.persons[id].name = name;
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

// ---------- Layout ----------

interface UnitInternal {
  id: string;
  primaryId: string;
  partnerId: string | null;
  parentUnitId: string | null;
  childUnitIds: string[];
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

function buildUnits(tree: Tree): {
  units: Map<string, UnitInternal>;
  unitOf: Map<string, string>;
  order: string[];
} {
  const order = bfsOrder(tree);
  const unitOf = new Map<string, string>();
  const units = new Map<string, UnitInternal>();

  for (const id of order) {
    if (unitOf.has(id)) continue;
    const p = tree.persons[id];
    const partner = p.spouseIds.find((sid) => !unitOf.has(sid)) ?? null;
    units.set(id, {
      id,
      primaryId: id,
      partnerId: partner,
      parentUnitId: null,
      childUnitIds: [],
    });
    unitOf.set(id, id);
    if (partner !== null) unitOf.set(partner, id);
  }

  // Determine parent unit for each unit, then attach as child of that parent unit.
  for (const id of order) {
    const unitId = unitOf.get(id);
    if (unitId !== id) continue;
    const unit = units.get(unitId)!;
    const primary = tree.persons[unit.primaryId];
    if (primary.parentIds.length > 0) {
      const anchorParentId = primary.parentIds[0];
      const parentUnitId = unitOf.get(anchorParentId);
      if (parentUnitId !== undefined && parentUnitId !== unit.id) {
        unit.parentUnitId = parentUnitId;
      }
    }
  }
  for (const unit of units.values()) {
    if (unit.parentUnitId !== null) {
      const parentUnit = units.get(unit.parentUnitId)!;
      if (!parentUnit.childUnitIds.includes(unit.id)) {
        parentUnit.childUnitIds.push(unit.id);
      }
    }
  }

  return { units, unitOf, order };
}

function unitWidth(unit: UnitInternal): number {
  return unit.partnerId !== null ? NODE_W * 2 + SPOUSE_GAP : NODE_W;
}

function subtreeWidth(
  unit: UnitInternal,
  units: Map<string, UnitInternal>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(unit.id);
  if (cached !== undefined) return cached;
  const own = unitWidth(unit);
  if (unit.childUnitIds.length === 0) {
    cache.set(unit.id, own);
    return own;
  }
  const childTotal =
    unit.childUnitIds.reduce(
      (sum, cid) => sum + subtreeWidth(units.get(cid)!, units, cache),
      0,
    ) + SIBLING_GAP * (unit.childUnitIds.length - 1);
  const w = Math.max(own, childTotal);
  cache.set(unit.id, w);
  return w;
}

function placeUnit(
  unit: UnitInternal,
  units: Map<string, UnitInternal>,
  startX: number,
  y: number,
  layout: Layout,
  widths: Map<string, number>,
): void {
  const width = widths.get(unit.id)!;
  const own = unitWidth(unit);
  const centerX = startX + width / 2;
  const leftX = centerX - own / 2;

  layout.nodes.push({ id: unit.primaryId, x: leftX, y, w: NODE_W, h: NODE_H });
  if (unit.partnerId !== null) {
    layout.nodes.push({
      id: unit.partnerId,
      x: leftX + NODE_W + SPOUSE_GAP,
      y,
      w: NODE_W,
      h: NODE_H,
    });
    layout.edges.push({
      kind: "spouse",
      aId: unit.primaryId,
      bId: unit.partnerId,
    });
  }

  if (unit.childUnitIds.length === 0) return;

  const childTotal =
    unit.childUnitIds.reduce((sum, cid) => sum + widths.get(cid)!, 0) +
    SIBLING_GAP * (unit.childUnitIds.length - 1);
  let cursor = centerX - childTotal / 2;
  for (const cid of unit.childUnitIds) {
    const child = units.get(cid)!;
    const cw = widths.get(cid)!;
    placeUnit(child, units, cursor, y + NODE_H + ROW_GAP, layout, widths);
    layout.edges.push({
      kind: "parent-child",
      parentAId: unit.primaryId,
      parentBId: unit.partnerId,
      childId: child.primaryId,
    });
    cursor += cw + SIBLING_GAP;
  }
}

export function computeLayout(tree: Tree): Layout {
  const { units, order } = buildUnits(tree);
  const layout: Layout = { nodes: [], edges: [], width: 0, height: 0 };
  const widths = new Map<string, number>();

  // Topmost units, ordered by BFS-from-root so root's lineage tends to render first.
  const seenUnit = new Set<string>();
  const tops: UnitInternal[] = [];
  for (const id of order) {
    const u = units.get(id);
    if (!u || seenUnit.has(u.id)) continue;
    if (u.parentUnitId === null) {
      tops.push(u);
      seenUnit.add(u.id);
    }
  }

  let cursor = 0;
  for (const top of tops) {
    const w = subtreeWidth(top, units, widths);
    placeUnit(top, units, cursor, 0, layout, widths);
    cursor += w + SUBTREE_GAP;
  }

  layout.width = Math.max(0, cursor - SUBTREE_GAP);
  layout.height = layout.nodes.reduce(
    (max: number, n: LaidOutNode) => Math.max(max, n.y + n.h),
    0,
  );
  return layout;
}
