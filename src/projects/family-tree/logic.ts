import {
  coordSimplex,
  graphStratify,
  sugiyama,
} from "d3-dag";
import type { Graph, Layering, Separation } from "d3-dag";
import type {
  Gender,
  LaidOutEdge,
  LaidOutNode,
  Layout,
  NameFields,
  Person,
  Tree,
  Union,
  UnionStatus,
} from "./types";

export const NODE_W = 180;
// Cards are a fixed size (the layout never measures text), so this must fit
// the tallest content: a name wrapped onto two lines, the "née" line, and
// the relation line.
export const NODE_H = 90;
export const SPOUSE_GAP = 28;
export const ROW_GAP = 96;
export const SUBTREE_GAP = 72;

export const ROOT_ID = "kyle-hutchinson";
export const ROOT_FIRST_NAME = "Kyle";
export const ROOT_LAST_NAME = "Hutchinson";

export function fullName(
  person: Pick<Person, "firstName" | "lastName" | "commonName">,
): string {
  const middle = person.commonName ? ` "${person.commonName}"` : "";
  const last = person.lastName ? ` ${person.lastName}` : "";
  return `${person.firstName}${middle}${last}`;
}

// A current union is the one a person is in now; former unions have ended.
// Layout pairs current partners side by side, and a former union sits
// beside them — so one ended marriage plus a current one never reads as
// bigamy.
export function isCurrentUnion(status: UnionStatus): boolean {
  return status === "married" || status === "partner";
}

export function currentPartnerIds(person: Person): string[] {
  return person.unions
    .filter((u) => isCurrentUnion(u.status))
    .map((u) => u.personId);
}

export function formerPartnerIds(person: Person): string[] {
  return person.unions
    .filter((u) => !isCurrentUnion(u.status))
    .map((u) => u.personId);
}

function unionWith(person: Person, otherId: string): Union | undefined {
  return person.unions.find((u) => u.personId === otherId);
}

// A fresh union entry. An ended-by-death union starts without a recorded
// deceased spouse.
export function newUnion(personId: string, status: UnionStatus): Union {
  return status === "ended-by-death"
    ? { personId, status, deceasedId: null }
    : { personId, status };
}

// Single source of truth for the Person shape — every place that creates a
// new person funnels through this so adding a field can't drift across the
// 4 create paths.
function makePerson(
  id: string,
  name: NameFields,
  gender: Gender,
  overrides: Partial<Pick<Person, "parentIds" | "unions">> = {},
): Person {
  return {
    id,
    firstName: name.firstName,
    lastName: name.lastName,
    commonName: name.commonName,
    birthSurname: name.birthSurname,
    notes: "",
    gender,
    parentIds: [],
    unions: [],
    ...overrides,
  };
}

export function createInitialTree(): Tree {
  const rootName: NameFields = {
    firstName: ROOT_FIRST_NAME,
    lastName: ROOT_LAST_NAME,
    commonName: "",
    birthSurname: "",
  };
  return {
    rootId: ROOT_ID,
    persons: { [ROOT_ID]: makePerson(ROOT_ID, rootName, "M") },
  };
}

function clone(tree: Tree): Tree {
  const persons: Record<string, Person> = {};
  for (const [id, p] of Object.entries(tree.persons)) {
    persons[id] = {
      ...p,
      parentIds: [...p.parentIds],
      unions: p.unions.map((u) => ({ ...u })),
    };
  }
  return { rootId: tree.rootId, persons };
}

export function addParent(
  tree: Tree,
  childId: string,
  newId: string,
  name: NameFields,
  gender: Gender,
): Tree {
  const next = clone(tree);
  const child = next.persons[childId];
  if (child.parentIds.length >= 2) return tree;
  next.persons[newId] = makePerson(newId, name, gender);
  child.parentIds.push(newId);

  if (child.parentIds.length === 2) {
    const otherParentId = child.parentIds.find((p) => p !== newId)!;
    const otherParent = next.persons[otherParentId];
    const newParent = next.persons[newId];
    otherParent.unions.push({ personId: newId, status: "married" });
    newParent.unions.push({ personId: otherParentId, status: "married" });
  }
  return next;
}

export function addChild(
  tree: Tree,
  parentId: string,
  newId: string,
  name: NameFields,
  gender: Gender,
  // Co-parent selector with three meanings, intentionally distinct:
  //   string  — use this person as the second parent.
  //   null    — EXPLICIT single parent (UI picker chose "X only").
  //   omitted — no choice provided; fall back to parent's first current
  //             spouse (back-compat for single-marriage callers).
  coParentId?: string | null,
): Tree {
  const next = clone(tree);
  const parent = next.persons[parentId];
  const parents = [parentId];
  if (coParentId === null) {
    // Explicit single parent — leave the parents array at [parentId].
  } else if (coParentId !== undefined && coParentId !== parentId) {
    parents.push(coParentId);
  } else {
    const partners = currentPartnerIds(parent);
    if (partners.length > 0) parents.push(partners[0]);
  }
  next.persons[newId] = makePerson(newId, name, gender, { parentIds: parents });
  return next;
}

export function addSpouse(
  tree: Tree,
  personId: string,
  newId: string,
  name: NameFields,
  gender: Gender,
  status: UnionStatus = "married",
  // Existing children of `personId` the new spouse should also bio-parent.
  // The UI picker presents these as opt-in checkboxes so the silent
  // step-parent promotion that previously corrupted data can't happen — the
  // user names exactly which kids the new spouse is also a bio parent of.
  bioChildIds: readonly string[] = [],
): Tree {
  const next = clone(tree);
  const person = next.persons[personId];
  next.persons[newId] = makePerson(newId, name, gender, {
    unions: [newUnion(personId, status)],
  });
  person.unions.push(newUnion(newId, status));
  for (const childId of bioChildIds) {
    const child = next.persons[childId];
    if (child.parentIds.includes(newId)) continue;
    if (child.parentIds.length >= 2) continue;
    child.parentIds.push(newId);
  }
  return next;
}

// Change the status of an existing union, on both sides. No-op when the pair
// has no union or already has this status. Leaving ended-by-death drops the
// recorded deceased spouse along with it.
export function setUnionStatus(
  tree: Tree,
  aId: string,
  bId: string,
  status: UnionStatus,
): Tree {
  const existing = unionWith(tree.persons[aId], bId);
  if (existing === undefined || existing.status === status) return tree;
  const next = clone(tree);
  for (const [selfId, otherId] of [[aId, bId], [bId, aId]]) {
    const self = next.persons[selfId];
    const index = self.unions.findIndex((u) => u.personId === otherId);
    if (index === -1) {
      self.unions.push(newUnion(otherId, status));
    } else {
      self.unions[index] = newUnion(otherId, status);
    }
  }
  return next;
}

// Record which spouse of an ended-by-death union died (null clears it), on
// both sides.
export function setUnionDeceased(
  tree: Tree,
  aId: string,
  bId: string,
  deceasedId: string | null,
): Tree {
  const existing = unionWith(tree.persons[aId], bId);
  if (existing?.status !== "ended-by-death") {
    throw new Error(`setUnionDeceased: ${aId} & ${bId} have no ended-by-death union`);
  }
  if (deceasedId !== null && deceasedId !== aId && deceasedId !== bId) {
    throw new Error(`setUnionDeceased: ${deceasedId} is not ${aId} or ${bId}`);
  }
  if (existing.deceasedId === deceasedId) return tree;
  const next = clone(tree);
  for (const [selfId, otherId] of [[aId, bId], [bId, aId]]) {
    const self = next.persons[selfId];
    const index = self.unions.findIndex((u) => u.personId === otherId);
    self.unions[index] = { personId: otherId, status: "ended-by-death", deceasedId };
  }
  return next;
}

export function renamePerson(tree: Tree, id: string, name: NameFields): Tree {
  const next = clone(tree);
  Object.assign(next.persons[id], name);
  return next;
}

export function setGender(tree: Tree, id: string, gender: Gender): Tree {
  const next = clone(tree);
  next.persons[id].gender = gender;
  return next;
}

export function setNotes(tree: Tree, id: string, notes: string): Tree {
  const next = clone(tree);
  next.persons[id].notes = notes;
  return next;
}

export function deletePerson(tree: Tree, id: string): Tree {
  if (id === tree.rootId) return tree;
  const next = clone(tree);
  delete next.persons[id];
  for (const p of Object.values(next.persons)) {
    p.parentIds = p.parentIds.filter((pid) => pid !== id);
    p.unions = p.unions.filter((u) => u.personId !== id);
  }
  return next;
}


// Every broken data-model invariant in `tree`, as readable sentences. An
// empty list means the tree is sound. The logic functions assume these
// invariants, so a tree that breaks one must never be saved.
export function treeProblems(tree: Tree): string[] {
  const problems: string[] = [];
  const { persons } = tree;
  const label = (id: string): string =>
    id in persons ? `${fullName(persons[id])} (${id})` : id;

  if (!(tree.rootId in persons)) {
    problems.push(`root ${tree.rootId} is missing`);
  }
  for (const [key, person] of Object.entries(persons)) {
    const who = label(key);
    if (person.id !== key) problems.push(`${who} is stored under key ${key} but has id ${person.id}`);
    if (person.firstName.trim() === "") problems.push(`${who} has an empty first name`);
    if (!GENDER_CYCLE.includes(person.gender)) problems.push(`${who} has unknown gender ${String(person.gender)}`);

    if (person.parentIds.length > 2) problems.push(`${who} has more than two parents`);
    if (new Set(person.parentIds).size !== person.parentIds.length) {
      problems.push(`${who} lists the same parent twice`);
    }
    for (const parentId of person.parentIds) {
      if (parentId === key) problems.push(`${who} is their own parent`);
      else if (!(parentId in persons)) problems.push(`${who} has missing parent ${parentId}`);
    }

    const partnerIds = person.unions.map((u) => u.personId);
    if (new Set(partnerIds).size !== partnerIds.length) {
      problems.push(`${who} has two unions with the same person`);
    }
    for (const union of person.unions) {
      const otherId = union.personId;
      if (otherId === key) {
        problems.push(`${who} is in a union with themselves`);
        continue;
      }
      if (!(otherId in persons)) {
        problems.push(`${who} has a union with missing person ${otherId}`);
        continue;
      }
      const mirror = unionWith(persons[otherId], key);
      if (mirror === undefined) {
        problems.push(`${who}'s union with ${label(otherId)} is one-sided`);
      } else if (mirror.status !== union.status) {
        problems.push(`${who}'s union with ${label(otherId)} has mismatched statuses`);
      }
      if (union.status === "ended-by-death") {
        const { deceasedId } = union;
        if (deceasedId !== null && deceasedId !== key && deceasedId !== otherId) {
          problems.push(`${who}'s union with ${label(otherId)} names an outsider as deceased`);
        }
        if (mirror?.status === "ended-by-death" && mirror.deceasedId !== deceasedId) {
          problems.push(`${who}'s union with ${label(otherId)} disagrees on who died`);
        }
      }
    }
  }
  // The ancestor walk trusts parent ids, so it only runs on an otherwise
  // sound tree.
  if (problems.length === 0) {
    for (const id of Object.keys(persons)) {
      if (isOwnAncestor(tree, id)) {
        problems.push(`${label(id)} is their own ancestor`);
      }
    }
  }
  return problems;
}

function isOwnAncestor(tree: Tree, id: string): boolean {
  const seen = new Set<string>();
  const stack = [...tree.persons[id].parentIds];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...tree.persons[cur].parentIds);
  }
  return false;
}

// A union as persisted by any schema version so far. Ended-by-death unions
// written before `deceasedId` existed lack it.
interface StoredUnion {
  personId: string;
  status: UnionStatus;
  deceasedId?: string | null;
}

// A person as persisted by any schema version so far. Rows written before
// unions existed carry two parallel lists instead: `spouseIds` (married) and,
// added later still, `divorcedSpouseIds`.
interface StoredPerson {
  id: string;
  firstName: string;
  lastName: string;
  commonName?: string;
  birthSurname?: string;
  notes?: string;
  gender: Gender;
  parentIds: string[];
  unions?: StoredUnion[];
  spouseIds?: string[];
  divorcedSpouseIds?: string[];
}

interface StoredTree {
  rootId: string;
  persons: Record<string, StoredPerson>;
}

function storedUnions(person: StoredPerson): Union[] {
  if (person.unions !== undefined) {
    return person.unions.map((u) =>
      u.status === "ended-by-death"
        ? { personId: u.personId, status: u.status, deceasedId: u.deceasedId ?? null }
        : newUnion(u.personId, u.status),
    );
  }
  return [
    ...(person.spouseIds ?? []).map((personId) => newUnion(personId, "married")),
    ...(person.divorcedSpouseIds ?? []).map((personId) =>
      newUnion(personId, "divorced"),
    ),
  ];
}

// Backfill schema fields added later (commonName, birthSurname, notes,
// deceasedId) and migrate the pre-union spouse lists into `unions`, so older persisted rows
// hydrate without crashing. Returns `changed: true` when a row had to be
// upgraded — callers use that to write the healed row back.
export function normalizeTree(raw: unknown): { tree: Tree; changed: boolean } {
  const t = raw as StoredTree;
  let changed = false;
  const persons: Record<string, Person> = {};
  for (const [id, person] of Object.entries(t.persons)) {
    if (
      person.unions === undefined ||
      person.commonName === undefined ||
      person.birthSurname === undefined ||
      person.notes === undefined ||
      person.unions.some(
        (u) => u.status === "ended-by-death" && u.deceasedId === undefined,
      )
    ) {
      changed = true;
    }
    persons[id] = {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      commonName: person.commonName ?? "",
      birthSurname: person.birthSurname ?? "",
      notes: person.notes ?? "",
      gender: person.gender,
      parentIds: [...person.parentIds],
      unions: storedUnions(person),
    };
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

function halfSiblingTerm(gender: Gender): string {
  return "half-" + pickByGender(gender, "brother", "sister", "sibling");
}

function stepSiblingTerm(gender: Gender): string {
  return "step-" + pickByGender(gender, "brother", "sister", "sibling");
}

function stepParentTerm(gender: Gender): string {
  return "step-" + pickByGender(gender, "father", "mother", "parent");
}

function stepChildTerm(gender: Gender): string {
  return "step-" + pickByGender(gender, "son", "daughter", "child");
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

// The term for `describedId`, who is one side of `union`. Only the spouse
// recorded as having died is "late"; the survivor stays a plain husband or
// wife, and so do both when nobody is recorded.
function unionTerm(union: Union, describedId: string, gender: Gender): string {
  switch (union.status) {
    case "married":
      return spouseTerm(gender);
    case "divorced":
      return "ex-" + spouseTerm(gender);
    case "ended-by-death":
      return union.deceasedId === describedId
        ? "late " + spouseTerm(gender)
        : spouseTerm(gender);
    case "partner":
      return "partner";
    case "ex-partner":
      return "ex-partner";
  }
}

// Which unions each family of terms derives through. Step terms need a
// marriage in force. In-law terms outlive a spouse's death but not a
// divorce. Composite terms ("partner's mother", "son's partner") also run
// through unmarried partners, who get no in-law or step terms of their own.
const STEP_STATUSES: readonly UnionStatus[] = ["married"];
const IN_LAW_STATUSES: readonly UnionStatus[] = ["married", "ended-by-death"];
const COMPOSITE_STATUSES: readonly UnionStatus[] = [
  "married",
  "ended-by-death",
  "partner",
];

function unionsWith(person: Person, statuses: readonly UnionStatus[]): Union[] {
  return person.unions.filter((u) => statuses.includes(u.status));
}

function partnerIdsWith(
  person: Person,
  statuses: readonly UnionStatus[],
): string[] {
  return unionsWith(person, statuses).map((u) => u.personId);
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

  // 1. Direct union, in any status.
  const direct = unionWith(root, targetId);
  if (direct !== undefined) return unionTerm(direct, targetId, target.gender);

  // 2. Blood relation. Sibling distance gets full/half discrimination by
  //    comparing parent sets — sharing all known parents is a full sibling,
  //    sharing some-but-not-all is a half-sibling.
  const blood = findBloodPath(tree, rootId, targetId);
  if (blood !== null) {
    if (blood.distFrom === 1 && blood.distTo === 1) {
      const shared = root.parentIds.filter((id) =>
        target.parentIds.includes(id),
      ).length;
      const maxKnown = Math.max(root.parentIds.length, target.parentIds.length);
      return shared === maxKnown
        ? siblingTerm(target.gender)
        : halfSiblingTerm(target.gender);
    }
    return classifyBlood(blood, target.gender);
  }

  // 3. Step-parent: root's parent's spouse. Bio parents are caught by the
  //    blood branch above, so anyone reaching here is a non-bio spouse.
  for (const parentId of root.parentIds) {
    const parentSpouses = partnerIdsWith(tree.persons[parentId], STEP_STATUSES);
    if (parentSpouses.includes(targetId)) {
      return stepParentTerm(target.gender);
    }
  }

  // 4. Step-child: child of root's spouse. Bio children also caught above.
  for (const spouseId of partnerIdsWith(root, STEP_STATUSES)) {
    if (target.parentIds.includes(spouseId)) {
      return stepChildTerm(target.gender);
    }
  }

  // 5. Step-sibling: target's parent is married to root's parent, with no
  //    shared bio parent (half-siblings would have been caught in #2).
  for (const rp of root.parentIds) {
    const rpSpouses = partnerIdsWith(tree.persons[rp], STEP_STATUSES);
    for (const tp of target.parentIds) {
      if (rp === tp) continue;
      if (rpSpouses.includes(tp)) return stepSiblingTerm(target.gender);
    }
  }

  const rootInLawSpouses = partnerIdsWith(root, IN_LAW_STATUSES);
  const targetInLawSpouses = partnerIdsWith(target, IN_LAW_STATUSES);

  // 6. Sibling-in-law: spouse of any sibling, or sibling of any spouse.
  for (const spouseId of rootInLawSpouses) {
    const path = findBloodPath(tree, spouseId, targetId);
    if (path !== null && path.distFrom === 1 && path.distTo === 1) {
      return siblingInLawTerm(target.gender);
    }
  }
  for (const targetSpouseId of targetInLawSpouses) {
    const path = findBloodPath(tree, rootId, targetSpouseId);
    if (path !== null && path.distFrom === 1 && path.distTo === 1) {
      return siblingInLawTerm(target.gender);
    }
  }

  // 7. Parent-in-law: parent of any spouse.
  for (const spouseId of rootInLawSpouses) {
    const path = findBloodPath(tree, spouseId, targetId);
    if (path !== null && path.distFrom === 1 && path.distTo === 0) {
      return parentInLawTerm(target.gender);
    }
  }

  // 8. Child-in-law: spouse of any child.
  for (const targetSpouseId of targetInLawSpouses) {
    const path = findBloodPath(tree, rootId, targetSpouseId);
    if (path !== null && path.distFrom === 0 && path.distTo === 1) {
      return childInLawTerm(target.gender);
    }
  }

  // 9. Through one of root's spouses to a blood relative of that spouse.
  for (const union of unionsWith(root, COMPOSITE_STATUSES)) {
    const path = findBloodPath(tree, union.personId, targetId);
    if (path === null) continue;
    const inner = classifyBlood(path, target.gender);
    if (inner !== null) {
      const spouseGender = tree.persons[union.personId].gender;
      return `${unionTerm(union, union.personId, spouseGender)}'s ${inner}`;
    }
  }

  // 10. Target is married into the family — spouse of root's blood relative.
  // English folds spouses-of-aunts/uncles into "aunt"/"uncle" themselves, so
  // gender-flip when the inner relation is an aunt/uncle (or great-).
  for (const union of unionsWith(target, COMPOSITE_STATUSES)) {
    const path = findBloodPath(tree, rootId, union.personId);
    if (path === null) continue;
    const foldsIntoAuntUncle =
      IN_LAW_STATUSES.includes(union.status) &&
      path.distTo === 1 &&
      path.distFrom > 1;
    if (foldsIntoAuntUncle) return classifyBlood(path, target.gender);
    const inner = classifyBlood(path, tree.persons[union.personId].gender);
    if (inner !== null) {
      return `${inner}'s ${unionTerm(union, targetId, target.gender)}`;
    }
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
    for (const spouseId of partnerIdsWith(person, COMPOSITE_STATUSES)) {
      visit(spouseId, "spouse");
    }
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
  // Adjacent members of one render-time row cluster:
  //   1 member  — singleton.
  //   2 members — single union (current or former).
  //   3 members — one former + the person + one current partner. This is the
  //               common "remarried" shape; rendered side-by-side with the
  //               person in the middle and both partners adjacent so each
  //               marriage line is short and child-drops emerge from clearly
  //               identifiable marriage midpoints.
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
    for (const spouseId of currentPartnerIds(person)) visit(spouseId, g);
    for (const exId of formerPartnerIds(person)) visit(exId, g);
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

    // Right-hand partner: the current spouse, if any uncoupled one exists.
    const current = p.unions.find(
      (u) => isCurrentUnion(u.status) && !coupleOf.has(u.personId),
    );

    // Left-hand partner: a "free" ex — uncoupled AND not remarried elsewhere.
    // A remarried ex belongs in their own cluster with their new spouse, so
    // we leave them alone here; the post-layout sweep emits a long line
    // across whatever distance the layout produces.
    const former = p.unions.find(
      (u) =>
        !isCurrentUnion(u.status) &&
        !coupleOf.has(u.personId) &&
        currentPartnerIds(tree.persons[u.personId]).length === 0,
    );

    const members: string[] = [];
    const statuses: UnionStatus[] = [];

    if (former !== undefined) {
      members.push(former.personId);
      statuses.push(former.status);
    }
    members.push(id);
    if (current !== undefined) {
      members.push(current.personId);
      statuses.push(current.status);
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
// center x. Crossing minimization runs via HiGHS-WASM (~30× faster than
// d3-dag's bundled javascript-lp-solver) — the whole decross-highs module
// (and the ~600KB highs WASM) is dynamic-imported so the React component
// bundle that imports logic.ts for types/helpers doesn't pull in any of it.
// Only the layout Web Worker (which is the sole caller of computeLayout)
// ever fetches this chunk. coordSimplex assigns x via an LP that pulls
// children under their parents (subject to layer ordering and width/gap
// constraints).
// Solver errors propagate: swallowing them would disguise a crashed solve as
// a merely ugly layout.
async function layoutCouplesViaSugiyama(
  couples: CoupleUnit[],
  parentCouplesOf: Map<string, string[]>,
): Promise<Map<string, number>> {
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
  const mod = await import("./decross-highs");
  const decross = mod.decrossHighs(await mod.loadHighs());
  const layout = sugiyama()
    .layering(layeringByGenerationOp)
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

export async function computeLayout(tree: Tree): Promise<Layout> {
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
  const rawCenterX = await layoutCouplesViaSugiyama(couples, parentCouplesOf);

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
  // for 3-member [ex, person, current] clusters: a kid from the left marriage
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

  // Within-couple spouse ordering: place each spouse on the side closer to
  // their own parents. Doesn't affect couple-level crossings but reduces
  // visual length of the parent→spouse drops.
  // Skipped for 3+ member clusters: their order ([ex, person, current]) is
  // already meaningful — the person sits in the middle by construction so
  // each marriage line stays short.
  const spouseSideOrder = new Map<string, string[]>();
  for (const couple of couples) {
    if (couple.members.length !== 2) {
      spouseSideOrder.set(couple.id, [...couple.members]);
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

  // Marriage-aware child reordering. Within each parent couple/cluster, sort
  // children by which marriage produced them so blended families read
  // correctly: e.g. for [Maya, Gary, Marta], Maya's-side kids on the left,
  // Maya+Gary shared kids next, then Gary+Marta shared, then Marta's-side.
  // Rank is the average index of the child's bio parents within the parent
  // cluster's member array (-1/0/+1 falls out naturally for the 2-member
  // case). Limited to leaf children — translating non-leaf subtrees risks
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
    // One spouse edge per adjacent pair. spouseSideOrder may have swapped
    // members in 2-member couples, so map the i-th adjacent pair back to
    // the original buildCoupleUnits position to pick the right status.
    const indexOfOriginal = new Map(
      couple.members.map((m, idx) => [m, idx] as const),
    );
    for (let i = 0; i < sides.length - 1; i++) {
      const a = sides[i];
      const b = sides[i + 1];
      const aIdx = indexOfOriginal.get(a) ?? i;
      const bIdx = indexOfOriginal.get(b) ?? i + 1;
      const lower = Math.min(aIdx, bIdx);
      layout.edges.push({
        kind: "spouse",
        aId: a,
        bId: b,
        status: couple.statuses[lower] ?? "married",
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

  // Sweep former unions and emit their lines for any that didn't end up in
  // the same couple unit — e.g. one ex remarried, so the other
  // landed as a singleton. The line spans wherever the layout placed the
  // two people; it's visually imperfect when the singleton lands far from
  // the ex, but at least the relationship stays visible. Proper adjacency
  // requires the marriage-as-DAG-primitive refactor (a person rendered
  // once but represented as a member of multiple marriage units).
  const emittedSpouseKey = new Set<string>();
  for (const couple of couples) {
    if (couple.members.length === 2) {
      const [a, b] = couple.members;
      emittedSpouseKey.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  for (const person of Object.values(tree.persons)) {
    for (const union of person.unions) {
      if (isCurrentUnion(union.status)) continue;
      const exId = union.personId;
      const key =
        person.id < exId ? `${person.id}|${exId}` : `${exId}|${person.id}`;
      if (emittedSpouseKey.has(key)) continue;
      emittedSpouseKey.add(key);
      layout.edges.push({
        kind: "spouse",
        aId: person.id,
        bId: exId,
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

function sameUnions(a: Union[], b: Union[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].personId !== b[i].personId || a[i].status !== b[i].status) {
      return false;
    }
  }
  return true;
}

// Fingerprint the parts of a tree that affect layout: which persons exist,
// their parent IDs and unions (order included, since the renderer keys off
// the first parent/spouse), and the root. Names and
// genders are deliberately excluded — they don't change positions, so a
// rename shouldn't invalidate the cached optimal layout.
//
// Person IDs are sorted before hashing so the hash is invariant to
// `Object.keys` iteration order. This matters because PostgreSQL jsonb
// canonicalizes object keys (by length, then lex) on write, so a tree
// hashed before persisting and the same tree hashed after a Supabase
// roundtrip would otherwise produce different hashes — breaking the
// cache-staleness check.
//
// FNV-1a-32 is a non-cryptographic hash. For ~150-person trees the
// collision probability across an indefinite session is ~150 / 2^32 ≈
// 3.5e-8 — well below "two random topologies happen to collide and one
// client serves the wrong layout to another". A collision would not be
// silently wrong forever: the next Optimize run overwrites with the right
// layout for that hash.
//
// Married and divorced unions hash exactly as the pre-union `spouseIds` and
// `divorcedSpouseIds` lists did, so the layout cached in Supabase stays valid
// across the migration to `unions`. Later statuses only contribute when
// present, which keeps trees that don't use them on their old hash.
const LATER_UNION_STATUSES: readonly UnionStatus[] = [
  "ended-by-death",
  "partner",
  "ex-partner",
];

export function topologyHash(tree: Tree): string {
  const parts: string[] = [tree.rootId];
  const sortedIds = Object.keys(tree.persons).slice().sort();
  for (const id of sortedIds) {
    const p = tree.persons[id];
    const idsWith = (status: UnionStatus): string =>
      p.unions
        .filter((u) => u.status === status)
        .map((u) => u.personId)
        .join(",");
    parts.push(id, p.parentIds.join(","), idsWith("married"), idsWith("divorced"));
    for (const status of LATER_UNION_STATUSES) {
      const ids = idsWith(status);
      if (ids !== "") parts.push(`${status}:${ids}`);
    }
  }
  return fnv1a32(parts.join("\n"));
}

function fnv1a32(s: string): string {
  // Standard FNV-1a constants. Math.imul keeps the multiply in 32-bit-signed
  // space (JS numbers would lose precision past 2^53 on the raw mul). The
  // final >>> 0 reinterprets the signed accumulator as unsigned for the hex.
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
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
        !sameUnions(a.unions, b.unions)
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
// or above a child. Each new node is checked against everything already on
// its row and shifted left or right until no overlap remains — so a parent
// can take a quick succession of "add child" clicks without the new kids
// piling on top of each other. Then rebuild edges from `nextTree` (so newly-
// added relationships render right away) and shift everything so min x/y = 0.
//
// Existing nodes keep their cached fancy positions; only the new arrivals
// move. The result is "approximate but readable" — the user sees their
// additions land in obviously-distinct slots and can click Optimize to get
// the proper sugiyama layout when they're done editing.
interface Candidate {
  x: number;
  y: number;
  // Which way to scan first when the candidate slot is occupied. We prefer
  // extending in the same direction as the anchor relationship (a new child
  // pushes the row rightward; a newly added ex-spouse anchored to the LEFT
  // of an existing partner stays on the left side).
  preferLeft: boolean;
}

function findCandidate(
  id: string,
  nextTree: Tree,
  byId: Map<string, LaidOutNode>,
): Candidate {
  const person = nextTree.persons[id];
  for (const pid of person.parentIds) {
    const p = byId.get(pid);
    if (p) return { x: p.x, y: p.y + p.h + ROW_GAP, preferLeft: false };
  }
  for (const sid of currentPartnerIds(person)) {
    const s = byId.get(sid);
    if (s) return { x: s.x + s.w + SPOUSE_GAP, y: s.y, preferLeft: false };
  }
  // Newly-added ex-spouse — drop on the LEFT of the existing partner so we
  // don't stack on top of a current spouse (typically to the right).
  for (const sid of formerPartnerIds(person)) {
    const s = byId.get(sid);
    if (s) {
      return { x: s.x - NODE_W - SPOUSE_GAP, y: s.y, preferLeft: true };
    }
  }
  // Newly-added person is somebody else's parent.
  for (const candidate of Object.values(nextTree.persons)) {
    if (!candidate.parentIds.includes(id)) continue;
    const c = byId.get(candidate.id);
    if (c) return { x: c.x, y: c.y - c.h - ROW_GAP, preferLeft: false };
  }
  return { x: 0, y: 0, preferLeft: false };
}

// Slide a new node along its row until it no longer overlaps any existing
// node on that row. Scans both directions from the candidate and picks the
// closer non-conflicting slot (ties broken by `preferLeft`). Existing nodes
// keep their positions — only the newcomer moves, so the cached fancy layout
// stays visually intact for everyone already placed.
function placeWithoutOverlap(
  candidate: Candidate,
  obstacles: readonly LaidOutNode[],
): { x: number; y: number } {
  const onSameRow = (n: LaidOutNode): boolean => n.y === candidate.y;
  const collidesAt = (x: number): LaidOutNode | null => {
    for (const n of obstacles) {
      if (!onSameRow(n)) continue;
      const xOverlap = !(x + NODE_W <= n.x || n.x + n.w <= x);
      if (xOverlap) return n;
    }
    return null;
  };
  if (collidesAt(candidate.x) === null) {
    return { x: candidate.x, y: candidate.y };
  }
  const scan = (dir: 1 | -1): number => {
    let x = candidate.x;
    let c = collidesAt(x);
    // Bounded by the obstacle count — each iteration must clear past a
    // distinct obstacle, and a finite row has finitely many.
    let safety = obstacles.length + 2;
    while (c !== null && safety-- > 0) {
      x = dir === 1 ? c.x + c.w + SUBTREE_GAP : c.x - NODE_W - SUBTREE_GAP;
      c = collidesAt(x);
    }
    return x;
  };
  const rightX = scan(1);
  const leftX = scan(-1);
  const rightDist = rightX - candidate.x;
  const leftDist = candidate.x - leftX;
  const chooseLeft = candidate.preferLeft
    ? leftDist <= rightDist
    : leftDist < rightDist;
  return { x: chooseLeft ? leftX : rightX, y: candidate.y };
}

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
    const candidate = findCandidate(id, nextTree, byId);
    const { x, y } = placeWithoutOverlap(candidate, nodes);
    const node: LaidOutNode = { id, x, y, w: NODE_W, h: NODE_H };
    nodes.push(node);
    byId.set(id, node);
  }

  const edges: LaidOutEdge[] = [];
  const seenSpouse = new Set<string>();
  for (const person of Object.values(nextTree.persons)) {
    if (!byId.has(person.id)) continue;
    for (const { personId: sid, status } of person.unions) {
      if (!byId.has(sid)) continue;
      const key =
        person.id < sid ? `${person.id}|${sid}` : `${sid}|${person.id}`;
      if (seenSpouse.has(key)) continue;
      seenSpouse.add(key);
      edges.push({ kind: "spouse", aId: person.id, bId: sid, status });
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
