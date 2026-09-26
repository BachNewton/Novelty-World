// The pure half of the tree-editing CLI (tree-cli.ts): parse a change file
// into operations, apply them through the app's own logic functions, and
// describe people and changes in words the owner can approve. No I/O here.

import {
  addChild,
  addParent,
  addSpouse,
  birthDateProblem,
  deletePerson,
  GENDER_CYCLE,
  formatShare,
  fullDateProblem,
  fullName,
  heritageBreakdowns,
  heritageProblem,
  linkParent,
  renamePerson,
  RESEARCH_QUESTIONS,
  RESEARCH_STATUSES,
  researchSourcesProblem,
  setBirthDate,
  setGender,
  setHeritage,
  setNotes,
  setResearch,
  setUnionDeceased,
  setUnionStatus,
  treeProblems,
} from "../logic";
import type {
  Gender,
  NameFields,
  Person,
  ResearchQuestion,
  ResearchRecord,
  ResearchStatus,
  Tree,
  UnionStatus,
} from "../types";
import { HERITAGES } from "../heritages";
import type { HeritageCode, HeritageEntryCode } from "../heritages";

// Also the list of name fields a change file may set: a new NameFields key
// fails typecheck here until it gets a default, and from then on flows
// through rename, new people, and search.
const EMPTY_NAME: NameFields = {
  firstName: "",
  middleName: "",
  lastName: "",
  commonName: "",
  birthSurname: "",
};
const NAME_KEYS = Object.keys(EMPTY_NAME) as (keyof NameFields)[];

const UNION_STATUSES: readonly UnionStatus[] = [
  "married",
  "divorced",
  "ended-by-death",
  "partner",
  "ex-partner",
];

// A person in a change file: "@name" for someone an earlier op in the same
// file added (via its `ref`), otherwise an id or any unique id prefix.
type PersonRef = string;

export type Op =
  | { op: "rename"; person: PersonRef; name: Partial<NameFields> }
  | { op: "setGender"; person: PersonRef; gender: Gender }
  | { op: "setNotes"; person: PersonRef; notes: string }
  | { op: "appendNote"; person: PersonRef; note: string }
  // A partial ISO date ("YYYY", "YYYY-MM" or "YYYY-MM-DD") or "~YYYY"; "" clears it.
  | { op: "setBirthDate"; person: PersonRef; birthDate: string }
  // Codes from heritages.ts, plus "unknown", split equally; [] removes the
  // entry.
  | { op: "setHeritage"; person: PersonRef; heritage: HeritageEntryCode[] }
  | {
      op: "addChild";
      ref?: string;
      parent: PersonRef;
      // null means an explicit single parent; there is no implicit default.
      coParent: PersonRef | null;
      name: Partial<NameFields>;
      gender: Gender;
      birthDate?: string;
      heritage?: HeritageEntryCode[];
    }
  | {
      op: "addSpouse";
      ref?: string;
      person: PersonRef;
      name: Partial<NameFields>;
      gender: Gender;
      status: UnionStatus;
      // Existing children of `person` the new spouse is also a parent of.
      bioChildren: PersonRef[];
      birthDate?: string;
      heritage?: HeritageEntryCode[];
    }
  | {
      op: "addParent";
      ref?: string;
      child: PersonRef;
      name: Partial<NameFields>;
      gender: Gender;
      birthDate?: string;
      heritage?: HeritageEntryCode[];
    }
  // Makes an existing person a parent of an existing child.
  | { op: "linkParent"; child: PersonRef; parent: PersonRef }
  | { op: "setUnionStatus"; a: PersonRef; b: PersonRef; status: UnionStatus }
  | { op: "setUnionDeceased"; a: PersonRef; b: PersonRef; deceased: PersonRef | null }
  | { op: "deletePerson"; person: PersonRef }
  // Records where research on one of `person`'s questions stands, replacing
  // any existing record for it. `asOf` is a full date ("YYYY-MM-DD"); the
  // sources and note live in the public row.
  | {
      op: "setResearch";
      person: PersonRef;
      question: ResearchQuestion;
      status: ResearchStatus;
      asOf: string;
      sources: string[];
      note: string;
    }
  | { op: "clearResearch"; person: PersonRef; question: ResearchQuestion };

type FieldKind =
  | "person"
  | "personOrNull"
  | "persons"
  | "name"
  | "gender"
  | "status"
  | "question"
  | "researchStatus"
  | "sources"
  | "text"
  | "fullDate"
  | "birthDate"
  | "birthDate?"
  | "heritage"
  | "heritage?"
  | "ref?";

const OP_FIELDS = {
  rename: { person: "person", name: "name" },
  setGender: { person: "person", gender: "gender" },
  setNotes: { person: "person", notes: "text" },
  appendNote: { person: "person", note: "text" },
  setBirthDate: { person: "person", birthDate: "birthDate" },
  setHeritage: { person: "person", heritage: "heritage" },
  addChild: {
    ref: "ref?",
    parent: "person",
    coParent: "personOrNull",
    name: "name",
    gender: "gender",
    birthDate: "birthDate?",
    heritage: "heritage?",
  },
  addSpouse: {
    ref: "ref?",
    person: "person",
    name: "name",
    gender: "gender",
    status: "status",
    bioChildren: "persons",
    birthDate: "birthDate?",
    heritage: "heritage?",
  },
  addParent: {
    ref: "ref?",
    child: "person",
    name: "name",
    gender: "gender",
    birthDate: "birthDate?",
    heritage: "heritage?",
  },
  linkParent: { child: "person", parent: "person" },
  setUnionStatus: { a: "person", b: "person", status: "status" },
  setUnionDeceased: { a: "person", b: "person", deceased: "personOrNull" },
  deletePerson: { person: "person" },
  setResearch: {
    person: "person",
    question: "question",
    status: "researchStatus",
    asOf: "fullDate",
    sources: "sources",
    note: "text",
  },
  clearResearch: { person: "person", question: "question" },
} as const satisfies Record<Op["op"], Record<string, FieldKind>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldError(kind: FieldKind, value: unknown): string | null {
  switch (kind) {
    case "person":
      return typeof value === "string" && value !== "" ? null : "must be a person id, id prefix, or @ref";
    case "personOrNull":
      return value === null || (typeof value === "string" && value !== "")
        ? null
        : "must be a person id, id prefix, @ref, or null";
    case "persons":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && v !== "")
        ? null
        : "must be a list of person ids, id prefixes, or @refs";
    case "name": {
      if (!isRecord(value)) return "must be an object of name fields";
      for (const [key, v] of Object.entries(value)) {
        if (!(NAME_KEYS as string[]).includes(key)) {
          return `has unknown field "${key}" (allowed: ${NAME_KEYS.join(", ")})`;
        }
        if (typeof v !== "string") return `field "${key}" must be a string`;
      }
      return null;
    }
    case "gender":
      return GENDER_CYCLE.includes(value as Gender) ? null : `must be one of ${GENDER_CYCLE.join(", ")}`;
    case "status":
      return UNION_STATUSES.includes(value as UnionStatus)
        ? null
        : `must be one of ${UNION_STATUSES.join(", ")}`;
    case "question":
      return RESEARCH_QUESTIONS.includes(value as ResearchQuestion)
        ? null
        : `must be one of ${RESEARCH_QUESTIONS.join(", ")}`;
    case "researchStatus":
      return RESEARCH_STATUSES.includes(value as ResearchStatus)
        ? null
        : `must be one of ${RESEARCH_STATUSES.join(", ")}`;
    case "sources":
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return "must be a list of source names";
      }
      return researchSourcesProblem(value.map((v: string) => v.trim()));
    case "text":
      return typeof value === "string" ? null : "must be a string";
    case "fullDate":
      return typeof value === "string" ? fullDateProblem(value.trim()) : "must be a string";
    case "birthDate?":
      return value === undefined ? null : fieldError("birthDate", value);
    case "birthDate":
      return typeof value === "string" ? birthDateProblem(value.trim()) : "must be a string";
    case "heritage?":
      return value === undefined ? null : fieldError("heritage", value);
    case "heritage":
      return Array.isArray(value) ? heritageProblem(value) : "must be a list of heritage codes";
    case "ref?":
      return value === undefined || (typeof value === "string" && /^@\w[\w-]*$/.test(value))
        ? null
        : 'must look like "@name"';
  }
}

// Parse a change file's JSON into operations, rejecting anything unexpected:
// unknown ops, missing or extra fields, and wrongly typed values.
export function parseOps(json: unknown): Op[] {
  if (!Array.isArray(json)) throw new Error("A change file must be a JSON list of operations");
  return json.map((raw: unknown, i) => {
    const where = `Operation ${i + 1}`;
    if (!isRecord(raw)) throw new Error(`${where} is not an object`);
    const { op } = raw;
    if (typeof op !== "string" || !(op in OP_FIELDS)) {
      throw new Error(`${where} has unknown op ${JSON.stringify(op)} (known: ${Object.keys(OP_FIELDS).join(", ")})`);
    }
    const fields: Record<string, FieldKind> = OP_FIELDS[op as Op["op"]];
    for (const key of Object.keys(raw)) {
      if (key !== "op" && !(key in fields)) throw new Error(`${where} (${op}) has unknown field "${key}"`);
    }
    for (const [key, kind] of Object.entries(fields)) {
      if (!(key in raw) && !kind.endsWith("?")) throw new Error(`${where} (${op}) is missing "${key}"`);
      const problem = fieldError(kind, raw[key]);
      if (problem !== null) throw new Error(`${where} (${op}): "${key}" ${problem}`);
    }
    return raw as Op;
  });
}

// ---------- ids and names ----------

// The person whose id is `idOrPrefix`, or the only one whose id starts with
// it. Ambiguous and unknown prefixes are errors.
export function resolveId(tree: Tree, idOrPrefix: string): string {
  if (idOrPrefix in tree.persons) return idOrPrefix;
  const matches = Object.keys(tree.persons).filter((id) => id.startsWith(idOrPrefix));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No person has an id starting with "${idOrPrefix}"`);
  const listed = matches.map((id) => `  ${id}  ${displayName(tree.persons[id])}`).join("\n");
  throw new Error(`"${idOrPrefix}" matches ${matches.length} people:\n${listed}`);
}

// The shortest prefix of `id` (at least 8 characters) no other id shares.
export function shortId(tree: Tree, id: string): string {
  const others = Object.keys(tree.persons).filter((other) => other !== id);
  for (let len = Math.min(8, id.length); len < id.length; len++) {
    const prefix = id.slice(0, len);
    if (!others.some((other) => other.startsWith(prefix))) return prefix;
  }
  return id;
}

export function displayName(person: Person): string {
  const born =
    person.birthSurname !== "" && person.birthSurname !== person.lastName
      ? ` (née ${person.birthSurname})`
      : "";
  return fullName(person) + born;
}

function labelOf(tree: Tree, id: string): string {
  return `${displayName(tree.persons[id])} [${shortId(tree, id)}]`;
}

// ---------- find / show ----------

// People whose name fields or notes contain `text`, ignoring case. The full
// name is searched too, so "first last" finds a person.
export function searchPersons(tree: Tree, text: string): Person[] {
  const needle = text.toLowerCase();
  return Object.values(tree.persons).filter((person) => {
    const haystack = [
      displayName(person),
      ...NAME_KEYS.map((key) => person[key]),
      `${person.firstName} ${person.lastName}`,
      person.notes,
    ];
    return haystack.some((s) => s.toLowerCase().includes(needle));
  });
}

function childrenOf(tree: Tree, id: string): Person[] {
  return Object.values(tree.persons).filter((p) => p.parentIds.includes(id));
}

export function describePerson(tree: Tree, id: string): string {
  const person = tree.persons[id];
  const lines = [`${displayName(person)}`, `  id:       ${id}`];
  const names = NAME_KEYS.filter((key) => person[key] !== "")
    .map((key) => `${key}=${JSON.stringify(person[key])}`)
    .join(", ");
  lines.push(`  names:    ${names}`);
  lines.push(`  gender:   ${person.gender}`);
  if (person.birthDate !== "") lines.push(`  born:     ${person.birthDate}`);
  const heritage = heritageBreakdowns(tree)[id];
  const mix = heritage.known.map((k) => `${heritageLabel(k.code)} ${formatShare(k.share)}`);
  if (heritage.unknown > 0) mix.push(`unknown ${formatShare(heritage.unknown)}`);
  lines.push(`  heritage: ${mix.join(", ")}`);
  if (heritage.entryInUse !== null) {
    lines.push(`  entry:    ${entryList(person.heritage)} (${describeEntryUse(heritage.entryInUse)})`);
  }
  lines.push(
    `  parents:  ${person.parentIds.length === 0 ? "(none)" : person.parentIds.map((pid) => labelOf(tree, pid)).join("; ")}`,
  );
  if (person.unions.length === 0) {
    lines.push("  unions:   (none)");
  } else {
    for (const [i, union] of person.unions.entries()) {
      let status: string = union.status;
      if (union.status === "ended-by-death" && union.deceasedId !== null) {
        status += `, ${union.deceasedId === id ? "this person" : "partner"} died`;
      }
      lines.push(`  ${i === 0 ? "unions:  " : "         "} ${labelOf(tree, union.personId)} (${status})`);
    }
  }
  const children = childrenOf(tree, id);
  if (children.length === 0) {
    lines.push("  children: (none)");
  } else {
    for (const [i, child] of children.entries()) {
      const otherId = child.parentIds.find((pid) => pid !== id);
      const other = otherId === undefined ? "no other parent" : `with ${labelOf(tree, otherId)}`;
      lines.push(`  ${i === 0 ? "children:" : "         "} ${labelOf(tree, child.id)} (${other})`);
    }
  }
  lines.push("  research:");
  for (const question of RESEARCH_QUESTIONS) {
    lines.push(`    ${`${question}:`.padEnd(11)}${describeRecord(person.research[question])}`);
  }
  if (person.notes !== "") {
    lines.push("  notes:");
    for (const line of person.notes.split("\n")) lines.push(`    ${line}`);
  }
  return lines.join("\n");
}

function describeRecord(record: ResearchRecord | null): string {
  if (record === null) return "not researched";
  const note = record.note === "" ? "" : ` note: ${JSON.stringify(record.note)}`;
  return `${record.status} as of ${record.asOf} (sources: ${record.sources.join("; ")})${note}`;
}

function sameRecord(a: ResearchRecord | null, b: ResearchRecord): boolean {
  return (
    a !== null &&
    a.status === b.status &&
    a.asOf === b.asOf &&
    a.note === b.note &&
    a.sources.length === b.sources.length &&
    a.sources.every((source, i) => source === b.sources[i])
  );
}

function heritageLabel(code: HeritageCode): string {
  return `${HERITAGES[code].name} (${code})`;
}

function entryList(heritage: readonly HeritageEntryCode[]): string {
  return heritage.length === 0 ? "(no entry)" : heritage.join(" + ");
}

function describeEntryUse(inUse: number): string {
  if (inUse === 1) return "fully in use";
  if (inUse === 0) return "fully superseded: clear it";
  return `${formatShare(inUse)} in use: partly superseded, review it`;
}

// ---------- superseded heritage entries ----------

export interface SupersededEntry {
  person: Person;
  inUse: number;
}

// Heritage entries that research above the person has taken over, sorted by
// name: fully superseded ones fill nothing and should be cleared; partly
// superseded ones may have been a guess covering both sides, so they need
// review.
export function supersededReport(tree: Tree): { full: Person[]; partly: SupersededEntry[] } {
  const breakdowns = heritageBreakdowns(tree);
  const superseded = Object.values(tree.persons)
    .flatMap((person) => {
      const inUse = breakdowns[person.id].entryInUse;
      return inUse === null || inUse === 1 ? [] : [{ person, inUse }];
    })
    .sort((a, b) => displayName(a.person).localeCompare(displayName(b.person)));
  return {
    full: superseded.filter((s) => s.inUse === 0).map((s) => s.person),
    partly: superseded.filter((s) => s.inUse > 0),
  };
}

export function describeSuperseded(tree: Tree): string {
  const { full, partly } = supersededReport(tree);
  const lines = [`Fully superseded heritage entries (clear these): ${full.length}`];
  for (const person of full) {
    lines.push(`  ${labelOf(tree, person.id)}  entry ${entryList(person.heritage)}`);
  }
  lines.push(`Partly superseded heritage entries (review these): ${partly.length}`);
  for (const { person, inUse } of partly) {
    lines.push(`  ${labelOf(tree, person.id)}  entry ${entryList(person.heritage)}, ${formatShare(inUse)} in use`);
  }
  return lines.join("\n");
}

// ---------- research gaps ----------

// Who research is responsible for: everyone in the tree.
export function researchScope(tree: Tree): Set<string> {
  return new Set(Object.keys(tree.persons));
}

// The questions asked of an in-scope person: heritage only of someone with no
// parents in the tree, since everyone else derives theirs.
export function questionsFor(person: Person): ResearchQuestion[] {
  return RESEARCH_QUESTIONS.filter((q) => q !== "heritage" || person.parentIds.length === 0);
}

// Steps from the root to everyone, over parent, child and union links.
function distancesFromRoot(tree: Tree): Map<string, number> {
  const distance = new Map([[tree.rootId, 0]]);
  const queue = [tree.rootId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const person = tree.persons[id];
    const next = [
      ...person.parentIds,
      ...childrenOf(tree, id).map((c) => c.id),
      ...person.unions.map((u) => u.personId),
    ];
    for (const other of next) {
      if (distance.has(other)) continue;
      distance.set(other, (distance.get(id) ?? 0) + 1);
      queue.push(other);
    }
  }
  return distance;
}

export interface ResearchGap {
  question: ResearchQuestion;
  // null when nobody has looked yet, otherwise the open record.
  record: ResearchRecord | null;
}

// A unit research works through together: a person or couple (with every
// in-scope partner) and those of their children who have no partner or child
// of their own. A child who does heads a family of their own instead, so
// everyone in scope is in exactly one family.
export interface GapFamily {
  // Closest to the root first.
  heads: string[];
  // Sorted by name.
  children: string[];
  // Steps from the root to the family's closest member.
  distance: number;
}

export interface QuestionTotals {
  // In-scope people the question is asked of.
  asked: number;
  confirmed: number;
  exhausted: number;
  open: number;
  missing: number;
}

export interface GapsReport {
  // Every in-scope person's family, closest to the root first.
  families: GapFamily[];
  // Each in-scope person's missing or open questions, in question order.
  gaps: Record<string, ResearchGap[]>;
  totals: Record<ResearchQuestion, QuestionTotals>;
  // In-scope people with every question confirmed or exhausted.
  complete: number;
  inScope: number;
}

export function gapsReport(tree: Tree): GapsReport {
  const scope = researchScope(tree);
  const distance = distancesFromRoot(tree);
  const dist = (id: string): number => distance.get(id) ?? Infinity;
  const byCloseness = (a: string, b: string): number =>
    dist(a) - dist(b) || displayName(tree.persons[a]).localeCompare(displayName(tree.persons[b])) || a.localeCompare(b);
  const byName = (a: string, b: string): number =>
    displayName(tree.persons[a]).localeCompare(displayName(tree.persons[b])) || a.localeCompare(b);

  const partnersInScope = (id: string): string[] =>
    tree.persons[id].unions.map((u) => u.personId).filter((pid) => scope.has(pid));
  const isHead = (id: string): boolean =>
    partnersInScope(id).length > 0 || childrenOf(tree, id).some((c) => scope.has(c.id));

  const ordered = [...scope].sort(byCloseness);
  const familyOf = new Map<string, GapFamily>();
  const families: GapFamily[] = [];
  for (const id of ordered.filter(isHead)) {
    if (familyOf.has(id)) continue;
    const family: GapFamily = { heads: [], children: [], distance: dist(id) };
    const stack = [id];
    for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
      if (familyOf.has(cur)) continue;
      familyOf.set(cur, family);
      family.heads.push(cur);
      stack.push(...partnersInScope(cur));
    }
    family.heads.sort(byCloseness);
    families.push(family);
  }
  for (const id of ordered.filter((pid) => !isHead(pid))) {
    const parent = tree.persons[id].parentIds.filter((pid) => familyOf.has(pid)).sort(byCloseness).at(0);
    const family = parent === undefined ? undefined : familyOf.get(parent);
    if (family === undefined) {
      families.push({ heads: [id], children: [], distance: dist(id) });
    } else {
      family.children.push(id);
      family.distance = Math.min(family.distance, dist(id));
    }
  }
  for (const family of families) family.children.sort(byName);
  families.sort((a, b) => a.distance - b.distance || byCloseness(a.heads[0], b.heads[0]));

  const totals = Object.fromEntries(
    RESEARCH_QUESTIONS.map((q) => [q, { asked: 0, confirmed: 0, exhausted: 0, open: 0, missing: 0 }]),
  ) as Record<ResearchQuestion, QuestionTotals>;
  const gaps: Record<string, ResearchGap[]> = {};
  let complete = 0;
  for (const id of scope) {
    const person = tree.persons[id];
    gaps[id] = [];
    for (const question of questionsFor(person)) {
      const record = person.research[question];
      const total = totals[question];
      total.asked++;
      if (record === null) total.missing++;
      else total[record.status]++;
      if (record === null || record.status === "open") gaps[id].push({ question, record });
    }
    if (gaps[id].length === 0) complete++;
  }
  return { families, gaps, totals, complete, inScope: scope.size };
}

function describeGap({ question, record }: ResearchGap): string {
  if (record === null) return `${question} missing`;
  return record.note === "" ? `${question} open` : `${question} open (${record.note})`;
}

export function describeGaps(tree: Tree): string {
  const report = gapsReport(tree);
  const lines = [
    `Research gaps among ${report.inScope} people in scope (everyone in the tree).`,
    "One family per block, closest to the root first: its heads (a person and their partners), then",
    "their children with no family of their own. Questions show family first; heritage is asked only",
    "of people with no parents in the tree.",
  ];
  for (const family of report.families) {
    const members = [
      ...family.heads.map((id) => ({ id, prefix: "" })),
      ...family.children.map((id) => ({ id, prefix: "child " })),
    ].filter(({ id }) => report.gaps[id].length > 0);
    if (members.length === 0) continue;
    lines.push("", family.heads.map((id) => labelOf(tree, id)).join(" + "));
    for (const { id, prefix } of members) {
      lines.push(`  ${prefix}${labelOf(tree, id)}: ${report.gaps[id].map(describeGap).join(", ")}`);
    }
  }
  lines.push("", "Totals:");
  for (const question of RESEARCH_QUESTIONS) {
    const t = report.totals[question];
    const of = question === "heritage" ? `${t.asked} with no parents in the tree` : `${t.asked}`;
    lines.push(
      `  ${`${question}:`.padEnd(11)}${t.confirmed} confirmed, ${t.exhausted} exhausted, ${t.open} open, ${t.missing} missing (of ${of})`,
    );
  }
  lines.push(`Complete: ${report.complete} of ${report.inScope} people`);
  return lines.join("\n");
}

// ---------- applying operations ----------

export interface ApplyResult {
  tree: Tree;
  // One line per operation, in names the owner can check.
  changes: string[];
}

function trimmedName(name: Partial<NameFields>): Partial<NameFields> {
  const out: Partial<NameFields> = {};
  for (const key of NAME_KEYS) {
    const value = name[key];
    if (value !== undefined) out[key] = value.trim();
  }
  return out;
}

function newPersonName(name: Partial<NameFields>): NameFields {
  const full = { ...EMPTY_NAME, ...trimmedName(name) };
  if (full.firstName === "") throw new Error("a new person needs a firstName");
  return full;
}

function currentName(person: Person): NameFields {
  const out = { ...EMPTY_NAME };
  for (const key of NAME_KEYS) out[key] = person[key];
  return out;
}

function sameName(a: NameFields, b: NameFields): boolean {
  return NAME_KEYS.every((key) => a[key] === b[key]);
}

// Refuses to add someone a relative already has under the same name, which
// is what re-running an already applied change file would do.
function refuseDuplicate(tree: Tree, relatives: string[], name: NameFields, relation: string): void {
  const dupe = relatives.find((rid) => sameName(currentName(tree.persons[rid]), name));
  if (dupe !== undefined) {
    throw new Error(`there is already a ${relation} named ${labelOf(tree, dupe)}`);
  }
}

export function applyOps(tree: Tree, ops: readonly Op[], newId: () => string): ApplyResult {
  const refs = new Map<string, string>();
  const changes: string[] = [];
  let current = tree;

  const who = (ref: PersonRef): string => {
    if (ref.startsWith("@")) {
      const id = refs.get(ref);
      if (id === undefined) throw new Error(`${ref} is not defined by an earlier operation`);
      return id;
    }
    return resolveId(current, ref);
  };
  const label = (id: string): string => labelOf(current, id);
  // Gives a just-added person the birth date their op carried, if any, and
  // describes it for the change list.
  const bornOn = (id: string, birthDate: string | undefined): string => {
    const date = birthDate?.trim() ?? "";
    if (date === "") return "";
    current = setBirthDate(current, id, date);
    return `, born ${date}`;
  };
  // Gives a just-added person the heritage entry their op carried, if any.
  const ofHeritage = (id: string, heritage: HeritageEntryCode[] | undefined): string => {
    if (heritage === undefined || heritage.length === 0) return "";
    current = setHeritage(current, id, heritage);
    return `, heritage ${entryList(heritage)}`;
  };
  const bindRef = (ref: string | undefined, id: string): string => {
    if (ref === undefined) return "";
    if (refs.has(ref)) throw new Error(`${ref} is defined twice`);
    refs.set(ref, id);
    return ` as ${ref}`;
  };

  for (const [i, op] of ops.entries()) {
    try {
      const change = applyOne(op);
      changes.push(change);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Operation ${i + 1} (${op.op}): ${message}`, { cause: err });
    }
  }

  const problems = treeProblems(current);
  if (problems.length > 0) {
    throw new Error(`The changed tree is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return { tree: current, changes };

  function applyOne(op: Op): string {
    switch (op.op) {
      case "rename": {
        const id = who(op.person);
        const before = currentName(current.persons[id]);
        const after = { ...before, ...trimmedName(op.name) };
        if (after.firstName === "") throw new Error("firstName can't be empty");
        const diffs = NAME_KEYS.filter((key) => before[key] !== after[key]).map(
          (key) => `${key} ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`,
        );
        if (diffs.length === 0) throw new Error(`${label(id)} already has these names`);
        const was = label(id);
        current = renamePerson(current, id, after);
        return `Rename ${was}: ${diffs.join(", ")}`;
      }
      case "setGender": {
        const id = who(op.person);
        const before = current.persons[id].gender;
        if (before === op.gender) throw new Error(`${label(id)} is already ${op.gender}`);
        current = setGender(current, id, op.gender);
        return `Set gender of ${label(id)}: ${before} → ${op.gender}`;
      }
      case "setNotes": {
        const id = who(op.person);
        const notes = op.notes.trim();
        if (current.persons[id].notes === notes) throw new Error(`${label(id)} already has these notes`);
        current = setNotes(current, id, notes);
        return notes === ""
          ? `Clear notes of ${label(id)}`
          : `Replace notes of ${label(id)} with:\n${indent(notes)}`;
      }
      case "appendNote": {
        const id = who(op.person);
        const note = op.note.trim();
        if (note === "") throw new Error("the note is empty");
        const before = current.persons[id].notes;
        if (before.split("\n").includes(note)) throw new Error(`${label(id)} already has this note`);
        current = setNotes(current, id, before === "" ? note : `${before}\n${note}`);
        return `Add note to ${label(id)}:\n${indent(note)}`;
      }
      case "setBirthDate": {
        const id = who(op.person);
        const date = op.birthDate.trim();
        const before = current.persons[id].birthDate;
        if (before === date) throw new Error(`${label(id)} already has this birth date`);
        current = setBirthDate(current, id, date);
        return `Set birth date of ${label(id)}: ${before === "" ? "(none)" : before} → ${date === "" ? "(none)" : date}`;
      }
      case "setHeritage": {
        const id = who(op.person);
        const before = current.persons[id].heritage;
        const next = setHeritage(current, id, op.heritage);
        if (next === current) throw new Error(`${label(id)} already has this heritage entry`);
        current = next;
        return `Set heritage entry of ${label(id)}: ${entryList(before)} → ${entryList(op.heritage)}`;
      }
      case "addChild": {
        const parentId = who(op.parent);
        const coParentId = op.coParent === null ? null : who(op.coParent);
        if (coParentId === parentId) throw new Error("coParent is the same person as parent");
        const name = newPersonName(op.name);
        refuseDuplicate(
          current,
          childrenOf(current, parentId).map((c) => c.id),
          name,
          `child of ${label(parentId)}`,
        );
        const id = newId();
        current = addChild(current, parentId, id, name, op.gender, coParentId);
        const details = bornOn(id, op.birthDate) + ofHeritage(id, op.heritage);
        const parents = coParentId === null
          ? `${label(parentId)} (no other parent)`
          : `${label(parentId)} and ${label(coParentId)}`;
        return `Add child ${displayName(current.persons[id])} (${op.gender}${details})${bindRef(op.ref, id)} of ${parents}`;
      }
      case "addSpouse": {
        const personId = who(op.person);
        const childIds = op.bioChildren.map(who);
        for (const childId of childIds) {
          const { parentIds } = current.persons[childId];
          if (parentIds.length !== 1 || parentIds[0] !== personId) {
            throw new Error(`${label(childId)} must have ${label(personId)} as their only parent`);
          }
        }
        const name = newPersonName(op.name);
        refuseDuplicate(
          current,
          current.persons[personId].unions.map((u) => u.personId),
          name,
          `partner of ${label(personId)}`,
        );
        const id = newId();
        current = addSpouse(current, personId, id, name, op.gender, op.status, childIds);
        const details = bornOn(id, op.birthDate) + ofHeritage(id, op.heritage);
        const kids = childIds.length === 0 ? "" : `; also parent of ${childIds.map(label).join(", ")}`;
        return `Add ${op.status} partner ${displayName(current.persons[id])} (${op.gender}${details})${bindRef(op.ref, id)} of ${label(personId)}${kids}`;
      }
      case "addParent": {
        const childId = who(op.child);
        const { parentIds } = current.persons[childId];
        if (parentIds.length >= 2) throw new Error(`${label(childId)} already has two parents`);
        const name = newPersonName(op.name);
        refuseDuplicate(current, parentIds, name, `parent of ${label(childId)}`);
        const otherParentId = parentIds.at(0);
        const id = newId();
        current = addParent(current, childId, id, name, op.gender);
        const details = bornOn(id, op.birthDate) + ofHeritage(id, op.heritage);
        const union = otherParentId === undefined
          ? ""
          : `; married to ${label(otherParentId)} automatically (follow with setUnionStatus if they weren't married)`;
        return `Add parent ${displayName(current.persons[id])} (${op.gender}${details})${bindRef(op.ref, id)} of ${label(childId)}${union}`;
      }
      case "linkParent": {
        const childId = who(op.child);
        const parentId = who(op.parent);
        const otherParentId = current.persons[childId].parentIds.at(0);
        const hadUnion = otherParentId !== undefined &&
          current.persons[parentId].unions.some((u) => u.personId === otherParentId);
        current = linkParent(current, childId, parentId);
        let coParent = "";
        if (otherParentId !== undefined) {
          coParent = hadUnion
            ? `, alongside ${label(otherParentId)}`
            : `; married to ${label(otherParentId)} automatically (follow with setUnionStatus if they weren't married)`;
        }
        return `Link ${label(parentId)} as parent of ${label(childId)}${coParent}`;
      }
      case "setUnionStatus": {
        const aId = who(op.a);
        const bId = who(op.b);
        const union = current.persons[aId].unions.find((u) => u.personId === bId);
        if (union === undefined) throw new Error(`${label(aId)} and ${label(bId)} have no union`);
        if (union.status === op.status) throw new Error(`their union is already ${op.status}`);
        current = setUnionStatus(current, aId, bId, op.status);
        return `Union of ${label(aId)} and ${label(bId)}: ${union.status} → ${op.status}`;
      }
      case "setUnionDeceased": {
        const aId = who(op.a);
        const bId = who(op.b);
        const deceasedId = op.deceased === null ? null : who(op.deceased);
        current = setUnionDeceased(current, aId, bId, deceasedId);
        const died = deceasedId === null ? "nobody recorded" : `${label(deceasedId)} died`;
        return `Ended-by-death union of ${label(aId)} and ${label(bId)}: ${died}`;
      }
      case "deletePerson": {
        const id = who(op.person);
        if (id === current.rootId) throw new Error("the root person can't be deleted");
        const effects = [
          ...childrenOf(current, id).map((c) => `parent of ${label(c.id)}`),
          ...current.persons[id].unions.map((u) => `${u.status} to ${label(u.personId)}`),
        ];
        const was = label(id);
        current = deletePerson(current, id);
        return effects.length === 0
          ? `Delete ${was}`
          : `Delete ${was}, removing: ${effects.join("; ")}`;
      }
      case "setResearch": {
        const id = who(op.person);
        const before = current.persons[id].research[op.question];
        const after: ResearchRecord = {
          status: op.status,
          asOf: op.asOf.trim(),
          sources: op.sources.map((source) => source.trim()),
          note: op.note.trim(),
        };
        if (sameRecord(before, after)) throw new Error(`${label(id)} already has this ${op.question} record`);
        current = setResearch(current, id, op.question, after);
        return `Research ${op.question} of ${label(id)}: ${describeRecord(before)} → ${describeRecord(after)}`;
      }
      case "clearResearch": {
        const id = who(op.person);
        const before = current.persons[id].research[op.question];
        if (before === null) throw new Error(`${label(id)} has no ${op.question} record to clear`);
        current = setResearch(current, id, op.question, null);
        return `Clear ${op.question} research of ${label(id)} (was ${describeRecord(before)})`;
      }
    }
  }
}

function indent(text: string): string {
  return text.split("\n").map((line) => `    ${line}`).join("\n");
}
