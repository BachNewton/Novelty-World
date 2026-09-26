import type {
  Gender,
  LaidOutNode,
  NameFields,
  Person,
  Research,
  ResearchQuestion,
  ResearchRecord,
  ResearchStatus,
  Tree,
  Union,
  UnionStatus,
} from "./types";
import { UNKNOWN_HERITAGE, isHeritageCode, isHeritageEntryCode } from "./heritages";
import type { HeritageCode, HeritageEntryCode } from "./heritages";

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

// The name as records spell it, for the edit panel. Cards use fullName.
export function fullNameWithMiddle(
  person: Pick<Person, "firstName" | "middleName" | "lastName" | "commonName">,
): string {
  const first = person.middleName
    ? `${person.firstName} ${person.middleName}`
    : person.firstName;
  return fullName({ ...person, firstName: first });
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
    middleName: name.middleName,
    lastName: name.lastName,
    commonName: name.commonName,
    birthSurname: name.birthSurname,
    notes: "",
    birthDate: "",
    research: emptyResearch(),
    heritage: [],
    gender,
    parentIds: [],
    unions: [],
    ...overrides,
  };
}

export function createInitialTree(): Tree {
  const rootName: NameFields = {
    firstName: ROOT_FIRST_NAME,
    middleName: "",
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
      research: copyResearch(p.research),
      heritage: [...p.heritage],
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

// The year of a valid, non-empty birth date, keeping the "~" of an
// approximate year.
export function birthYear(birthDate: string): string {
  return birthDate.startsWith("~") ? birthDate : birthDate.slice(0, 4);
}

// Why `value` isn't a partial ISO date ("YYYY", "YYYY-MM" or "YYYY-MM-DD")
// or an approximate year ("~YYYY"), or null when it is one. The empty string
// means "not set" and is valid.
export function birthDateProblem(value: string): string | null {
  if (value === "") return null;
  if (value.startsWith("~")) {
    return /^~\d{4}$/.test(value) ? null : `"${value}" is not ~YYYY (an approximate year has no month or day)`;
  }
  const parts = value.split("-");
  const [year, month, day] = parts;
  const wellFormed =
    parts.length <= 3 &&
    /^\d{4}$/.test(year) &&
    parts.slice(1).every((part) => /^\d{2}$/.test(part));
  if (!wellFormed) return `"${value}" is not YYYY, YYYY-MM, YYYY-MM-DD or ~YYYY`;
  if (parts.length === 1) return null;
  const m = Number(month);
  if (m < 1 || m > 12) return `"${value}" has no month ${month}`;
  if (parts.length === 2) return null;
  // Day 0 of the following month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
  const d = Number(day);
  if (d < 1 || d > daysInMonth) return `"${value}" has no day ${day}`;
  return null;
}

export function setBirthDate(tree: Tree, id: string, birthDate: string): Tree {
  if (tree.persons[id].birthDate === birthDate) return tree;
  const next = clone(tree);
  next.persons[id].birthDate = birthDate;
  return next;
}

// Why `value` isn't a real full ISO date ("YYYY-MM-DD"), or null when it is.
export function fullDateProblem(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `"${value}" is not YYYY-MM-DD`;
  return birthDateProblem(value);
}

export const RESEARCH_QUESTIONS: readonly ResearchQuestion[] = ["family", "birthYear", "heritage"];
export const RESEARCH_STATUSES: readonly ResearchStatus[] = ["confirmed", "exhausted", "open"];

export function emptyResearch(): Research {
  return { family: null, birthYear: null, heritage: null };
}

function copyRecord(record: ResearchRecord | null): ResearchRecord | null {
  return record === null ? null : { ...record, sources: [...record.sources] };
}

function copyResearch(research: Research): Research {
  return {
    family: copyRecord(research.family),
    birthYear: copyRecord(research.birthYear),
    heritage: copyRecord(research.heritage),
  };
}

// Why `sources` isn't a valid source list, or null when it is: at least one
// name, each non-empty with no surrounding whitespace, none repeated.
export function researchSourcesProblem(sources: readonly unknown[]): string | null {
  if (sources.length === 0) return "has no sources";
  for (const source of sources) {
    if (typeof source !== "string" || source.trim() === "") return "has an empty source";
    if (source !== source.trim()) return `source ${JSON.stringify(source)} has surrounding whitespace`;
  }
  if (new Set(sources).size !== sources.length) return "lists the same source twice";
  return null;
}

// Why `record` isn't a sound research record, or null when it is.
function researchRecordProblem(record: ResearchRecord): string | null {
  if (!RESEARCH_STATUSES.includes(record.status)) return `has unknown status ${JSON.stringify(record.status)}`;
  const dateProblem = fullDateProblem(record.asOf);
  if (dateProblem !== null) return `date ${dateProblem}`;
  const sourcesProblem = researchSourcesProblem(record.sources);
  if (sourcesProblem !== null) return sourcesProblem;
  if (record.note !== record.note.trim()) return "note has surrounding whitespace";
  return null;
}

// Every problem with `person`'s research record. A confirmed birth year needs
// a birth date to confirm; an approximate year is precise enough.
function researchProblems(person: Person): string[] {
  const problems: string[] = [];
  for (const question of RESEARCH_QUESTIONS) {
    const record = person.research[question];
    if (record === null) continue;
    const problem = researchRecordProblem(record);
    if (problem !== null) problems.push(`${question} research ${problem}`);
  }
  if (person.research.birthYear?.status === "confirmed" && person.birthDate === "") {
    problems.push("birthYear research is confirmed but the birth date is empty");
  }
  return problems;
}

// Set `id`'s record for one research question, or clear it with null.
export function setResearch(
  tree: Tree,
  id: string,
  question: ResearchQuestion,
  record: ResearchRecord | null,
): Tree {
  const next = clone(tree);
  next.persons[id].research[question] = copyRecord(record);
  return next;
}

// Why `heritage` isn't a valid heritage entry, or null when it is. The empty
// list means "no entry" and is valid; a list of only unknown fills nothing,
// so it is rejected in favor of no entry.
export function heritageProblem(heritage: readonly unknown[]): string | null {
  const invalid = heritage.filter((code) => !isHeritageEntryCode(code));
  if (invalid.length > 0) {
    return `has unknown heritage ${invalid.map((code) => JSON.stringify(code)).join(", ")}`;
  }
  if (new Set(heritage).size !== heritage.length) return "lists the same heritage twice";
  if (heritage.length > 0 && heritage.every((code) => code === UNKNOWN_HERITAGE)) {
    return "has a heritage entry of only unknown, which is the same as no entry";
  }
  return null;
}

// Set `id`'s heritage entry; [] removes it.
export function setHeritage(
  tree: Tree,
  id: string,
  heritage: readonly HeritageEntryCode[],
): Tree {
  const before = tree.persons[id].heritage;
  if (before.length === heritage.length && before.every((code, i) => code === heritage[i])) {
    return tree;
  }
  const next = clone(tree);
  next.persons[id].heritage = [...heritage];
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
    const dateProblem = birthDateProblem(person.birthDate);
    if (dateProblem !== null) problems.push(`${who}'s birth date ${dateProblem}`);
    for (const problem of researchProblems(person)) problems.push(`${who}'s ${problem}`);
    const heritageIssue = heritageProblem(person.heritage);
    if (heritageIssue !== null) problems.push(`${who} ${heritageIssue}`);

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
  middleName?: string;
  lastName: string;
  commonName?: string;
  birthSurname?: string;
  notes?: string;
  birthDate?: string;
  research?: Research;
  // The completeness check `research.family` replaced: a confirmed family
  // question with one source.
  checked?: { asOf: string; source: string } | null;
  heritage?: HeritageEntryCode[];
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

function storedResearch(person: StoredPerson): Research {
  const research = copyResearch(person.research ?? emptyResearch());
  const { checked } = person;
  if (checked === undefined || checked === null) return research;
  if (research.family !== null) {
    throw new Error(`${person.id} has both a completeness check and a family research record`);
  }
  research.family = { status: "confirmed", asOf: checked.asOf, sources: [checked.source], note: "" };
  return research;
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

// Backfill schema fields added later (commonName, birthSurname, middleName,
// notes, birthDate, research, heritage, deceasedId), migrate the pre-union
// spouse lists into `unions` and the completeness check into `research`, so older persisted rows
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
      person.middleName === undefined ||
      person.notes === undefined ||
      person.birthDate === undefined ||
      person.research === undefined ||
      person.checked !== undefined ||
      person.heritage === undefined ||
      person.unions.some(
        (u) => u.status === "ended-by-death" && u.deceasedId === undefined,
      )
    ) {
      changed = true;
    }
    persons[id] = {
      id: person.id,
      firstName: person.firstName,
      middleName: person.middleName ?? "",
      lastName: person.lastName,
      commonName: person.commonName ?? "",
      birthSurname: person.birthSurname ?? "",
      notes: person.notes ?? "",
      birthDate: person.birthDate ?? "",
      research: storedResearch(person),
      heritage: [...(person.heritage ?? [])],
      gender: person.gender,
      parentIds: [...person.parentIds],
      unions: storedUnions(person),
    };
  }
  return { tree: { rootId: t.rootId, persons }, changed };
}

// ---------- Heritage ----------

// One heritage's share of a person's mix, from 0 to 1.
export interface HeritageShare {
  code: HeritageCode;
  share: number;
}

// A person's heritage mix, derived from the tree and never stored. `known`
// is in display order: largest share first, ties to the surname line.
// Together with `unknown` the shares sum to 1.
export interface HeritageBreakdown {
  known: HeritageShare[];
  unknown: number;
  // How much of the person's own entry is still in use, from 0 to 1, or null
  // without an entry. It is the part of their mix their parents leave
  // unknown: below 1, research above them has taken over part of it; at 0 it
  // fills nothing.
  entryInUse: number | null;
}

// Surname-line order of a pair of parents: the father first. When gender
// can't single him out (two fathers, two mothers, non-binary parents), the
// stored parent order stands.
const LINE_RANK: Record<Gender, number> = { M: 0, NB: 1, F: 2 };

function parentsInLineOrder(tree: Tree, person: Person): string[] {
  return [...person.parentIds].sort(
    (a, b) => LINE_RANK[tree.persons[a].gender] - LINE_RANK[tree.persons[b].gender],
  );
}

interface DerivedHeritage {
  mix: Map<HeritageEntryCode, number>;
  // Known codes in surname-line order: the father's line before the
  // mother's, recursively, then the codes the person's entry filled in.
  // First appearance wins.
  line: HeritageCode[];
  entryInUse: number | null;
}

// Every person's heritage breakdown. Each parent passes on half of their
// mix, and a missing parent passes on an unknown half rather than letting the
// known half stand in for the whole. The person's own entry, split equally,
// then fills whatever is still unknown; an unknown in the entry keeps its
// part unknown. Only parent links pass heritage on.
export function heritageBreakdowns(tree: Tree): Record<string, HeritageBreakdown> {
  const derived = new Map<string, DerivedHeritage>();

  const derive = (id: string): DerivedHeritage => {
    const cached = derived.get(id);
    if (cached) return cached;
    const person = tree.persons[id];
    const mix = new Map<HeritageEntryCode, number>();
    const add = (code: HeritageEntryCode, share: number): void => {
      mix.set(code, (mix.get(code) ?? 0) + share);
    };
    const parents = parentsInLineOrder(tree, person).map(derive);
    for (const parent of parents) {
      for (const [code, share] of parent.mix) add(code, share / 2);
    }
    const missingParents = 2 - parents.length;
    if (missingParents > 0) add(UNKNOWN_HERITAGE, missingParents / 2);
    const line = parents.flatMap((parent) => parent.line);

    let entryInUse: number | null = null;
    if (person.heritage.length > 0) {
      entryInUse = mix.get(UNKNOWN_HERITAGE) ?? 0;
      mix.delete(UNKNOWN_HERITAGE);
      if (entryInUse > 0) {
        for (const code of person.heritage) {
          add(code, entryInUse / person.heritage.length);
          if (isHeritageCode(code)) line.push(code);
        }
      }
    }
    const result = { mix, line: [...new Set(line)], entryInUse };
    derived.set(id, result);
    return result;
  };

  // Shares reached by different paths can differ in the last bits of the
  // float, so ties are judged on rounded shares.
  const rounded = (share: number): number => Math.round(share * 1e9);

  const result: Record<string, HeritageBreakdown> = {};
  for (const id of Object.keys(tree.persons)) {
    const { mix, line, entryInUse } = derive(id);
    const known = line
      .map((code) => ({ code, share: mix.get(code) ?? 0 }))
      .sort((a, b) => rounded(b.share) - rounded(a.share));
    result[id] = { known, unknown: mix.get(UNKNOWN_HERITAGE) ?? 0, entryInUse };
  }
  return result;
}

// A share as a percentage with up to two decimals: "50%", "12.5%", "6.25%".
export function formatShare(share: number): string {
  return `${Number((share * 100).toFixed(2))}%`;
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

// Generation (row) of every person relative to the root: parents one up,
// partners level, children one down.
export function computeGenerations(tree: Tree): Map<string, number> {
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

// Lower ranks list first: a match on the name the card shows beats a match on
// a name only research knows. Keyed by NameFields so a new name field fails
// typecheck here until it is searchable.
const NAME_SEARCH_RANK: Record<keyof NameFields, number> = {
  firstName: 0,
  commonName: 0,
  lastName: 1,
  birthSurname: 2,
  middleName: 3,
};
const NAME_SEARCH_FIELDS = Object.keys(NAME_SEARCH_RANK) as (keyof NameFields)[];

// Lowercased, accents stripped, split on anything that isn't a letter or
// digit, so "Ruth-Anne" is the words "ruth" and "anne".
function searchWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "");
}

// People with a name word starting with each word of the query, ignoring case
// and accents: "hutch" finds every Hutchinson, "deb" finds a Deborah.
// Ranked by the best field each query word hit, then alphabetically.
export function searchByName(tree: Tree, query: string): Person[] {
  const queryWords = searchWords(query);
  if (queryWords.length === 0) return [];
  const hits: { person: Person; rank: number; name: string }[] = [];
  for (const person of Object.values(tree.persons)) {
    const fields = NAME_SEARCH_FIELDS.map((key) => ({
      words: searchWords(person[key]),
      rank: NAME_SEARCH_RANK[key],
    }));
    let rank = 0;
    for (const q of queryWords) {
      const best = Math.min(
        ...fields
          .filter((f) => f.words.some((w) => w.startsWith(q)))
          .map((f) => f.rank),
      );
      rank += best;
    }
    if (Number.isFinite(rank)) hits.push({ person, rank, name: fullName(person) });
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return hits.map((h) => h.person);
}

export const GENDER_CYCLE: Gender[] = ["M", "F", "NB"];

// ---------- Layout identity ----------
//
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
// 3.5e-8 — well below "two random topologies happen to collide and the
// viewer renders a layout solved for a different tree".
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
